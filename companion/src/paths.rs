use std::fs;
use std::io;
use std::path::{Path, PathBuf};

// Constants
const APP_DIRECTORY: &str = "StreamXtras";
const UNIX_APP_DIRECTORY: &str = "streamxtras";
pub const LOCAL_FILES: [&str; 2] = ["twitch-token.json", "update-check.json"];

// Directories
pub fn config_dir() -> Option<PathBuf> {
    config_dir_from(|name| std::env::var_os(name).map(PathBuf::from))
}

pub fn local_dir() -> Option<PathBuf> {
    local_dir_from(|name| std::env::var_os(name).map(PathBuf::from))
}

fn local_dir_from(lookup: impl Fn(&str) -> Option<PathBuf>) -> Option<PathBuf> {
    if cfg!(windows) {
        lookup("LOCALAPPDATA")
            .filter(|path| !path.as_os_str().is_empty())
            .map(|path| path.join(APP_DIRECTORY))
    } else {
        config_dir_from(lookup)
    }
}

pub fn move_local_files(config_dir: &Path, local_dir: &Path) -> io::Result<()> {
    if config_dir == local_dir {
        return Ok(());
    }
    for file in LOCAL_FILES {
        let old = config_dir.join(file);
        let new = local_dir.join(file);
        if old.is_file() && !new.exists() {
            fs::create_dir_all(local_dir)?;
            if fs::rename(&old, &new).is_err() {
                fs::copy(&old, &new)?;
                fs::remove_file(&old)?;
            }
        }
    }
    Ok(())
}

fn config_dir_from(lookup: impl Fn(&str) -> Option<PathBuf>) -> Option<PathBuf> {
    let (base, directory) = if cfg!(windows) {
        (lookup("APPDATA"), APP_DIRECTORY)
    } else if cfg!(target_os = "macos") {
        (
            lookup("HOME").map(|home| home.join("Library").join("Application Support")),
            APP_DIRECTORY,
        )
    } else {
        (
            lookup("XDG_CONFIG_HOME")
                .filter(|path| path.is_absolute())
                .or_else(|| lookup("HOME").map(|home| home.join(".config"))),
            UNIX_APP_DIRECTORY,
        )
    };
    base.filter(|path| !path.as_os_str().is_empty())
        .map(|path| path.join(directory))
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    fn lookup<'a>(values: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<PathBuf> + 'a {
        move |name| {
            values
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| PathBuf::from(value))
        }
    }

    #[test]
    #[cfg(windows)]
    fn uses_appdata_on_windows() {
        let path = config_dir_from(lookup(&[("APPDATA", r"C:\Users\test\AppData\Roaming")]));
        assert_eq!(
            path,
            Some(PathBuf::from(r"C:\Users\test\AppData\Roaming\StreamXtras"))
        );
    }

    #[test]
    #[cfg(all(unix, not(target_os = "macos")))]
    fn prefers_absolute_xdg_config_home_on_linux() {
        let path = config_dir_from(lookup(&[
            ("XDG_CONFIG_HOME", "/custom"),
            ("HOME", "/home/test"),
        ]));
        assert_eq!(path, Some(PathBuf::from("/custom/streamxtras")));
        let path = config_dir_from(lookup(&[
            ("XDG_CONFIG_HOME", "relative"),
            ("HOME", "/home/test"),
        ]));
        assert_eq!(path, Some(PathBuf::from("/home/test/.config/streamxtras")));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn uses_application_support_on_macos() {
        let path = config_dir_from(lookup(&[("HOME", "/Users/test")]));
        assert_eq!(
            path,
            Some(PathBuf::from(
                "/Users/test/Library/Application Support/StreamXtras"
            ))
        );
    }

    #[test]
    #[cfg(windows)]
    fn uses_local_appdata_on_windows() {
        let path = local_dir_from(lookup(&[
            ("APPDATA", r"C:\Users\test\AppData\Roaming"),
            ("LOCALAPPDATA", r"C:\Users\test\AppData\Local"),
        ]));
        assert_eq!(
            path,
            Some(PathBuf::from(r"C:\Users\test\AppData\Local\StreamXtras"))
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn keeps_local_files_in_the_config_folder_elsewhere() {
        let values = [("HOME", "/home/test")];
        assert_eq!(
            local_dir_from(lookup(&values)),
            config_dir_from(lookup(&values))
        );
    }

    #[test]
    fn moves_local_files_once() {
        let base = std::env::temp_dir().join(format!("streamxtras-paths-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (config, local) = (base.join("roaming"), base.join("local"));
        fs::create_dir_all(&config).unwrap();
        fs::write(config.join("twitch-token.json"), "token").unwrap();
        fs::write(config.join("update-check.json"), "old").unwrap();
        fs::write(config.join("config.json"), "{}").unwrap();
        fs::create_dir_all(&local).unwrap();
        fs::write(local.join("update-check.json"), "new").unwrap();

        move_local_files(&config, &local).unwrap();
        assert_eq!(
            fs::read_to_string(local.join("twitch-token.json")).unwrap(),
            "token"
        );
        assert!(!config.join("twitch-token.json").exists());
        assert_eq!(
            fs::read_to_string(local.join("update-check.json")).unwrap(),
            "new"
        );
        assert!(config.join("config.json").exists());
        assert!(!local.join("config.json").exists());
        move_local_files(&config, &config).unwrap();
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn returns_none_without_environment() {
        assert_eq!(config_dir_from(lookup(&[])), None);
    }
}
