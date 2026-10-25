use std::net::TcpStream;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

use super::account::TwitchAccount;
use super::helix::HelixClient;
use crate::events::EventBroadcaster;

// Constants
pub const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const SUBSCRIPTIONS_PATH: &str = "/eventsub/subscriptions";
const WELCOME_TIMEOUT: Duration = Duration::from_secs(15);
const KEEPALIVE_GRACE: Duration = Duration::from_secs(10);
const LOGGED_OUT_POLL_INTERVAL: Duration = Duration::from_secs(10);
const MAX_RETRY_DELAY_SECONDS: u64 = 120;

// Types
type Socket = WebSocket<MaybeTlsStream<TcpStream>>;

#[derive(Debug, Clone, PartialEq)]
pub enum EventSubMessage {
    Welcome {
        session_id: String,
        keepalive_timeout: Duration,
    },
    Keepalive,
    Notification {
        subscription_type: String,
        event: Value,
    },
    Reconnect {
        url: String,
    },
    Revocation {
        subscription_type: String,
        status: String,
    },
    Other,
}

#[derive(Debug, PartialEq, Eq)]
enum SessionEnd {
    LoggedOut,
}

#[derive(Deserialize)]
struct Envelope {
    metadata: Metadata,
    #[serde(default)]
    payload: Value,
}

#[derive(Deserialize)]
struct Metadata {
    message_type: String,
}

pub struct EventSubClient {
    account: Arc<TwitchAccount>,
    helix: Arc<HelixClient>,
    events: Arc<EventBroadcaster>,
    url: String,
}

// Alerts
pub fn follow_alert(event: &Value) -> Option<Value> {
    Some(json!({
        "type": "follow",
        "userId": event["user_id"].as_str()?,
        "userLogin": event["user_login"].as_str()?,
        "userName": event["user_name"].as_str()?,
        "test": false,
    }))
}

pub fn test_alert(kind: &str) -> Option<Value> {
    match kind {
        "follow" => Some(json!({
            "type": "follow",
            "userId": "0",
            "userLogin": "streamxtras",
            "userName": "StreamXtras",
            "test": true,
        })),
        _ => None,
    }
}

// Parsing
pub fn parse_message(text: &str) -> Result<EventSubMessage, String> {
    let envelope: Envelope = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let payload = &envelope.payload;
    let text_at = |value: &Value| value.as_str().map(str::to_owned);
    Ok(match envelope.metadata.message_type.as_str() {
        "session_welcome" => EventSubMessage::Welcome {
            session_id: text_at(&payload["session"]["id"])
                .ok_or_else(|| "welcome message without session id".to_owned())?,
            keepalive_timeout: Duration::from_secs(
                payload["session"]["keepalive_timeout_seconds"]
                    .as_u64()
                    .unwrap_or(10),
            ),
        },
        "session_keepalive" => EventSubMessage::Keepalive,
        "notification" => EventSubMessage::Notification {
            subscription_type: text_at(&payload["subscription"]["type"]).unwrap_or_default(),
            event: payload["event"].clone(),
        },
        "session_reconnect" => EventSubMessage::Reconnect {
            url: text_at(&payload["session"]["reconnect_url"])
                .ok_or_else(|| "reconnect message without URL".to_owned())?,
        },
        "revocation" => EventSubMessage::Revocation {
            subscription_type: text_at(&payload["subscription"]["type"]).unwrap_or_default(),
            status: text_at(&payload["subscription"]["status"]).unwrap_or_default(),
        },
        _ => EventSubMessage::Other,
    })
}

fn follow_subscription(session_id: &str, user_id: &str) -> String {
    json!({
        "type": "channel.follow",
        "version": "2",
        "condition": { "broadcaster_user_id": user_id, "moderator_user_id": user_id },
        "transport": { "method": "websocket", "session_id": session_id },
    })
    .to_string()
}

// Client
impl EventSubClient {
    pub fn new(
        account: Arc<TwitchAccount>,
        helix: Arc<HelixClient>,
        events: Arc<EventBroadcaster>,
        url: &str,
    ) -> Self {
        Self {
            account,
            helix,
            events,
            url: url.to_owned(),
        }
    }

    pub fn start(self) {
        thread::spawn(move || self.run());
    }

    fn run(&self) {
        let mut failures = 0;
        loop {
            let Some(credentials) = self.account.credentials() else {
                thread::sleep(LOGGED_OUT_POLL_INTERVAL);
                continue;
            };
            match self.run_session(&credentials.user_id) {
                Ok(SessionEnd::LoggedOut) => failures = 0,
                Err(error) => {
                    eprintln!("EventSub: {error}");
                    failures += 1;
                    thread::sleep(Duration::from_secs(
                        2_u64.saturating_pow(failures).min(MAX_RETRY_DELAY_SECONDS),
                    ));
                }
            }
        }
    }

    fn run_session(&self, user_id: &str) -> Result<SessionEnd, String> {
        let mut socket = connect(&self.url)?;
        let mut is_subscribed = false;
        loop {
            let Some(text) = read_text(&mut socket)? else {
                continue;
            };
            match parse_message(&text)? {
                EventSubMessage::Welcome {
                    session_id,
                    keepalive_timeout,
                } => {
                    set_read_timeout(&socket, keepalive_timeout + KEEPALIVE_GRACE)?;
                    if !is_subscribed {
                        self.subscribe(&session_id, user_id)?;
                        is_subscribed = true;
                    }
                }
                EventSubMessage::Notification {
                    subscription_type,
                    event,
                } => self.handle_notification(&subscription_type, &event),
                EventSubMessage::Reconnect { url } => {
                    let next = connect_and_wait_for_welcome(&url)?;
                    let _ = socket.close(None);
                    socket = next;
                }
                EventSubMessage::Revocation {
                    subscription_type,
                    status,
                } => {
                    return Err(format!(
                        "Twitch revoked the {subscription_type} subscription ({status})"
                    ));
                }
                EventSubMessage::Keepalive | EventSubMessage::Other => {}
            }
            let current_user = self
                .account
                .credentials()
                .map(|credentials| credentials.user_id);
            if current_user.as_deref() != Some(user_id) {
                let _ = socket.close(None);
                return Ok(SessionEnd::LoggedOut);
            }
        }
    }

    fn subscribe(&self, session_id: &str, user_id: &str) -> Result<(), String> {
        let response = self
            .helix
            .post(
                SUBSCRIPTIONS_PATH,
                &follow_subscription(session_id, user_id),
            )
            .map_err(|error| error.to_string())?;
        match response.status {
            202 => Ok(()),
            403 => Err(
                "the login lacks the permission to read followers; please log in again".to_owned(),
            ),
            status => Err(format!(
                "creating the follow subscription failed: HTTP {status} {}",
                response.body
            )),
        }
    }

    fn handle_notification(&self, subscription_type: &str, event: &Value) {
        if subscription_type == "channel.follow"
            && let Some(alert) = follow_alert(event)
        {
            self.events.publish("alert", &alert);
        }
    }
}

// Socket helpers
fn connect(url: &str) -> Result<Socket, String> {
    let (socket, _) = tungstenite::connect(url)
        .map_err(|error| format!("connecting to {url} failed: {error}"))?;
    set_read_timeout(&socket, WELCOME_TIMEOUT)?;
    Ok(socket)
}

fn connect_and_wait_for_welcome(url: &str) -> Result<Socket, String> {
    let mut socket = connect(url)?;
    loop {
        if let Some(text) = read_text(&mut socket)?
            && let EventSubMessage::Welcome {
                keepalive_timeout, ..
            } = parse_message(&text)?
        {
            set_read_timeout(&socket, keepalive_timeout + KEEPALIVE_GRACE)?;
            return Ok(socket);
        }
    }
}

fn read_text(socket: &mut Socket) -> Result<Option<String>, String> {
    match socket.read() {
        Ok(Message::Text(text)) => Ok(Some(text.to_string())),
        Ok(Message::Close(_)) => Err("Twitch closed the connection".to_owned()),
        Ok(_) => {
            let _ = socket.flush();
            Ok(None)
        }
        Err(error) => Err(format!("connection lost: {error}")),
    }
}

fn set_read_timeout(socket: &Socket, timeout: Duration) -> Result<(), String> {
    let stream = match socket.get_ref() {
        MaybeTlsStream::Plain(stream) => stream,
        MaybeTlsStream::Rustls(stream) => &stream.sock,
        _ => return Ok(()),
    };
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| error.to_string())
}

// Tests
#[cfg(test)]
mod tests {
    use std::net::TcpListener;
    use std::time::Duration;

    use super::*;
    use crate::twitch::test_support::account_fixture;

    fn welcome(session_id: &str) -> String {
        json!({
            "metadata": { "message_type": "session_welcome" },
            "payload": { "session": { "id": session_id, "keepalive_timeout_seconds": 10 } },
        })
        .to_string()
    }

    fn follow(name: &str) -> String {
        json!({
            "metadata": { "message_type": "notification", "subscription_type": "channel.follow" },
            "payload": {
                "subscription": { "type": "channel.follow" },
                "event": { "user_id": "7", "user_login": name.to_lowercase(), "user_name": name, "broadcaster_user_id": "42" },
            },
        })
        .to_string()
    }

    fn fake_server(messages: Vec<String>) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("ws://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut socket = tungstenite::accept(stream).unwrap();
            for message in messages {
                socket.send(Message::text(message)).unwrap();
            }
            thread::sleep(Duration::from_millis(300));
        });
        (url, handle)
    }

    #[test]
    fn parses_eventsub_messages() {
        assert_eq!(
            parse_message(&welcome("abc")).unwrap(),
            EventSubMessage::Welcome {
                session_id: "abc".to_owned(),
                keepalive_timeout: Duration::from_secs(10)
            }
        );
        assert_eq!(
            parse_message(r#"{"metadata":{"message_type":"session_keepalive"},"payload":{}}"#)
                .unwrap(),
            EventSubMessage::Keepalive
        );
        assert_eq!(
            parse_message(r#"{"metadata":{"message_type":"session_reconnect"},"payload":{"session":{"reconnect_url":"wss://next"}}}"#).unwrap(),
            EventSubMessage::Reconnect { url: "wss://next".to_owned() }
        );
        assert_eq!(
            parse_message(r#"{"metadata":{"message_type":"revocation"},"payload":{"subscription":{"type":"channel.follow","status":"authorization_revoked"}}}"#).unwrap(),
            EventSubMessage::Revocation {
                subscription_type: "channel.follow".to_owned(),
                status: "authorization_revoked".to_owned()
            }
        );
        assert!(parse_message("not json").is_err());
        assert!(
            parse_message(r#"{"metadata":{"message_type":"session_welcome"},"payload":{}}"#)
                .is_err()
        );
    }

    #[test]
    fn builds_follow_alerts() {
        let EventSubMessage::Notification { event, .. } =
            parse_message(&follow("NewFollower")).unwrap()
        else {
            panic!("expected a notification");
        };
        assert_eq!(
            follow_alert(&event).unwrap(),
            json!({ "type": "follow", "userId": "7", "userLogin": "newfollower", "userName": "NewFollower", "test": false })
        );
        assert_eq!(follow_alert(&json!({ "user_id": "7" })), None);
        assert_eq!(test_alert("follow").unwrap()["test"], true);
        assert_eq!(test_alert("raid"), None);
    }

    #[test]
    fn subscribes_publishes_follows_and_follows_reconnects() {
        let (second_url, second_server) =
            fake_server(vec![welcome("session-2"), follow("SecondFollower")]);
        let reconnect = json!({
            "metadata": { "message_type": "session_reconnect" },
            "payload": { "session": { "reconnect_url": second_url } },
        })
        .to_string();
        let (first_url, first_server) = fake_server(vec![
            welcome("session-1"),
            follow("FirstFollower"),
            reconnect,
        ]);

        let fixture = account_fixture("eventsub", true, &[(202, r#"{"data":[]}"#)]);
        let events = Arc::new(EventBroadcaster::default());
        let alerts = events.subscribe();
        let helix = Arc::new(HelixClient::new(
            fixture.http.clone(),
            fixture.account.clone(),
        ));
        let client = EventSubClient::new(fixture.account.clone(), helix, events, &first_url);
        let session = thread::spawn(move || client.run_session("42"));

        let first = alerts.recv_timeout(Duration::from_secs(5)).unwrap();
        let second = alerts.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(first.contains(r#""userName":"FirstFollower""#));
        assert!(second.contains(r#""userName":"SecondFollower""#));

        first_server.join().unwrap();
        second_server.join().unwrap();
        assert!(session.join().unwrap().is_err());

        let requests = fixture.http.requests.lock().unwrap();
        let subscriptions: Vec<&String> = requests
            .iter()
            .filter(|request| request.contains("eventsub/subscriptions"))
            .collect();
        assert_eq!(subscriptions.len(), 1);
        assert!(subscriptions[0].contains(r#""session_id":"session-1""#));
        assert!(subscriptions[0].contains(r#""moderator_user_id":"42""#));
    }

    #[test]
    fn reports_a_missing_follower_permission() {
        let (url, server) = fake_server(vec![welcome("session")]);
        let fixture = account_fixture(
            "eventsub-forbidden",
            true,
            &[(403, r#"{"error":"Forbidden"}"#)],
        );
        let helix = Arc::new(HelixClient::new(
            fixture.http.clone(),
            fixture.account.clone(),
        ));
        let client = EventSubClient::new(
            fixture.account.clone(),
            helix,
            Arc::new(EventBroadcaster::default()),
            &url,
        );
        let error = client.run_session("42").unwrap_err();
        assert!(error.contains("permission to read followers"));
        server.join().unwrap();
    }
}
