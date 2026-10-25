#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod config;
mod event_loop;
mod events;
mod http;
mod instance;
mod paths;
mod server;
mod tray;
mod twitch;

use std::error::Error;
use std::io;
use std::net::{Ipv4Addr, SocketAddr, TcpListener};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::{Arc, Mutex};

use events::EventBroadcaster;
use server::AppState;
use twitch::account::TwitchAccount;
use twitch::helix::HelixClient;
use twitch::http::UreqHttp;

// Entry point
fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("streamxtras: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let config_dir = paths::config_dir().ok_or(config::ConfigError::NoConfigDirectory)?;
    let (config, is_first_start) = config::load_or_create(&config_dir)?;
    let port = config.port;
    let url = format!("http://127.0.0.1:{port}/");

    let listener = match TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port))) {
        Ok(listener) => listener,
        Err(error) if error.kind() == io::ErrorKind::AddrInUse && instance::is_running(port) => {
            browser::open(&url)?;
            return Ok(());
        }
        Err(error) => return Err(format!("port {port} is not available: {error}").into()),
    };
    let events = Arc::new(EventBroadcaster::default());
    let client_id = config
        .twitch_client_id
        .clone()
        .or_else(|| option_env!("TWITCH_CLIENT_ID").map(str::to_owned))
        .filter(|client_id| !client_id.trim().is_empty());
    let http = Arc::new(UreqHttp::new());
    let twitch = TwitchAccount::new(http.clone(), client_id, &config_dir, Arc::clone(&events));
    twitch.start_maintenance();
    let helix = Arc::new(HelixClient::new(http, Arc::clone(&twitch)));
    let state = Arc::new(AppState {
        port,
        web_root: web_root(),
        config_dir,
        config: Mutex::new(config),
        events,
        twitch,
        helix,
    });
    server::start(listener, state)?;

    event_loop::init();
    let _tray = tray::create(url.clone())?;
    if is_first_start {
        browser::open(&url)?;
    }
    event_loop::run();
    Ok(())
}

fn web_root() -> PathBuf {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|directory| directory.join("web")));
    if let Some(directory) = bundled
        && directory.is_dir()
    {
        return directory;
    }
    development_web_root()
}

#[cfg(debug_assertions)]
fn development_web_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("web")
}

#[cfg(not(debug_assertions))]
fn development_web_root() -> PathBuf {
    PathBuf::from("web")
}
