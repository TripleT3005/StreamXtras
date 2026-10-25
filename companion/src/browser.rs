use std::io;

// Browser
pub fn open(url: &str) -> io::Result<()> {
    if !is_web_url(url) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "only web addresses can be opened",
        ));
    }
    platform::open(url)
}

fn is_web_url(url: &str) -> bool {
    (url.starts_with("http://") || url.starts_with("https://"))
        && !url
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
}

// Windows
#[cfg(windows)]
mod platform {
    use std::io;
    use std::ptr;

    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    pub fn open(url: &str) -> io::Result<()> {
        let operation: Vec<u16> = "open".encode_utf16().chain([0]).collect();
        let target: Vec<u16> = url.encode_utf16().chain([0]).collect();
        let result = unsafe {
            ShellExecuteW(
                ptr::null_mut(),
                operation.as_ptr(),
                target.as_ptr(),
                ptr::null(),
                ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if result as isize > 32 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
}

// macOS
#[cfg(target_os = "macos")]
mod platform {
    use std::io;
    use std::process::Command;

    pub fn open(url: &str) -> io::Result<()> {
        Command::new("open").arg(url).spawn().map(drop)
    }
}

// Linux and other Unix systems
#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::io;
    use std::process::Command;

    pub fn open(url: &str) -> io::Result<()> {
        Command::new("xdg-open").arg(url).spawn().map(drop)
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_web_addresses() {
        assert!(is_web_url("http://127.0.0.1:47820/"));
        assert!(is_web_url("https://www.twitch.tv/activate"));
        assert!(!is_web_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_web_url("C:\\Windows\\notepad.exe"));
        assert!(!is_web_url("http://127.0.0.1/ --flag"));
        assert!(open("calc.exe").is_err());
    }
}
