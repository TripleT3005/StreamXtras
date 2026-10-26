use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

use crate::server::APP_NAME;

// Constants
const TIMEOUT: Duration = Duration::from_millis(800);

// Detection
pub fn is_running(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(TIMEOUT));
    let _ = stream.set_write_timeout(Some(TIMEOUT));
    let request =
        format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.take(4096).read_to_string(&mut response);
    response.starts_with("HTTP/1.1 200") && response.contains(&format!(r#""name":"{APP_NAME}""#))
}

// Tests
#[cfg(test)]
mod tests {
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::alert_control::AlertControl;
    use crate::config::Config;
    use crate::events::EventBroadcaster;
    use crate::server::{self, AppState};
    use crate::stats::Stats;
    use crate::twitch::account::TwitchAccount;
    use crate::twitch::auth::tests::FakeHttp;
    use crate::twitch::helix::HelixClient;
    use crate::update::UpdateChecker;

    #[test]
    fn detects_a_running_instance() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let twitch = TwitchAccount::new(
            Arc::new(FakeHttp::default()),
            None,
            &std::env::temp_dir(),
            Arc::new(EventBroadcaster::default()),
        );
        let state = AppState {
            port,
            web_root: PathBuf::new(),
            config_dir: PathBuf::new(),
            config: Mutex::new(Config::default()),
            events: Arc::new(EventBroadcaster::default()),
            helix: Arc::new(HelixClient::new(
                Arc::new(FakeHttp::default()),
                twitch.clone(),
            )),
            stats: Stats::new(
                &std::env::temp_dir(),
                Arc::new(EventBroadcaster::default()),
                twitch.clone(),
                Arc::new(HelixClient::new(
                    Arc::new(FakeHttp::default()),
                    twitch.clone(),
                )),
            ),
            alert_control: AlertControl::new(Arc::new(EventBroadcaster::default())),
            update: Arc::new(UpdateChecker::new(
                Arc::new(FakeHttp::default()),
                &std::env::temp_dir(),
                "0.0.0",
            )),
            twitch,
        };
        server::start(listener, Arc::new(state)).unwrap();
        assert!(is_running(port));
    }

    #[test]
    fn ignores_other_programs_on_the_port() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
            }
        });
        assert!(!is_running(port));
    }
}
