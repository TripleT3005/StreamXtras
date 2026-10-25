pub use platform::{init, quit, run};

// Windows
#[cfg(windows)]
mod platform {
    use std::ptr;

    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, MSG, PostQuitMessage, TranslateMessage,
    };

    pub fn init() {}

    pub fn run() {
        let mut message: MSG = unsafe { std::mem::zeroed() };
        while unsafe { GetMessageW(&raw mut message, ptr::null_mut(), 0, 0) } > 0 {
            unsafe {
                TranslateMessage(&raw const message);
                DispatchMessageW(&raw const message);
            }
        }
    }

    pub fn quit() {
        unsafe { PostQuitMessage(0) };
    }
}

// macOS
#[cfg(target_os = "macos")]
mod platform {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};

    pub fn init() {
        if let Some(main_thread) = MainThreadMarker::new() {
            NSApplication::sharedApplication(main_thread)
                .setActivationPolicy(NSApplicationActivationPolicy::Accessory);
        }
    }

    pub fn run() {
        if let Some(main_thread) = MainThreadMarker::new() {
            NSApplication::sharedApplication(main_thread).run();
        }
    }

    pub fn quit() {
        if let Some(main_thread) = MainThreadMarker::new() {
            NSApplication::sharedApplication(main_thread).terminate(None);
        }
    }
}

// Linux and other Unix systems
#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::sync::{Condvar, Mutex};

    static QUIT_REQUESTED: (Mutex<bool>, Condvar) = (Mutex::new(false), Condvar::new());

    pub fn init() {}

    pub fn run() {
        let (lock, signal) = &QUIT_REQUESTED;
        let mut quit_requested = lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while !*quit_requested {
            quit_requested = signal
                .wait(quit_requested)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
    }

    pub fn quit() {
        let (lock, signal) = &QUIT_REQUESTED;
        *lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = true;
        signal.notify_all();
    }
}
