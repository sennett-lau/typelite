use crate::pipeline;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// Managed tray icon handle for dynamic menu/tooltip updates.
pub struct TrayHandle {
    pub tray: Mutex<tauri::tray::TrayIcon>,
}

struct TrayLabels {
    show_window: &'static str,
    hide_window: &'static str,
    start_recording: &'static str,
    stop_recording: &'static str,
    settings: &'static str,
    about: &'static str,
    quit: &'static str,
}

fn get_tray_labels(lang: &str) -> TrayLabels {
    match lang {
        "zh" => TrayLabels {
            show_window: "显示窗口",
            hide_window: "隐藏窗口",
            start_recording: "开始录音",
            stop_recording: "停止录音",
            settings: "设置",
            about: "关于 Typelite",
            quit: "退出",
        },
        _ => TrayLabels {
            show_window: "Show Window",
            hide_window: "Hide Window",
            start_recording: "Start Recording",
            stop_recording: "Stop Recording",
            settings: "Settings",
            about: "About Typelite",
            quit: "Quit",
        },
    }
}

fn app_config_value(app: &tauri::AppHandle) -> Option<serde_json::Value> {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("app_config"))
}

fn tray_language(app: &tauri::AppHandle) -> String {
    app_config_value(app)
        .and_then(|config| {
            config
                .get("ui_language")
                .and_then(|value| value.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| "en".to_string())
}

/// Build (or rebuild) the system tray menu based on current state.
pub fn build_tray_menu(
    app: &tauri::AppHandle,
    is_recording: bool,
    window_visible: bool,
) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let lang = tray_language(app);
    let labels = get_tray_labels(&lang);

    let show_hide = MenuItem::with_id(
        app,
        "show_hide",
        if window_visible {
            labels.hide_window
        } else {
            labels.show_window
        },
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let record = MenuItem::with_id(
        app,
        "record",
        if is_recording {
            labels.stop_recording
        } else {
            labels.start_recording
        },
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", labels.settings, true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let about = MenuItem::with_id(app, "about", labels.about, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_hide, &sep1, &record, &sep2, &settings, &sep3, &about, &quit,
        ],
    )?;
    Ok(menu)
}

/// Rebuild the tray menu and update tooltip based on pipeline state.
pub fn refresh_tray(app: &tauri::AppHandle) {
    let is_recording = app
        .try_state::<pipeline::PipelineHandle>()
        .map(|p| p.current_state() == pipeline::PipelineState::Recording)
        .unwrap_or(false);
    let window_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    if let Some(tray_handle) = app.try_state::<TrayHandle>() {
        if let Ok(tray) = tray_handle.tray.lock() {
            if let Ok(menu) = build_tray_menu(app, is_recording, window_visible) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The idle capsule is always hidden, so everything its right-click menu offers
    /// (open the main window, Settings, quit) must be in the tray menu too.
    #[test]
    fn tray_labels_cover_the_capsule_menu_actions() {
        for lang in ["en", "zh"] {
            let labels = get_tray_labels(lang);
            assert!(!labels.show_window.is_empty());
            assert!(!labels.settings.is_empty());
            assert!(!labels.quit.is_empty());
        }
    }
}
