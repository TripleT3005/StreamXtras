use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver, Sender};

use serde_json::Value;

// Broadcaster
#[derive(Default)]
pub struct EventBroadcaster {
    subscribers: Mutex<Vec<Sender<String>>>,
}

impl EventBroadcaster {
    pub fn subscribe(&self) -> Receiver<String> {
        let (sender, receiver) = mpsc::channel();
        self.lock().push(sender);
        receiver
    }

    pub fn publish(&self, event: &str, data: &serde_json::Value) {
        let message = format!("event: {event}\ndata: {data}\n\n");
        self.lock()
            .retain(|subscriber| subscriber.send(message.clone()).is_ok());
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Sender<String>>> {
        self.subscribers
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

// Messages
pub fn event_data(message: &str, event: &str) -> Option<Value> {
    let data = message
        .strip_prefix("event: ")?
        .strip_prefix(event)?
        .strip_prefix("\ndata: ")?;
    serde_json::from_str(data.trim_end()).ok()
}

pub fn is_real_alert(alert: &Value) -> bool {
    alert["type"].is_string() && alert["test"] != true && alert["replay"] != true
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delivers_events_and_drops_closed_subscribers() {
        let broadcaster = EventBroadcaster::default();
        let first = broadcaster.subscribe();
        let second = broadcaster.subscribe();
        drop(second);
        broadcaster.publish("settings", &serde_json::json!({ "overlay": "chatbox" }));
        assert_eq!(
            first.try_recv().unwrap(),
            "event: settings\ndata: {\"overlay\":\"chatbox\"}\n\n"
        );
        assert_eq!(broadcaster.lock().len(), 1);
    }
}
