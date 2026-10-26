use std::error::Error;

use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

use crate::icon::icon_pixels;
use crate::{browser, event_loop};

// Constants
const ICON_SIZE: u16 = 32;

// Tray
pub fn create(url: String) -> Result<TrayIcon, Box<dyn Error>> {
    let open_item = MenuItem::new("Open settings", true, None);
    let quit_item = MenuItem::new("Quit", true, None);
    let menu = Menu::with_items(&[&open_item, &PredefinedMenuItem::separator(), &quit_item])?;

    let open_id = open_item.id().clone();
    let quit_id = quit_item.id().clone();
    let menu_url = url.clone();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        if event.id == open_id {
            open_settings(&menu_url);
        } else if event.id == quit_id {
            event_loop::quit();
        }
    }));
    TrayIconEvent::set_event_handler(Some(move |event: TrayIconEvent| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            open_settings(&url);
        }
    }));

    let icon = Icon::from_rgba(
        icon_pixels(ICON_SIZE),
        u32::from(ICON_SIZE),
        u32::from(ICON_SIZE),
    )?;
    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_menu_on_left_click(false)
        .with_tooltip("StreamXtras")
        .with_icon(icon)
        .build()?;
    Ok(tray)
}

fn open_settings(url: &str) {
    if let Err(error) = browser::open(url) {
        eprintln!("Opening the browser failed: {error}");
    }
}
