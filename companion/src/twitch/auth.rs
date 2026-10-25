use std::fmt;

use serde::Deserialize;

use super::http::{HttpResponse, TwitchHttp};

// Constants
const DEVICE_URL: &str = "https://id.twitch.tv/oauth2/device";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const REVOKE_URL: &str = "https://id.twitch.tv/oauth2/revoke";
const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";

// Types
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DeviceAuthorization {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct TokenGrant {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    #[serde(default)]
    pub scope: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct TokenInfo {
    pub login: String,
    pub user_id: String,
    pub expires_in: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum PollResult {
    Pending,
    SlowDown,
    Granted(TokenGrant),
    Failed(String),
}

#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    Network(String),
    Rejected(String),
    InvalidResponse(String),
}

impl fmt::Display for AuthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Network(message) => write!(formatter, "Twitch is not reachable: {message}"),
            Self::Rejected(message) => write!(formatter, "Twitch rejected the request: {message}"),
            Self::InvalidResponse(message) => {
                write!(formatter, "unexpected answer from Twitch: {message}")
            }
        }
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    #[serde(default)]
    message: String,
}

// Requests
pub fn request_device_code(
    http: &dyn TwitchHttp,
    client_id: &str,
    scopes: &str,
) -> Result<DeviceAuthorization, AuthError> {
    let response = post(
        http,
        DEVICE_URL,
        &[("client_id", client_id), ("scopes", scopes)],
    )?;
    parse_success(&response)
}

pub fn poll_token(
    http: &dyn TwitchHttp,
    client_id: &str,
    scopes: &str,
    device_code: &str,
) -> Result<PollResult, AuthError> {
    let response = post(
        http,
        TOKEN_URL,
        &[
            ("client_id", client_id),
            ("scopes", scopes),
            ("device_code", device_code),
            ("grant_type", DEVICE_GRANT_TYPE),
        ],
    )?;
    if response.status == 200 {
        return parse_success(&response).map(PollResult::Granted);
    }
    let message = error_message(&response);
    Ok(match message.as_str() {
        "authorization_pending" => PollResult::Pending,
        "slow_down" => PollResult::SlowDown,
        _ => PollResult::Failed(message),
    })
}

pub fn refresh_token(
    http: &dyn TwitchHttp,
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenGrant, AuthError> {
    let response = post(
        http,
        TOKEN_URL,
        &[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ],
    )?;
    parse_success(&response)
}

pub fn validate_token(
    http: &dyn TwitchHttp,
    access_token: &str,
) -> Result<Option<TokenInfo>, AuthError> {
    let authorization = format!("OAuth {access_token}");
    let response = http
        .get(VALIDATE_URL, &[("Authorization", &authorization)])
        .map_err(AuthError::Network)?;
    if response.status == 401 {
        return Ok(None);
    }
    parse_success(&response).map(Some)
}

pub fn revoke_token(
    http: &dyn TwitchHttp,
    client_id: &str,
    access_token: &str,
) -> Result<(), AuthError> {
    let response = post(
        http,
        REVOKE_URL,
        &[("client_id", client_id), ("token", access_token)],
    )?;
    if response.status == 200 {
        Ok(())
    } else {
        Err(AuthError::Rejected(error_message(&response)))
    }
}

// Helpers
fn post(
    http: &dyn TwitchHttp,
    url: &str,
    form: &[(&str, &str)],
) -> Result<HttpResponse, AuthError> {
    http.post_form(url, form).map_err(AuthError::Network)
}

fn parse_success<T: for<'de> Deserialize<'de>>(response: &HttpResponse) -> Result<T, AuthError> {
    if response.status != 200 {
        return Err(AuthError::Rejected(error_message(response)));
    }
    serde_json::from_str(&response.body)
        .map_err(|error| AuthError::InvalidResponse(error.to_string()))
}

fn error_message(response: &HttpResponse) -> String {
    serde_json::from_str::<ErrorBody>(&response.body)
        .ok()
        .map(|body| body.message)
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| format!("HTTP {}", response.status))
}

// Tests
#[cfg(test)]
pub mod tests {
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    pub struct FakeHttp {
        pub responses: Mutex<VecDeque<HttpResponse>>,
        pub requests: Mutex<Vec<String>>,
    }

    impl FakeHttp {
        pub fn with(responses: &[(u16, &str)]) -> Self {
            let fake = Self::default();
            for (status, body) in responses {
                fake.push(*status, body);
            }
            fake
        }

        pub fn push(&self, status: u16, body: &str) {
            self.responses.lock().unwrap().push_back(HttpResponse {
                status,
                body: body.to_owned(),
            });
        }

        fn next(&self, request: String) -> Result<HttpResponse, String> {
            self.requests.lock().unwrap().push(request);
            self.responses
                .lock()
                .unwrap()
                .pop_front()
                .ok_or_else(|| "no response".to_owned())
        }
    }

    impl TwitchHttp for FakeHttp {
        fn post_form(&self, url: &str, form: &[(&str, &str)]) -> Result<HttpResponse, String> {
            let fields: Vec<String> = form
                .iter()
                .map(|(key, value)| format!("{key}={value}"))
                .collect();
            self.next(format!("POST {url} {}", fields.join("&")))
        }

        fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String> {
            let fields: Vec<String> = headers
                .iter()
                .map(|(key, value)| format!("{key}: {value}"))
                .collect();
            self.next(format!("GET {url} {}", fields.join("; ")))
        }

        fn post_json(
            &self,
            url: &str,
            headers: &[(&str, &str)],
            body: &str,
        ) -> Result<HttpResponse, String> {
            let fields: Vec<String> = headers
                .iter()
                .map(|(key, value)| format!("{key}: {value}"))
                .collect();
            self.next(format!("POST {url} {} {body}", fields.join("; ")))
        }
    }

    #[test]
    fn requests_a_device_code() {
        let http = FakeHttp::with(&[(
            200,
            r#"{"device_code":"dc","expires_in":1800,"interval":5,"user_code":"ABCD","verification_uri":"https://www.twitch.tv/activate?device-code=ABCD"}"#,
        )]);
        let code = request_device_code(&http, "client", "a b").unwrap();
        assert_eq!(code.user_code, "ABCD");
        assert_eq!(code.interval, 5);
        assert_eq!(
            http.requests.lock().unwrap()[0],
            "POST https://id.twitch.tv/oauth2/device client_id=client&scopes=a b"
        );
    }

    #[test]
    fn maps_poll_answers() {
        let http = FakeHttp::with(&[
            (400, r#"{"status":400,"message":"authorization_pending"}"#),
            (400, r#"{"status":400,"message":"slow_down"}"#),
            (400, r#"{"status":400,"message":"invalid device code"}"#),
            (
                200,
                r#"{"access_token":"at","refresh_token":"rt","expires_in":14000,"scope":["bits:read"],"token_type":"bearer"}"#,
            ),
        ]);
        assert_eq!(
            poll_token(&http, "c", "s", "d").unwrap(),
            PollResult::Pending
        );
        assert_eq!(
            poll_token(&http, "c", "s", "d").unwrap(),
            PollResult::SlowDown
        );
        assert_eq!(
            poll_token(&http, "c", "s", "d").unwrap(),
            PollResult::Failed("invalid device code".to_owned())
        );
        let PollResult::Granted(grant) = poll_token(&http, "c", "s", "d").unwrap() else {
            panic!("expected a token");
        };
        assert_eq!(grant.access_token, "at");
        assert_eq!(grant.scope, vec!["bits:read".to_owned()]);
    }

    #[test]
    fn validates_and_detects_invalid_tokens() {
        let http = FakeHttp::with(&[
            (
                200,
                r#"{"client_id":"c","login":"streamer","scopes":[],"user_id":"42","expires_in":100}"#,
            ),
            (401, r#"{"status":401,"message":"invalid access token"}"#),
        ]);
        let info = validate_token(&http, "token").unwrap().unwrap();
        assert_eq!(
            (info.login.as_str(), info.user_id.as_str()),
            ("streamer", "42")
        );
        assert_eq!(validate_token(&http, "token").unwrap(), None);
        assert!(http.requests.lock().unwrap()[0].ends_with("Authorization: OAuth token"));
    }

    #[test]
    fn reports_rejections_and_network_errors() {
        let http = FakeHttp::with(&[(400, r#"{"status":400,"message":"Invalid refresh token"}"#)]);
        assert_eq!(
            refresh_token(&http, "c", "rt"),
            Err(AuthError::Rejected("Invalid refresh token".to_owned()))
        );
        assert!(matches!(
            refresh_token(&http, "c", "rt"),
            Err(AuthError::Network(_))
        ));
    }
}
