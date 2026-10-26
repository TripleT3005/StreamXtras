use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};

use crate::events::{EventBroadcaster, event_data, is_real_alert};
use crate::twitch::account::TwitchAccount;
use crate::twitch::helix::HelixClient;

// Constants
const HISTORY_FILE: &str = "history.json";
const MAX_RECENT: usize = 20;
const REFRESH_INTERVAL: Duration = Duration::from_secs(5 * 60);
const LOGIN_POLL_INTERVAL: Duration = Duration::from_secs(30);
const REFRESH_DELAY_AFTER_SUB: Duration = Duration::from_secs(10);
const RECENT_FIELDS: [&str; 6] = ["type", "userName", "userLogin", "amount", "tier", "at"];

// Types
#[derive(Default)]
struct StatsData {
    user_id: Option<String>,
    followers: Option<u64>,
    subscribers: Option<u64>,
    sub_points: Option<u64>,
    goals: Vec<Value>,
    recent: BTreeMap<String, Vec<Value>>,
}

pub struct Stats {
    data: Mutex<StatsData>,
    path: PathBuf,
    events: Arc<EventBroadcaster>,
    account: Arc<TwitchAccount>,
    helix: Arc<HelixClient>,
}

// Stats
impl Stats {
    pub fn new(
        config_dir: &Path,
        events: Arc<EventBroadcaster>,
        account: Arc<TwitchAccount>,
        helix: Arc<HelixClient>,
    ) -> Arc<Self> {
        let path = config_dir.join(HISTORY_FILE);
        let data = load_history(&path);
        Arc::new(Self {
            data: Mutex::new(data),
            path,
            events,
            account,
            helix,
        })
    }

    pub fn start(self: &Arc<Self>) {
        let (refresh, requests) = mpsc::channel();
        let alerts = self.events.subscribe();
        let listener = Arc::clone(self);
        thread::spawn(move || {
            for message in alerts {
                if let Some(alert) = event_data(&message, "alert").filter(is_real_alert) {
                    listener.record(&alert, &refresh);
                } else if let Some(goal_event) = event_data(&message, "twitch-goal") {
                    apply_goal_event(&mut listener.lock().goals, &goal_event);
                    listener.publish();
                }
            }
        });
        let refresher = Arc::clone(self);
        thread::spawn(move || refresher.run(&requests));
    }

    pub fn snapshot(&self) -> Value {
        let data = self.lock();
        json!({
            "followers": data.followers,
            "subscribers": data.subscribers,
            "subPoints": data.sub_points,
            "goals": data.goals,
            "recent": data.recent,
        })
    }

    fn record(&self, alert: &Value, refresh: &Sender<()>) {
        let kind = alert["type"].as_str().unwrap_or_default().to_owned();
        {
            let mut data = self.lock();
            if kind == "follow"
                && let Some(followers) = data.followers.as_mut()
            {
                *followers += 1;
            }
            push_recent(&mut data.recent, &kind, recent_entry(alert, now()));
        }
        if kind == "sub" || kind == "gift" {
            let _ = refresh.send(());
        }
        self.save();
        self.publish();
    }

    fn run(&self, requests: &Receiver<()>) {
        let mut last_refresh: Option<Instant> = None;
        let mut last_user: Option<String> = None;
        loop {
            let user = self
                .account
                .credentials()
                .map(|credentials| credentials.user_id);
            let is_due = last_refresh.is_none_or(|time| time.elapsed() >= REFRESH_INTERVAL);
            if let Some(user_id) = user.as_deref()
                && (is_due || last_user.as_deref() != Some(user_id))
            {
                self.refresh(user_id);
                last_refresh = Some(Instant::now());
            }
            last_user = user;
            match requests.recv_timeout(LOGIN_POLL_INTERVAL) {
                Ok(()) => {
                    thread::sleep(REFRESH_DELAY_AFTER_SUB);
                    while requests.try_recv().is_ok() {}
                    last_refresh = None;
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    fn refresh(&self, user_id: &str) {
        let followers = self.helix.followers(user_id);
        let subscriptions = self.helix.subscriptions(user_id);
        let goals = self.helix.goals(user_id);
        {
            let mut data = self.lock();
            if data.user_id.as_deref() != Some(user_id) {
                data.recent.clear();
                data.user_id = Some(user_id.to_owned());
            }
            match followers {
                Ok(followers) => {
                    data.followers = followers["total"].as_u64();
                    let has_follows = data
                        .recent
                        .get("follow")
                        .is_some_and(|list| !list.is_empty());
                    if !has_follows && let Some(latest) = followers["latest"].as_array() {
                        data.recent.insert(
                            "follow".to_owned(),
                            latest.iter().take(MAX_RECENT).cloned().collect(),
                        );
                    }
                }
                Err(error) => eprintln!("Loading the followers failed: {error}"),
            }
            match subscriptions {
                Ok(subscriptions) => {
                    data.subscribers = subscriptions["total"].as_u64();
                    data.sub_points = subscriptions["points"].as_u64();
                }
                Err(error) => eprintln!("Loading the subscriptions failed: {error}"),
            }
            match goals {
                Ok(goals) => data.goals = goals.as_array().cloned().unwrap_or_default(),
                Err(error) => eprintln!("Loading the Twitch goals failed: {error}"),
            }
        }
        self.save();
        self.publish();
    }

    fn publish(&self) {
        self.events.publish("stats", &self.snapshot());
    }

    fn save(&self) {
        let content = {
            let data = self.lock();
            json!({ "userId": data.user_id, "recent": data.recent }).to_string()
        };
        if let Err(error) = fs::write(&self.path, content) {
            eprintln!("Saving the event history failed: {error}");
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, StatsData> {
        self.data.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

// Helpers
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn load_history(path: &Path) -> StatsData {
    let stored = fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .unwrap_or_default();
    let recent = stored["recent"]
        .as_object()
        .map(|recent| {
            recent
                .iter()
                .filter_map(|(kind, list)| {
                    let list = list.as_array()?.iter().take(MAX_RECENT).cloned().collect();
                    Some((kind.clone(), list))
                })
                .collect()
        })
        .unwrap_or_default();
    StatsData {
        user_id: stored["userId"].as_str().map(str::to_owned),
        recent,
        ..StatsData::default()
    }
}

fn apply_goal_event(goals: &mut Vec<Value>, goal_event: &Value) {
    let goal = &goal_event["goal"];
    let Some(id) = goal["id"].as_str() else {
        return;
    };
    goals.retain(|existing| existing["id"] != id);
    if goal_event["action"] != "end" {
        goals.push(goal.clone());
    }
    goals.sort_by(|first, second| first["id"].as_str().cmp(&second["id"].as_str()));
}

fn recent_entry(alert: &Value, at: u64) -> Value {
    let mut entry: Map<String, Value> = RECENT_FIELDS
        .iter()
        .filter_map(|field| {
            let value = alert.get(*field)?;
            (!value.is_null()).then(|| ((*field).to_owned(), value.clone()))
        })
        .collect();
    entry.insert("at".to_owned(), json!(at));
    Value::Object(entry)
}

fn push_recent(recent: &mut BTreeMap<String, Vec<Value>>, kind: &str, entry: Value) {
    let list = recent.entry(kind.to_owned()).or_default();
    list.insert(0, entry);
    list.truncate(MAX_RECENT);
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_real_alerts_from_the_event_stream() {
        let real = |message: &str| event_data(message, "alert").filter(is_real_alert);
        assert_eq!(
            real(
                "event: alert\ndata: {\"type\":\"follow\",\"userName\":\"Fan\",\"test\":false}\n\n"
            )
            .unwrap()["userName"],
            "Fan"
        );
        assert_eq!(
            real("event: alert\ndata: {\"type\":\"follow\",\"test\":true}\n\n"),
            None
        );
        assert_eq!(
            real("event: alert\ndata: {\"type\":\"follow\",\"replay\":true}\n\n"),
            None
        );
        assert_eq!(real("event: alerts\ndata: {\"type\":\"follow\"}\n\n"), None);
        assert_eq!(
            real("event: settings\ndata: {\"type\":\"follow\"}\n\n"),
            None
        );
    }

    #[test]
    fn keeps_twitch_goals_up_to_date() {
        let mut goals = Vec::new();
        let goal = |id: &str, current: u64| json!({ "id": id, "type": "follower", "description": "", "current": current, "target": 100 });
        apply_goal_event(
            &mut goals,
            &json!({ "action": "begin", "goal": goal("a", 10) }),
        );
        apply_goal_event(
            &mut goals,
            &json!({ "action": "begin", "goal": goal("b", 1) }),
        );
        apply_goal_event(
            &mut goals,
            &json!({ "action": "progress", "goal": goal("a", 11) }),
        );
        assert_eq!(goals.len(), 2);
        assert_eq!(goals[0]["current"], 11);
        apply_goal_event(
            &mut goals,
            &json!({ "action": "end", "goal": goal("a", 12) }),
        );
        assert_eq!(goals.len(), 1);
        apply_goal_event(
            &mut goals,
            &json!({ "action": "progress", "goal": { "type": "follower" } }),
        );
        assert_eq!(goals.len(), 1);
    }

    #[test]
    fn keeps_the_newest_entries_without_messages() {
        let mut recent = BTreeMap::new();
        for index in 0..25 {
            let alert = json!({ "type": "cheer", "userName": format!("Fan{index}"), "amount": index, "message": "secret", "avatarUrl": "https://x", "test": false });
            push_recent(&mut recent, "cheer", recent_entry(&alert, 7));
        }
        let list = &recent["cheer"];
        assert_eq!(list.len(), MAX_RECENT);
        assert_eq!(
            list[0],
            json!({ "type": "cheer", "userName": "Fan24", "amount": 24, "at": 7 })
        );
    }

    #[test]
    fn loads_a_saved_history() {
        let directory =
            std::env::temp_dir().join(format!("streamxtras-stats-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(HISTORY_FILE);
        fs::write(
            &path,
            r#"{"userId":"42","recent":{"follow":[{"userName":"Fan"}],"bad":5}}"#,
        )
        .unwrap();
        let data = load_history(&path);
        assert_eq!(data.user_id.as_deref(), Some("42"));
        assert_eq!(data.recent["follow"][0]["userName"], "Fan");
        assert!(!data.recent.contains_key("bad"));
        assert!(
            load_history(&directory.join("missing.json"))
                .recent
                .is_empty()
        );
        let _ = fs::remove_dir_all(&directory);
    }
}
