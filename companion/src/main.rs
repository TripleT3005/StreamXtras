#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod config;
mod event_loop;
mod instance;
mod paths;
mod server;
mod tray;

use std::error::Error;
use std::io;
use std::net::{Ipv4Addr, SocketAddr, TcpListener};
use std::process::ExitCode;

// Entry point
fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("stream-overlays: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let directory = paths::config_dir().ok_or(config::ConfigError::NoConfigDirectory)?;
    let (config, is_first_start) = config::load_or_create(&directory)?;
    let url = format!("http://127.0.0.1:{}/", config.port);

    let listener = match TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, config.port))) {
        Ok(listener) => listener,
        Err(error)
            if error.kind() == io::ErrorKind::AddrInUse && instance::is_running(config.port) =>
        {
            browser::open(&url)?;
            return Ok(());
        }
        Err(error) => return Err(format!("port {} is not available: {error}", config.port).into()),
    };
    server::start(listener).map_err(|error| error.to_string())?;

    event_loop::init();
    let _tray = tray::create(url.clone())?;
    if is_first_start {
        browser::open(&url)?;
    }
    event_loop::run();
    Ok(())
}
