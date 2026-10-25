use std::error::Error;

use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

use crate::{browser, event_loop};

// Constants
const ICON_SIZE: u16 = 32;
const ICON_BACKGROUND: [u8; 4] = [0x91, 0x46, 0xff, 0xff];
const ICON_FOREGROUND: [u8; 4] = [0xff, 0xff, 0xff, 0xff];
const TRANSPARENT: [u8; 4] = [0, 0, 0, 0];

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
        .with_tooltip("Stream Overlays")
        .with_icon(icon)
        .build()?;
    Ok(tray)
}

fn open_settings(url: &str) {
    if let Err(error) = browser::open(url) {
        eprintln!("Opening the browser failed: {error}");
    }
}

// Icon
fn icon_pixels(size: u16) -> Vec<u8> {
    let size_f = f32::from(size);
    let radius = size_f * 0.25;
    let mut pixels = Vec::with_capacity(usize::from(size) * usize::from(size) * 4);
    for y in 0..size {
        for x in 0..size {
            let (x_f, y_f) = (f32::from(x) + 0.5, f32::from(y) + 0.5);
            let color = if !is_inside_rounded_square(x_f, y_f, size_f, radius) {
                TRANSPARENT
            } else if is_chat_line(x_f / size_f, y_f / size_f) {
                ICON_FOREGROUND
            } else {
                ICON_BACKGROUND
            };
            pixels.extend_from_slice(&color);
        }
    }
    pixels
}

fn is_inside_rounded_square(x: f32, y: f32, size: f32, radius: f32) -> bool {
    let nearest_x = x.clamp(radius, size - radius);
    let nearest_y = y.clamp(radius, size - radius);
    (x - nearest_x).powi(2) + (y - nearest_y).powi(2) <= radius.powi(2)
}

fn is_chat_line(x: f32, y: f32) -> bool {
    let first_line = (0.28..0.40).contains(&y) && (0.22..0.78).contains(&x);
    let second_line = (0.56..0.68).contains(&y) && (0.22..0.60).contains(&x);
    first_line || second_line
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draws_rounded_icon_with_transparent_corners() {
        let pixels = icon_pixels(ICON_SIZE);
        assert_eq!(pixels.len(), 32 * 32 * 4);
        assert_eq!(pixels[0..4], TRANSPARENT);
        let center = (16 * 32 + 16) * 4;
        assert_eq!(pixels[center..center + 4], ICON_BACKGROUND);
        let line = (11 * 32 + 16) * 4;
        assert_eq!(pixels[line..line + 4], ICON_FOREGROUND);
    }
}
