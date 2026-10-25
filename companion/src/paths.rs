use std::path::PathBuf;

// Constants
const APP_DIRECTORY: &str = "StreamXtras";
const UNIX_APP_DIRECTORY: &str = "streamxtras";

// Directories
pub fn config_dir() -> Option<PathBuf> {
    config_dir_from(|name| std::env::var_os(name).map(PathBuf::from))
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
    fn returns_none_without_environment() {
        assert_eq!(config_dir_from(lookup(&[])), None);
    }
}
