use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// Constants
const CONFIG_FILE: &str = "config.json";
pub const DEFAULT_PORT: u16 = 47_820;

// Types
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twitch_client_id: Option<String>,
    pub overlays: BTreeMap<String, serde_json::Map<String, serde_json::Value>>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            twitch_client_id: None,
            overlays: BTreeMap::new(),
        }
    }
}

#[derive(Debug)]
pub enum ConfigError {
    NoConfigDirectory,
    Io(PathBuf, io::Error),
    Invalid(PathBuf, serde_json::Error),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoConfigDirectory => write!(formatter, "no configuration directory found"),
            Self::Io(path, error) => write!(formatter, "{}: {error}", path.display()),
            Self::Invalid(path, error) => {
                write!(formatter, "{} is not valid: {error}", path.display())
            }
        }
    }
}

impl std::error::Error for ConfigError {}

// Loading and saving
pub fn config_path(directory: &Path) -> PathBuf {
    directory.join(CONFIG_FILE)
}

pub fn load_or_create(directory: &Path) -> Result<(Config, bool), ConfigError> {
    let path = config_path(directory);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(content.trim_start_matches('\u{feff}'))
            .map(|config| (config, false))
            .map_err(|error| ConfigError::Invalid(path, error)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let config = Config::default();
            save(directory, &config)?;
            Ok((config, true))
        }
        Err(error) => Err(ConfigError::Io(path, error)),
    }
}

pub fn save(directory: &Path, config: &Config) -> Result<(), ConfigError> {
    let path = config_path(directory);
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| ConfigError::Invalid(path.clone(), error))?;
    write_private_file(&path, &content).map_err(|error| ConfigError::Io(path, error))
}

pub fn write_private_file(path: &Path, content: &str) -> io::Result<()> {
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory)?;
    }
    let mut temporary_name = path.as_os_str().to_owned();
    temporary_name.push(".tmp");
    let temporary_path = PathBuf::from(temporary_name);
    fs::write(&temporary_path, format!("{content}\n"))?;
    #[cfg(unix)]
    restrict_permissions(&temporary_path)?;
    fs::rename(&temporary_path, path)
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "stream-overlays-test-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        directory
    }

    #[test]
    fn creates_default_config_when_missing() {
        let directory = temporary_directory("create");
        let (config, created) = load_or_create(&directory).unwrap();
        assert_eq!(config, Config::default());
        assert!(created);
        assert!(!load_or_create(&directory).unwrap().1);
        assert!(config_path(&directory).exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn keeps_saved_values_and_fills_missing_ones() {
        let directory = temporary_directory("load");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            config_path(&directory),
            r#"{ "port": 50000, "unknown": true }"#,
        )
        .unwrap();
        assert_eq!(load_or_create(&directory).unwrap().0.port, 50_000);
        fs::write(config_path(&directory), "{}").unwrap();
        assert_eq!(load_or_create(&directory).unwrap().0.port, DEFAULT_PORT);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn accepts_a_byte_order_mark() {
        let directory = temporary_directory("bom");
        fs::create_dir_all(&directory).unwrap();
        fs::write(config_path(&directory), "\u{feff}{ \"port\": 41000 }").unwrap();
        assert_eq!(load_or_create(&directory).unwrap().0.port, 41_000);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_invalid_json() {
        let directory = temporary_directory("invalid");
        fs::create_dir_all(&directory).unwrap();
        fs::write(config_path(&directory), "{ port: ").unwrap();
        assert!(matches!(
            load_or_create(&directory),
            Err(ConfigError::Invalid(..))
        ));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn saves_and_reloads() {
        let directory = temporary_directory("save");
        let mut config = Config {
            port: 40_000,
            ..Config::default()
        };
        let mut settings = serde_json::Map::new();
        settings.insert("channel".to_owned(), "test".into());
        config.overlays.insert("chatbox".to_owned(), settings);
        save(&directory, &config).unwrap();
        assert_eq!(load_or_create(&directory).unwrap().0, config);
        fs::remove_dir_all(directory).unwrap();
    }
}
