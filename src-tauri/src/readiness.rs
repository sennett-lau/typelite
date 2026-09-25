//! Which features can start, given which services are ready (plan 0007).
//!
//! A service is ready when its active preset passed a Test since it last changed
//! (`AppConfig::speech_ready` / `ai_ready`). The checks here run at the start of every
//! Dictate, Translate and Ask path, so a missing service gives one clear capsule message
//! instead of a failed request.

use crate::error::UserError;
use crate::storage::AppConfig;
use tauri::{Emitter, Manager};

/// Capsule error code: speech is not set up. `details` is the Settings pane to open.
pub const SPEECH_NOT_READY: &str = "speech_not_ready";
/// Capsule error code: the AI polish service is not set up.
pub const AI_NOT_READY: &str = "ai_not_ready";

/// The feature a shortcut starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Feature {
    Dictate,
    Translate,
    Ask,
}

/// The error to show when `feature` cannot start, or `None` when it can.
///
/// Dictate needs only speech: without AI it pastes the raw transcript (see
/// `without_unready_ai`). Translate and Ask need both.
pub fn start_error(config: &AppConfig, feature: Feature) -> Option<UserError> {
    if !config.speech_ready() {
        return Some(not_ready_error(SPEECH_NOT_READY, "stt"));
    }
    if feature != Feature::Dictate && !config.ai_ready() {
        return Some(not_ready_error(AI_NOT_READY, "llm"));
    }
    None
}

/// The config a Dictate run uses: when AI is not ready, AI cleanup and "always translate"
/// are turned off for this run only, so the raw transcript is pasted without an error.
pub fn without_unready_ai(mut config: AppConfig) -> AppConfig {
    if !config.ai_ready() {
        config.polish_enabled = false;
        config.translate_enabled = false;
    }
    config
}

fn not_ready_error(code: &str, pane: &str) -> UserError {
    UserError {
        code: code.to_string(),
        details: Some(pane.to_string()),
        retry_count: 0,
    }
}

/// Opens the main window on one Settings pane. The capsule's "Set up" button calls this.
#[tauri::command]
pub fn open_settings_pane(app: tauri::AppHandle, pane: String) -> Result<(), String> {
    let pane = match pane.as_str() {
        "stt" | "llm" | "general" => pane,
        _ => return Err(format!("Unknown settings pane: {pane}")),
    };
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window is not available".to_string())?;
    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    // Only the main window navigates; the capsule and Ask windows keep their own page.
    app.emit_to("main", "navigate", format!("#/settings?pane={pane}"))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(speech: bool, ai: bool) -> AppConfig {
        let mut config = AppConfig::default();
        config.speech_presets[0].verified_at = speech.then_some(1);
        config.ai_presets[0].verified_at = ai.then_some(1);
        config
    }

    #[test]
    fn nothing_starts_without_speech() {
        for feature in [Feature::Dictate, Feature::Translate, Feature::Ask] {
            let error = start_error(&config(false, true), feature).unwrap();
            assert_eq!(error.code, SPEECH_NOT_READY);
            assert_eq!(error.details.as_deref(), Some("stt"));
        }
    }

    #[test]
    fn translate_and_ask_need_ai_but_dictate_does_not() {
        let speech_only = config(true, false);
        assert!(start_error(&speech_only, Feature::Dictate).is_none());
        for feature in [Feature::Translate, Feature::Ask] {
            let error = start_error(&speech_only, feature).unwrap();
            assert_eq!(error.code, AI_NOT_READY);
            assert_eq!(error.details.as_deref(), Some("llm"));
        }
    }

    #[test]
    fn everything_starts_when_both_are_ready() {
        let ready = config(true, true);
        for feature in [Feature::Dictate, Feature::Translate, Feature::Ask] {
            assert!(start_error(&ready, feature).is_none());
        }
    }

    #[test]
    fn dictate_without_ai_skips_polish_and_translation() {
        let mut speech_only = config(true, false);
        speech_only.polish_enabled = true;
        speech_only.translate_enabled = true;
        let run = without_unready_ai(speech_only);
        assert!(!run.polish_enabled);
        assert!(!run.translate_enabled);

        let mut ready = config(true, true);
        ready.translate_enabled = true;
        let run = without_unready_ai(ready);
        assert!(run.polish_enabled);
        assert!(run.translate_enabled);
    }

    #[test]
    fn a_built_in_preset_is_ready_only_after_its_test() {
        let mut config = config(false, true);
        let preset = config.install_builtin_whisper("small", "ggml-small-q5_1.bin");
        assert_eq!(
            start_error(&config, Feature::Dictate).unwrap().code,
            SPEECH_NOT_READY
        );
        assert!(config.mark_speech_verified(&preset, 10));
        for feature in [Feature::Dictate, Feature::Translate, Feature::Ask] {
            assert!(start_error(&config, feature).is_none());
        }
        // Deleting its model file makes it not ready again.
        config.reconcile_builtin_models(&[]);
        assert_eq!(
            start_error(&config, Feature::Dictate).unwrap().code,
            SPEECH_NOT_READY
        );
    }

    #[test]
    fn readiness_follows_the_active_preset() {
        let mut config = config(true, true);
        config.active_speech_preset_id = config.speech_presets[2].id.clone();
        assert!(!config.speech_ready());
        assert_eq!(
            start_error(&config, Feature::Dictate).unwrap().code,
            SPEECH_NOT_READY
        );
    }
}
