use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use super::account::TwitchAccount;
use super::auth::tests::FakeHttp;
use crate::events::EventBroadcaster;

// Constants
pub const VALID: &str =
    r#"{"client_id":"client","login":"streamer","scopes":[],"user_id":"42","expires_in":10000}"#;

// Fixture
pub struct AccountFixture {
    pub directory: PathBuf,
    pub http: Arc<FakeHttp>,
    pub account: Arc<TwitchAccount>,
}

impl Drop for AccountFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

pub fn account_fixture(name: &str, logged_in: bool, responses: &[(u16, &str)]) -> AccountFixture {
    let directory = std::env::temp_dir().join(format!("streamxtras-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    fs::create_dir_all(&directory).unwrap();
    let http = Arc::new(FakeHttp::default());
    if logged_in {
        let expires_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
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
        http.push(200, VALID);
    }
    for (status, body) in responses {
        http.push(*status, body);
    }
    let account = TwitchAccount::new(
        http.clone(),
        Some("client".to_owned()),
        &directory,
        Arc::new(EventBroadcaster::default()),
    );
    AccountFixture {
        directory,
        http,
        account,
    }
}
