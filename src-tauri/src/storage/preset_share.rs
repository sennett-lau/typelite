//! Plan `preset-sharing`: export and import presets as a `*.typelite-presets.json` file.
//!
//! The file holds a format name, a format version and two lists, `speech` and `ai`. Each entry
//! has a kind, a name, a base URL and a model; speech entries also have a language, AI entries
//! their extra request fields. An API key is only in the file when the user asked for it.
//!
//! Reading is tolerant: unknown fields are ignored, and entries of a kind this build does not
//! know (a newer provider kind, or a local model) are skipped and counted. Everything else that
//! is wrong (not JSON, another format, a newer version, a bad address) rejects the whole file,
//! so a broken or foreign file never adds half its presets.
//!
//! Only presets that point at a server are shared: never a Built-in (local model) preset, never
//! an address that still holds a placeholder, and never a shipped template the user did not
//! change. Imported presets get new ids, never replace an existing preset, never become the
//! preset in use, and start untested.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{
    base_url_has_placeholder, preset_name_or_default, AiPreset, AppConfig, ServiceKind,
    SpeechPreset, PRESET_NAME_MAX_CHARS, SPEECH_LANGUAGE_AUTO,
};
use crate::credentials::{CredentialSecretReader, CredentialVault};

/// Value of the `format` field.
pub const FORMAT: &str = "typelite-presets";
/// Newest format version this build reads and the one it writes.
pub const VERSION: u64 = 1;
/// End of the suggested file name.
pub const FILE_SUFFIX: &str = ".typelite-presets.json";
/// Largest file that is read. Real files are a few kilobytes.
pub const MAX_FILE_BYTES: u64 = 1024 * 1024;
/// Most entries read from one list.
const MAX_ENTRIES: usize = 200;
/// Longest base URL or model name accepted.
const MAX_FIELD_CHARS: usize = 2048;
const MAX_API_KEY_CHARS: usize = 4096;
const MAX_LANGUAGE_CHARS: usize = 16;
/// The kind an entry has when the file does not say: an OpenAI-compatible server. It is also
/// the only kind shared for AI presets.
pub const SHAREABLE_KIND: &str = "openai_compatible";
/// Speech kinds that are shared: an OpenAI-compatible server, or Qwen Cloud's own API (plan
/// `qwen-cloud-speech`). Other kinds (the Built-in model, or kinds added later) are left out of
/// an export and skipped on import.
pub const SHAREABLE_SPEECH_KINDS: [&str; 2] = [SHAREABLE_KIND, QWEN_CLOUD_KIND];
const QWEN_CLOUD_KIND: &str = "qwen_cloud";

/// True when entries of `kind` are shared for `service`.
fn is_shareable_kind(service: ServiceKind, kind: &str) -> bool {
    match service {
        ServiceKind::Speech => SHAREABLE_SPEECH_KINDS.contains(&kind),
        ServiceKind::Ai => kind == SHAREABLE_KIND,
    }
}

/// Why an export or import failed. Sent to the frontend as `{ "code": ..., ...fields }`, which
/// shows a translated message for each code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ShareError {
    /// The file is not valid JSON (or not text).
    NotJson,
    /// JSON, but not a Typelite presets file.
    WrongFormat,
    /// Made by a newer Typelite with a format this build does not know.
    NewerVersion {
        version: u64,
    },
    /// The `version` field is missing or not a positive whole number.
    InvalidVersion,
    /// The file is larger than `MAX_FILE_BYTES`.
    TooLarge,
    /// A list holds more than `MAX_ENTRIES` entries.
    TooManyEntries,
    /// An entry of a known kind has a field of the wrong type or length.
    InvalidEntry {
        list: String,
        index: usize,
    },
    /// An entry of a known kind has an address that is not a usable http(s) URL.
    BadAddress {
        name: String,
        address: String,
    },
    /// Export or import was asked for with no presets chosen.
    NothingSelected,
    /// No file was read before the import was confirmed (or it was cancelled).
    NoPendingImport,
    ReadFailed {
        details: String,
    },
    WriteFailed {
        details: String,
    },
    KeyReadFailed {
        details: String,
    },
    SaveFailed {
        details: String,
    },
    /// The command was called from a window other than the main window.
    NotAllowed,
}

impl std::fmt::Display for ShareError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match serde_json::to_string(self) {
            Ok(text) => f.write_str(&text),
            Err(_) => write!(f, "{self:?}"),
        }
    }
}

/// One preset as it is written to and read from the file.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SharedPreset {
    pub kind: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    /// Speech only: `"auto"` or a language code.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// AI only: copied into every chat request.
    #[serde(skip_serializing_if = "Map::is_empty")]
    pub extra_request_fields: Map<String, Value>,
    /// Only when the user chose "Include API keys".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

#[derive(Serialize)]
struct ShareFile<'a> {
    format: &'static str,
    version: u64,
    speech: &'a [SharedPreset],
    ai: &'a [SharedPreset],
}

/// A preset the export dialog offers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCandidate {
    pub id: String,
    pub name: String,
    pub host: String,
}

/// A read and checked file, waiting for the user to pick entries.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ParsedFile {
    pub speech: Vec<SharedPreset>,
    pub ai: Vec<SharedPreset>,
    /// Entries of kinds this build does not import.
    pub skipped_speech: usize,
    pub skipped_ai: usize,
}

impl ParsedFile {
    fn list(&self, service: ServiceKind) -> &[SharedPreset] {
        match service {
            ServiceKind::Speech => &self.speech,
            ServiceKind::Ai => &self.ai,
        }
    }
}

/// What the import review list shows for one entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntry {
    pub index: usize,
    pub name: String,
    pub host: String,
    pub model: String,
    pub has_key: bool,
}

/// What the import review dialog shows for a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub file_name: String,
    /// Entries for the page the import was started from.
    pub entries: Vec<ImportEntry>,
    /// Entries of kinds this build does not import, on this page's list.
    pub skipped_unknown: usize,
    /// Entries for the other page (speech when importing on the AI page, and the other way round).
    pub other_service_count: usize,
}

/// The presets an import added, and the API keys to store for them.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ImportOutcome {
    pub speech: Vec<SpeechPreset>,
    pub ai: Vec<AiPreset>,
    /// `(new preset id, key)`.
    pub keys: Vec<(String, String)>,
}

/// Keychain namespace of a service's API keys (see `credentials.rs`).
pub fn credential_namespace(service: ServiceKind) -> &'static str {
    match service {
        ServiceKind::Speech => "stt",
        ServiceKind::Ai => "llm",
    }
}

/// Suggested file name for an export from one Settings page.
pub fn suggested_file_name(service: ServiceKind) -> String {
    let stem = match service {
        ServiceKind::Speech => "speech",
        ServiceKind::Ai => "ai",
    };
    format!("{stem}{FILE_SUFFIX}")
}

/// The `kind` a preset has when stored. Read through serde, so kinds added later (on either
/// preset type) are seen without changing this file. No `kind` means OpenAI-compatible.
fn stored_kind<T: Serialize>(preset: &T) -> String {
    serde_json::to_value(preset)
        .ok()
        .and_then(|value| {
            value
                .get("kind")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| SHAREABLE_KIND.to_string())
}

/// A base URL someone else can use: a valid http(s) URL without a placeholder.
fn shareable_address(base_url: &str) -> Option<String> {
    if base_url_has_placeholder(base_url) {
        return None;
    }
    crate::stt::config::normalize_base_url(base_url).ok()
}

/// `host` or `host:port` of a base URL, for the dialogs.
pub fn display_host(base_url: &str) -> String {
    match url::Url::parse(base_url) {
        Ok(url) => match (url.host_str(), url.port()) {
            (Some(host), Some(port)) => format!("{host}:{port}"),
            (Some(host), None) => host.to_string(),
            _ => base_url.to_string(),
        },
        Err(_) => base_url.to_string(),
    }
}

fn is_unchanged_speech_template(preset: &SpeechPreset) -> bool {
    preset.builtin
        && SpeechPreset::legacy_templates_v1()
            .iter()
            .any(|template| template.id == preset.id && template.same_connection(preset))
}

fn is_unchanged_ai_template(preset: &AiPreset) -> bool {
    preset.builtin
        && AiPreset::legacy_templates_v1()
            .iter()
            .any(|template| template.id == preset.id && template.same_connection(preset))
}

fn speech_exportable(preset: &SpeechPreset) -> bool {
    is_shareable_kind(ServiceKind::Speech, &stored_kind(preset))
        && !preset.is_builtin_whisper()
        && shareable_address(&preset.base_url).is_some()
        && !is_unchanged_speech_template(preset)
}

fn ai_exportable(preset: &AiPreset) -> bool {
    stored_kind(preset) == SHAREABLE_KIND
        && !preset.is_builtin_llama()
        && shareable_address(&preset.base_url).is_some()
        && !is_unchanged_ai_template(preset)
}

/// The presets of one service that can be exported, in the order the app lists them.
pub fn export_candidates(config: &AppConfig, service: ServiceKind) -> Vec<ExportCandidate> {
    let candidate = |id: &str, name: &str, base_url: &str| ExportCandidate {
        id: id.to_string(),
        name: name.to_string(),
        host: display_host(base_url),
    };
    match service {
        ServiceKind::Speech => config
            .speech_presets
            .iter()
            .filter(|preset| speech_exportable(preset))
            .map(|preset| candidate(&preset.id, &preset.name, &preset.base_url))
            .collect(),
        ServiceKind::Ai => config
            .ai_presets
            .iter()
            .filter(|preset| ai_exportable(preset))
            .map(|preset| candidate(&preset.id, &preset.name, &preset.base_url))
            .collect(),
    }
}

fn read_key<V: CredentialSecretReader>(
    vault: &V,
    service: ServiceKind,
    preset_id: &str,
) -> Result<Option<String>, ShareError> {
    vault
        .get_secret(credential_namespace(service), preset_id)
        .map(|key| key.filter(|key| !key.trim().is_empty()))
        .map_err(|error| ShareError::KeyReadFailed {
            details: error.to_string(),
        })
}

/// Builds the file text for the chosen presets of one service. Presets that cannot be
/// exported are left out even when chosen. API keys are read from `vault` only when
/// `include_keys` is set. Returns the text and the number of presets in it.
pub fn build_export<V: CredentialSecretReader>(
    config: &AppConfig,
    service: ServiceKind,
    ids: &[String],
    include_keys: bool,
    vault: &V,
) -> Result<(String, usize), ShareError> {
    let chosen = |id: &str| ids.iter().any(|wanted| wanted == id);
    let key_for = |id: &str| -> Result<Option<String>, ShareError> {
        if include_keys {
            read_key(vault, service, id)
        } else {
            Ok(None)
        }
    };
    let mut entries = Vec::new();
    match service {
        ServiceKind::Speech => {
            for preset in config
                .speech_presets
                .iter()
                .filter(|preset| chosen(&preset.id) && speech_exportable(preset))
            {
                entries.push(SharedPreset {
                    kind: stored_kind(preset),
                    name: preset.name.clone(),
                    base_url: preset.base_url.clone(),
                    model: preset.model.clone(),
                    language: Some(preset.language.clone()),
                    extra_request_fields: Map::new(),
                    api_key: key_for(&preset.id)?,
                });
            }
        }
        ServiceKind::Ai => {
            for preset in config
                .ai_presets
                .iter()
                .filter(|preset| chosen(&preset.id) && ai_exportable(preset))
            {
                entries.push(SharedPreset {
                    kind: SHAREABLE_KIND.to_string(),
                    name: preset.name.clone(),
                    base_url: preset.base_url.clone(),
                    model: preset.model.clone(),
                    language: None,
                    extra_request_fields: preset.extra_request_fields.clone(),
                    api_key: key_for(&preset.id)?,
                });
            }
        }
    }
    if entries.is_empty() {
        return Err(ShareError::NothingSelected);
    }
    let (speech, ai): (&[SharedPreset], &[SharedPreset]) = match service {
        ServiceKind::Speech => (&entries, &[]),
        ServiceKind::Ai => (&[], &entries),
    };
    let file = ShareFile {
        format: FORMAT,
        version: VERSION,
        speech,
        ai,
    };
    let mut text =
        serde_json::to_string_pretty(&file).map_err(|error| ShareError::WriteFailed {
            details: error.to_string(),
        })?;
    text.push('\n');
    Ok((text, entries.len()))
}

/// The fields read from one entry. Unknown fields are ignored.
#[derive(Deserialize, Default)]
#[serde(default)]
struct RawEntry {
    name: String,
    base_url: String,
    model: String,
    language: Option<String>,
    extra_request_fields: Map<String, Value>,
    api_key: Option<String>,
}

fn normalize_language(language: Option<&str>) -> String {
    let language = language.unwrap_or_default().trim();
    let valid = !language.is_empty()
        && language.chars().count() <= MAX_LANGUAGE_CHARS
        && language
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
    if valid && language != "multi" {
        language.to_string()
    } else {
        SPEECH_LANGUAGE_AUTO.to_string()
    }
}

/// Reads one list. Returns the entries this build can import and the number skipped.
fn parse_list(
    value: Option<&Value>,
    service: ServiceKind,
) -> Result<(Vec<SharedPreset>, usize), ShareError> {
    let list_name = match service {
        ServiceKind::Speech => "speech",
        ServiceKind::Ai => "ai",
    };
    let items = match value {
        None | Some(Value::Null) => return Ok((Vec::new(), 0)),
        Some(Value::Array(items)) => items,
        Some(_) => return Err(ShareError::WrongFormat),
    };
    if items.len() > MAX_ENTRIES {
        return Err(ShareError::TooManyEntries);
    }
    let invalid = |index: usize| ShareError::InvalidEntry {
        list: list_name.to_string(),
        index,
    };
    let mut entries = Vec::new();
    let mut skipped = 0;
    for (index, item) in items.iter().enumerate() {
        let Some(object) = item.as_object() else {
            return Err(invalid(index));
        };
        // Check the kind first: an unknown kind may use its fields differently.
        let kind = match object.get("kind") {
            None | Some(Value::Null) => SHAREABLE_KIND,
            Some(Value::String(kind)) => kind.as_str(),
            Some(_) => return Err(invalid(index)),
        };
        if !is_shareable_kind(service, kind) {
            skipped += 1;
            continue;
        }
        let kind = kind.to_string();
        let raw: RawEntry = serde_json::from_value(item.clone()).map_err(|_| invalid(index))?;
        if raw.base_url.chars().count() > MAX_FIELD_CHARS
            || raw.model.chars().count() > MAX_FIELD_CHARS
        {
            return Err(invalid(index));
        }
        let model = raw.model.trim().to_string();
        let name = preset_name_or_default(&raw.name, &model);
        let base_url = shareable_address(&raw.base_url).ok_or_else(|| ShareError::BadAddress {
            name: name.clone(),
            address: raw.base_url.trim().chars().take(200).collect(),
        })?;
        // Qwen's compatible-mode address does not work for speech; store the native one, as the
        // setup form does (plan `qwen-cloud-speech`).
        let base_url = if kind == QWEN_CLOUD_KIND {
            crate::stt::qwen_cloud::native_base_url(&base_url)
        } else {
            base_url
        };
        let api_key = match raw.api_key.map(|key| key.trim().to_string()) {
            Some(key) if key.chars().count() > MAX_API_KEY_CHARS => return Err(invalid(index)),
            Some(key) if !key.is_empty() => Some(key),
            _ => None,
        };
        let (language, extra_request_fields) = match service {
            ServiceKind::Speech => (
                Some(normalize_language(raw.language.as_deref())),
                Map::new(),
            ),
            ServiceKind::Ai => (None, raw.extra_request_fields),
        };
        entries.push(SharedPreset {
            kind,
            name,
            base_url,
            model,
            language,
            extra_request_fields,
            api_key,
        });
    }
    Ok((entries, skipped))
}

/// Reads and checks a presets file.
pub fn parse_file(text: &str) -> Result<ParsedFile, ShareError> {
    let value: Value = serde_json::from_str(text).map_err(|_| ShareError::NotJson)?;
    let Some(object) = value.as_object() else {
        return Err(ShareError::WrongFormat);
    };
    if object.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(ShareError::WrongFormat);
    }
    let version = match object.get("version").and_then(Value::as_u64) {
        Some(version) if version >= 1 => version,
        _ => return Err(ShareError::InvalidVersion),
    };
    if version > VERSION {
        return Err(ShareError::NewerVersion { version });
    }
    let (speech, skipped_speech) = parse_list(object.get("speech"), ServiceKind::Speech)?;
    let (ai, skipped_ai) = parse_list(object.get("ai"), ServiceKind::Ai)?;
    Ok(ParsedFile {
        speech,
        ai,
        skipped_speech,
        skipped_ai,
    })
}

/// What the review list shows for a parsed file, for the page `service`.
pub fn preview(parsed: &ParsedFile, service: ServiceKind, file_name: &str) -> ImportPreview {
    let entries = parsed
        .list(service)
        .iter()
        .enumerate()
        .map(|(index, entry)| ImportEntry {
            index,
            name: entry.name.clone(),
            host: display_host(&entry.base_url),
            model: entry.model.clone(),
            has_key: entry.api_key.is_some(),
        })
        .collect();
    let (skipped_unknown, other_service_count) = match service {
        ServiceKind::Speech => (parsed.skipped_speech, parsed.ai.len()),
        ServiceKind::Ai => (parsed.skipped_ai, parsed.speech.len()),
    };
    ImportPreview {
        file_name: file_name.to_string(),
        entries,
        skipped_unknown,
        other_service_count,
    }
}

/// `name`, or `name (2)`, `name (3)`, ... when `taken` already has it (ignoring case). The
/// result stays within the preset name limit and is added to `taken`.
pub fn unique_name(name: &str, taken: &mut HashSet<String>) -> String {
    let base: String = name.trim().chars().take(PRESET_NAME_MAX_CHARS).collect();
    let mut candidate = base.clone();
    let mut number = 2;
    while taken.contains(&candidate.to_lowercase()) {
        let suffix = format!(" ({number})");
        let room = PRESET_NAME_MAX_CHARS.saturating_sub(suffix.chars().count());
        let stem: String = base.chars().take(room).collect();
        candidate = format!("{}{suffix}", stem.trim_end());
        number += 1;
    }
    taken.insert(candidate.to_lowercase());
    candidate
}

/// Adds the chosen entries (by index into the page's list) to `config`. Every added preset
/// gets a new id and, on a name clash, a numbered name. Existing presets and the preset in
/// use are not changed; added presets are untested.
pub fn merge_import(
    config: &mut AppConfig,
    parsed: &ParsedFile,
    service: ServiceKind,
    indices: &[usize],
) -> Result<ImportOutcome, ShareError> {
    let list = parsed.list(service);
    let mut chosen: Vec<usize> = indices
        .iter()
        .copied()
        .filter(|&index| index < list.len())
        .collect();
    chosen.sort_unstable();
    chosen.dedup();
    if chosen.is_empty() {
        return Err(ShareError::NothingSelected);
    }

    let mut taken: HashSet<String> = match service {
        ServiceKind::Speech => config
            .speech_presets
            .iter()
            .map(|preset| preset.name.trim().to_lowercase())
            .collect(),
        ServiceKind::Ai => config
            .ai_presets
            .iter()
            .map(|preset| preset.name.trim().to_lowercase())
            .collect(),
    };
    let mut outcome = ImportOutcome::default();
    for index in chosen {
        let entry = &list[index];
        let id = uuid::Uuid::new_v4().to_string();
        let name = unique_name(&entry.name, &mut taken);
        match service {
            ServiceKind::Speech => {
                let mut preset = if entry.kind == QWEN_CLOUD_KIND {
                    SpeechPreset::qwen_cloud(&id, &name, &entry.base_url, &entry.model)
                } else {
                    SpeechPreset::server(&id, &name, &entry.base_url, &entry.model)
                };
                preset.language = normalize_language(entry.language.as_deref());
                config.speech_presets.push(preset.clone());
                outcome.speech.push(preset);
            }
            ServiceKind::Ai => {
                let preset = AiPreset {
                    id: id.clone(),
                    name,
                    base_url: entry.base_url.clone(),
                    model: entry.model.clone(),
                    extra_request_fields: entry.extra_request_fields.clone(),
                    // Not builtin, untested (the defaults), and any field added later.
                    ..AiPreset::default()
                };
                config.ai_presets.push(preset.clone());
                outcome.ai.push(preset);
            }
        }
        if let Some(key) = &entry.api_key {
            outcome.keys.push((id, key.clone()));
        }
    }
    Ok(outcome)
}

/// Stores the imported API keys. Returns how many could not be stored; the presets stay and
/// the user can type those keys again.
pub fn store_keys<V: CredentialVault>(
    vault: &V,
    service: ServiceKind,
    keys: &[(String, String)],
) -> usize {
    keys.iter()
        .filter(
            |(id, key)| match vault.set_secret(credential_namespace(service), id, key) {
                Ok(()) => false,
                Err(error) => {
                    tracing::warn!("Failed to store an imported API key: {error}");
                    true
                }
            },
        )
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::{anyhow, Result};
    use std::sync::Mutex;

    /// Stand-in for the Keychain: tests never touch the real one.
    #[derive(Default)]
    struct MemoryVault {
        records: Mutex<Vec<(String, String, String)>>,
        fail_writes: bool,
    }

    impl MemoryVault {
        fn with(records: &[(&str, &str, &str)]) -> Self {
            Self {
                records: Mutex::new(
                    records
                        .iter()
                        .map(|(ns, id, key)| (ns.to_string(), id.to_string(), key.to_string()))
                        .collect(),
                ),
                fail_writes: false,
            }
        }

        fn get(&self, namespace: &str, provider: &str) -> Option<String> {
            self.records
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|(ns, id, _)| ns == namespace && id == provider)
                .map(|(_, _, key)| key.clone())
        }
    }

    impl CredentialSecretReader for MemoryVault {
        fn get_secret(&self, namespace: &str, provider: &str) -> Result<Option<String>> {
            Ok(self.get(namespace, provider))
        }
    }

    impl CredentialVault for MemoryVault {
        fn set_secret(&self, namespace: &str, provider: &str, secret: &str) -> Result<()> {
            if self.fail_writes {
                return Err(anyhow!("vault locked"));
            }
            self.records.lock().unwrap().push((
                namespace.to_string(),
                provider.to_string(),
                secret.to_string(),
            ));
            Ok(())
        }
    }

    /// A vault that fails the test when it is read.
    struct NoReadVault;

    impl CredentialSecretReader for NoReadVault {
        fn get_secret(&self, _namespace: &str, _provider: &str) -> Result<Option<String>> {
            panic!("the vault must not be read when keys are excluded");
        }
    }

    fn config_with_user_presets() -> AppConfig {
        let mut config = AppConfig::default();
        config.speech_presets.push(SpeechPreset {
            language: "en".to_string(),
            verified_at: Some(1),
            ..SpeechPreset::server(
                "speech-groq",
                "Groq",
                "https://api.groq.com/openai/v1",
                "whisper-large-v3-turbo",
            )
        });
        let mut extra = Map::new();
        extra.insert("reasoning_effort".to_string(), Value::from("none"));
        config.ai_presets.push(AiPreset {
            id: "ai-office".to_string(),
            name: "Ollama on the office PC".to_string(),
            base_url: "http://gpu-box.example:11434/v1".to_string(),
            model: "qwen3:4b".to_string(),
            extra_request_fields: extra,
            verified_at: Some(1),
            ..AiPreset::default()
        });
        config
    }

    fn all_ids(config: &AppConfig, service: ServiceKind) -> Vec<String> {
        match service {
            ServiceKind::Speech => config.speech_presets.iter().map(|p| p.id.clone()).collect(),
            ServiceKind::Ai => config.ai_presets.iter().map(|p| p.id.clone()).collect(),
        }
    }

    #[test]
    fn export_leaves_out_builtin_templates_and_placeholders() {
        let mut config = config_with_user_presets();
        // Configs from before plan `ai-polish-setup` still hold the old AI templates.
        config.ai_presets.extend(AiPreset::legacy_templates_v1());
        // An edited shipped template (the address filled in) is the user's own setup now.
        let lan = config
            .ai_presets
            .iter_mut()
            .find(|preset| preset.id == "builtin-ai-ollama-lan")
            .unwrap();
        lan.base_url = "http://office-pc.example:11434/v1".to_string();

        let speech = export_candidates(&config, ServiceKind::Speech);
        assert_eq!(
            speech.len(),
            1,
            "the Built-in (this Mac) preset is never offered"
        );
        assert_eq!(speech[0].id, "speech-groq");
        assert_eq!(speech[0].host, "api.groq.com");

        let ai: Vec<String> = export_candidates(&config, ServiceKind::Ai)
            .into_iter()
            .map(|candidate| candidate.id)
            .collect();
        // The Built-in (this Mac) AI preset is never offered either.
        assert_eq!(ai, vec!["ai-office", "builtin-ai-ollama-lan"]);
    }

    #[test]
    fn a_preset_of_another_kind_is_never_exported() {
        let mut config = config_with_user_presets();
        config.speech_presets[0] = SpeechPreset::builtin_whisper("small", "ggml-small.bin");
        let ids = all_ids(&config, ServiceKind::Speech);
        let (text, count) =
            build_export(&config, ServiceKind::Speech, &ids, false, &NoReadVault).unwrap();
        assert_eq!(count, 1);
        assert!(!text.contains("builtin"));
        assert!(!text.contains("ggml"));
    }

    #[test]
    fn export_writes_the_format_and_leaves_keys_out_by_default() {
        let config = config_with_user_presets();
        let ids = all_ids(&config, ServiceKind::Ai);
        let (text, count) =
            build_export(&config, ServiceKind::Ai, &ids, false, &NoReadVault).unwrap();
        assert_eq!(count, 1);
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["format"], FORMAT);
        assert_eq!(value["version"], VERSION);
        assert_eq!(value["speech"], Value::Array(Vec::new()));
        let entry = &value["ai"][0];
        assert_eq!(entry["kind"], "openai_compatible");
        assert_eq!(entry["name"], "Ollama on the office PC");
        assert_eq!(entry["base_url"], "http://gpu-box.example:11434/v1");
        assert_eq!(entry["model"], "qwen3:4b");
        assert_eq!(entry["extra_request_fields"]["reasoning_effort"], "none");
        assert!(entry.get("api_key").is_none());
        // Ids, test results and the builtin flag stay on this Mac.
        assert!(entry.get("id").is_none());
        assert!(entry.get("verified_at").is_none());
        assert!(entry.get("builtin").is_none());
    }

    #[test]
    fn export_includes_keys_only_when_asked() {
        let config = config_with_user_presets();
        let vault = MemoryVault::with(&[("stt", "speech-groq", "gsk-secret")]);
        let ids = vec!["speech-groq".to_string()];
        let (text, _) = build_export(&config, ServiceKind::Speech, &ids, true, &vault).unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["speech"][0]["api_key"], "gsk-secret");
        assert_eq!(value["speech"][0]["language"], "en");

        let (text, _) = build_export(&config, ServiceKind::Speech, &ids, false, &vault).unwrap();
        assert!(!text.contains("gsk-secret"));
    }

    #[test]
    fn export_of_nothing_is_an_error() {
        let config = config_with_user_presets();
        assert_eq!(
            build_export(&config, ServiceKind::Ai, &[], false, &NoReadVault),
            Err(ShareError::NothingSelected)
        );
        let builtin = vec![crate::storage::BUILTIN_SPEECH_PRESET_ID.to_string()];
        assert_eq!(
            build_export(&config, ServiceKind::Speech, &builtin, false, &NoReadVault),
            Err(ShareError::NothingSelected)
        );
    }

    #[test]
    fn an_export_reads_back_the_same_presets() {
        let config = config_with_user_presets();
        let vault = MemoryVault::with(&[("llm", "ai-office", "sk-1")]);
        let (text, _) = build_export(
            &config,
            ServiceKind::Ai,
            &all_ids(&config, ServiceKind::Ai),
            true,
            &vault,
        )
        .unwrap();
        let parsed = parse_file(&text).unwrap();
        assert!(parsed.speech.is_empty());
        assert_eq!(parsed.ai.len(), 1);
        assert_eq!(parsed.ai[0].name, "Ollama on the office PC");
        assert_eq!(parsed.ai[0].api_key.as_deref(), Some("sk-1"));
        assert_eq!(
            parsed.ai[0].extra_request_fields,
            config.ai_presets.last().unwrap().extra_request_fields
        );
    }

    #[test]
    fn parse_rejects_files_that_are_not_presets() {
        assert_eq!(parse_file("not json"), Err(ShareError::NotJson));
        assert_eq!(parse_file("[]"), Err(ShareError::WrongFormat));
        assert_eq!(
            parse_file(r#"{"format":"something-else","version":1}"#),
            Err(ShareError::WrongFormat)
        );
        assert_eq!(
            parse_file(r#"{"format":"typelite-presets"}"#),
            Err(ShareError::InvalidVersion)
        );
        assert_eq!(
            parse_file(r#"{"format":"typelite-presets","version":0}"#),
            Err(ShareError::InvalidVersion)
        );
        assert_eq!(
            parse_file(r#"{"format":"typelite-presets","version":1,"speech":{}}"#),
            Err(ShareError::WrongFormat)
        );
    }

    #[test]
    fn parse_rejects_a_newer_version() {
        assert_eq!(
            parse_file(r#"{"format":"typelite-presets","version":2,"speech":[]}"#),
            Err(ShareError::NewerVersion { version: 2 })
        );
    }

    #[test]
    fn parse_rejects_bad_addresses() {
        for address in [
            "ftp://example.com/v1",
            "not a url",
            "",
            "http://<computer-ip>:8000/v1",
            "http://user:pass@example.com/v1",
        ] {
            let text = serde_json::json!({
                "format": FORMAT,
                "version": 1,
                "ai": [{ "name": "Bad", "base_url": address, "model": "m" }],
            })
            .to_string();
            assert_eq!(
                parse_file(&text),
                Err(ShareError::BadAddress {
                    name: "Bad".to_string(),
                    address: address.to_string(),
                }),
                "{address}"
            );
        }
    }

    #[test]
    fn parse_rejects_entries_with_wrong_field_types() {
        let text = r#"{"format":"typelite-presets","version":1,
            "speech":[{"name":"A","base_url":"http://a.example/v1"}, 5]}"#;
        assert_eq!(
            parse_file(text),
            Err(ShareError::InvalidEntry {
                list: "speech".to_string(),
                index: 1,
            })
        );
        let text = r#"{"format":"typelite-presets","version":1,
            "ai":[{"name":"A","base_url":"http://a.example/v1","extra_request_fields":[1]}]}"#;
        assert_eq!(
            parse_file(text),
            Err(ShareError::InvalidEntry {
                list: "ai".to_string(),
                index: 0,
            })
        );
    }

    #[test]
    fn parse_ignores_unknown_fields_and_skips_unknown_kinds() {
        let text = r#"{
            "format": "typelite-presets",
            "version": 1,
            "exported_by": "a future build",
            "speech": [
                {"name": "Server", "base_url": "http://speech.example:8000/v1/", "model": "w",
                 "colour": "blue"},
                {"kind": "builtin", "name": "Local", "model": "small"},
                {"kind": "some_cloud", "name": "Cloud", "region": {"id": 3}}
            ],
            "ai": [
                {"kind": "builtin", "name": "Local AI"},
                {"name": "Chat", "base_url": "https://chat.example/v1", "model": "m",
                 "api_key": "  "}
            ],
            "themes": []
        }"#;
        let parsed = parse_file(text).unwrap();
        assert_eq!(parsed.speech.len(), 1);
        assert_eq!(parsed.skipped_speech, 2);
        assert_eq!(parsed.speech[0].base_url, "http://speech.example:8000/v1");
        assert_eq!(parsed.speech[0].language.as_deref(), Some("auto"));
        assert_eq!(parsed.ai.len(), 1);
        assert_eq!(parsed.skipped_ai, 1);
        assert_eq!(parsed.ai[0].api_key, None, "a blank key is no key");
    }

    #[test]
    fn a_qwen_cloud_preset_round_trips_with_its_kind() {
        let mut config = config_with_user_presets();
        config.speech_presets.push(SpeechPreset::qwen_cloud(
            "speech-qwen",
            "Qwen Cloud",
            crate::stt::qwen_cloud::DEFAULT_BASE_URL,
            crate::stt::qwen_cloud::DEFAULT_MODEL,
        ));
        let offered: Vec<String> = export_candidates(&config, ServiceKind::Speech)
            .into_iter()
            .map(|candidate| candidate.id)
            .collect();
        assert_eq!(offered, vec!["speech-groq", "speech-qwen"]);

        let ids = vec!["speech-qwen".to_string()];
        let (text, count) =
            build_export(&config, ServiceKind::Speech, &ids, false, &NoReadVault).unwrap();
        assert_eq!(count, 1);
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["speech"][0]["kind"], "qwen_cloud");

        let parsed = parse_file(&text).unwrap();
        assert_eq!(parsed.skipped_speech, 0);
        let outcome = merge_import(&mut config, &parsed, ServiceKind::Speech, &[0]).unwrap();
        config.normalize_values();
        let stored = config
            .speech_presets
            .iter()
            .find(|preset| preset.id == outcome.speech[0].id)
            .unwrap();
        assert!(stored.is_qwen_cloud());
        assert_eq!(stored.base_url, crate::stt::qwen_cloud::DEFAULT_BASE_URL);
        assert_eq!(stored.name, "Qwen Cloud (2)");
        assert_eq!(stored.verified_at, None);
        assert!(!stored.builtin);
    }

    #[test]
    fn an_imported_qwen_compatible_mode_address_becomes_the_native_one() {
        let text = r#"{"format":"typelite-presets","version":1,"speech":[
            {"kind":"qwen_cloud","name":"Qwen","model":"qwen-audio-3.0-asr-flash",
             "base_url":"https://token-plan.maas.qwencloudapi.com/compatible-mode/v1/"},
            {"kind":"openai_compatible","name":"Other","model":"m",
             "base_url":"https://speech.example/compatible-mode/v1"}
        ]}"#;
        let parsed = parse_file(text).unwrap();
        assert_eq!(parsed.speech[0].kind, "qwen_cloud");
        assert_eq!(
            parsed.speech[0].base_url,
            "https://token-plan.maas.qwencloudapi.com/api/v1"
        );
        // Only Qwen Cloud entries are rewritten.
        assert_eq!(
            parsed.speech[1].base_url,
            "https://speech.example/compatible-mode/v1"
        );

        let mut config = AppConfig::default();
        let outcome = merge_import(&mut config, &parsed, ServiceKind::Speech, &[0, 1]).unwrap();
        assert!(outcome.speech[0].is_qwen_cloud());
        assert!(!outcome.speech[1].is_qwen_cloud());
    }

    #[test]
    fn qwen_cloud_is_a_speech_kind_only() {
        let text = r#"{"format":"typelite-presets","version":1,"ai":[
            {"kind":"qwen_cloud","name":"Qwen","base_url":"https://a.example/v1","model":"m"}
        ]}"#;
        let parsed = parse_file(text).unwrap();
        assert!(parsed.ai.is_empty());
        assert_eq!(parsed.skipped_ai, 1);
    }

    #[test]
    fn parse_fills_a_missing_name_from_the_model() {
        let text = r#"{"format":"typelite-presets","version":1,
            "ai":[{"base_url":"http://a.example/v1","model":"llama3"}]}"#;
        assert_eq!(parse_file(text).unwrap().ai[0].name, "llama3");
    }

    #[test]
    fn preview_lists_the_page_entries_and_counts_the_rest() {
        let text = r#"{"format":"typelite-presets","version":1,
            "speech":[{"name":"S","base_url":"http://s.example:9000/v1","model":"w",
                       "api_key":"k"},
                      {"kind":"future","name":"F"}],
            "ai":[{"name":"A","base_url":"https://a.example/v1","model":"m"},
                  {"name":"B","base_url":"https://b.example/v1","model":"m"}]}"#;
        let parsed = parse_file(text).unwrap();
        let speech = preview(&parsed, ServiceKind::Speech, "x.typelite-presets.json");
        assert_eq!(speech.file_name, "x.typelite-presets.json");
        assert_eq!(
            speech.entries,
            vec![ImportEntry {
                index: 0,
                name: "S".to_string(),
                host: "s.example:9000".to_string(),
                model: "w".to_string(),
                has_key: true,
            }]
        );
        assert_eq!(speech.skipped_unknown, 1);
        assert_eq!(speech.other_service_count, 2);

        let ai = preview(&parsed, ServiceKind::Ai, "x");
        assert_eq!(ai.entries.len(), 2);
        assert_eq!(ai.skipped_unknown, 0);
        assert_eq!(ai.other_service_count, 1);
    }

    #[test]
    fn unique_name_adds_a_number_on_a_clash() {
        let mut taken: HashSet<String> = ["groq".to_string(), "groq (2)".to_string()].into();
        assert_eq!(unique_name("Groq", &mut taken), "Groq (3)");
        assert_eq!(unique_name("Groq", &mut taken), "Groq (4)");
        assert_eq!(unique_name("Other", &mut taken), "Other");
        assert_eq!(unique_name("other", &mut taken), "other (2)");

        let long = "x".repeat(PRESET_NAME_MAX_CHARS + 10);
        let mut taken = HashSet::new();
        let first = unique_name(&long, &mut taken);
        let second = unique_name(&long, &mut taken);
        assert_eq!(first.chars().count(), PRESET_NAME_MAX_CHARS);
        assert_eq!(second.chars().count(), PRESET_NAME_MAX_CHARS);
        assert!(second.ends_with(" (2)"));
    }

    #[test]
    fn merge_adds_untested_presets_with_new_ids_and_keeps_the_active_one() {
        let mut config = config_with_user_presets();
        let before = config.clone();
        let text = r#"{"format":"typelite-presets","version":1,
            "speech":[{"name":"Groq","base_url":"https://api.groq.com/openai/v1",
                       "model":"whisper-large-v3-turbo","language":"en","api_key":"gsk"},
                      {"name":"Other","base_url":"http://o.example/v1","model":"w",
                       "language":"multi"},
                      {"name":"Not chosen","base_url":"http://n.example/v1"}]}"#;
        let parsed = parse_file(text).unwrap();
        let outcome =
            merge_import(&mut config, &parsed, ServiceKind::Speech, &[1, 0, 0, 9]).unwrap();

        assert_eq!(outcome.speech.len(), 2);
        assert!(outcome.ai.is_empty());
        let names: Vec<&str> = outcome.speech.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, vec!["Groq (2)", "Other"]);
        for preset in &outcome.speech {
            assert!(!preset.builtin);
            assert_eq!(preset.verified_at, None);
            assert!(!before.speech_presets.iter().any(|p| p.id == preset.id));
        }
        assert_eq!(outcome.speech[1].language, "auto");
        assert_eq!(
            outcome.keys,
            vec![(outcome.speech[0].id.clone(), "gsk".to_string())]
        );

        // Nothing existing changed, nothing became active.
        assert_eq!(
            config.speech_presets[..before.speech_presets.len()],
            before.speech_presets[..]
        );
        assert_eq!(config.speech_presets.len(), before.speech_presets.len() + 2);
        assert_eq!(
            config.active_speech_preset_id,
            before.active_speech_preset_id
        );
        assert_eq!(config.ai_presets, before.ai_presets);
    }

    #[test]
    fn merged_presets_survive_normalisation() {
        let mut config = config_with_user_presets();
        let text = r#"{"format":"typelite-presets","version":1,
            "ai":[{"name":"Ollama on the office PC","base_url":"http://h.example:11434/v1",
                   "model":"m","extra_request_fields":{"reasoning_effort":"none"}}]}"#;
        let parsed = parse_file(text).unwrap();
        let outcome = merge_import(&mut config, &parsed, ServiceKind::Ai, &[0]).unwrap();
        config.normalize_values();
        let stored = config
            .ai_presets
            .iter()
            .find(|preset| preset.id == outcome.ai[0].id)
            .unwrap();
        assert_eq!(stored, &outcome.ai[0]);
        assert_eq!(stored.name, "Ollama on the office PC (2)");
        assert_eq!(stored.extra_request_fields["reasoning_effort"], "none");
    }

    #[test]
    fn merge_needs_a_choice() {
        let mut config = AppConfig::default();
        let parsed = parse_file(
            r#"{"format":"typelite-presets","version":1,
                "ai":[{"name":"A","base_url":"http://a.example/v1"}]}"#,
        )
        .unwrap();
        assert_eq!(
            merge_import(&mut config, &parsed, ServiceKind::Ai, &[]),
            Err(ShareError::NothingSelected)
        );
        assert_eq!(
            merge_import(&mut config, &parsed, ServiceKind::Speech, &[0]),
            Err(ShareError::NothingSelected),
            "the file has no speech entries"
        );
    }

    #[test]
    fn imported_keys_go_to_the_vault_under_the_new_ids() {
        let vault = MemoryVault::default();
        let keys = vec![("new-id".to_string(), "sk-1".to_string())];
        assert_eq!(store_keys(&vault, ServiceKind::Ai, &keys), 0);
        assert_eq!(vault.get("llm", "new-id").as_deref(), Some("sk-1"));

        let locked = MemoryVault {
            fail_writes: true,
            ..MemoryVault::default()
        };
        assert_eq!(store_keys(&locked, ServiceKind::Speech, &keys), 1);
    }

    #[test]
    fn errors_serialise_with_a_code() {
        let value = serde_json::to_value(ShareError::NewerVersion { version: 3 }).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"code": "newer_version", "version": 3})
        );
        let value = serde_json::to_value(ShareError::NotJson).unwrap();
        assert_eq!(value, serde_json::json!({"code": "not_json"}));
    }

    #[test]
    fn suggested_file_names_end_with_the_suffix() {
        assert_eq!(
            suggested_file_name(ServiceKind::Speech),
            "speech.typelite-presets.json"
        );
        assert!(suggested_file_name(ServiceKind::Ai).ends_with(FILE_SUFFIX));
    }
}
