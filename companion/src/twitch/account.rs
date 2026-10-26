use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::auth::{self, AuthError, PollResult, TokenGrant};
use super::http::TwitchHttp;
use crate::config;
use crate::events::EventBroadcaster;

// Constants
pub const SCOPES: &[&str] = &[
    "bits:read",
    "user:read:chat",
    "channel:read:goals",
    "channel:read:redemptions",
    "channel:read:subscriptions",
    "moderator:read:followers",
];
const TOKEN_FILE: &str = "twitch-token.json";
const REFRESH_MARGIN_SECONDS: u64 = 600;
const VALIDATE_INTERVAL_SECONDS: u64 = 3600;
const MAINTENANCE_INTERVAL_UNITS: u32 = 15 * 60;
const SLOW_DOWN_UNITS: u64 = 5;

// Types
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredToken {
    pub client_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub login: String,
    pub user_id: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum AuthStatus {
    NotConfigured,
    LoggedOut,
    #[serde(rename_all = "camelCase")]
    Pending {
        user_code: String,
        verification_uri: String,
        expires_at: u64,
    },
    #[serde(rename_all = "camelCase")]
    LoggedIn {
        login: String,
        missing_scopes: bool,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Credentials {
    pub client_id: String,
    pub access_token: String,
    pub user_id: String,
}

struct Inner {
    status: AuthStatus,
    token: Option<StoredToken>,
    attempt: u64,
    last_validated: u64,
}

pub struct TwitchAccount {
    http: Arc<dyn TwitchHttp>,
    client_id: Option<String>,
    token_path: PathBuf,
    events: Arc<EventBroadcaster>,
    time_unit: Duration,
    inner: Mutex<Inner>,
}

// Account
impl TwitchAccount {
    pub fn new(
        http: Arc<dyn TwitchHttp>,
        client_id: Option<String>,
        config_dir: &Path,
        events: Arc<EventBroadcaster>,
    ) -> Arc<Self> {
        Self::with_time_unit(http, client_id, config_dir, events, Duration::from_secs(1))
    }

    pub fn with_time_unit(
        http: Arc<dyn TwitchHttp>,
        client_id: Option<String>,
        config_dir: &Path,
        events: Arc<EventBroadcaster>,
        time_unit: Duration,
    ) -> Arc<Self> {
        let token_path = config_dir.join(TOKEN_FILE);
        let token = client_id.as_deref().and_then(|client_id| {
            load_token(&token_path).filter(|token| token.client_id == client_id)
        });
        let status = match (&client_id, &token) {
            (None, _) => AuthStatus::NotConfigured,
            (Some(_), Some(token)) => logged_in(token),
            (Some(_), None) => AuthStatus::LoggedOut,
        };
        Arc::new(Self {
            http,
            client_id,
            token_path,
            events,
            time_unit,
            inner: Mutex::new(Inner {
                status,
                token,
                attempt: 0,
                last_validated: 0,
            }),
        })
    }

    pub fn status(&self) -> AuthStatus {
        self.lock().status.clone()
    }

    pub fn start_maintenance(self: &Arc<Self>) {
        let account = Arc::clone(self);
        thread::spawn(move || {
            loop {
                account.maintain();
                thread::sleep(account.time_unit * MAINTENANCE_INTERVAL_UNITS);
            }
        });
    }

    pub fn login(self: &Arc<Self>) -> AuthStatus {
        let Some(client_id) = self.client_id.clone() else {
            return AuthStatus::NotConfigured;
        };
        let attempt = {
            let mut inner = self.lock();
            inner.attempt += 1;
            inner.attempt
        };
        let scopes = SCOPES.join(" ");
        match auth::request_device_code(self.http.as_ref(), &client_id, &scopes) {
            Ok(code) => {
                let expires_at = now() + code.expires_in;
                self.set_status_if_current(
                    attempt,
                    AuthStatus::Pending {
                        user_code: code.user_code.clone(),
                        verification_uri: code.verification_uri.clone(),
                        expires_at,
                    },
                );
                let account = Arc::clone(self);
                thread::spawn(move || {
                    account.poll(
                        attempt,
                        &client_id,
                        &scopes,
                        &code.device_code,
                        code.interval,
                        expires_at,
                    );
                });
            }
            Err(error) => self.set_status_if_current(attempt, error_status(&error)),
        }
        self.status()
    }

    pub fn logout(self: &Arc<Self>) -> AuthStatus {
        let token = {
            let mut inner = self.lock();
            inner.attempt += 1;
            inner.status = if self.client_id.is_some() {
                AuthStatus::LoggedOut
            } else {
                AuthStatus::NotConfigured
            };
            inner.token.take()
        };
        let _ = fs::remove_file(&self.token_path);
        self.publish();
        if let Some(token) = token {
            let http = Arc::clone(&self.http);
            thread::spawn(move || {
                let _ = auth::revoke_token(http.as_ref(), &token.client_id, &token.access_token);
            });
        }
        self.status()
    }

    pub fn access_token(&self) -> Option<(String, String)> {
        self.credentials()
            .map(|credentials| (credentials.client_id, credentials.access_token))
    }

    pub fn credentials(&self) -> Option<Credentials> {
        self.maintain();
        let inner = self.lock();
        inner.token.as_ref().map(|token| Credentials {
            client_id: token.client_id.clone(),
            access_token: token.access_token.clone(),
            user_id: token.user_id.clone(),
        })
    }

    pub fn refresh_after_rejection(&self) {
        let current = {
            let inner = self.lock();
            inner.token.clone().map(|token| (inner.attempt, token))
        };
        if let Some((attempt, token)) = current {
            self.refresh(attempt, &token);
        }
    }

    // Login polling
    fn poll(
        &self,
        attempt: u64,
        client_id: &str,
        scopes: &str,
        device_code: &str,
        interval: u64,
        expires_at: u64,
    ) {
        let mut interval = interval.max(1);
        loop {
            thread::sleep(self.time_unit * u32::try_from(interval).unwrap_or(u32::MAX));
            if self.lock().attempt != attempt {
                return;
            }
            if now() >= expires_at {
                self.set_status_if_current(
                    attempt,
                    error("The code expired. Please start the login again."),
                );
                return;
            }
            match auth::poll_token(self.http.as_ref(), client_id, scopes, device_code) {
                Ok(PollResult::Pending) | Err(AuthError::Network(_)) => {}
                Ok(PollResult::SlowDown) => interval += SLOW_DOWN_UNITS,
                Ok(PollResult::Granted(grant)) => {
                    self.complete_login(attempt, client_id, grant);
                    return;
                }
                Ok(PollResult::Failed(message)) => {
                    self.set_status_if_current(attempt, error(&format!("Login failed: {message}")));
                    return;
                }
                Err(other) => {
                    self.set_status_if_current(attempt, error_status(&other));
                    return;
                }
            }
        }
    }

    fn complete_login(&self, attempt: u64, client_id: &str, grant: TokenGrant) {
        let info = match auth::validate_token(self.http.as_ref(), &grant.access_token) {
            Ok(Some(info)) => info,
            Ok(None) => {
                self.set_status_if_current(attempt, error("Twitch did not accept the new login."));
                return;
            }
            Err(error) => {
                self.set_status_if_current(attempt, error_status(&error));
                return;
            }
        };
        let token = StoredToken {
            client_id: client_id.to_owned(),
            access_token: grant.access_token,
            refresh_token: grant.refresh_token,
            expires_at: now() + grant.expires_in,
            login: info.login,
            user_id: info.user_id,
            scopes: grant.scope,
        };
        let mut inner = self.lock();
        if inner.attempt != attempt {
            return;
        }
        if let Err(error) = save_token(&self.token_path, &token) {
            inner.status = AuthStatus::Error {
                message: format!("Saving the login failed: {error}"),
            };
        } else {
            inner.status = logged_in(&token);
            inner.token = Some(token);
            inner.last_validated = now();
        }
        drop(inner);
        self.publish();
    }

    // Maintenance
    fn maintain(&self) {
        let (attempt, token, last_validated) = {
            let inner = self.lock();
            match &inner.token {
                Some(token) => (inner.attempt, token.clone(), inner.last_validated),
                None => return,
            }
        };
        let current_time = now();
        if token.expires_at <= current_time + REFRESH_MARGIN_SECONDS {
            self.refresh(attempt, &token);
        } else if current_time.saturating_sub(last_validated) >= VALIDATE_INTERVAL_SECONDS {
            match auth::validate_token(self.http.as_ref(), &token.access_token) {
                Ok(Some(info)) => {
                    let mut inner = self.lock();
                    if inner.attempt == attempt {
                        inner.last_validated = current_time;
                        if let Some(stored) = inner.token.as_mut() {
                            stored.login = info.login;
                        }
                    }
                }
                Ok(None) => self.refresh(attempt, &token),
                Err(_) => {}
            }
        }
    }

    fn refresh(&self, attempt: u64, token: &StoredToken) {
        match auth::refresh_token(self.http.as_ref(), &token.client_id, &token.refresh_token) {
            Ok(grant) => {
                let refreshed = StoredToken {
                    access_token: grant.access_token,
                    refresh_token: grant.refresh_token,
                    expires_at: now() + grant.expires_in,
                    scopes: if grant.scope.is_empty() {
                        token.scopes.clone()
                    } else {
                        grant.scope
                    },
                    ..token.clone()
                };
                let mut inner = self.lock();
                if inner.attempt == attempt && inner.token.is_some() {
                    let _ = save_token(&self.token_path, &refreshed);
                    inner.token = Some(refreshed);
                    inner.last_validated = now();
                }
            }
            Err(AuthError::Rejected(_)) => {
                {
                    let mut inner = self.lock();
                    if inner.attempt != attempt {
                        return;
                    }
                    inner.token = None;
                    inner.status = error("The Twitch login expired. Please log in again.");
                }
                let _ = fs::remove_file(&self.token_path);
                self.publish();
            }
            Err(_) => {}
        }
    }

    // Helpers
    fn set_status_if_current(&self, attempt: u64, status: AuthStatus) {
        {
            let mut inner = self.lock();
            if inner.attempt != attempt {
                return;
            }
            inner.status = status;
        }
        self.publish();
    }

    fn publish(&self) {
        let status = self.status();
        self.events
            .publish("twitch", &serde_json::to_value(status).unwrap_or_default());
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn logged_in(token: &StoredToken) -> AuthStatus {
    AuthStatus::LoggedIn {
        login: token.login.clone(),
        missing_scopes: SCOPES
            .iter()
            .any(|scope| !token.scopes.iter().any(|granted| granted == scope)),
    }
}

fn error(message: &str) -> AuthStatus {
    AuthStatus::Error {
        message: message.to_owned(),
    }
}

fn error_status(error: &AuthError) -> AuthStatus {
    AuthStatus::Error {
        message: error.to_string(),
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn load_token(path: &Path) -> Option<StoredToken> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(content.trim_start_matches('\u{feff}')).ok()
}

fn save_token(path: &Path, token: &StoredToken) -> std::io::Result<()> {
    let content = serde_json::to_string_pretty(token).map_err(std::io::Error::other)?;
    config::write_private_file(path, &content)
}

// Tests
#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;
    use crate::twitch::auth::tests::FakeHttp;

    const DEVICE: &str = r#"{"device_code":"dc","expires_in":1800,"interval":1,"user_code":"ABCD","verification_uri":"https://www.twitch.tv/activate?device-code=ABCD"}"#;
    const GRANT: &str = r#"{"access_token":"at","refresh_token":"rt","expires_in":14000,"scope":["bits:read","user:read:chat","channel:read:goals","channel:read:redemptions","channel:read:subscriptions","moderator:read:followers"],"token_type":"bearer"}"#;
    const VALID: &str = r#"{"client_id":"client","login":"streamer","scopes":[],"user_id":"42","expires_in":14000}"#;
    const PENDING: &str = r#"{"status":400,"message":"authorization_pending"}"#;

    struct Fixture {
        directory: PathBuf,
        http: Arc<FakeHttp>,
        events: Arc<EventBroadcaster>,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }

    fn fixture(name: &str, responses: &[(u16, &str)]) -> Fixture {
        let directory =
            std::env::temp_dir().join(format!("streamxtras-twitch-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        Fixture {
            directory,
            http: Arc::new(FakeHttp::with(responses)),
            events: Arc::new(EventBroadcaster::default()),
        }
    }

    fn account(fixture: &Fixture, client_id: Option<&str>) -> Arc<TwitchAccount> {
        TwitchAccount::with_time_unit(
            fixture.http.clone(),
            client_id.map(str::to_owned),
            &fixture.directory,
            fixture.events.clone(),
            Duration::from_millis(5),
        )
    }

    fn wait_for(account: &TwitchAccount, condition: impl Fn(&AuthStatus) -> bool) -> AuthStatus {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let status = account.status();
            if condition(&status) || Instant::now() > deadline {
                return status;
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn current_access_token(account: &TwitchAccount) -> Option<String> {
        account
            .lock()
            .token
            .as_ref()
            .map(|token| token.access_token.clone())
    }

    fn stored_token(expires_at: u64) -> StoredToken {
        StoredToken {
            client_id: "client".to_owned(),
            access_token: "old".to_owned(),
            refresh_token: "old-refresh".to_owned(),
            expires_at,
            login: "streamer".to_owned(),
            user_id: "42".to_owned(),
            scopes: SCOPES.iter().map(|scope| (*scope).to_owned()).collect(),
        }
    }

    #[test]
    fn is_not_configured_without_client_id() {
        let fixture = fixture("unconfigured", &[]);
        let account = account(&fixture, None);
        assert_eq!(account.status(), AuthStatus::NotConfigured);
        assert_eq!(account.login(), AuthStatus::NotConfigured);
    }

    #[test]
    fn logs_in_with_the_device_code_flow() {
        let fixture = fixture(
            "login",
            &[(200, DEVICE), (400, PENDING), (200, GRANT), (200, VALID)],
        );
        let events = fixture.events.subscribe();
        let account = account(&fixture, Some("client"));

        let status = account.login();
        assert!(matches!(status, AuthStatus::Pending { ref user_code, .. } if user_code == "ABCD"));

        let status = wait_for(&account, |status| {
            matches!(status, AuthStatus::LoggedIn { .. })
        });
        assert_eq!(
            status,
            AuthStatus::LoggedIn {
                login: "streamer".to_owned(),
                missing_scopes: false
            }
        );
        let stored = load_token(&fixture.directory.join(TOKEN_FILE)).unwrap();
        assert_eq!(
            (stored.access_token.as_str(), stored.user_id.as_str()),
            ("at", "42")
        );
        assert!(
            events
                .try_iter()
                .any(|event| event.contains(r#""state":"loggedIn""#))
        );
        assert_eq!(current_access_token(&account), Some("at".to_owned()));
    }

    #[test]
    fn reports_failed_logins() {
        let fixture = fixture(
            "failed",
            &[
                (200, DEVICE),
                (400, r#"{"status":400,"message":"authorization_denied"}"#),
            ],
        );
        let account = account(&fixture, Some("client"));
        account.login();
        let status = wait_for(&account, |status| {
            matches!(status, AuthStatus::Error { .. })
        });
        assert_eq!(status, error("Login failed: authorization_denied"));
    }

    #[test]
    fn logout_removes_and_revokes_the_token() {
        let fixture = fixture("logout", &[(200, "")]);
        save_token(
            &fixture.directory.join(TOKEN_FILE),
            &stored_token(now() + 10_000),
        )
        .unwrap();
        let account = account(&fixture, Some("client"));
        assert!(matches!(account.status(), AuthStatus::LoggedIn { .. }));

        assert_eq!(account.logout(), AuthStatus::LoggedOut);
        assert!(!fixture.directory.join(TOKEN_FILE).exists());
        assert_eq!(current_access_token(&account), None);
        let deadline = Instant::now() + Duration::from_secs(5);
        while fixture.http.requests.lock().unwrap().is_empty() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert!(
            fixture.http.requests.lock().unwrap()[0]
                .contains("oauth2/revoke client_id=client&token=old")
        );
    }

    #[test]
    fn ignores_tokens_of_another_client_id() {
        let fixture = fixture("other-client", &[]);
        save_token(
            &fixture.directory.join(TOKEN_FILE),
            &stored_token(now() + 10_000),
        )
        .unwrap();
        assert_eq!(
            account(&fixture, Some("different")).status(),
            AuthStatus::LoggedOut
        );
    }

    #[test]
    fn refreshes_tokens_before_they_expire() {
        let fixture = fixture("refresh", &[(200, GRANT)]);
        save_token(
            &fixture.directory.join(TOKEN_FILE),
            &stored_token(now() + 60),
        )
        .unwrap();
        let account = account(&fixture, Some("client"));
        account.maintain();
        assert_eq!(current_access_token(&account), Some("at".to_owned()));
        assert!(
            fixture.http.requests.lock().unwrap()[0]
                .contains("grant_type=refresh_token&refresh_token=old-refresh")
        );
        assert_eq!(
            load_token(&fixture.directory.join(TOKEN_FILE))
                .unwrap()
                .refresh_token,
            "rt"
        );
    }

    #[test]
    fn logs_out_when_the_refresh_token_is_rejected() {
        let fixture = fixture(
            "revoked",
            &[(400, r#"{"status":400,"message":"Invalid refresh token"}"#)],
        );
        save_token(
            &fixture.directory.join(TOKEN_FILE),
            &stored_token(now() + 60),
        )
        .unwrap();
        let account = account(&fixture, Some("client"));
        account.maintain();
        assert_eq!(current_access_token(&account), None);
        assert_eq!(
            account.status(),
            error("The Twitch login expired. Please log in again.")
        );
        assert!(!fixture.directory.join(TOKEN_FILE).exists());
    }

    #[test]
    fn detects_missing_scopes() {
        let mut token = stored_token(now() + 10_000);
        token.scopes.pop();
        assert_eq!(
            logged_in(&token),
            AuthStatus::LoggedIn {
                login: "streamer".to_owned(),
                missing_scopes: true
            }
        );
    }
}
