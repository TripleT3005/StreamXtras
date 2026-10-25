use std::error::Error;
use std::net::TcpListener;
use std::thread;

use tiny_http::{Header, Method, Request, Response, Server};

// Constants
pub const APP_NAME: &str = "stream-overlays";
const VERSION: &str = env!("CARGO_PKG_VERSION");

// Types
#[derive(Debug, PartialEq, Eq)]
struct Reply {
    status: u16,
    content_type: &'static str,
    body: String,
}

impl Reply {
    fn new(status: u16, content_type: &'static str, body: impl Into<String>) -> Self {
        Self {
            status,
            content_type,
            body: body.into(),
        }
    }

    fn text(status: u16, body: &str) -> Self {
        Self::new(status, "text/plain; charset=utf-8", body)
    }
}

// Server
pub fn start(listener: TcpListener) -> Result<(), Box<dyn Error + Send + Sync>> {
    let port = listener.local_addr()?.port();
    let server = Server::from_listener(listener, None)?;
    thread::spawn(move || {
        for request in server.incoming_requests() {
            handle(request, port);
        }
    });
    Ok(())
}

fn handle(request: Request, port: u16) {
    let host = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Host"))
        .map(|header| header.value.as_str().to_owned());
    let reply = route(request.method(), request.url(), host.as_deref(), port);
    let response = Response::from_string(reply.body)
        .with_status_code(reply.status)
        .with_header(header("Content-Type", reply.content_type))
        .with_header(header("Cache-Control", "no-store"))
        .with_header(header("X-Content-Type-Options", "nosniff"));
    let _ = request.respond(response);
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("static header is valid")
}

// Routing
fn route(method: &Method, url: &str, host: Option<&str>, port: u16) -> Reply {
    if !is_allowed_host(host, port) {
        return Reply::text(421, "Misdirected request");
    }
    let path = url.split(['?', '#']).next().unwrap_or_default();
    match (method, path) {
        (Method::Get, "/") => Reply::new(200, "text/html; charset=utf-8", placeholder_page()),
        (Method::Get, "/api/health") => Reply::new(
            200,
            "application/json",
            serde_json::json!({ "name": APP_NAME, "version": VERSION }).to_string(),
        ),
        (Method::Get, _) => Reply::text(404, "Not found"),
        _ => Reply::text(405, "Method not allowed"),
    }
}

fn is_allowed_host(host: Option<&str>, port: u16) -> bool {
    host.is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}")
    })
}

fn placeholder_page() -> String {
    format!(
        "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>Stream Overlays</title></head>\n\
         <body><h1>Stream Overlays</h1><p>Version {VERSION} is running. Settings will follow here.</p></body>\n</html>\n"
    )
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    const PORT: u16 = 47_820;

    #[test]
    fn serves_health_information() {
        let reply = route(
            &Method::Get,
            "/api/health?x=1",
            Some("127.0.0.1:47820"),
            PORT,
        );
        assert_eq!(reply.status, 200);
        assert_eq!(reply.content_type, "application/json");
        assert!(reply.body.contains(r#""name":"stream-overlays""#));
    }

    #[test]
    fn accepts_localhost_names_only() {
        assert_eq!(
            route(&Method::Get, "/", Some("LOCALHOST:47820"), PORT).status,
            200
        );
        assert_eq!(
            route(&Method::Get, "/", Some("evil.example:47820"), PORT).status,
            421
        );
        assert_eq!(
            route(&Method::Get, "/", Some("127.0.0.1:1234"), PORT).status,
            421
        );
        assert_eq!(route(&Method::Get, "/", None, PORT).status, 421);
    }

    #[test]
    fn rejects_unknown_paths_and_methods() {
        assert_eq!(
            route(&Method::Get, "/missing", Some("127.0.0.1:47820"), PORT).status,
            404
        );
        assert_eq!(
            route(&Method::Post, "/api/health", Some("127.0.0.1:47820"), PORT).status,
            405
        );
    }
}
