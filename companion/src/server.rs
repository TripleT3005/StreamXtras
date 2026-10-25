use std::fs;
use std::io::{self, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::config::{self, Config};
use crate::events::EventBroadcaster;
use crate::http::{self, Method, ParseError, Request, Response};

// Constants
pub const APP_NAME: &str = "stream-overlays";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const READ_TIMEOUT: Duration = Duration::from_secs(10);
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
const MAX_OVERLAY_ID_LENGTH: usize = 40;

// Types
pub struct AppState {
    pub port: u16,
    pub web_root: PathBuf,
    pub config_dir: PathBuf,
    pub config: Mutex<Config>,
    pub events: EventBroadcaster,
}

enum Outcome {
    Reply(Response),
    EventStream,
}

// Server
pub fn start(listener: TcpListener, state: Arc<AppState>) -> io::Result<()> {
    thread::Builder::new()
        .name("http".to_owned())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let state = Arc::clone(&state);
                let _ = thread::Builder::new()
                    .name("http-connection".to_owned())
                    .spawn(move || handle_connection(&stream, &state));
            }
        })?;
    Ok(())
}

fn handle_connection(stream: &TcpStream, state: &AppState) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let outcome = match http::read_request(stream) {
        Ok(request) => route(&request, state),
        Err(ParseError::TooLarge) => Outcome::Reply(Response::text(413, "Request too large")),
        Err(ParseError::Malformed) => Outcome::Reply(Response::text(400, "Bad request")),
        Err(ParseError::Io(_)) => return,
    };
    match outcome {
        Outcome::Reply(response) => {
            let _ = http::write_response(stream, &response);
        }
        Outcome::EventStream => stream_events(stream, state),
    }
}

// Routing
fn route(request: &Request, state: &AppState) -> Outcome {
    if !is_local_origin(request.header("host"), state.port, "") {
        return Outcome::Reply(Response::text(421, "Misdirected request"));
    }
    let path = request.path.as_str();
    let overlay_id = overlay_settings_id(path);
    let response = match (request.method, path, overlay_id) {
        (Method::Get, "/", _) => Response::redirect("/settings/"),
        (Method::Get, "/api/health", _) => Response::json(
            200,
            &serde_json::json!({ "name": APP_NAME, "version": VERSION }),
        ),
        (Method::Get, "/api/events", _) => return Outcome::EventStream,
        (Method::Get, _, Some(id)) => get_overlay_settings(state, id),
        (Method::Put, _, Some(id)) => put_overlay_settings(request, state, id),
        (Method::Get, _, None) if path.starts_with("/api/") => Response::text(404, "Not found"),
        (Method::Get, _, None) => serve_static(&state.web_root, path),
        _ => Response::text(405, "Method not allowed"),
    };
    Outcome::Reply(response)
}

fn is_local_origin(value: Option<&str>, port: u16, scheme: &str) -> bool {
    value.is_some_and(|value| {
        let value = value.to_ascii_lowercase();
        value == format!("{scheme}127.0.0.1:{port}") || value == format!("{scheme}localhost:{port}")
    })
}

fn overlay_settings_id(path: &str) -> Option<&str> {
    let id = path
        .strip_prefix("/api/overlays/")?
        .strip_suffix("/settings")?;
    let is_valid = !id.is_empty()
        && id.len() <= MAX_OVERLAY_ID_LENGTH
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
    is_valid.then_some(id)
}

// Settings
fn get_overlay_settings(state: &AppState, id: &str) -> Response {
    let config = lock(&state.config);
    let settings = config.overlays.get(id).cloned().unwrap_or_default();
    Response::json(200, &serde_json::Value::Object(settings))
}

fn put_overlay_settings(request: &Request, state: &AppState, id: &str) -> Response {
    if !is_local_origin(request.header("origin"), state.port, "http://") {
        return Response::text(403, "Forbidden");
    }
    if !request
        .header("content-type")
        .is_some_and(|value| value.starts_with("application/json"))
    {
        return Response::text(415, "Expected application/json");
    }
    let Ok(serde_json::Value::Object(settings)) = serde_json::from_slice(&request.body) else {
        return Response::text(400, "Expected a JSON object");
    };

    let mut config = lock(&state.config);
    let previous = config.overlays.insert(id.to_owned(), settings.clone());
    if let Err(error) = config::save(&state.config_dir, &config) {
        match previous {
            Some(previous) => config.overlays.insert(id.to_owned(), previous),
            None => config.overlays.remove(id),
        };
        eprintln!("Saving settings failed: {error}");
        return Response::text(500, "Saving settings failed");
    }
    drop(config);

    let settings = serde_json::Value::Object(settings);
    state.events.publish(
        "settings",
        &serde_json::json!({ "overlay": id, "settings": settings }),
    );
    Response::json(200, &settings)
}

fn lock(config: &Mutex<Config>) -> std::sync::MutexGuard<'_, Config> {
    config
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

// Static files
fn serve_static(web_root: &Path, url_path: &str) -> Response {
    let Some(path) = resolve_static_path(web_root, url_path) else {
        return Response::text(404, "Not found");
    };
    if path.is_dir() {
        return Response::redirect(&format!("{url_path}/"));
    }
    match fs::read(&path) {
        Ok(content) => Response::new(200, content_type(&path), content),
        Err(_) => Response::text(404, "Not found"),
    }
}

fn resolve_static_path(web_root: &Path, url_path: &str) -> Option<PathBuf> {
    if url_path.contains(['\\', '%', '\0', ':']) {
        return None;
    }
    let mut path = web_root.to_path_buf();
    for segment in url_path.split('/').filter(|segment| !segment.is_empty()) {
        if segment.starts_with('.') {
            return None;
        }
        path.push(segment);
    }
    if url_path.ends_with('/') {
        path.push("index.html");
    }
    Some(path)
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

// Events
fn stream_events(mut stream: &TcpStream, state: &AppState) {
    let receiver = state.events.subscribe();
    if http::write_event_stream_head(stream).is_err()
        || stream
            .write_all(b"retry: 2000\n\n")
            .and_then(|()| stream.flush())
            .is_err()
    {
        return;
    }
    loop {
        let message = match receiver.recv_timeout(KEEPALIVE_INTERVAL) {
            Ok(message) => message,
            Err(RecvTimeoutError::Timeout) => ": keepalive\n\n".to_owned(),
            Err(RecvTimeoutError::Disconnected) => return,
        };
        if stream
            .write_all(message.as_bytes())
            .and_then(|()| stream.flush())
            .is_err()
        {
            return;
        }
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    const PORT: u16 = 47_820;

    struct TestState {
        state: AppState,
        root: PathBuf,
    }

    impl Drop for TestState {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn test_state(name: &str) -> TestState {
        let root = std::env::temp_dir().join(format!(
            "stream-overlays-server-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let web_root = root.join("web");
        fs::create_dir_all(web_root.join("chatbox")).unwrap();
        fs::write(web_root.join("chatbox").join("index.html"), "<p>chat</p>").unwrap();
        fs::write(web_root.join("chatbox").join("chatbox.css"), "p{}").unwrap();
        fs::write(root.join("secret.txt"), "secret").unwrap();
        TestState {
            state: AppState {
                port: PORT,
                web_root,
                config_dir: root.join("config"),
                config: Mutex::new(Config::default()),
                events: EventBroadcaster::default(),
            },
            root,
        }
    }

    fn request(raw: &str) -> Request {
        http::read_request(raw.as_bytes()).unwrap()
    }

    fn get(path: &str) -> Request {
        request(&format!(
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\n\r\n"
        ))
    }

    fn put(path: &str, origin: &str, content_type: &str, body: &str) -> Request {
        request(&format!(
            "PUT {path} HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nOrigin: {origin}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ))
    }

    fn reply(request: &Request, state: &AppState) -> Response {
        match route(request, state) {
            Outcome::Reply(response) => response,
            Outcome::EventStream => panic!("unexpected event stream"),
        }
    }

    #[test]
    fn rejects_foreign_hosts() {
        let test = test_state("host");
        let foreign = request("GET /api/health HTTP/1.1\r\nHost: evil.example:47820\r\n\r\n");
        assert_eq!(reply(&foreign, &test.state).status, 421);
        let missing = request("GET /api/health HTTP/1.1\r\n\r\n");
        assert_eq!(reply(&missing, &test.state).status, 421);
        assert_eq!(reply(&get("/api/health"), &test.state).status, 200);
    }

    #[test]
    fn serves_static_files_and_redirects_directories() {
        let test = test_state("static");
        let page = reply(&get("/chatbox/"), &test.state);
        assert_eq!(
            (page.status, page.content_type, page.body.as_slice()),
            (200, "text/html; charset=utf-8", &b"<p>chat</p>"[..])
        );
        assert_eq!(
            reply(&get("/chatbox/chatbox.css?v=1"), &test.state).content_type,
            "text/css; charset=utf-8"
        );
        let redirect = reply(&get("/chatbox"), &test.state);
        assert_eq!(redirect.status, 302);
        assert_eq!(redirect.headers, vec![("Location", "/chatbox/".to_owned())]);
        assert_eq!(
            reply(&get("/"), &test.state).headers,
            vec![("Location", "/settings/".to_owned())]
        );
    }

    #[test]
    fn blocks_paths_outside_the_web_root() {
        let test = test_state("traversal");
        for path in [
            "/../secret.txt",
            "/chatbox/../../secret.txt",
            "/%2e%2e/secret.txt",
            "/..\\secret.txt",
            "/.hidden",
            "/C:/Windows/win.ini",
            "/missing.js",
        ] {
            assert_eq!(reply(&get(path), &test.state).status, 404, "{path}");
        }
    }

    #[test]
    fn stores_and_returns_overlay_settings() {
        let test = test_state("settings");
        let events = test.state.events.subscribe();
        let origin = format!("http://127.0.0.1:{PORT}");
        let saved = reply(
            &put(
                "/api/overlays/chatbox/settings",
                &origin,
                "application/json",
                r#"{"channel":"test"}"#,
            ),
            &test.state,
        );
        assert_eq!(saved.status, 200);
        let loaded = reply(&get("/api/overlays/chatbox/settings"), &test.state);
        assert_eq!(loaded.body, br#"{"channel":"test"}"#);
        assert!(
            events
                .try_recv()
                .unwrap()
                .contains(r#""overlay":"chatbox""#)
        );
        let (stored, _) = config::load_or_create(&test.state.config_dir).unwrap();
        assert_eq!(stored.overlays["chatbox"]["channel"], "test");
        assert_eq!(
            reply(&get("/api/overlays/unknown/settings"), &test.state).body,
            b"{}"
        );
    }

    #[test]
    fn protects_settings_against_foreign_pages() {
        let test = test_state("csrf");
        let path = "/api/overlays/chatbox/settings";
        let origin = format!("http://localhost:{PORT}");
        assert_eq!(
            reply(
                &put(path, "https://evil.example", "application/json", "{}"),
                &test.state
            )
            .status,
            403
        );
        assert_eq!(
            reply(&put(path, &origin, "text/plain", "{}"), &test.state).status,
            415
        );
        assert_eq!(
            reply(&put(path, &origin, "application/json", "[1]"), &test.state).status,
            400
        );
        let no_origin = request(&format!(
            "PUT {path} HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{{}}"
        ));
        assert_eq!(reply(&no_origin, &test.state).status, 403);
    }

    #[test]
    fn validates_overlay_ids() {
        assert_eq!(
            overlay_settings_id("/api/overlays/chatbox/settings"),
            Some("chatbox")
        );
        assert_eq!(
            overlay_settings_id("/api/overlays/alert-box-2/settings"),
            Some("alert-box-2")
        );
        assert_eq!(overlay_settings_id("/api/overlays//settings"), None);
        assert_eq!(overlay_settings_id("/api/overlays/Chat/settings"), None);
        assert_eq!(overlay_settings_id("/api/overlays/a/b/settings"), None);
    }

    #[test]
    fn starts_event_streams() {
        let test = test_state("events");
        assert!(matches!(
            route(&get("/api/events"), &test.state),
            Outcome::EventStream
        ));
    }
}
