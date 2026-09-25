use tauri::{Emitter, Manager};

use crate::{pipeline::PipelineHandle, storage};

/// Serialises target switches (chip clicks and shortcut presses), so quick repeated presses
/// save their targets in the same order as they switched the running recording.
static TARGET_SWITCH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
pub async fn set_active_translation_target(
    app: tauri::AppHandle,
    code: String,
    pipeline: tauri::State<'_, PipelineHandle>,
    config_manager: tauri::State<'_, storage::ConfigManager>,
) -> Result<storage::TranslationConfig, String> {
    let _guard = TARGET_SWITCH_LOCK.lock().await;
    let code = code.trim().to_ascii_lowercase();
    let config = config_manager
        .load()
        .await
        .map_err(|error| error.to_string())?;
    if !config.translation.targets.contains(&code) {
        return Err("translation_target_not_configured".to_string());
    }

    let previous_operation_target = pipeline.switch_active_translation_target(code.clone())?;
    persist_active_target(
        &app,
        &pipeline,
        &config_manager,
        config,
        code,
        previous_operation_target,
    )
    .await
}

/// Switches a running Translate recording to its next target language (1 -> 2 -> 3 -> 1),
/// saves it as the active target and tells the windows. The Switch language shortcut calls
/// this. With one language it changes nothing.
#[tauri::command]
pub async fn cycle_translation_target(
    app: tauri::AppHandle,
    pipeline: tauri::State<'_, PipelineHandle>,
    config_manager: tauri::State<'_, storage::ConfigManager>,
) -> Result<storage::TranslationConfig, String> {
    let _guard = TARGET_SWITCH_LOCK.lock().await;
    let config = config_manager
        .load()
        .await
        .map_err(|error| error.to_string())?;

    let (previous_operation_target, code) = pipeline.cycle_active_translation_target()?;
    if code == previous_operation_target {
        return Ok(config.translation);
    }
    if !config.translation.targets.contains(&code) {
        // Settings changed the list during this recording; keep the run on its old target.
        let _ = pipeline.switch_active_translation_target(previous_operation_target);
        return Err("translation_target_not_configured".to_string());
    }
    tracing::info!(
        "translation target switched: {} -> {}",
        previous_operation_target,
        code
    );
    persist_active_target(
        &app,
        &pipeline,
        &config_manager,
        config,
        code,
        previous_operation_target,
    )
    .await
}

/// Runs [`cycle_translation_target`] from the hotkey handler, which has only an app handle.
pub async fn cycle_translation_target_from_shortcut(app: tauri::AppHandle) {
    let pipeline = app.state::<PipelineHandle>();
    let config_manager = app.state::<storage::ConfigManager>();
    if let Err(error) = cycle_translation_target(app.clone(), pipeline, config_manager).await {
        tracing::warn!("Could not switch translation target: {}", error);
    }
}

/// Saves `code` as the active target and emits `translation:target-changed` and
/// `config:patch`. If saving fails, the running recording goes back to its previous target.
async fn persist_active_target(
    app: &tauri::AppHandle,
    pipeline: &PipelineHandle,
    config_manager: &storage::ConfigManager,
    mut config: storage::AppConfig,
    code: String,
    previous_operation_target: String,
) -> Result<storage::TranslationConfig, String> {
    let previous_config = config.clone();
    config.translation.active_target = code.clone();
    config.target_lang = code.clone();
    if let Err(error) = config_manager.save(&config).await {
        let _ = pipeline.switch_active_translation_target(previous_operation_target);
        let _ = config_manager.save(&previous_config).await;
        return Err(error.to_string());
    }

    let _ = app.emit("translation:target-changed", &code);
    let _ = app.emit(
        "config:patch",
        serde_json::json!({
            "target_lang": code,
            "translation": config.translation.clone(),
        }),
    );
    Ok(config.translation)
}

/// Whether a Switch language shortcut event should move to the next language: only a press
/// while a Translate recording is capturing audio. The key listener already ignores the
/// shortcut at other times; this check covers a press whose release arrives late (a key that
/// is also part of a longer chord fires on release) after the recording has ended.
pub fn switch_language_press_cycles_target(
    event_state: tauri_plugin_global_shortcut::ShortcutState,
    pipeline_state: crate::pipeline::PipelineState,
    is_translate_run: bool,
) -> bool {
    event_state == tauri_plugin_global_shortcut::ShortcutState::Pressed
        && pipeline_state == crate::pipeline::PipelineState::Recording
        && is_translate_run
}

#[cfg(test)]
mod tests {
    use super::switch_language_press_cycles_target;
    use crate::pipeline::PipelineState;
    use tauri_plugin_global_shortcut::ShortcutState;

    #[test]
    fn switch_language_cycles_only_on_a_press_during_a_translate_recording() {
        let pressed = ShortcutState::Pressed;
        assert!(switch_language_press_cycles_target(
            pressed,
            PipelineState::Recording,
            true
        ));
        // A Dictate recording has no languages to switch.
        assert!(!switch_language_press_cycles_target(
            pressed,
            PipelineState::Recording,
            false
        ));
        // Idle, or after the recording has moved on to transcribing.
        assert!(!switch_language_press_cycles_target(
            pressed,
            PipelineState::Idle,
            false
        ));
        assert!(!switch_language_press_cycles_target(
            pressed,
            PipelineState::Transcribing,
            true
        ));
        // Releases never switch.
        assert!(!switch_language_press_cycles_target(
            ShortcutState::Released,
            PipelineState::Recording,
            true
        ));
    }
}
