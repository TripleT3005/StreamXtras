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
const ANONYMOUS_NAME: &str = "Anonymous";
pub const ALERT_TYPES: [&str; 5] = ["follow", "sub", "gift", "cheer", "raid"];

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
pub fn alert_from_event(subscription_type: &str, event: &Value) -> Option<Value> {
    match subscription_type {
        "channel.follow" => user_alert("follow", event, "user", None),
        "channel.chat.notification" => notification_alert(event),
        "channel.cheer" => {
            let mut alert = user_alert("cheer", event, "user", event["bits"].as_u64())?;
            alert["message"] = json!(event["message"].as_str().unwrap_or_default());
            Some(alert)
        }
        "channel.raid" => user_alert(
            "raid",
            event,
            "from_broadcaster_user",
            event["viewers"].as_u64(),
        ),
        _ => None,
    }
}

fn notification_alert(event: &Value) -> Option<Value> {
    let (kind, details, amount) = match event["notice_type"].as_str()? {
        "sub" => ("sub", &event["sub"], Some(1)),
        "resub" => (
            "sub",
            &event["resub"],
            event["resub"]["cumulative_months"].as_u64(),
        ),
        "sub_gift" if event["sub_gift"]["community_gift_id"].is_null() => {
            ("gift", &event["sub_gift"], Some(1))
        }
        "community_sub_gift" => (
            "gift",
            &event["community_sub_gift"],
            event["community_sub_gift"]["total"].as_u64(),
        ),
        _ => return None,
    };
    let mut alert = user_alert(kind, event, "chatter_user", amount)?;
    alert["tier"] = json!(tier(details));
    alert["message"] = json!(event["message"]["text"].as_str().unwrap_or_default());
    Some(alert)
}

fn tier(details: &Value) -> &'static str {
    if details["is_prime"].as_bool() == Some(true) {
        return "prime";
    }
    match details["sub_tier"].as_str() {
        Some("2000") => "2",
        Some("3000") => "3",
        _ => "1",
    }
}

pub fn strip_cheermotes(text: &str, prefixes: &[String]) -> String {
    text.split_whitespace()
        .filter(|word| {
            let word = word.to_lowercase();
            !prefixes.iter().any(|prefix| {
                word.strip_prefix(prefix.as_str()).is_some_and(|rest| {
                    !rest.is_empty() && rest.bytes().all(|byte| byte.is_ascii_digit())
                })
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn user_alert(kind: &str, event: &Value, prefix: &str, amount: Option<u64>) -> Option<Value> {
    let field = |name: &str| event[format!("{prefix}_{name}")].as_str();
    let is_anonymous = event["is_anonymous"].as_bool() == Some(true)
        || event["chatter_is_anonymous"].as_bool() == Some(true);
    let (id, login, name) = if is_anonymous {
        ("", "", ANONYMOUS_NAME)
    } else {
        (field("id")?, field("login")?, field("name")?)
    };
    let mut alert = json!({
        "type": kind,
        "userId": id,
        "userLogin": login,
        "userName": name,
        "test": false,
    });
    if let Some(amount) = amount {
        alert["amount"] = json!(amount);
    }
    Some(alert)
}

pub fn test_alert(kind: &str, options: &Value, user: Option<&Value>) -> Option<Value> {
    if !ALERT_TYPES.contains(&kind) {
        return None;
    }
    let text = |key: &str, fallback: &str| {
        user.and_then(|user| user[key].as_str())
            .unwrap_or(fallback)
            .to_owned()
    };
    let mut alert = json!({
        "type": kind,
        "userId": text("id", "0"),
        "userLogin": text("login", "streamxtras"),
        "userName": text("displayName", "StreamXtras"),
        "test": true,
    });
    if kind != "follow" {
        alert["amount"] =
            json!(
                options["amount"]
                    .as_u64()
                    .unwrap_or(if kind == "cheer" { 100 } else { 5 })
            );
    }
    if kind == "sub" || kind == "gift" {
        let tier = options["tier"]
            .as_str()
            .filter(|tier| matches!(*tier, "prime" | "2" | "3"))
            .unwrap_or("1");
        alert["tier"] = json!(tier);
    }
    if let Some(message) = options["message"].as_str() {
        alert["message"] = json!(message);
    }
    add_avatar(&mut alert, user);
    Some(alert)
}

pub fn add_avatar(alert: &mut Value, user: Option<&Value>) {
    if let Some(url) = user.and_then(|user| user["largeProfileImageUrl"].as_str()) {
        alert["avatarUrl"] = json!(url);
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

fn subscriptions(session_id: &str, user_id: &str) -> Vec<(&'static str, String)> {
    let broadcaster = json!({ "broadcaster_user_id": user_id });
    [
        (
            "channel.follow",
            "2",
            json!({ "broadcaster_user_id": user_id, "moderator_user_id": user_id }),
        ),
        (
            "channel.chat.notification",
            "1",
            json!({ "broadcaster_user_id": user_id, "user_id": user_id }),
        ),
        ("channel.cheer", "1", broadcaster),
        (
            "channel.raid",
            "1",
            json!({ "to_broadcaster_user_id": user_id }),
        ),
    ]
    .into_iter()
    .map(|(kind, version, condition)| {
        let body = json!({
            "type": kind,
            "version": version,
            "condition": condition,
            "transport": { "method": "websocket", "session_id": session_id },
        });
        (kind, body.to_string())
    })
    .collect()
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
        let all = subscriptions(session_id, user_id);
        let total = all.len();
        let failures: Vec<String> = all
            .into_iter()
            .filter_map(
                |(kind, body)| match self.helix.post(SUBSCRIPTIONS_PATH, &body) {
                    Ok(response) if response.status == 202 => None,
                    Ok(response) if response.status == 403 => Some(format!(
                        "{kind}: the login lacks the permission; please log in again"
                    )),
                    Ok(response) => Some(format!(
                        "{kind}: HTTP {} {}",
                        response.status, response.body
                    )),
                    Err(error) => Some(format!("{kind}: {error}")),
                },
            )
            .collect();
        if failures.len() == total {
            return Err(format!(
                "creating the subscriptions failed: {}",
                failures.join("; ")
            ));
        }
        for failure in failures {
            eprintln!("EventSub subscription failed: {failure}");
        }
        Ok(())
    }

    fn handle_notification(&self, subscription_type: &str, event: &Value) {
        let Some(mut alert) = alert_from_event(subscription_type, event) else {
            return;
        };
        let user = alert["userId"]
            .as_str()
            .filter(|user_id| !user_id.is_empty())
            .and_then(|user_id| self.helix.user(user_id).ok());
        add_avatar(&mut alert, user.as_ref());
        if alert["type"] == "cheer"
            && let Some(broadcaster_id) = event["broadcaster_user_id"].as_str()
            && let Ok(prefixes) = self.helix.cheermote_prefixes(broadcaster_id)
        {
            let message =
                strip_cheermotes(alert["message"].as_str().unwrap_or_default(), &prefixes);
            alert["message"] = json!(message);
        }
        self.events.publish("alert", &alert);
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
            alert_from_event("channel.follow", &event).unwrap(),
            json!({ "type": "follow", "userId": "7", "userLogin": "newfollower", "userName": "NewFollower", "test": false })
        );
        assert_eq!(
            alert_from_event("channel.follow", &json!({ "user_id": "7" })),
            None
        );
        assert_eq!(alert_from_event("channel.unknown", &event), None);
    }

    fn notification(notice_type: &str, details: &Value, message: &str) -> Value {
        json!({
            "chatter_user_id": "7",
            "chatter_user_login": "viewer",
            "chatter_user_name": "Viewer",
            "chatter_is_anonymous": false,
            "notice_type": notice_type,
            (notice_type): details,
            "message": { "text": message },
        })
    }

    #[test]
    fn builds_sub_and_gift_alerts_from_chat_notifications() {
        let sub = alert_from_event(
            "channel.chat.notification",
            &notification("sub", &json!({ "sub_tier": "2000", "is_prime": false }), ""),
        )
        .unwrap();
        assert_eq!(
            sub,
            json!({ "type": "sub", "userId": "7", "userLogin": "viewer", "userName": "Viewer", "amount": 1, "tier": "2", "message": "", "test": false })
        );

        let resub = alert_from_event(
            "channel.chat.notification",
            &notification(
                "resub",
                &json!({ "cumulative_months": 14, "sub_tier": "1000", "is_prime": true }),
                "Still here!",
            ),
        )
        .unwrap();
        assert_eq!(
            (&resub["amount"], &resub["tier"], &resub["message"]),
            (&json!(14), &json!("prime"), &json!("Still here!"))
        );

        let bomb = alert_from_event(
            "channel.chat.notification",
            &notification(
                "community_sub_gift",
                &json!({ "total": 5, "sub_tier": "3000" }),
                "",
            ),
        )
        .unwrap();
        assert_eq!(
            (&bomb["type"], &bomb["amount"], &bomb["tier"]),
            (&json!("gift"), &json!(5), &json!("3"))
        );

        let single = notification(
            "sub_gift",
            &json!({ "sub_tier": "1000", "community_gift_id": null }),
            "",
        );
        assert_eq!(
            alert_from_event("channel.chat.notification", &single).unwrap()["amount"],
            1
        );
        let part_of_bomb = notification(
            "sub_gift",
            &json!({ "sub_tier": "1000", "community_gift_id": "abc" }),
            "",
        );
        assert_eq!(
            alert_from_event("channel.chat.notification", &part_of_bomb),
            None
        );
        assert_eq!(
            alert_from_event(
                "channel.chat.notification",
                &notification("shared_chat_sub", &json!({}), "")
            ),
            None
        );

        let mut anonymous = notification("community_sub_gift", &json!({ "total": 10 }), "");
        anonymous["chatter_is_anonymous"] = json!(true);
        assert_eq!(
            alert_from_event("channel.chat.notification", &anonymous).unwrap()["userName"],
            "Anonymous"
        );
    }

    #[test]
    fn builds_cheer_and_raid_alerts() {
        let cheer = alert_from_event(
            "channel.cheer",
            &json!({ "user_id": "7", "user_login": "viewer", "user_name": "Viewer", "bits": 67, "message": "Cheer67 hi" }),
        )
        .unwrap();
        assert_eq!(
            (&cheer["amount"], &cheer["message"]),
            (&json!(67), &json!("Cheer67 hi"))
        );

        let anonymous = alert_from_event(
            "channel.cheer",
            &json!({ "is_anonymous": true, "user_id": null, "bits": 500 }),
        )
        .unwrap();
        assert_eq!(
            (&anonymous["userName"], &anonymous["userId"]),
            (&json!("Anonymous"), &json!(""))
        );

        let raid = alert_from_event(
            "channel.raid",
            &json!({ "from_broadcaster_user_id": "9", "from_broadcaster_user_login": "friend", "from_broadcaster_user_name": "Friend", "viewers": 12 }),
        )
        .unwrap();
        assert_eq!(
            raid,
            json!({ "type": "raid", "userId": "9", "userLogin": "friend", "userName": "Friend", "amount": 12, "test": false })
        );
    }

    #[test]
    fn strips_cheermotes_from_messages() {
        let prefixes = vec!["cheer".to_owned(), "biblethump".to_owned()];
        assert_eq!(
            strip_cheermotes(
                "Cheer100 great  stream BibleThump5 cheer cheers2you",
                &prefixes
            ),
            "great stream cheer cheers2you"
        );
    }

    #[test]
    fn builds_test_alerts() {
        let none = json!({});
        assert_eq!(test_alert("follow", &none, None).unwrap()["test"], true);
        assert!(
            test_alert("follow", &json!({ "amount": 3 }), None)
                .unwrap()
                .get("amount")
                .is_none()
        );
        assert_eq!(test_alert("cheer", &none, None).unwrap()["amount"], 100);
        assert_eq!(
            test_alert("gift", &json!({ "amount": 67 }), None).unwrap()["amount"],
            67
        );
        assert_eq!(test_alert("host", &none, None), None);

        let sub = test_alert("sub", &json!({ "tier": "prime", "message": "Hello" }), None).unwrap();
        assert_eq!(
            (&sub["tier"], &sub["message"]),
            (&json!("prime"), &json!("Hello"))
        );
        assert_eq!(
            test_alert("sub", &json!({ "tier": "9" }), None).unwrap()["tier"],
            "1"
        );
        assert!(
            test_alert("raid", &none, None)
                .unwrap()
                .get("tier")
                .is_none()
        );

        let friend = json!({ "id": "9", "login": "friend", "displayName": "Friend", "largeProfileImageUrl": "https://cdn/friend.png" });
        let raid = test_alert("raid", &none, Some(&friend)).unwrap();
        assert_eq!(raid["userName"], "Friend");
        assert_eq!(raid["avatarUrl"], "https://cdn/friend.png");
        assert!(
            test_alert("sub", &none, None)
                .unwrap()
                .get("avatarUrl")
                .is_none()
        );
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

        let accepted = (202, r#"{"data":[]}"#);
        let forbidden = (403, r#"{"error":"Forbidden"}"#);
        let fixture = account_fixture("eventsub", true, &[accepted, forbidden, accepted, accepted]);
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
        assert_eq!(subscriptions.len(), 4);
        assert!(
            subscriptions
                .iter()
                .all(|request| request.contains(r#""session_id":"session-1""#))
        );
        assert!(subscriptions[0].contains(r#""moderator_user_id":"42""#));
        assert!(subscriptions[1].contains(r#""type":"channel.chat.notification""#));
        assert!(subscriptions[1].contains(r#""user_id":"42""#));
        assert!(subscriptions[3].contains(r#""to_broadcaster_user_id":"42""#));
    }

    #[test]
    fn fails_only_when_every_subscription_fails() {
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
        assert!(error.contains("channel.follow: the login lacks the permission"));
        server.join().unwrap();
    }
}
