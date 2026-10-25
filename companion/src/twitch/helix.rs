use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{Map, Value, json};

use super::account::TwitchAccount;
use super::http::TwitchHttp;

// Constants
const API_URL: &str = "https://api.twitch.tv/helix";
const BADGE_CACHE_DURATION: Duration = Duration::from_secs(60 * 60);
const USER_CACHE_DURATION: Duration = Duration::from_secs(6 * 60 * 60);
const MAX_CACHE_ENTRIES: usize = 500;

// Types
#[derive(Debug, PartialEq, Eq)]
pub enum HelixError {
    NotLoggedIn,
    NotFound,
    Failed(String),
}

impl fmt::Display for HelixError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotLoggedIn => write!(formatter, "not logged in to Twitch"),
            Self::NotFound => write!(formatter, "not found"),
            Self::Failed(message) => write!(formatter, "Twitch API request failed: {message}"),
        }
    }
}

#[derive(Deserialize)]
struct DataResponse<T> {
    data: Vec<T>,
}

#[derive(Deserialize)]
struct BadgeSet {
    set_id: String,
    versions: Vec<BadgeVersion>,
}

#[derive(Deserialize)]
struct BadgeVersion {
    id: String,
    image_url_2x: String,
    #[serde(default)]
    title: String,
}

#[derive(Deserialize)]
struct User {
    id: String,
    login: String,
    display_name: String,
    profile_image_url: String,
}

struct CacheEntry {
    fetched_at: Instant,
    value: Value,
}

pub struct HelixClient {
    http: Arc<dyn TwitchHttp>,
    account: Arc<TwitchAccount>,
    cache: Mutex<HashMap<String, CacheEntry>>,
}

// Client
impl HelixClient {
    pub fn new(http: Arc<dyn TwitchHttp>, account: Arc<TwitchAccount>) -> Self {
        Self {
            http,
            account,
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn global_badges(&self) -> Result<Value, HelixError> {
        self.cached("badges:global", BADGE_CACHE_DURATION, || {
            self.get("/chat/badges/global")
                .and_then(|body| parse_badges(&body))
        })
    }

    pub fn channel_badges(&self, broadcaster_id: &str) -> Result<Value, HelixError> {
        let broadcaster_id = validate_id(broadcaster_id)?;
        self.cached(
            &format!("badges:{broadcaster_id}"),
            BADGE_CACHE_DURATION,
            || {
                self.get(&format!("/chat/badges?broadcaster_id={broadcaster_id}"))
                    .and_then(|body| parse_badges(&body))
            },
        )
    }

    pub fn user(&self, user_id: &str) -> Result<Value, HelixError> {
        let user_id = validate_id(user_id)?;
        self.cached(&format!("user:{user_id}"), USER_CACHE_DURATION, || {
            self.get(&format!("/users?id={user_id}"))
                .and_then(|body| parse_user(&body))
        })
    }

    // Requests
    fn get(&self, path: &str) -> Result<String, HelixError> {
        let response = self.request(path)?;
        let response = if response.status == 401 {
            self.account.refresh_after_rejection();
            self.request(path)?
        } else {
            response
        };
        match response.status {
            200 => Ok(response.body),
            401 => Err(HelixError::NotLoggedIn),
            status => Err(HelixError::Failed(format!("HTTP {status}"))),
        }
    }

    fn request(&self, path: &str) -> Result<super::http::HttpResponse, HelixError> {
        let (client_id, access_token) =
            self.account.access_token().ok_or(HelixError::NotLoggedIn)?;
        let authorization = format!("Bearer {access_token}");
        self.http
            .get(
                &format!("{API_URL}{path}"),
                &[("Authorization", &authorization), ("Client-Id", &client_id)],
            )
            .map_err(HelixError::Failed)
    }

    // Cache
    fn cached(
        &self,
        key: &str,
        duration: Duration,
        load: impl FnOnce() -> Result<Value, HelixError>,
    ) -> Result<Value, HelixError> {
        if let Some(entry) = self.lock_cache().get(key)
            && entry.fetched_at.elapsed() < duration
        {
            return Ok(entry.value.clone());
        }
        let value = load()?;
        let mut cache = self.lock_cache();
        if cache.len() >= MAX_CACHE_ENTRIES {
            cache.retain(|_, entry| entry.fetched_at.elapsed() < duration);
        }
        cache.insert(
            key.to_owned(),
            CacheEntry {
                fetched_at: Instant::now(),
                value: value.clone(),
            },
        );
        Ok(value)
    }

    fn lock_cache(&self) -> std::sync::MutexGuard<'_, HashMap<String, CacheEntry>> {
        self.cache.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

// Parsing
fn validate_id(id: &str) -> Result<&str, HelixError> {
    if !id.is_empty() && id.len() <= 20 && id.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(id)
    } else {
        Err(HelixError::NotFound)
    }
}

fn parse_badges(body: &str) -> Result<Value, HelixError> {
    let response: DataResponse<BadgeSet> =
        serde_json::from_str(body).map_err(|error| HelixError::Failed(error.to_string()))?;
    let sets: Map<String, Value> = response
        .data
        .into_iter()
        .map(|set| {
            let versions: Map<String, Value> = set
                .versions
                .into_iter()
                .map(|version| {
                    (
                        version.id,
                        json!({ "url": version.image_url_2x, "title": version.title }),
                    )
                })
                .collect();
            (set.set_id, Value::Object(versions))
        })
        .collect();
    Ok(Value::Object(sets))
}

fn parse_user(body: &str) -> Result<Value, HelixError> {
    let response: DataResponse<User> =
        serde_json::from_str(body).map_err(|error| HelixError::Failed(error.to_string()))?;
    let user = response
        .data
        .into_iter()
        .next()
        .ok_or(HelixError::NotFound)?;
    Ok(json!({
        "id": user.id,
        "login": user.login,
        "displayName": user.display_name,
        "profileImageUrl": user.profile_image_url.replace("-300x300.", "-70x70."),
    }))
}

// Tests
#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;
    use crate::events::EventBroadcaster;
    use crate::twitch::auth::tests::FakeHttp;

    const GLOBAL_BADGES: &str = r#"{"data":[{"set_id":"moderator","versions":[{"id":"1","image_url_1x":"https://cdn/mod/1","image_url_2x":"https://cdn/mod/2","image_url_4x":"https://cdn/mod/3","title":"Moderator"}]},{"set_id":"subscriber","versions":[{"id":"0","image_url_2x":"https://cdn/sub0/2","title":"Subscriber"},{"id":"12","image_url_2x":"https://cdn/sub12/2","title":"1-Year Subscriber"}]}]}"#;
    const VALID: &str = r#"{"client_id":"client","login":"streamer","scopes":[],"user_id":"42","expires_in":10000}"#;
    const USER: &str = r#"{"data":[{"id":"42","login":"streamer","display_name":"Streamer","type":"","broadcaster_type":"partner","profile_image_url":"https://cdn/user-profile_image-300x300.png"}]}"#;

    struct Fixture {
        directory: PathBuf,
        http: Arc<FakeHttp>,
        client: HelixClient,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }

    fn fixture(name: &str, logged_in: bool, responses: &[(u16, &str)]) -> Fixture {
        let directory =
            std::env::temp_dir().join(format!("streamxtras-helix-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        if logged_in {
            let expires_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + 10_000;
            fs::write(
                directory.join("twitch-token.json"),
                format!(
                    r#"{{"clientId":"client","accessToken":"token","refreshToken":"refresh","expiresAt":{expires_at},"login":"streamer","userId":"42","scopes":[]}}"#
                ),
            )
            .unwrap();
        }
        let http = Arc::new(FakeHttp::with(if logged_in {
            &[(200, VALID)]
        } else {
            &[]
        }));
        for (status, body) in responses {
            http.push(*status, body);
        }
        let account = TwitchAccount::new(
            http.clone(),
            Some("client".to_owned()),
            &directory,
            Arc::new(EventBroadcaster::default()),
        );
        Fixture {
            client: HelixClient::new(http.clone(), account),
            directory,
            http,
        }
    }

    #[test]
    fn normalizes_and_caches_badges() {
        let fixture = fixture("badges", true, &[(200, GLOBAL_BADGES)]);
        let badges = fixture.client.global_badges().unwrap();
        assert_eq!(badges["moderator"]["1"]["url"], "https://cdn/mod/2");
        assert_eq!(badges["subscriber"]["12"]["title"], "1-Year Subscriber");
        assert_eq!(fixture.client.global_badges().unwrap(), badges);
        let requests = fixture.http.requests.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].contains("oauth2/validate"));
        assert_eq!(
            requests[1],
            "GET https://api.twitch.tv/helix/chat/badges/global Authorization: Bearer token; Client-Id: client"
        );
    }

    #[test]
    fn loads_channel_badges_and_users() {
        let fixture = fixture("channel", true, &[(200, GLOBAL_BADGES), (200, USER)]);
        assert!(fixture.client.channel_badges("1337").unwrap()["moderator"].is_object());
        let user = fixture.client.user("42").unwrap();
        assert_eq!(user["displayName"], "Streamer");
        assert_eq!(
            user["profileImageUrl"],
            "https://cdn/user-profile_image-70x70.png"
        );
        let requests = fixture.http.requests.lock().unwrap();
        assert!(requests[1].contains("/chat/badges?broadcaster_id=1337"));
        assert!(requests[2].contains("/users?id=42"));
    }

    #[test]
    fn rejects_invalid_ids_without_requests() {
        let fixture = fixture("ids", true, &[]);
        assert_eq!(
            fixture.client.channel_badges("12&x=1"),
            Err(HelixError::NotFound)
        );
        assert_eq!(fixture.client.user(""), Err(HelixError::NotFound));
        assert!(fixture.http.requests.lock().unwrap().is_empty());
    }

    #[test]
    fn requires_a_login() {
        let fixture = fixture("logged-out", false, &[]);
        assert_eq!(fixture.client.global_badges(), Err(HelixError::NotLoggedIn));
    }

    #[test]
    fn refreshes_the_token_once_when_twitch_rejects_it() {
        let fixture = fixture(
            "unauthorized",
            true,
            &[
                (401, r#"{"error":"Unauthorized","status":401}"#),
                (
                    200,
                    r#"{"access_token":"new","refresh_token":"new-refresh","expires_in":14000,"scope":[]}"#,
                ),
                (200, GLOBAL_BADGES),
            ],
        );
        assert!(fixture.client.global_badges().is_ok());
        let requests = fixture.http.requests.lock().unwrap();
        assert!(requests[2].contains("grant_type=refresh_token"));
        assert!(requests[3].contains("Authorization: Bearer new"));
    }

    #[test]
    fn reports_unknown_users() {
        let fixture = fixture("unknown", true, &[(200, r#"{"data":[]}"#)]);
        assert_eq!(fixture.client.user("7"), Err(HelixError::NotFound));
    }
}
