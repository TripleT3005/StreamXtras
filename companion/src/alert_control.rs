use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use serde_json::{Value, json};

use crate::events::{EventBroadcaster, event_data, is_real_alert};

// Types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertAction {
    Pause,
    Resume,
    Skip,
    Replay,
}

#[derive(Default)]
struct ControlState {
    paused: bool,
    last_alert: Option<Value>,
}

pub struct AlertControl {
    state: Mutex<ControlState>,
    events: Arc<EventBroadcaster>,
}

// Control
impl AlertAction {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pause" => Some(Self::Pause),
            "resume" => Some(Self::Resume),
            "skip" => Some(Self::Skip),
            "replay" => Some(Self::Replay),
            _ => None,
        }
    }
}

impl AlertControl {
    pub fn new(events: Arc<EventBroadcaster>) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(ControlState::default()),
            events,
        })
    }

    pub fn start(self: &Arc<Self>) {
        let alerts = self.events.subscribe();
        let control = Arc::clone(self);
        thread::spawn(move || {
            for message in alerts {
                if let Some(alert) = event_data(&message, "alert").filter(is_real_alert) {
                    control.lock().last_alert = Some(alert);
                }
            }
        });
    }

    pub fn status(&self) -> Value {
        let state = self.lock();
        json!({ "paused": state.paused, "hasLastAlert": state.last_alert.is_some() })
    }

    pub fn apply(&self, action: AlertAction) -> Result<Value, &'static str> {
        match action {
            AlertAction::Pause | AlertAction::Resume => {
                self.lock().paused = action == AlertAction::Pause;
                self.events.publish("alert-control", &self.status());
            }
            AlertAction::Skip => {
                let mut status = self.status();
                status["skip"] = json!(true);
                self.events.publish("alert-control", &status);
            }
            AlertAction::Replay => {
                let mut alert = self
                    .lock()
                    .last_alert
                    .clone()
                    .ok_or("No alert to replay yet")?;
                alert["replay"] = json!(true);
                self.events.publish("alert", &alert);
            }
        }
        Ok(self.status())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, ControlState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

// Tests
#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    #[test]
    fn pauses_skips_and_replays_the_last_real_alert() {
        let events = Arc::new(EventBroadcaster::default());
        let control = AlertControl::new(Arc::clone(&events));
        control.start();
        let received = events.subscribe();

        assert_eq!(
            control.apply(AlertAction::Replay),
            Err("No alert to replay yet")
        );
        events.publish(
            "alert",
            &json!({ "type": "follow", "userName": "Fan", "test": false }),
        );
        events.publish(
            "alert",
            &json!({ "type": "follow", "userName": "Tester", "test": true }),
        );
        thread::sleep(Duration::from_millis(100));

        assert_eq!(control.apply(AlertAction::Pause).unwrap()["paused"], true);
        assert_eq!(control.apply(AlertAction::Skip).unwrap()["paused"], true);
        control.apply(AlertAction::Replay).unwrap();
        assert_eq!(control.apply(AlertAction::Resume).unwrap()["paused"], false);

        let messages: Vec<String> = received.try_iter().collect();
        assert!(messages[2].contains(r#""paused":true"#));
        assert!(messages[3].contains(r#""skip":true"#));
        assert!(
            messages[4].contains(r#""userName":"Fan""#) && messages[4].contains(r#""replay":true"#)
        );
        assert!(messages[5].contains(r#""paused":false"#));
        assert_eq!(AlertAction::parse("skip"), Some(AlertAction::Skip));
        assert_eq!(AlertAction::parse("stop"), None);
    }
}
