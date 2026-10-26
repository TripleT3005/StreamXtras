use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

use crate::twitch::http::TwitchHttp;

// Constants
const RELEASES_URL: &str =
    "https://api.github.com/repos/TripleT3005/StreamXtras/releases?per_page=10";
const RELEASE_PAGE_PREFIX: &str = "https://github.com/TripleT3005/StreamXtras/releases/";
const CHECK_INTERVAL_SECONDS: u64 = 24 * 60 * 60;
const STATE_FILE: &str = "update-check.json";

// Types
#[derive(Debug, Clone, PartialEq, Eq)]
struct Release {
    version: String,
    url: String,
}

pub struct UpdateChecker {
    http: Arc<dyn TwitchHttp>,
    path: PathBuf,
    current: String,
    lock: Mutex<()>,
}

// Checker
impl UpdateChecker {
    pub fn new(http: Arc<dyn TwitchHttp>, config_dir: &Path, current: &str) -> Self {
        Self {
            http,
            path: config_dir.join(STATE_FILE),
            current: current.to_owned(),
            lock: Mutex::new(()),
        }
    }

    pub fn status(&self) -> Value {
        let _guard = self.lock.lock().unwrap_or_else(PoisonError::into_inner);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_secs());
        let stored = fs::read_to_string(&self.path)
            .ok()
            .and_then(|content| serde_json::from_str::<Value>(&content).ok())
            .unwrap_or_default();
        let checked_at = stored["checkedAt"].as_u64().unwrap_or(0);
        let release = if now.saturating_sub(checked_at) < CHECK_INTERVAL_SECONDS {
            parse_stored(&stored)
        } else {
            let release = self.fetch_latest();
            let content = json!({
                "checkedAt": now,
                "version": release.as_ref().map(|release| release.version.clone()),
                "url": release.as_ref().map(|release| release.url.clone()),
            });
            if let Err(error) = fs::write(&self.path, content.to_string()) {
                eprintln!("Saving the update check failed: {error}");
            }
            release
        };
        let available = release
            .as_ref()
            .filter(|release| is_newer(&release.version, &self.current));
        json!({
            "current": self.current,
            "available": available.is_some(),
            "version": available.map(|release| release.version.clone()),
            "url": available.map(|release| release.url.clone()),
        })
    }

    fn fetch_latest(&self) -> Option<Release> {
        let headers = [
            ("Accept", "application/vnd.github+json"),
            ("User-Agent", "StreamXtras"),
        ];
        match self.http.get(RELEASES_URL, &headers) {
            Ok(response) if response.status == 200 => latest_release(&response.body),
            Ok(response) => {
                eprintln!("Checking for updates failed: HTTP {}", response.status);
                None
            }
            Err(error) => {
                eprintln!("Checking for updates failed: {error}");
                None
            }
        }
    }
}

// Parsing
fn latest_release(body: &str) -> Option<Release> {
    let releases: Value = serde_json::from_str(body).ok()?;
    releases
        .as_array()?
        .iter()
        .filter(|release| release["draft"] != true)
        .filter_map(|release| {
            let version = release["tag_name"].as_str()?.trim_start_matches('v');
            let url = release["html_url"].as_str()?;
            (parse_version(version).is_some() && url.starts_with(RELEASE_PAGE_PREFIX)).then(|| {
                Release {
                    version: version.to_owned(),
                    url: url.to_owned(),
                }
            })
        })
        .max_by_key(|release| parse_version(&release.version))
}

fn parse_stored(stored: &Value) -> Option<Release> {
    let version = stored["version"].as_str()?;
    let url = stored["url"].as_str()?;
    (parse_version(version).is_some() && url.starts_with(RELEASE_PAGE_PREFIX)).then(|| Release {
        version: version.to_owned(),
        url: url.to_owned(),
    })
}

fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.split('.').map(|part| part.parse::<u64>().ok());
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

fn is_newer(candidate: &str, current: &str) -> bool {
    match (parse_version(candidate), parse_version(current)) {
        (Some(candidate), Some(current)) => candidate > current,
        _ => false,
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;
    use crate::twitch::auth::tests::FakeHttp;

    const RELEASES: &str = r#"[
        {"tag_name":"v0.4.1","html_url":"https://github.com/TripleT3005/StreamXtras/releases/tag/v0.4.1","draft":false},
        {"tag_name":"v0.10.0","html_url":"https://github.com/TripleT3005/StreamXtras/releases/tag/v0.10.0","draft":false},
        {"tag_name":"v9.0.0","html_url":"https://github.com/TripleT3005/StreamXtras/releases/tag/v9.0.0","draft":true},
        {"tag_name":"v8.0.0","html_url":"https://evil.example/v8","draft":false},
        {"tag_name":"latest","html_url":"https://github.com/TripleT3005/StreamXtras/releases/tag/latest","draft":false}
    ]"#;

    fn directory(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("streamxtras-update-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.10.0", "0.9.3"));
        assert!(is_newer("1.0.0", "0.99.99"));
        assert!(!is_newer("0.4.1", "0.4.1"));
        assert!(!is_newer("0.4", "0.3.0"));
        assert!(!is_newer("x", "0.3.0"));
    }

    #[test]
    fn picks_the_newest_published_release() {
        assert_eq!(
            latest_release(RELEASES),
            Some(Release {
                version: "0.10.0".to_owned(),
                url: "https://github.com/TripleT3005/StreamXtras/releases/tag/v0.10.0".to_owned(),
            })
        );
        assert_eq!(latest_release("{}"), None);
    }

    #[test]
    fn checks_at_most_once_a_day() {
        let directory = directory("daily");
        let http = Arc::new(FakeHttp::with(&[(200, RELEASES)]));
        let checker = UpdateChecker::new(http.clone(), &directory, "0.4.1");
        let first = checker.status();
        assert_eq!(first["available"], true);
        assert_eq!(first["version"], "0.10.0");
        assert_eq!(checker.status(), first);
        assert_eq!(http.requests.lock().unwrap().len(), 1);
        assert!(http.requests.lock().unwrap()[0].contains("User-Agent: StreamXtras"));

        let current = UpdateChecker::new(http.clone(), &directory, "0.10.0").status();
        assert_eq!(current["available"], false);
        assert_eq!(http.requests.lock().unwrap().len(), 1);
        let _ = fs::remove_dir_all(&directory);
    }
}
