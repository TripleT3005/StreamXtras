use std::collections::HashMap;
use std::fmt::{self, Write as _};
use std::io::{self, BufRead, BufReader, Read, Write};

// Constants
const MAX_HEAD_BYTES: usize = 16 * 1024;
pub const MAX_BODY_BYTES: usize = 64 * 1024;
pub const MAX_UPLOAD_BYTES: usize = 50 * 1024 * 1024;

// Types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Put,
    Delete,
    Other,
}

#[derive(Debug)]
pub struct Request {
    pub method: Method,
    pub path: String,
    pub query: String,
    headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .get(&name.to_ascii_lowercase())
            .map(String::as_str)
    }
}

#[derive(Debug)]
pub enum ParseError {
    Io(io::Error),
    Malformed,
    TooLarge,
}

impl fmt::Display for ParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "{error}"),
            Self::Malformed => write!(formatter, "malformed request"),
            Self::TooLarge => write!(formatter, "request too large"),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl Response {
    pub fn new(status: u16, content_type: &'static str, body: impl Into<Vec<u8>>) -> Self {
        Self {
            status,
            content_type,
            headers: Vec::new(),
            body: body.into(),
        }
    }

    pub fn redirect(location: &str) -> Self {
        let mut response = Self::text(302, "Found");
        response.headers.push(("Location", location.to_owned()));
        response
    }

    pub fn text(status: u16, body: &str) -> Self {
        Self::new(status, "text/plain; charset=utf-8", body)
    }

    pub fn json(status: u16, value: &serde_json::Value) -> Self {
        Self::new(status, "application/json", value.to_string())
    }
}

// Parsing
pub fn read_request(
    stream: impl Read,
    body_limit: impl Fn(&str) -> usize,
) -> Result<Request, ParseError> {
    let mut reader = BufReader::new(stream.take((MAX_HEAD_BYTES + MAX_UPLOAD_BYTES) as u64));
    let mut head_bytes = 0;

    let request_line = read_line(&mut reader, &mut head_bytes)?;
    let mut parts = request_line.split(' ');
    let (Some(method), Some(target), Some(version), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(ParseError::Malformed);
    };
    if !version.starts_with("HTTP/1.") || !target.starts_with('/') {
        return Err(ParseError::Malformed);
    }

    let mut headers = HashMap::new();
    loop {
        let line = read_line(&mut reader, &mut head_bytes)?;
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':').ok_or(ParseError::Malformed)?;
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_owned());
    }

    let content_length = match headers.get("content-length") {
        Some(value) => value.parse::<usize>().map_err(|_| ParseError::Malformed)?,
        None => 0,
    };
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if content_length > body_limit(path).min(MAX_UPLOAD_BYTES) {
        return Err(ParseError::TooLarge);
    }
    let mut body = vec![0; content_length];
    reader.read_exact(&mut body).map_err(ParseError::Io)?;

    Ok(Request {
        method: match method {
            "GET" => Method::Get,
            "PUT" => Method::Put,
            "DELETE" => Method::Delete,
            _ => Method::Other,
        },
        path: path.to_owned(),
        query: query.to_owned(),
        headers,
        body,
    })
}

fn read_line(reader: &mut impl BufRead, head_bytes: &mut usize) -> Result<String, ParseError> {
    let mut line = Vec::new();
    let read = reader
        .by_ref()
        .take((MAX_HEAD_BYTES - *head_bytes) as u64)
        .read_until(b'\n', &mut line)
        .map_err(ParseError::Io)?;
    *head_bytes += read;
    if !line.ends_with(b"\n") {
        return Err(if *head_bytes >= MAX_HEAD_BYTES {
            ParseError::TooLarge
        } else {
            ParseError::Malformed
        });
    }
    let line = String::from_utf8(line).map_err(|_| ParseError::Malformed)?;
    Ok(line.trim_end_matches(['\r', '\n']).to_owned())
}

// Writing
pub fn write_response(mut stream: impl Write, response: &Response) -> io::Result<()> {
    let extra_headers =
        response
            .headers
            .iter()
            .fold(String::new(), |mut headers, (name, value)| {
                let _ = write!(headers, "{name}: {value}\r\n");
                headers
            });
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n{extra_headers}{}\r\n",
        response.status,
        reason(response.status),
        response.content_type,
        response.body.len(),
        common_headers(),
    );
    stream.write_all(head.as_bytes())?;
    stream.write_all(&response.body)?;
    stream.flush()
}

pub fn write_event_stream_head(mut stream: impl Write) -> io::Result<()> {
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n{}\r\n",
        common_headers()
    );
    stream.write_all(head.as_bytes())?;
    stream.flush()
}

fn common_headers() -> &'static str {
    "Cache-Control: no-store\r\n\
     X-Content-Type-Options: nosniff\r\n\
     Referrer-Policy: no-referrer\r\n\
     Content-Security-Policy: frame-ancestors 'self'\r\n\
     Connection: close\r\n"
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        302 => "Found",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Content Too Large",
        415 => "Unsupported Media Type",
        421 => "Misdirected Request",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Internal Server Error",
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_request_line_headers_and_body() {
        let raw = b"PUT /api/x?a=1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\nContent-Length: 4\r\nX-Test:  value \r\n\r\nbody";
        let request = read_request(&raw[..], |_| MAX_BODY_BYTES).unwrap();
        assert_eq!(request.method, Method::Put);
        assert_eq!(request.path, "/api/x");
        assert_eq!(request.header("HOST"), Some("127.0.0.1:1"));
        assert_eq!(request.header("x-test"), Some("value"));
        assert_eq!(request.body, b"body");
    }

    #[test]
    fn applies_the_body_limit_per_path_and_parses_delete() {
        let limit = |path: &str| {
            if path == "/api/media" {
                MAX_UPLOAD_BYTES
            } else {
                MAX_BODY_BYTES
            }
        };
        let mut raw = format!(
            "PUT /api/media?name=a.png HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        )
        .into_bytes();
        raw.resize(raw.len() + MAX_BODY_BYTES + 1, b'x');
        let request = read_request(raw.as_slice(), limit).unwrap();
        assert_eq!(
            (request.path.as_str(), request.query.as_str()),
            ("/api/media", "name=a.png")
        );
        let other = format!(
            "PUT /api/other HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        );
        assert!(matches!(
            read_request(other.as_bytes(), limit),
            Err(ParseError::TooLarge)
        ));
        let delete = read_request(&b"DELETE /api/media/a.png HTTP/1.1\r\n\r\n"[..], limit).unwrap();
        assert_eq!(delete.method, Method::Delete);
    }

    #[test]
    fn accepts_bare_line_feeds() {
        let request =
            read_request(&b"GET / HTTP/1.0\nHost: a\n\n"[..], |_| MAX_BODY_BYTES).unwrap();
        assert_eq!(request.method, Method::Get);
        assert_eq!(request.header("host"), Some("a"));
    }

    #[test]
    fn rejects_malformed_requests() {
        for raw in [
            &b"GET\r\n\r\n"[..],
            b"GET / HTTP/2\r\n\r\n",
            b"GET relative HTTP/1.1\r\n\r\n",
            b"GET / HTTP/1.1\r\nNoColon\r\n\r\n",
            b"GET / HTTP/1.1\r\nHost: a\r\n",
            b"PUT / HTTP/1.1\r\nContent-Length: x\r\n\r\n",
        ] {
            assert!(
                matches!(
                    read_request(raw, |_| MAX_BODY_BYTES),
                    Err(ParseError::Malformed)
                ),
                "{raw:?}"
            );
        }
    }

    #[test]
    fn rejects_oversized_requests() {
        let long_header = format!(
            "GET / HTTP/1.1\r\nX: {}\r\n\r\n",
            "a".repeat(MAX_HEAD_BYTES)
        );
        assert!(matches!(
            read_request(long_header.as_bytes(), |_| MAX_BODY_BYTES),
            Err(ParseError::TooLarge)
        ));
        let big_body = format!(
            "PUT / HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        );
        assert!(matches!(
            read_request(big_body.as_bytes(), |_| MAX_BODY_BYTES),
            Err(ParseError::TooLarge)
        ));
    }

    #[test]
    fn writes_response_with_security_headers() {
        let mut output = Vec::new();
        write_response(&mut output, &Response::text(404, "Not found")).unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(text.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(text.contains("Content-Length: 9\r\n"));
        assert!(text.contains("X-Content-Type-Options: nosniff\r\n"));
        assert!(text.contains("Content-Security-Policy: frame-ancestors 'self'\r\n"));
        assert!(text.ends_with("\r\n\r\nNot found"));
    }
}
