//! Plan `preset-sharing`: Export and Import buttons of Settings → Speech and Settings → AI.
//!
//! The system save and open dialogs are shown from Rust (`tauri-plugin-dialog`), and the file
//! is read and written here, so the web view never sees a file path or a file's API keys.
//! Import takes two steps: `pick_preset_import` reads and checks a file and returns what it
//! holds; `apply_preset_import` adds the entries the user ticked. The checked file waits in
//! memory between the two (and is dropped by `cancel_preset_import`).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::Window;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

use crate::credentials::SystemCredentialVault;
use crate::storage::preset_share::{self, ExportCandidate, ImportPreview, ParsedFile, ShareError};
use crate::storage::{AiPreset, ConfigManager, ServiceKind, SpeechPreset};

struct PendingImport {
    service: ServiceKind,
    parsed: ParsedFile,
}

/// The file read by the last `pick_preset_import`, until it is applied or cancelled.
static PENDING_IMPORT: Mutex<Option<PendingImport>> = Mutex::new(None);

fn set_pending(pending: Option<PendingImport>) {
    *PENDING_IMPORT.lock().unwrap_or_else(|e| e.into_inner()) = pending;
}

fn take_pending(service: ServiceKind) -> Option<ParsedFile> {
    let mut slot = PENDING_IMPORT.lock().unwrap_or_else(|e| e.into_inner());
    match slot.take() {
        Some(pending) if pending.service == service => Some(pending.parsed),
        _ => None,
    }
}

/// Presets and API keys are only handled for the main (Settings) window.
fn ensure_main_window(window: &Window) -> Result<(), ShareError> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(ShareError::NotAllowed)
    }
}

/// Shows a file dialog as a sheet on `window` and waits for the user's choice. `None` when the
/// dialog was closed without a choice.
async fn choose_file(builder: FileDialogBuilder<tauri::Wry>, save: bool) -> Option<PathBuf> {
    let (sender, receiver) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    let done = move |path: Option<FilePath>| {
        let _ = sender.send(path);
    };
    if save {
        builder.save_file(done);
    } else {
        builder.pick_file(done);
    }
    receiver.await.ok().flatten()?.into_path().ok()
}

fn file_dialog(window: &Window, filter_name: &str) -> FileDialogBuilder<tauri::Wry> {
    let name = if filter_name.trim().is_empty() {
        "Typelite presets"
    } else {
        filter_name.trim()
    };
    window
        .dialog()
        .file()
        .set_parent(window)
        .add_filter(name, &["json"])
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The presets of one page that Export offers (never Built-in presets).
#[tauri::command]
pub async fn list_exportable_presets(
    window: Window,
    state: tauri::State<'_, ConfigManager>,
    service: ServiceKind,
) -> Result<Vec<ExportCandidate>, ShareError> {
    ensure_main_window(&window)?;
    let config = state.load().await.map_err(|error| ShareError::ReadFailed {
        details: error.to_string(),
    })?;
    Ok(preset_share::export_candidates(&config, service))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub file_name: String,
    pub count: usize,
}

/// Asks where to save, then writes the chosen saved presets (`ids`) of one page. API keys
/// are read from the Keychain only with `include_keys`. `None` when the user cancelled.
#[tauri::command]
pub async fn export_presets(
    window: Window,
    state: tauri::State<'_, ConfigManager>,
    service: ServiceKind,
    ids: Vec<String>,
    include_keys: bool,
    filter_name: String,
) -> Result<Option<ExportResult>, ShareError> {
    ensure_main_window(&window)?;
    let config = state.load().await.map_err(|error| ShareError::ReadFailed {
        details: error.to_string(),
    })?;
    if preset_share::export_candidates(&config, service)
        .iter()
        .all(|candidate| !ids.contains(&candidate.id))
    {
        return Err(ShareError::NothingSelected);
    }
    let builder = file_dialog(&window, &filter_name)
        .set_file_name(preset_share::suggested_file_name(service))
        .set_can_create_directories(true);
    let Some(path) = choose_file(builder, true).await else {
        return Ok(None);
    };
    let (text, count) =
        preset_share::build_export(&config, service, &ids, include_keys, &SystemCredentialVault)?;
    write_file(&path, &text, include_keys).map_err(|error| ShareError::WriteFailed {
        details: error.to_string(),
    })?;
    tracing::info!("Exported {count} {service:?} presets (keys included: {include_keys})");
    Ok(Some(ExportResult {
        file_name: file_name_of(&path),
        count,
    }))
}

/// Writes the file. A file with API keys is readable by this macOS user only.
fn write_file(path: &Path, text: &str, has_keys: bool) -> std::io::Result<()> {
    std::fs::write(path, text)?;
    #[cfg(unix)]
    if has_keys {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    let _ = has_keys;
    Ok(())
}

fn read_file(path: &Path) -> Result<String, ShareError> {
    let read_failed = |error: std::io::Error| ShareError::ReadFailed {
        details: error.to_string(),
    };
    let size = std::fs::metadata(path).map_err(read_failed)?.len();
    if size > preset_share::MAX_FILE_BYTES {
        return Err(ShareError::TooLarge);
    }
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::InvalidData => Err(ShareError::NotJson),
        Err(error) => Err(read_failed(error)),
    }
}

/// Asks for a presets file, reads and checks it, and returns the entries for this page.
/// `None` when the user cancelled. Nothing is added yet.
#[tauri::command]
pub async fn pick_preset_import(
    window: Window,
    service: ServiceKind,
    filter_name: String,
) -> Result<Option<ImportPreview>, ShareError> {
    ensure_main_window(&window)?;
    set_pending(None);
    let Some(path) = choose_file(file_dialog(&window, &filter_name), false).await else {
        return Ok(None);
    };
    let parsed = preset_share::parse_file(&read_file(&path)?)?;
    let preview = preset_share::preview(&parsed, service, &file_name_of(&path));
    set_pending(Some(PendingImport { service, parsed }));
    Ok(Some(preview))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    /// The added presets, as saved; the frontend adds them to its lists.
    pub speech: Vec<SpeechPreset>,
    pub ai: Vec<AiPreset>,
    /// API keys from the file that could not be stored in the Keychain.
    pub keys_failed: usize,
}

/// Adds the chosen entries (indexes from the preview) of the file read last. The config is
/// saved first, then the file's API keys go to the Keychain under the new preset ids.
#[tauri::command]
pub async fn apply_preset_import(
    window: Window,
    state: tauri::State<'_, ConfigManager>,
    service: ServiceKind,
    indices: Vec<usize>,
) -> Result<ImportResult, ShareError> {
    ensure_main_window(&window)?;
    let parsed = take_pending(service).ok_or(ShareError::NoPendingImport)?;
    let mut config = state.load().await.map_err(|error| ShareError::SaveFailed {
        details: error.to_string(),
    })?;
    let outcome = preset_share::merge_import(&mut config, &parsed, service, &indices)?;
    state
        .save(&config)
        .await
        .map_err(|error| ShareError::SaveFailed {
            details: error.to_string(),
        })?;
    let keys_failed = preset_share::store_keys(&SystemCredentialVault, service, &outcome.keys);
    tracing::info!(
        "Imported {} {service:?} presets ({} with an API key)",
        outcome.speech.len() + outcome.ai.len(),
        outcome.keys.len()
    );
    Ok(ImportResult {
        speech: outcome.speech,
        ai: outcome.ai,
        keys_failed,
    })
}

/// Drops the file read by `pick_preset_import` (the review dialog was closed).
#[tauri::command]
pub fn cancel_preset_import() {
    set_pending(None);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pending_import_is_only_taken_for_its_page_and_only_once() {
        set_pending(Some(PendingImport {
            service: ServiceKind::Ai,
            parsed: ParsedFile::default(),
        }));
        assert!(take_pending(ServiceKind::Speech).is_none());
        // A mismatch drops it too, so a stale file cannot be applied later.
        assert!(take_pending(ServiceKind::Ai).is_none());

        set_pending(Some(PendingImport {
            service: ServiceKind::Ai,
            parsed: ParsedFile::default(),
        }));
        assert!(take_pending(ServiceKind::Ai).is_some());
        assert!(take_pending(ServiceKind::Ai).is_none());
    }

    #[test]
    fn read_file_rejects_large_and_binary_files() {
        let dir = std::env::temp_dir().join(format!("typelite-share-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let big = dir.join("big.json");
        std::fs::write(&big, vec![b' '; preset_share::MAX_FILE_BYTES as usize + 1]).unwrap();
        assert_eq!(read_file(&big), Err(ShareError::TooLarge));
        let binary = dir.join("binary.json");
        std::fs::write(&binary, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_file(&binary), Err(ShareError::NotJson));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_file_with_keys_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("typelite-share-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("keys.typelite-presets.json");
        write_file(&path, "{}", true).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
