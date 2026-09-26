//! Plan `language-prompt-library`: commands behind the language sheet's Browse and Preview
//! screens, and the library status that Settings shows (versions, automatic updates).

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::Manager;

use crate::llm::language_library::{
    self as library,
    fetch::{self, FetchError},
    store::{AutoUpdateRecord, LibraryStore},
    IndexEntry, Preset,
};

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(fetch::client)
}

pub(crate) fn library_store(app: &tauri::AppHandle) -> Result<LibraryStore, String> {
    app.path()
        .app_data_dir()
        .map(|dir| LibraryStore::in_app_data(&dir))
        .map_err(|error| error.to_string())
}

/// One preset in the Browse list.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PresetListing {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub summary: String,
    pub languages: Vec<String>,
    /// The regional note used for this language, if any ("notes for en-GB").
    pub variant: Option<String>,
    pub version: i64,
    pub authors: Vec<String>,
    pub model_hint: Option<String>,
    /// This version is on disk.
    pub downloaded: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PresetList {
    /// Matching presets, best first (the built-in default is added by the sheet).
    pub presets: Vec<PresetListing>,
    /// Names of presets for the same language that did not match.
    pub related: Vec<String>,
    /// The library could not be reached; only downloaded presets are listed.
    pub offline: bool,
}

/// A preset rendered for one language: what Preview shows and what "Use this preset" stores.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PresetDetail {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub summary: String,
    pub version: i64,
    pub sha256: String,
    pub authors: Vec<String>,
    pub model_hint: Option<String>,
    /// The full text the AI gets for this language.
    pub text: String,
    pub variant: Option<String>,
    pub detect_codes: Vec<String>,
    pub hints: Vec<String>,
    pub require_hint: bool,
    pub applies_to: Vec<String>,
}

pub(crate) fn detail(preset: &Preset, code: &str) -> PresetDetail {
    PresetDetail {
        id: preset.id.clone(),
        name: preset.name.clone(),
        tier: preset.tier.clone(),
        summary: preset.summary.clone(),
        version: preset.version,
        sha256: preset.sha256.clone(),
        authors: preset.authors.clone(),
        model_hint: preset.model_hint.clone(),
        text: library::render_for_code(preset, code),
        variant: library::variant_for_code(preset.variants.keys(), code).map(str::to_string),
        detect_codes: preset.detect_codes.clone(),
        hints: preset.hints.clone(),
        require_hint: preset.require_hint,
        applies_to: preset.applies_to.clone(),
    }
}

/// The Browse list for `code` from an index: matches best first, related names, and whether
/// each is downloaded. `offline` keeps only downloaded presets.
pub(crate) fn preset_list(
    index: &library::Index,
    store: &LibraryStore,
    code: &str,
    offline: bool,
) -> PresetList {
    let (matches, related) = library::find_presets_for(&index.presets, code);
    let listing = |entry: &IndexEntry| PresetListing {
        id: entry.id.clone(),
        name: entry.name.clone(),
        tier: entry.tier.clone(),
        summary: entry.summary.clone(),
        languages: entry.languages.clone(),
        variant: library::variant_for_code(&entry.variants, code).map(str::to_string),
        version: entry.version,
        authors: entry.authors.clone(),
        model_hint: entry.model_hint.clone(),
        downloaded: store.has_preset(&entry.id, &entry.sha256),
    };
    let presets = matches
        .iter()
        .filter_map(|m| index.entry(&m.id))
        .map(listing)
        .filter(|item| !offline || item.downloaded)
        .collect();
    let related = related
        .iter()
        .filter_map(|id| index.entry(id))
        .map(|entry| entry.name.clone())
        .collect();
    PresetList {
        presets,
        related,
        offline,
    }
}

/// Browse: refreshes the index (a conditional GET) and lists the presets for `code`. Offline,
/// lists the downloaded ones from the cached index.
#[tauri::command]
pub async fn list_language_presets(
    app: tauri::AppHandle,
    code: String,
) -> Result<PresetList, String> {
    let store = library_store(&app)?;
    let (index, offline) =
        match fetch::refresh_index(http_client(), library::LIBRARY_BASE_URL, &store).await {
            Ok(index) => (index, false),
            Err(error) => {
                if let FetchError::Invalid(reason) = &error {
                    tracing::warn!("Language presets: {reason}");
                }
                (store.cached_index().unwrap_or_default(), true)
            }
        };
    Ok(preset_list(&index, &store, &code, offline))
}

/// Preview: downloads preset `id` if needed (size, SHA-256 and validation checked) and renders
/// it for `code`. Nothing is used until the sheet saves it.
#[tauri::command]
pub async fn download_language_preset(
    app: tauri::AppHandle,
    config_manager: tauri::State<'_, crate::storage::ConfigManager>,
    id: String,
    code: String,
) -> Result<PresetDetail, String> {
    let store = library_store(&app)?;
    let (_, preset) =
        fetch::ensure_preset(http_client(), library::LIBRARY_BASE_URL, &store, &id).await?;
    if let Ok(config) = config_manager.load().await {
        store.prune(&id, &versions_in_use(&config, &id, &preset.sha256));
    }
    tracing::info!(
        "Language presets: {} v{} ready for {code}",
        preset.id,
        preset.version
    );
    Ok(detail(&preset, &code))
}

/// The stored versions of `id` to keep: the ones languages use, plus `newest`.
pub(crate) fn versions_in_use(
    config: &crate::storage::AppConfig,
    id: &str,
    newest: &str,
) -> Vec<String> {
    let mut keep: Vec<String> = config
        .translation
        .languages
        .values()
        .filter_map(|settings| settings.library_preset.as_ref())
        .filter(|preset| preset.id == id)
        .map(|preset| preset.sha256.clone())
        .collect();
    keep.push(newest.to_string());
    keep
}

/// A stored version of a preset rendered for `code`, or `None` when it is missing or damaged
/// (the sheet then offers to download it again). Never goes online.
#[tauri::command]
pub fn load_language_preset(
    app: tauri::AppHandle,
    id: String,
    sha256: String,
    code: String,
) -> Result<Option<PresetDetail>, String> {
    let store = library_store(&app)?;
    Ok(store
        .load_preset(&id, &sha256)
        .ok()
        .map(|preset| detail(&preset, &code)))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LatestVersion {
    pub version: i64,
    pub sha256: String,
}

/// What Settings needs to show "Update" tags and banners, from the cache only.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
pub struct LibraryStatus {
    /// Newest version of every preset in the cached index.
    pub latest: BTreeMap<String, LatestVersion>,
    /// Automatic updates by language code.
    pub updates: BTreeMap<String, AutoUpdateRecord>,
}

#[tauri::command]
pub fn get_language_library_status(app: tauri::AppHandle) -> Result<LibraryStatus, String> {
    let store = library_store(&app)?;
    let latest = store
        .cached_index()
        .unwrap_or_default()
        .presets
        .into_iter()
        .map(|entry| {
            (
                entry.id,
                LatestVersion {
                    version: entry.version,
                    sha256: entry.sha256,
                },
            )
        })
        .collect();
    Ok(LibraryStatus {
        latest,
        updates: store.updates(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::language_library::store::tests::{english_bytes, temp_store};

    fn repository_index() -> library::Index {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../presets/languages/index.json");
        library::parse_index(&std::fs::read(path).unwrap()).unwrap()
    }

    #[test]
    fn browse_lists_matches_with_their_variant_and_download_state() {
        let store = temp_store("browse");
        let index = repository_index();
        let list = preset_list(&index, &store, "zh-Hant-HK", false);
        assert_eq!(list.presets[0].id, "cantonese-hong-kong");
        assert_eq!(list.presets[0].tier, "official");
        assert!(!list.presets[0].downloaded);
        assert!(list
            .related
            .iter()
            .any(|name| name.starts_with("Mandarin (Taiwan)")));

        store.store_preset("english", &english_bytes()).unwrap();
        let english = preset_list(&index, &store, "en", false);
        assert_eq!(english.presets.len(), 1);
        assert!(english.presets[0].downloaded);
        assert_eq!(english.presets[0].variant, None);
    }

    #[test]
    fn offline_browse_lists_only_downloaded_presets() {
        let store = temp_store("browse-offline");
        let index = repository_index();
        assert!(preset_list(&index, &store, "zh-Hant-HK", true)
            .presets
            .is_empty());
        store.store_preset("english", &english_bytes()).unwrap();
        let list = preset_list(&index, &store, "en", true);
        assert!(list.offline);
        assert_eq!(list.presets.len(), 1);
    }

    #[test]
    fn the_detail_renders_for_the_language() {
        let preset = library::parse_preset("english", &english_bytes()).unwrap();
        let detail = detail(&preset, "en");
        assert_eq!(detail.detect_codes, ["en"]);
        assert!(detail.text.contains("Examples:"));
        assert_eq!(detail.variant, None);
    }
}
