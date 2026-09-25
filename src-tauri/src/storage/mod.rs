use crate::app_detector::types::ContextFamily;
use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri_plugin_store::StoreExt;
use unicode_normalization::UnicodeNormalization;

const CUSTOM_SCENES_MAX_COUNT: usize = 100;
const SCENE_ID_MAX_CHARS: usize = 120;
const SCENE_SOURCE_MAX_CHARS: usize = 24;
const SCENE_NAME_MAX_CHARS: usize = 80;
const SCENE_DESCRIPTION_MAX_CHARS: usize = 240;
pub(crate) const SCENE_PROMPT_MAX_CHARS: usize = 4000;
pub const MAX_HOTKEY_BINDINGS_PER_ROLE: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct CustomScene {
    pub id: String,
    pub name: String,
    pub description: String,
    pub prompt_template: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct ActiveScene {
    pub id: String,
    pub source: String,
    pub name: String,
    pub prompt_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct FamilySceneAssignment {
    pub family: ContextFamily,
    pub scene_id: String,
}

impl Default for FamilySceneAssignment {
    fn default() -> Self {
        Self {
            family: ContextFamily::General,
            scene_id: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct SystemSceneOverride {
    pub id: String,
    pub prompt_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ShortcutBinding {
    pub primary: String,
    pub modifiers: Vec<String>,
}

impl Default for ShortcutBinding {
    fn default() -> Self {
        binding_from_hotkey_string(default_dictation_hotkey()).unwrap_or_else(|| Self {
            primary: "/".to_string(),
            modifiers: vec!["Ctrl".to_string()],
        })
    }
}

impl ShortcutBinding {
    pub fn from_hotkey(value: &str) -> Option<Self> {
        binding_from_hotkey_string(value)
    }

    pub fn to_hotkey_string(&self) -> Option<String> {
        let mut binding = self.clone();
        if !binding.normalize() {
            return None;
        }

        let mut parts = binding.modifiers;
        parts.push(binding.primary);
        Some(parts.join("+"))
    }

    pub fn normalize(&mut self) -> bool {
        let Some(primary) = normalize_hotkey_primary(&self.primary) else {
            return false;
        };

        let mut seen_semantic = HashSet::new();
        let mut modifiers = Vec::new();
        for modifier in &self.modifiers {
            let Some((semantic, canonical)) = normalize_hotkey_modifier(modifier) else {
                return false;
            };
            if !seen_semantic.insert(semantic) || canonical == primary {
                return false;
            }
            modifiers.push(canonical.to_string());
        }

        modifiers.sort_by_key(|modifier| hotkey_modifier_rank(modifier));
        self.primary = primary;
        self.modifiers = modifiers;
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub dictation: ShortcutBinding,
    pub ask: Option<ShortcutBinding>,
    pub translate: Option<ShortcutBinding>,
    #[serde(default)]
    pub dictation_bindings: Vec<ShortcutBinding>,
    #[serde(default)]
    pub ask_bindings: Vec<ShortcutBinding>,
    #[serde(default)]
    pub translate_bindings: Vec<ShortcutBinding>,
    pub edit_selection: Option<ShortcutBinding>,
    pub switch_scene: Option<ShortcutBinding>,
    pub open_app: Option<ShortcutBinding>,
    pub dictation_mode: String,
    /// Switches the target language of a running Translate recording. Only listened to while
    /// a Translate recording runs (plan `translate-controls`). Default: Shift on either side.
    pub switch_language: Option<ShortcutBinding>,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        let mut config = Self::from_legacy(
            default_dictation_hotkey(),
            default_ask_hotkey(),
            default_dictation_hotkey_mode(),
        );
        config.translate = default_translate_hotkey().and_then(ShortcutBinding::from_hotkey);
        config.translate_bindings = config.translate.clone().into_iter().collect();
        config
    }
}

impl HotkeyConfig {
    pub fn from_legacy(dictation_hotkey: &str, ask_hotkey: &str, dictation_mode: &str) -> Self {
        let dictation = ShortcutBinding::from_hotkey(dictation_hotkey)
            .unwrap_or_else(|| ShortcutBinding::from_hotkey(default_dictation_hotkey()).unwrap());
        let ask = if ask_hotkey.trim().is_empty() {
            None
        } else {
            ShortcutBinding::from_hotkey(ask_hotkey)
                .or_else(|| ShortcutBinding::from_hotkey(default_ask_hotkey()))
        };
        let dictation_mode = normalize_hotkey_mode(dictation_mode).to_string();

        Self {
            dictation_bindings: vec![dictation.clone()],
            ask_bindings: ask.clone().into_iter().collect(),
            translate_bindings: Vec::new(),
            dictation,
            ask,
            translate: None,
            edit_selection: None,
            switch_scene: None,
            open_app: None,
            dictation_mode,
            switch_language: default_switch_language_binding(),
        }
    }

    pub fn normalize(&mut self) {
        let had_dictation_list = !self.dictation_bindings.is_empty();
        let had_ask_list = !self.ask_bindings.is_empty();
        let had_translate_list = !self.translate_bindings.is_empty();

        normalize_binding_list(&mut self.dictation_bindings);
        normalize_binding_list(&mut self.ask_bindings);
        normalize_binding_list(&mut self.translate_bindings);

        if !had_dictation_list && self.dictation.normalize() {
            self.dictation_bindings.push(self.dictation.clone());
        }
        if self.dictation_bindings.is_empty() {
            self.dictation_bindings =
                vec![ShortcutBinding::from_hotkey(default_dictation_hotkey())
                    .expect("default dictation hotkey must be valid")];
        }

        if !had_ask_list {
            if let Some(mut ask) = self.ask.clone() {
                if ask.normalize() {
                    self.ask_bindings.push(ask);
                }
            }
        }
        if !had_translate_list {
            if let Some(mut translate) = self.translate.clone() {
                if translate.normalize() {
                    self.translate_bindings.push(translate);
                }
            }
        }

        self.dictation = self.dictation_bindings[0].clone();
        self.ask = self.ask_bindings.first().cloned();
        self.translate = self.translate_bindings.first().cloned();
        normalize_optional_binding(&mut self.edit_selection);
        normalize_optional_binding(&mut self.switch_scene);
        normalize_optional_binding(&mut self.open_app);
        normalize_optional_binding(&mut self.switch_language);
        self.dictation_mode = normalize_hotkey_mode(&self.dictation_mode).to_string();
    }
}

/// The default Switch language key: Shift on either side (`Shift` as a bare key).
pub fn default_switch_language_binding() -> Option<ShortcutBinding> {
    ShortcutBinding::from_hotkey("Shift")
}

fn normalize_binding_list(bindings: &mut Vec<ShortcutBinding>) {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for mut binding in bindings.drain(..) {
        if !binding.normalize() {
            continue;
        }
        let identity = shortcut_binding_identity(&binding);
        if !seen.insert(identity) {
            continue;
        }
        normalized.push(binding);
        if normalized.len() == MAX_HOTKEY_BINDINGS_PER_ROLE {
            break;
        }
    }
    *bindings = normalized;
}

/// Identity of a normalised binding for duplicate and conflict checks: the unordered set of
/// its keys, with `Option`/`Alt` and `Command`/`Super` treated as the same key. So
/// `{modifiers: ["End"], primary: "RightShift"}` and `{modifiers: ["RightShift"],
/// primary: "End"}` are the same shortcut.
pub(crate) fn shortcut_binding_identity(binding: &ShortcutBinding) -> String {
    let mut parts: Vec<&str> = binding
        .modifiers
        .iter()
        .map(|modifier| match modifier.as_str() {
            "Option" | "Alt" => "Alt",
            "Command" | "Super" => "Super",
            value => value,
        })
        .collect();
    parts.push(&binding.primary);
    parts.sort_unstable();
    parts.join("+")
}

/// Translation target codes, in the order the Settings list offers them. Chinese has three
/// variants (Simplified, Traditional as written in Hong Kong, Traditional as written in
/// Taiwan); the old single `zh` code is read as `zh-Hans`.
pub const SUPPORTED_TRANSLATION_LANGUAGES: &[&str] = &[
    "en",
    "zh-Hans",
    "zh-Hant-HK",
    "zh-Hant-TW",
    "ja",
    "ko",
    "fr",
    "de",
    "es",
    "pt",
    "ru",
    "ar",
    "hi",
    "th",
    "vi",
    "it",
    "nl",
    "tr",
    "pl",
    "uk",
    "id",
    "ms",
];

/// Most translation targets a user can choose (the pill shows one chip per target).
pub const MAX_TRANSLATION_TARGETS: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct TranslationConfig {
    pub targets: Vec<String>,
    pub active_target: String,
}

impl Default for TranslationConfig {
    /// English only: users add up to two more languages themselves.
    fn default() -> Self {
        Self {
            targets: vec!["en".to_string()],
            active_target: "en".to_string(),
        }
    }
}

impl TranslationConfig {
    fn from_legacy(target_lang: &str) -> Self {
        let target = normalize_translation_code(target_lang).unwrap_or_else(|| "en".to_string());
        Self {
            targets: vec![target.clone()],
            active_target: target,
        }
    }

    fn normalize(&mut self, legacy_target: &str) {
        let mut normalized = Vec::new();
        for target in &self.targets {
            let Some(target) = normalize_translation_code(target) else {
                continue;
            };
            if !normalized.contains(&target) {
                normalized.push(target);
            }
            if normalized.len() == MAX_TRANSLATION_TARGETS {
                break;
            }
        }

        let legacy = normalize_translation_code(legacy_target);
        if normalized.is_empty() {
            normalized.push(legacy.clone().unwrap_or_else(|| "en".to_string()));
        }
        if let Some(legacy) = legacy.as_ref() {
            if !normalized.contains(legacy) && normalized.len() < MAX_TRANSLATION_TARGETS {
                normalized.push(legacy.clone());
            }
        }

        let requested_active = normalize_translation_code(&self.active_target);
        let active_target = legacy
            .filter(|target| normalized.contains(target))
            .or_else(|| requested_active.filter(|target| normalized.contains(target)))
            .unwrap_or_else(|| normalized[0].clone());

        self.targets = normalized;
        self.active_target = active_target;
    }
}

/// The canonical spelling of a supported translation code, matched case-insensitively
/// (`ZH-hant-hk` gives `zh-Hant-HK`). Older configs stored plain `zh`, which becomes
/// Simplified Chinese.
pub fn normalize_translation_code(value: &str) -> Option<String> {
    let lower = value.trim().to_ascii_lowercase();
    if lower == "zh" {
        return Some("zh-Hans".to_string());
    }
    SUPPORTED_TRANSLATION_LANGUAGES
        .iter()
        .find(|code| code.to_ascii_lowercase() == lower)
        .map(|code| code.to_string())
}

// ─── Speech and AI presets ───

/// Id of the speech preset used as the fallback: the Built-in one (whisper.cpp inside the app,
/// plan `two-tab-speech`). Every config has it, with or without a downloaded model.
pub const BUILTIN_SPEECH_PRESET_ID: &str = BUILTIN_WHISPER_PRESET_ID;
/// Id of the first built-in AI preset (Ollama on this Mac). Used as the fallback.
pub const BUILTIN_AI_PRESET_ID: &str = "builtin-ai-ollama-local";
/// Version of the built-in preset templates. A stored config with an older version gets its
/// old built-ins replaced by the current templates once (see `migrate_builtin_presets`).
/// 1: plan `setup-without-dead-ends` templates. 2: plan `two-tab-speech`, speech keeps only the
/// Built-in preset; the old server and cloud templates are dropped unless the user edited or used
/// them.
pub const BUILTIN_PRESETS_VERSION: u32 = 2;
/// Speech preset language value that means "let the server detect the language".
pub const SPEECH_LANGUAGE_AUTO: &str = "auto";
/// Longest preset id; matches the limit of the credential account names in the Keychain.
const PRESET_ID_MAX_CHARS: usize = 80;
const PRESET_NAME_MAX_CHARS: usize = 80;

/// The message Test shows for a base URL that still holds a template placeholder.
pub const PLACEHOLDER_URL_ERROR: &str =
    "Replace <computer-ip> in the base URL with the address of the computer that runs the server.";

/// True when a base URL still holds a template placeholder such as `<computer-ip>`.
/// Such a URL can never work, so Test fails with `PLACEHOLDER_URL_ERROR`.
pub fn base_url_has_placeholder(base_url: &str) -> bool {
    match base_url.find('<') {
        Some(start) => base_url[start..].contains('>'),
        None => false,
    }
}

/// Milliseconds since the Unix epoch, for `verified_at`.
pub fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// Id of the "Built-in (this Mac)" speech preset that Quick setup creates (plan
/// `quick-speech-setup`).
pub const BUILTIN_WHISPER_PRESET_ID: &str = "builtin-speech-this-mac";

/// How a speech preset turns audio into text.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SpeechProviderKind {
    /// Upload a WAV file to an OpenAI-compatible `/audio/transcriptions` server. Configs
    /// written before plan `quick-speech-setup` have no `kind`, so this is the default.
    #[default]
    OpenaiCompatible,
    /// Run whisper.cpp inside the app with a downloaded model file (plan `quick-speech-setup`).
    Builtin,
}

/// A saved speech-to-text setup. Usually an OpenAI-compatible
/// `POST {base_url}/audio/transcriptions` server; with `kind: builtin` a model file that
/// whisper.cpp runs inside the app. The optional API key is not stored here; it lives in the
/// macOS Keychain under the preset id (see `credentials.rs`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct SpeechPreset {
    pub id: String,
    pub name: String,
    pub kind: SpeechProviderKind,
    /// Server presets only. Empty for built-in presets.
    pub base_url: String,
    /// Model name sent to the server. For built-in presets the id of the known model
    /// (`large-v3-turbo`), shown in the UI and the Speed board.
    pub model: String,
    /// Built-in presets only: the model file name inside the app's `models` folder.
    pub model_file: String,
    /// `"auto"` or an ISO language code such as `"en"`.
    pub language: String,
    /// True for presets that ship with the app. They can still be edited.
    pub builtin: bool,
    /// When this preset last passed a Test (Unix ms). `None` until then, and cleared again
    /// whenever its URL, model, language or API key changes. A preset with a value is
    /// "ready". Nothing about dictations is stored here.
    pub verified_at: Option<u64>,
}

impl SpeechPreset {
    fn template(id: &str, name: &str, base_url: &str, model: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            base_url: base_url.to_string(),
            model: model.to_string(),
            language: SPEECH_LANGUAGE_AUTO.to_string(),
            builtin: true,
            ..Self::default()
        }
    }

    /// A server preset (OpenAI-compatible) made by the user.
    pub fn server(id: &str, name: &str, base_url: &str, model: &str) -> Self {
        Self {
            builtin: false,
            ..Self::template(id, name, base_url, model)
        }
    }

    /// The "Built-in (this Mac)" preset for a model (plan `quick-speech-setup`). Every config
    /// has one (plan `two-tab-speech`); `model_file` is empty until a model is downloaded.
    pub fn builtin_whisper(model_id: &str, model_file: &str) -> Self {
        Self {
            id: BUILTIN_WHISPER_PRESET_ID.to_string(),
            name: "Built-in (this Mac)".to_string(),
            kind: SpeechProviderKind::Builtin,
            model: model_id.to_string(),
            model_file: model_file.to_string(),
            language: SPEECH_LANGUAGE_AUTO.to_string(),
            builtin: true,
            ..Self::default()
        }
    }

    /// True when whisper.cpp runs this preset inside the app.
    pub fn is_builtin_whisper(&self) -> bool {
        self.kind == SpeechProviderKind::Builtin
    }

    /// The Built-in preset before any model is downloaded: the fallback and the only speech
    /// template (plan `two-tab-speech`).
    pub fn builtin_default() -> Self {
        Self::builtin_whisper(crate::stt::models::DEFAULT_MODEL_ID, "")
    }

    /// The speech templates of a new config.
    pub fn builtin_templates() -> Vec<Self> {
        vec![Self::builtin_default()]
    }

    /// The server and cloud templates of plan `setup-without-dead-ends` (template version 1). Only
    /// the migrations use them: version 1 to compare, version 2 to drop the ones the user never
    /// changed.
    fn legacy_templates_v1() -> Vec<Self> {
        vec![
            Self::template(
                "builtin-speech-local",
                "whisper.cpp on this Mac",
                "http://127.0.0.1:8178/v1",
                "large-v3-turbo",
            ),
            Self::template(
                "builtin-speech-lan",
                "Speech server on another computer",
                "http://<computer-ip>:8000/v1",
                "Systran/faster-whisper-large-v3",
            ),
            Self::template(
                "builtin-speech-openai",
                "OpenAI (your key)",
                "https://api.openai.com/v1",
                "whisper-1",
            ),
            Self::template(
                "builtin-speech-groq",
                "Groq (your key)",
                "https://api.groq.com/openai/v1",
                "whisper-large-v3-turbo",
            ),
        ]
    }

    /// Same endpoint: the fields that decide whether a passed Test still holds. The language
    /// only counts for servers (one may reject it); the built-in model runs any language, and
    /// it has no Test button to pass again (plan `two-tab-speech`).
    pub fn same_connection(&self, other: &Self) -> bool {
        self.kind == other.kind
            && self.base_url == other.base_url
            && self.model == other.model
            && self.model_file == other.model_file
            && (self.is_builtin_whisper() || self.language == other.language)
    }
}

/// A saved chat endpoint: an OpenAI-compatible `POST {base_url}/chat/completions` server.
/// The optional API key lives in the Keychain under the preset id.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct AiPreset {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    /// Copied into every chat request body, overriding the defaults.
    /// Example: `{"reasoning_effort": "none"}` for models that think by default.
    pub extra_request_fields: serde_json::Map<String, serde_json::Value>,
    /// True for presets that ship with the app. They can still be edited.
    pub builtin: bool,
    /// When this preset last passed a Test (Unix ms); see `SpeechPreset::verified_at`.
    pub verified_at: Option<u64>,
}

impl AiPreset {
    fn template(id: &str, name: &str, base_url: &str, model: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            base_url: base_url.to_string(),
            model: model.to_string(),
            extra_request_fields: serde_json::Map::new(),
            builtin: true,
            verified_at: None,
        }
    }

    /// Ollama on this Mac: the first built-in and the fallback.
    pub fn builtin_local() -> Self {
        Self::template(
            BUILTIN_AI_PRESET_ID,
            "Ollama on this Mac",
            "http://127.0.0.1:11434/v1",
            "qwen3:4b-instruct-2507-q4_K_M",
        )
    }

    /// The built-in templates, in the order the picker shows them.
    pub fn builtin_templates() -> Vec<Self> {
        vec![
            Self::builtin_local(),
            Self::template(
                "builtin-ai-ollama-lan",
                "Ollama on another computer",
                "http://<computer-ip>:11434/v1",
                "qwen3:4b-instruct-2507-q4_K_M",
            ),
            Self::template(
                "builtin-ai-openai",
                "OpenAI (your key)",
                "https://api.openai.com/v1",
                "gpt-4.1-mini",
            ),
            Self::template(
                "builtin-ai-groq",
                "Groq (your key)",
                "https://api.groq.com/openai/v1",
                "llama-3.1-8b-instant",
            ),
        ]
    }

    /// Same endpoint: the fields that decide whether a passed Test still holds.
    pub fn same_connection(&self, other: &Self) -> bool {
        self.base_url == other.base_url
            && self.model == other.model
            && self.extra_request_fields == other.extra_request_fields
    }
}

/// Which of the two services a preset belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceKind {
    Speech,
    Ai,
}

impl ServiceKind {
    /// Maps a Keychain namespace (`stt`, `llm`) to its service.
    pub fn from_credential_namespace(namespace: &str) -> Option<Self> {
        match namespace {
            "stt" => Some(Self::Speech),
            "llm" => Some(Self::Ai),
            _ => None,
        }
    }
}

/// Clears `verified_at` of every preset in `next` whose connection changed compared with the
/// same preset in `previous`, unless `next` carries a new `verified_at` (a Test of the edited
/// values passed before they were saved).
pub fn invalidate_changed_presets(previous: &AppConfig, next: &mut AppConfig) {
    invalidate_changed(&previous.speech_presets, &mut next.speech_presets);
    invalidate_changed(&previous.ai_presets, &mut next.ai_presets);
}

/// What the readiness and migration code needs from both preset types.
trait VerifiablePreset: Clone {
    fn id(&self) -> &str;
    /// True for a shipped template that a template migration may replace or remove.
    fn is_builtin(&self) -> bool;
    fn base_url(&self) -> &str;
    fn model(&self) -> &str;
    fn verified_at(&self) -> Option<u64>;
    fn verified_at_mut(&mut self) -> &mut Option<u64>;
    fn same_connection_as(&self, other: &Self) -> bool;
}

impl VerifiablePreset for SpeechPreset {
    fn id(&self) -> &str {
        &self.id
    }
    fn is_builtin(&self) -> bool {
        // The "Built-in (this Mac)" preset is made by Quick setup, not from a template, so a
        // template migration must keep it.
        self.builtin && !self.is_builtin_whisper()
    }
    fn base_url(&self) -> &str {
        &self.base_url
    }
    fn model(&self) -> &str {
        &self.model
    }
    fn verified_at(&self) -> Option<u64> {
        self.verified_at
    }
    fn verified_at_mut(&mut self) -> &mut Option<u64> {
        &mut self.verified_at
    }
    fn same_connection_as(&self, other: &Self) -> bool {
        self.same_connection(other)
    }
}

impl VerifiablePreset for AiPreset {
    fn id(&self) -> &str {
        &self.id
    }
    fn is_builtin(&self) -> bool {
        self.builtin
    }
    fn base_url(&self) -> &str {
        &self.base_url
    }
    fn model(&self) -> &str {
        &self.model
    }
    fn verified_at(&self) -> Option<u64> {
        self.verified_at
    }
    fn verified_at_mut(&mut self) -> &mut Option<u64> {
        &mut self.verified_at
    }
    fn same_connection_as(&self, other: &Self) -> bool {
        self.same_connection(other)
    }
}

fn invalidate_changed<T: VerifiablePreset>(previous: &[T], next: &mut [T]) {
    for preset in next {
        if let Some(old) = previous.iter().find(|p| p.id() == preset.id()) {
            if !old.same_connection_as(preset) && old.verified_at() == preset.verified_at() {
                *preset.verified_at_mut() = None;
            }
        }
    }
}

fn mark_verified<T: VerifiablePreset>(presets: &mut [T], tested: &T, at: u64) -> bool {
    match presets
        .iter_mut()
        .find(|preset| preset.id() == tested.id() && preset.same_connection_as(tested))
    {
        Some(preset) if !base_url_has_placeholder(preset.base_url()) => {
            *preset.verified_at_mut() = Some(at);
            true
        }
        _ => false,
    }
}

fn clear_verified<T: VerifiablePreset>(presets: &mut [T], preset_id: &str) -> bool {
    match presets.iter_mut().find(|preset| preset.id() == preset_id) {
        Some(preset) if preset.verified_at().is_some() => {
            *preset.verified_at_mut() = None;
            true
        }
        _ => false,
    }
}

/// See `AppConfig::migrate_builtin_presets`. `verify_at` marks the surviving active preset
/// as ready (only for configs whose onboarding was completed).
fn migrate_preset_list<T: VerifiablePreset>(
    presets: &mut Vec<T>,
    active_id: &mut String,
    templates: Vec<T>,
    verify_at: Option<u64>,
) {
    let fallback_id = templates
        .first()
        .map(|template| template.id().to_string())
        .unwrap_or_default();
    let mut active_replacement: Option<Option<String>> = None;
    presets.retain(|preset| {
        let keep = !preset.is_builtin() || templates.iter().any(|t| t.id() == preset.id());
        if !keep && preset.id() == active_id.as_str() {
            active_replacement = Some(
                templates
                    .iter()
                    .find(|t| t.base_url() == preset.base_url() && t.model() == preset.model())
                    .map(|t| t.id().to_string()),
            );
        }
        keep
    });
    let missing: Vec<T> = templates
        .into_iter()
        .filter(|t| !presets.iter().any(|p| p.id() == t.id()))
        .collect();
    presets.splice(0..0, missing);

    let mut keep_ready = true;
    match active_replacement {
        Some(Some(id)) => *active_id = id,
        Some(None) => keep_ready = false,
        None => {}
    }
    if !presets
        .iter()
        .any(|preset| preset.id() == active_id.as_str())
    {
        *active_id = fallback_id;
        keep_ready = false;
    }
    if let (Some(at), true) = (verify_at, keep_ready) {
        if let Some(preset) = presets.iter_mut().find(|p| p.id() == active_id.as_str()) {
            if !base_url_has_placeholder(preset.base_url()) {
                *preset.verified_at_mut() = Some(at);
            }
        }
    }
}

/// Keeps a preset id if it is usable as a Keychain account name and not taken yet;
/// otherwise makes a new random one.
fn unique_preset_id(id: &str, seen_ids: &mut HashSet<String>) -> String {
    let id = id.trim();
    let valid = !id.is_empty()
        && id.len() <= PRESET_ID_MAX_CHARS
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    let id = if valid && !seen_ids.contains(id) {
        id.to_string()
    } else {
        uuid::Uuid::new_v4().to_string()
    };
    seen_ids.insert(id.clone());
    id
}

fn preset_name_or_default(name: &str, model: &str) -> String {
    let name: String = name.trim().chars().take(PRESET_NAME_MAX_CHARS).collect();
    if !name.is_empty() {
        return name;
    }
    let model = model.trim();
    if model.is_empty() {
        "Preset".to_string()
    } else {
        model.chars().take(PRESET_NAME_MAX_CHARS).collect()
    }
}

/// Tidies a base URL. An invalid URL is kept as typed (trimmed) so the user can see and
/// fix it; the Test button and the pipeline report the error.
fn normalize_preset_base_url(base_url: &str) -> String {
    crate::stt::config::normalize_base_url(base_url).unwrap_or_else(|_| base_url.trim().to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// Saved speech-to-text endpoints. Never empty after `normalize_values`.
    pub speech_presets: Vec<SpeechPreset>,
    pub active_speech_preset_id: String,
    /// Saved chat (AI polish) endpoints. Never empty after `normalize_values`.
    pub ai_presets: Vec<AiPreset>,
    pub active_ai_preset_id: String,
    pub polish_enabled: bool,
    pub context_adaptation_enabled: bool,
    pub voice_routing_flags: crate::voice_intent::VoiceRoutingFlags,
    pub polish_style: String,
    pub polish_custom_prompt: String,
    pub polish_chinese_script: String,
    pub custom_scenes: Vec<CustomScene>,
    pub system_scene_overrides: Vec<SystemSceneOverride>,
    pub active_scene: Option<ActiveScene>,
    pub family_scene_assignments: Vec<FamilySceneAssignment>,
    pub translate_enabled: bool,
    pub target_lang: String,
    pub translation: TranslationConfig,
    pub hotkey: String,
    pub ask_hotkey: String,
    pub hotkey_mode: String,
    pub hotkeys: HotkeyConfig,
    pub output_mode: String,
    pub insertion_strategy: String,
    pub restore_clipboard_after_paste: bool,
    pub paste_shortcut: String,
    pub windows_sendinput_newline_mode: String,
    pub streaming_insert_enabled: bool,
    pub selected_text_enabled: bool,
    pub theme: String,
    pub auto_start: bool,
    pub close_to_tray: bool,
    pub start_minimized: bool,
    pub recording_limit_mode: crate::stt::capabilities::RecordingLimitMode,
    pub custom_recording_limit_seconds: u32,
    pub max_recording_seconds: u32,
    pub ui_language: String,
    /// Microphone name chosen in Settings → General. Empty means "System default".
    pub input_device: String,
    /// macOS only: show the app icon in the Dock. When false the app runs as a menu-bar
    /// (tray) app with no Dock icon. See `apply_dock_visibility` in `lib.rs`.
    pub show_in_dock: bool,
    /// Mute the default output device while recording (Settings → General → Audio).
    pub mute_output_while_recording: bool,
    /// Version of the built-in preset templates this config holds (`BUILTIN_PRESETS_VERSION`).
    pub builtin_presets_version: u32,
    /// The three-shortcut tour (onboarding steps 5 to 7) has been finished.
    pub shortcut_tour_completed: bool,
    /// The user answered "Later" (or "Start") to the "try the three shortcuts now?" dialog.
    pub shortcut_tour_prompt_dismissed: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            speech_presets: SpeechPreset::builtin_templates(),
            active_speech_preset_id: BUILTIN_SPEECH_PRESET_ID.to_string(),
            ai_presets: AiPreset::builtin_templates(),
            active_ai_preset_id: BUILTIN_AI_PRESET_ID.to_string(),
            polish_enabled: true,
            context_adaptation_enabled: true,
            voice_routing_flags: crate::voice_intent::VoiceRoutingFlags::default(),
            polish_style: "clean".to_string(),
            polish_custom_prompt: String::new(),
            polish_chinese_script: "preserve".to_string(),
            custom_scenes: Vec::new(),
            system_scene_overrides: Vec::new(),
            active_scene: None,
            family_scene_assignments: Vec::new(),
            translate_enabled: false,
            target_lang: "en".to_string(),
            translation: TranslationConfig::default(),
            hotkey: default_dictation_hotkey().to_string(),
            ask_hotkey: default_ask_hotkey().to_string(),
            hotkey_mode: default_dictation_hotkey_mode().to_string(),
            hotkeys: HotkeyConfig::default(),
            output_mode: "keyboard".to_string(),
            insertion_strategy: "auto".to_string(),
            restore_clipboard_after_paste: true,
            paste_shortcut: "ctrlV".to_string(),
            windows_sendinput_newline_mode: "enter".to_string(),
            streaming_insert_enabled: false,
            selected_text_enabled: false,
            theme: "system".to_string(),
            auto_start: true,
            close_to_tray: true,
            start_minimized: false,
            recording_limit_mode: crate::stt::capabilities::RecordingLimitMode::Auto,
            custom_recording_limit_seconds: 600,
            max_recording_seconds: 30,
            ui_language: "en".to_string(),
            input_device: String::new(),
            show_in_dock: true,
            mute_output_while_recording: false,
            builtin_presets_version: BUILTIN_PRESETS_VERSION,
            shortcut_tour_completed: false,
            shortcut_tour_prompt_dismissed: false,
        }
    }
}

impl AppConfig {
    /// Config for a first launch with no stored settings.
    pub fn new_install_default() -> Self {
        Self::default()
    }

    fn migrate_legacy_platform_hotkeys(&mut self) {
        #[cfg(target_os = "macos")]
        if self.hotkey == "Alt+/" {
            self.hotkey = "Option+/".to_string();
        }
        #[cfg(target_os = "macos")]
        if self.hotkey == "Option+/" && self.hotkey_mode == "hold" {
            self.hotkey = "Fn".to_string();
            self.hotkey_mode = "toggle".to_string();
        }
        #[cfg(target_os = "windows")]
        if self.hotkey == "RightAlt" && self.hotkey_mode == "toggle" {
            self.hotkey = "Ctrl+/".to_string();
            self.hotkey_mode = "hold".to_string();
        }
        #[cfg(target_os = "macos")]
        if self.ask_hotkey == "Alt+Shift+/"
            || self.ask_hotkey == "Option+Shift+/"
            || self.ask_hotkey == "Command+Shift+/"
            || self.ask_hotkey == "Command+/"
            || self.ask_hotkey == "Command+。"
            || self.ask_hotkey == "Command+."
        {
            self.ask_hotkey = default_ask_hotkey().to_string();
        }
        #[cfg(not(target_os = "macos"))]
        if self.ask_hotkey == "Ctrl+Shift+/"
            || self.ask_hotkey == "Control+Shift+/"
            || self.ask_hotkey == "Ctrl+/"
            || self.ask_hotkey == "Control+/"
            || self.ask_hotkey == "Ctrl+."
            || self.ask_hotkey == "Control+."
            || self.ask_hotkey == "RightAlt+Space"
        {
            self.ask_hotkey = default_ask_hotkey().to_string();
        }
        #[cfg(target_os = "windows")]
        if self
            .hotkeys
            .translate
            .as_ref()
            .and_then(ShortcutBinding::to_hotkey_string)
            .as_deref()
            == Some("RightAlt+LeftShift")
        {
            self.hotkeys.translate = None;
            self.hotkeys.translate_bindings.clear();
        }
    }

    fn normalize_hotkey_settings(&mut self) {
        self.migrate_platform_typed_hotkeys();
        self.hotkeys.dictation_mode =
            normalize_hotkey_mode(&self.hotkeys.dictation_mode).to_string();
        self.sync_legacy_hotkey_fields_from_typed();
    }

    fn migrate_platform_typed_hotkeys(&mut self) {
        #[cfg(target_os = "windows")]
        {
            if self.hotkeys.dictation.to_hotkey_string().as_deref() == Some("RightAlt") {
                if let Some(binding) = ShortcutBinding::from_hotkey("Ctrl+/") {
                    self.hotkeys.dictation = binding.clone();
                    self.hotkeys.dictation_bindings = vec![binding];
                }
                self.hotkeys.dictation_mode = "hold".to_string();
            }
            if self
                .hotkeys
                .ask
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string)
                .as_deref()
                == Some("RightAlt+Space")
            {
                self.hotkeys.ask = ShortcutBinding::from_hotkey("Ctrl+.");
                self.hotkeys.ask_bindings = self.hotkeys.ask.clone().into_iter().collect();
            }
            if self
                .hotkeys
                .translate
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string)
                .as_deref()
                == Some("RightAlt+LeftShift")
            {
                self.hotkeys.translate = None;
                self.hotkeys.translate_bindings.clear();
            }
        }
    }

    fn sync_legacy_hotkey_fields_from_typed(&mut self) {
        self.hotkeys.normalize();
        self.hotkey = self
            .hotkeys
            .dictation
            .to_hotkey_string()
            .unwrap_or_else(|| default_dictation_hotkey().to_string());
        self.ask_hotkey = self
            .hotkeys
            .ask
            .as_ref()
            .and_then(ShortcutBinding::to_hotkey_string)
            .unwrap_or_default();
        self.hotkey_mode = self.hotkeys.dictation_mode.clone();
    }

    /// The speech preset used for recording. Falls back to the first preset, or to the
    /// built-in one if the list is somehow empty (it never is after `normalize_values`).
    pub fn active_speech_preset(&self) -> &SpeechPreset {
        static FALLBACK: std::sync::OnceLock<SpeechPreset> = std::sync::OnceLock::new();
        self.speech_presets
            .iter()
            .find(|preset| preset.id == self.active_speech_preset_id)
            .or_else(|| self.speech_presets.first())
            .unwrap_or_else(|| FALLBACK.get_or_init(SpeechPreset::builtin_default))
    }

    /// The AI preset used for polish and Ask. Same fallback rules as
    /// `active_speech_preset`.
    pub fn active_ai_preset(&self) -> &AiPreset {
        static FALLBACK: std::sync::OnceLock<AiPreset> = std::sync::OnceLock::new();
        self.ai_presets
            .iter()
            .find(|preset| preset.id == self.active_ai_preset_id)
            .or_else(|| self.ai_presets.first())
            .unwrap_or_else(|| FALLBACK.get_or_init(AiPreset::builtin_local))
    }

    /// Language hint of the active speech preset. `None` means auto-detect.
    pub fn speech_language(&self) -> Option<&str> {
        let language = self.active_speech_preset().language.trim();
        if language.is_empty() || language == SPEECH_LANGUAGE_AUTO {
            None
        } else {
            Some(language)
        }
    }

    /// Speech is ready when the active speech preset passed a Test since it last changed.
    pub fn speech_ready(&self) -> bool {
        self.active_speech_preset().verified_at.is_some()
    }

    /// AI is ready when the active AI preset passed a Test since it last changed.
    pub fn ai_ready(&self) -> bool {
        self.active_ai_preset().verified_at.is_some()
    }

    /// Marks the stored speech preset with the tested preset's id as verified, but only when
    /// its connection is the one that was tested (unsaved edits do not count). Returns true
    /// when the preset was marked.
    pub fn mark_speech_verified(&mut self, tested: &SpeechPreset, at: u64) -> bool {
        mark_verified(&mut self.speech_presets, tested, at)
    }

    /// Plan `quick-speech-setup`: adds (or updates) the "Built-in (this Mac)" preset for an
    /// installed model and makes it the active speech preset. The preset starts unverified; the
    /// automatic test after setup marks it ready.
    pub fn install_builtin_whisper(&mut self, model_id: &str, model_file: &str) -> SpeechPreset {
        let fresh = SpeechPreset::builtin_whisper(model_id, model_file);
        let preset = match self
            .speech_presets
            .iter_mut()
            .find(|preset| preset.id == BUILTIN_WHISPER_PRESET_ID)
        {
            Some(existing) => {
                existing.kind = SpeechProviderKind::Builtin;
                existing.base_url.clear();
                if existing.model_file != fresh.model_file {
                    existing.model = fresh.model.clone();
                    existing.model_file = fresh.model_file.clone();
                    existing.verified_at = None;
                }
                existing.clone()
            }
            None => {
                self.speech_presets.insert(0, fresh.clone());
                fresh
            }
        };
        self.active_speech_preset_id = preset.id.clone();
        preset
    }

    /// Plan `quick-speech-setup`: keeps built-in presets in step with the model files on disk. A
    /// preset whose model file is gone moves to another installed model (and must pass a test
    /// again). When no model is left it stays (plan `two-tab-speech`: the Built-in engine always
    /// exists) with no model file, so it is not ready until a model is downloaded again. Returns
    /// true when anything changed.
    pub fn reconcile_builtin_models(&mut self, installed: &[(String, String)]) -> bool {
        let mut changed = false;
        for preset in &mut self.speech_presets {
            if !preset.is_builtin_whisper()
                || (!preset.model_file.is_empty()
                    && installed.iter().any(|(_, file)| *file == preset.model_file))
            {
                continue;
            }
            let replacement = installed
                .iter()
                .find(|(id, _)| *id == preset.model)
                .or_else(|| installed.first());
            match replacement {
                Some((model_id, file)) => {
                    preset.model = model_id.clone();
                    preset.model_file = file.clone();
                    preset.verified_at = None;
                    changed = true;
                }
                None if !preset.model_file.is_empty() || preset.verified_at.is_some() => {
                    preset.model_file.clear();
                    preset.verified_at = None;
                    changed = true;
                }
                None => {}
            }
        }
        changed
    }

    /// Same as `mark_speech_verified`, for AI presets.
    pub fn mark_ai_verified(&mut self, tested: &AiPreset, at: u64) -> bool {
        mark_verified(&mut self.ai_presets, tested, at)
    }

    /// Clears the verification of one preset, for example after its API key changed.
    /// Returns true when the preset was verified before.
    pub fn clear_verification(&mut self, kind: ServiceKind, preset_id: &str) -> bool {
        match kind {
            ServiceKind::Speech => clear_verified(&mut self.speech_presets, preset_id),
            ServiceKind::Ai => clear_verified(&mut self.ai_presets, preset_id),
        }
    }

    /// One-time moves to the current built-in templates.
    ///
    /// Version 1 (plan `setup-without-dead-ends`): old built-ins that are not templates any more
    /// are removed, user presets are kept, and missing templates are added in front. An active id
    /// that no longer exists moves to a template with the same URL and model if there is one,
    /// otherwise to the first template. `onboarding_completed`: the old onboarding needed a passing
    /// Test of both services and ended with the shortcut tour, so such configs keep their surviving
    /// active presets ready and count the tour as done.
    ///
    /// Version 2 (plan `two-tab-speech`): see `migrate_speech_presets_v2`.
    pub(crate) fn migrate_builtin_presets(&mut self, onboarding_completed: bool) {
        if self.builtin_presets_version >= BUILTIN_PRESETS_VERSION {
            return;
        }
        // The active speech preset of a version-1 config is the user's own choice; a version-0
        // config gets its active preset from the version-1 step below.
        let active_was_chosen = self.builtin_presets_version >= 1;
        if self.builtin_presets_version < 1 {
            let verify_at = onboarding_completed.then(now_unix_ms);
            migrate_preset_list(
                &mut self.speech_presets,
                &mut self.active_speech_preset_id,
                SpeechPreset::legacy_templates_v1(),
                verify_at,
            );
            migrate_preset_list(
                &mut self.ai_presets,
                &mut self.active_ai_preset_id,
                AiPreset::builtin_templates(),
                verify_at,
            );
            if onboarding_completed {
                self.shortcut_tour_completed = true;
            }
        }
        if self.builtin_presets_version < 2 {
            self.migrate_speech_presets_v2(active_was_chosen);
        }
        self.builtin_presets_version = BUILTIN_PRESETS_VERSION;
    }

    /// Plan `two-tab-speech`: speech has two engines, Built-in and "your server or API key". The
    /// old server and cloud templates leave the saved list unless the user edited them (name,
    /// address or model), picked them (the active preset, when `keep_active`) or got them working
    /// (a passed Test). The ones that stay become ordinary user presets. The Built-in preset is
    /// added when missing, and an active id that no longer exists falls back to it.
    fn migrate_speech_presets_v2(&mut self, keep_active: bool) {
        let legacy = SpeechPreset::legacy_templates_v1();
        let active = self.active_speech_preset_id.clone();
        self.speech_presets.retain_mut(|preset| {
            if preset.is_builtin_whisper() {
                return true;
            }
            if let Some(template) = legacy.iter().find(|template| template.id == preset.id) {
                let unedited = preset.name == template.name
                    && preset.base_url == template.base_url
                    && preset.model == template.model;
                let in_use = keep_active && preset.id == active;
                if unedited && !in_use && preset.verified_at.is_none() {
                    return false;
                }
            }
            preset.builtin = false;
            true
        });
        if !self
            .speech_presets
            .iter()
            .any(SpeechPreset::is_builtin_whisper)
        {
            self.speech_presets
                .insert(0, SpeechPreset::builtin_default());
        }
        if !self.speech_presets.iter().any(|preset| preset.id == active) {
            self.active_speech_preset_id = BUILTIN_SPEECH_PRESET_ID.to_string();
        }
    }

    fn normalize_presets(&mut self) {
        // Plan `two-tab-speech`: the Built-in engine always has its preset.
        if !self
            .speech_presets
            .iter()
            .any(SpeechPreset::is_builtin_whisper)
        {
            self.speech_presets
                .insert(0, SpeechPreset::builtin_default());
        }
        let mut seen_ids = HashSet::new();
        for preset in &mut self.speech_presets {
            preset.id = unique_preset_id(&preset.id, &mut seen_ids);
            preset.name = preset_name_or_default(&preset.name, &preset.model);
            if preset.is_builtin_whisper() {
                preset.base_url.clear();
                preset.model_file = preset.model_file.trim().to_string();
            } else {
                preset.base_url = normalize_preset_base_url(&preset.base_url);
                preset.model_file.clear();
            }
            preset.model = preset.model.trim().to_string();
            preset.language = preset.language.trim().to_string();
            if preset.language.is_empty() || preset.language == "multi" {
                preset.language = SPEECH_LANGUAGE_AUTO.to_string();
            }
            if base_url_has_placeholder(&preset.base_url) {
                preset.verified_at = None;
            }
        }
        if !self
            .speech_presets
            .iter()
            .any(|preset| preset.id == self.active_speech_preset_id)
        {
            self.active_speech_preset_id = self.speech_presets[0].id.clone();
        }

        if self.ai_presets.is_empty() {
            self.ai_presets = AiPreset::builtin_templates();
        }
        let mut seen_ids = HashSet::new();
        for preset in &mut self.ai_presets {
            preset.id = unique_preset_id(&preset.id, &mut seen_ids);
            preset.name = preset_name_or_default(&preset.name, &preset.model);
            preset.base_url = normalize_preset_base_url(&preset.base_url);
            preset.model = preset.model.trim().to_string();
            if base_url_has_placeholder(&preset.base_url) {
                preset.verified_at = None;
            }
        }
        if !self
            .ai_presets
            .iter()
            .any(|preset| preset.id == self.active_ai_preset_id)
        {
            self.active_ai_preset_id = self.ai_presets[0].id.clone();
        }
    }

    pub(crate) fn normalize_values(&mut self) {
        self.normalize_presets();
        self.polish_style = normalize_polish_style(&self.polish_style).to_string();
        self.polish_custom_prompt = sanitize_polish_custom_prompt(&self.polish_custom_prompt);
        self.polish_chinese_script = "preserve".to_string();
        sanitize_custom_scenes(&mut self.custom_scenes);
        sanitize_system_scene_overrides(&mut self.system_scene_overrides);
        sanitize_active_scene(&mut self.active_scene);
        sanitize_family_scene_assignments(
            &mut self.family_scene_assignments,
            &self.custom_scenes,
            &self.system_scene_overrides,
        );
        self.translation.normalize(&self.target_lang);
        self.target_lang = self.translation.active_target.clone();
        self.normalize_insertion_strategy();
        self.normalize_paste_shortcut();
        self.normalize_windows_sendinput_newline_mode();
        self.normalize_hotkey_settings();
        self.recompute_recording_limit_mirror();
        self.input_device = self.input_device.trim().to_string();
    }

    fn normalize_insertion_strategy(&mut self) {
        if !matches!(
            self.insertion_strategy.as_str(),
            "auto" | "keyboard" | "clipboardPaste" | "clipboardCopyOnly" | "windowsSendInput"
        ) {
            self.insertion_strategy = "auto".to_string();
        }

        self.output_mode =
            legacy_output_mode_for_insertion_strategy(&self.insertion_strategy).to_string();
    }

    fn normalize_paste_shortcut(&mut self) {
        if !matches!(
            self.paste_shortcut.as_str(),
            "ctrlV" | "ctrlShiftV" | "shiftInsert"
        ) {
            self.paste_shortcut = "ctrlV".to_string();
        }
    }

    fn normalize_windows_sendinput_newline_mode(&mut self) {
        if !matches!(
            self.windows_sendinput_newline_mode.as_str(),
            "enter" | "shiftEnter" | "crlf"
        ) {
            self.windows_sendinput_newline_mode = "enter".to_string();
        }
    }

    pub(crate) fn recompute_recording_limit_mirror(&mut self) {
        let resolved = crate::stt::capabilities::resolve_recording_limit(self);
        self.max_recording_seconds = resolved.effective_max_seconds;
    }

    pub(crate) fn clamp_recording_limit_intent_for_save(&mut self) {
        self.recompute_recording_limit_mirror();
        if self.recording_limit_mode == crate::stt::capabilities::RecordingLimitMode::Custom {
            self.custom_recording_limit_seconds = self.max_recording_seconds;
        } else if self.custom_recording_limit_seconds == 0 {
            self.custom_recording_limit_seconds = 600;
        }
    }

    pub fn from_stored_value(value: serde_json::Value) -> Result<Self, serde_json::Error> {
        Self::from_stored_value_with_onboarding(value, false)
    }

    /// Reads a stored config. `onboarding_completed` is the separate store flag; it only
    /// matters for the one-time built-in preset migration.
    pub fn from_stored_value_with_onboarding(
        value: serde_json::Value,
        onboarding_completed: bool,
    ) -> Result<Self, serde_json::Error> {
        let mut value = value;
        if let Some(object) = value.as_object_mut() {
            if object
                .get("system_scene_overrides")
                .is_some_and(serde_json::Value::is_null)
            {
                object.insert(
                    "system_scene_overrides".to_string(),
                    serde_json::Value::Array(Vec::new()),
                );
            }
        }
        let has_insertion_strategy = value
            .as_object()
            .is_some_and(|object| object.contains_key("insertion_strategy"));
        let has_hotkeys = value
            .as_object()
            .is_some_and(|object| object.contains_key("hotkeys"));
        let has_translation = value
            .as_object()
            .is_some_and(|object| object.contains_key("translation"));
        let has_legacy_target = value
            .as_object()
            .is_some_and(|object| object.contains_key("target_lang"));
        let has_recording_limit_mode = value
            .as_object()
            .is_some_and(|object| object.contains_key("recording_limit_mode"));
        let has_custom_recording_limit = value
            .as_object()
            .is_some_and(|object| object.contains_key("custom_recording_limit_seconds"));
        let has_builtin_presets_version = value
            .as_object()
            .is_some_and(|object| object.contains_key("builtin_presets_version"));
        let mut config: Self = serde_json::from_value(value)?;
        if !has_builtin_presets_version {
            config.builtin_presets_version = 0;
        }
        config.migrate_builtin_presets(onboarding_completed);
        if !has_recording_limit_mode {
            if config.max_recording_seconds == 0 || config.max_recording_seconds == 30 {
                config.recording_limit_mode = crate::stt::capabilities::RecordingLimitMode::Auto;
                config.custom_recording_limit_seconds = 600;
            } else {
                config.recording_limit_mode = crate::stt::capabilities::RecordingLimitMode::Custom;
                config.custom_recording_limit_seconds = config.max_recording_seconds;
            }
        } else if !has_custom_recording_limit {
            config.custom_recording_limit_seconds = 600;
        }
        if !has_translation {
            config.translation = TranslationConfig::from_legacy(&config.target_lang);
        } else if !has_legacy_target {
            config.target_lang = config.translation.active_target.clone();
        }
        if !has_insertion_strategy {
            config.insertion_strategy =
                insertion_strategy_from_legacy_output_mode(&config.output_mode).to_string();
        }
        if !has_hotkeys {
            config.migrate_legacy_platform_hotkeys();
            config.hotkeys =
                HotkeyConfig::from_legacy(&config.hotkey, &config.ask_hotkey, &config.hotkey_mode);
        } else {
            config.sync_legacy_hotkey_fields_from_typed();
        }
        config.normalize_values();
        Ok(config)
    }
}

fn default_dictation_hotkey() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Fn"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+/"
    }
}

fn default_dictation_hotkey_mode() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "toggle"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "hold"
    }
}

fn default_ask_hotkey() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Fn+Space"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+."
    }
}

fn default_translate_hotkey() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        Some("Fn+LeftShift")
    }
    #[cfg(not(target_os = "macos"))]
    {
        Some("Ctrl+Shift+/")
    }
}

fn normalize_hotkey_mode(value: &str) -> &'static str {
    if value == "toggle" {
        "toggle"
    } else {
        "hold"
    }
}

fn binding_from_hotkey_string(value: &str) -> Option<ShortcutBinding> {
    let parts: Vec<&str> = value
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.is_empty() {
        return None;
    }

    let primary = normalize_hotkey_primary(parts.last()?)?;
    let mut modifiers = Vec::new();
    let mut seen_semantic = HashSet::new();
    for part in &parts[..parts.len() - 1] {
        let (semantic, canonical) = normalize_hotkey_modifier(part)?;
        if !seen_semantic.insert(semantic) || canonical == primary {
            return None;
        }
        modifiers.push(canonical.to_string());
    }

    modifiers.sort_by_key(|modifier| hotkey_modifier_rank(modifier));
    Some(ShortcutBinding { primary, modifiers })
}

fn normalize_optional_binding(binding: &mut Option<ShortcutBinding>) {
    if let Some(value) = binding.as_mut() {
        if !value.normalize() {
            *binding = None;
        }
    }
}

/// Keys that only the native listener (`native_keys.rs`) can tell apart: side-specific
/// modifiers, Home/PageUp/PageDown and F13–F20. Valid both as a modifier and as a primary.
fn normalize_native_key_name(lower: &str) -> Option<&'static str> {
    Some(match lower {
        "leftshift" | "left_shift" | "left-shift" | "shiftleft" | "shift_left" | "shift-left" => {
            "LeftShift"
        }
        "rightshift" | "right_shift" | "right-shift" | "shiftright" => "RightShift",
        "leftcontrol" | "left_control" | "leftctrl" | "controlleft" => "LeftControl",
        "rightcontrol" | "right_control" | "rightctrl" | "controlright" => "RightControl",
        "leftoption" | "left_option" | "optionleft" => "LeftOption",
        "rightoption" | "right_option" | "optionright" => "RightOption",
        "leftcommand" | "left_command" | "leftcmd" | "commandleft" | "metaleft" => "LeftCommand",
        "rightcommand" | "right_command" | "rightcmd" | "commandright" | "metaright" => {
            "RightCommand"
        }
        "home" => "Home",
        "pageup" => "PageUp",
        "pagedown" => "PageDown",
        "f13" => "F13",
        "f14" => "F14",
        "f15" => "F15",
        "f16" => "F16",
        "f17" => "F17",
        "f18" => "F18",
        "f19" => "F19",
        "f20" => "F20",
        _ => return None,
    })
}

/// Returns `(semantic, canonical)`. Two modifiers with the same semantic (for example
/// `Option` and `Alt`) cannot appear in one binding.
fn normalize_hotkey_modifier(value: &str) -> Option<(&'static str, &'static str)> {
    let lower = value.trim().to_lowercase();
    if let Some(name) = normalize_native_key_name(&lower) {
        return Some((name, name));
    }
    match lower.as_str() {
        "fn" | "function" => Some(("fn", "Fn")),
        "rightalt" | "right_alt" | "right-alt" | "altright" | "alt_right" | "alt-right" => {
            Some(("rightalt", "RightAlt"))
        }
        "end" => Some(("end", "End")),
        "ctrl" | "control" => Some(("ctrl", "Ctrl")),
        "shift" => Some(("shift", "Shift")),
        "alt" => Some(("alt", "Alt")),
        "option" => Some(("alt", "Option")),
        "meta" | "super" | "win" => Some(("super", "Super")),
        "cmd" | "command" => Some(("super", "Command")),
        _ => None,
    }
}

/// Sort order of modifiers in a stored binding: Fn, End, Home/Page keys, F13+, then
/// Command, Control, Option, Shift (generic, then left, then right). Keep in sync with
/// `modifierOrder` in `src/stores/appStore.ts`.
fn hotkey_modifier_rank(value: &str) -> u8 {
    match value {
        "Fn" => 0,
        "RightAlt" => 1,
        "End" => 2,
        "Home" => 3,
        "PageUp" => 4,
        "PageDown" => 5,
        "F13" => 6,
        "F14" => 7,
        "F15" => 8,
        "F16" => 9,
        "F17" => 10,
        "F18" => 11,
        "F19" => 12,
        "F20" => 13,
        "Command" | "Super" => 20,
        "LeftCommand" => 21,
        "RightCommand" => 22,
        "Ctrl" => 23,
        "LeftControl" => 24,
        "RightControl" => 25,
        "Option" | "Alt" => 26,
        "LeftOption" => 27,
        "RightOption" => 28,
        "Shift" => 29,
        "LeftShift" => 30,
        "RightShift" => 31,
        _ => 99,
    }
}

fn normalize_hotkey_primary(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lower = trimmed.to_lowercase();
    if let Some(name) = normalize_native_key_name(&lower) {
        return Some(name.to_string());
    }
    let normalized = match lower.as_str() {
        "space" => "Space".to_string(),
        "tab" => "Tab".to_string(),
        "enter" | "return" => "Enter".to_string(),
        "backspace" => "Backspace".to_string(),
        "escape" | "esc" => "Escape".to_string(),
        "delete" => "Delete".to_string(),
        "insert" => "Insert".to_string(),
        "end" => "End".to_string(),
        "arrowup" | "up" => "Up".to_string(),
        "arrowdown" | "down" => "Down".to_string(),
        "arrowleft" | "left" => "Left".to_string(),
        "arrowright" | "right" => "Right".to_string(),
        "fn" | "function" => "Fn".to_string(),
        // Bare generic Shift (either side); only the Switch language shortcut can use it.
        "shift" => "Shift".to_string(),
        "rightalt" | "right_alt" | "right-alt" | "altright" | "alt_right" | "alt-right" => {
            "RightAlt".to_string()
        }
        "slash" | "/" => "/".to_string(),
        "backslash" | "\\" => "\\".to_string(),
        "period" | "." | "。" => ".".to_string(),
        "comma" | "," => ",".to_string(),
        "semicolon" | ";" => ";".to_string(),
        "quote" | "'" => "'".to_string(),
        "backquote" | "`" => "`".to_string(),
        "minus" | "-" => "-".to_string(),
        "equal" | "=" => "=".to_string(),
        "bracketleft" | "[" => "[".to_string(),
        "bracketright" | "]" => "]".to_string(),
        other
            if matches!(
                other,
                "f1" | "f2"
                    | "f3"
                    | "f4"
                    | "f5"
                    | "f6"
                    | "f7"
                    | "f8"
                    | "f9"
                    | "f10"
                    | "f11"
                    | "f12"
            ) =>
        {
            other.to_uppercase()
        }
        other if other.len() == 1 => {
            let ch = other.chars().next()?;
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase().to_string()
            } else {
                return None;
            }
        }
        _ => return None,
    };

    Some(normalized)
}

fn insertion_strategy_from_legacy_output_mode(output_mode: &str) -> &'static str {
    if output_mode == "clipboard" {
        "clipboardPaste"
    } else {
        "auto"
    }
}

fn legacy_output_mode_for_insertion_strategy(strategy: &str) -> &'static str {
    match strategy {
        "clipboardPaste" | "clipboardCopyOnly" => "clipboard",
        _ => "keyboard",
    }
}

const POLISH_CUSTOM_PROMPT_MAX_CHARS: usize = 2000;

fn normalize_polish_style(value: &str) -> &'static str {
    match value.trim() {
        "minimal" => "minimal",
        "clean" => "clean",
        "structured" => "structured",
        "professional" => "professional",
        _ => "clean",
    }
}

fn sanitize_polish_custom_prompt(value: &str) -> String {
    value
        .replace('\0', "")
        .trim()
        .chars()
        .take(POLISH_CUSTOM_PROMPT_MAX_CHARS)
        .collect()
}

fn sanitize_scene_string(value: &str, max_chars: usize) -> String {
    value
        .replace('\0', "")
        .trim()
        .chars()
        .take(max_chars)
        .collect()
}

fn sanitize_custom_scenes(scenes: &mut Vec<CustomScene>) {
    for scene in scenes.iter_mut() {
        scene.id = sanitize_scene_string(&scene.id, SCENE_ID_MAX_CHARS);
        scene.name = sanitize_scene_string(&scene.name, SCENE_NAME_MAX_CHARS);
        scene.description = sanitize_scene_string(&scene.description, SCENE_DESCRIPTION_MAX_CHARS);
        scene.prompt_template =
            sanitize_scene_string(&scene.prompt_template, SCENE_PROMPT_MAX_CHARS);
        scene.created_at = sanitize_scene_string(&scene.created_at, SCENE_ID_MAX_CHARS);
        scene.updated_at = sanitize_scene_string(&scene.updated_at, SCENE_ID_MAX_CHARS);
    }
    scenes.retain(|scene| {
        !scene.id.is_empty() && !scene.name.is_empty() && !scene.prompt_template.is_empty()
    });
    scenes.truncate(CUSTOM_SCENES_MAX_COUNT);
}

fn system_scene_prompt(scene_id: &str) -> Option<&'static str> {
    match scene_id {
        "system_email" => Some(
            "Email system mode: produce an email body when there is enough content. Use a greeting when the recipient is spoken, concise body paragraphs, and a light closing when appropriate. Do not generate a subject unless explicitly requested.",
        ),
        "system_work_chat" => Some(
            "Work chat system mode: keep it casual and concise. Use short sentences or simple line breaks when helpful. No greeting or sign-off.",
        ),
        "system_personal_chat" => Some(
            "Personal chat system mode: keep the user's casual voice and short-message rhythm; do not turn it into business writing.",
        ),
        "system_document" => Some(
            "Document system mode: use coherent paragraphs. Use short headings or bullet points when the spoken structure has sections, takeaways, or multiple items.",
        ),
        "system_project_management" => Some(
            "Project update system mode: format as a compact update with bullets for progress, blockers, and next steps when spoken. Do not invent owners, deadlines, or ticket fields.",
        ),
        "system_developer_collaboration" => Some(
            "Engineering note system mode: format as a concise review or engineering note. Use bullets for issue, impact, and suggestion when helpful. Preserve technical identifiers exactly.",
        ),
        "system_prompt_or_code" => Some(
            "Prompt/code system mode: make the spoken request explicit and usable. Use compact bullets for goal, constraints, and output shape when implied, but never invent code or unstated requirements.",
        ),
        "system_support" => Some(
            "Support reply system mode: write a clear, empathetic reply. Use short paragraphs or numbered steps when next actions are spoken. Do not invent policy, refund, or resolution claims.",
        ),
        "system_social" => Some(
            "Social post system mode: keep the user's voice and make it readable as a short post. No hashtags, emoji, or calls to action unless spoken.",
        ),
        _ => None,
    }
}

fn sanitize_system_scene_overrides(overrides: &mut Vec<SystemSceneOverride>) {
    let mut seen = HashSet::new();
    for item in overrides.iter_mut() {
        item.id = sanitize_scene_string(&item.id, SCENE_ID_MAX_CHARS);
        item.prompt_template = sanitize_scene_string(&item.prompt_template, SCENE_PROMPT_MAX_CHARS);
    }
    overrides.retain(|item| {
        !item.prompt_template.is_empty()
            && system_scene_prompt(&item.id).is_some()
            && seen.insert(item.id.clone())
    });
}

fn sanitize_active_scene(active_scene: &mut Option<ActiveScene>) {
    if let Some(scene) = active_scene.as_mut() {
        scene.id = sanitize_scene_string(&scene.id, SCENE_ID_MAX_CHARS);
        scene.source = sanitize_scene_string(&scene.source, SCENE_SOURCE_MAX_CHARS);
        scene.name = sanitize_scene_string(&scene.name, SCENE_NAME_MAX_CHARS);
        scene.prompt_template =
            sanitize_scene_string(&scene.prompt_template, SCENE_PROMPT_MAX_CHARS);

        if scene.id.is_empty()
            || scene.source.is_empty()
            || scene.name.is_empty()
            || scene.prompt_template.is_empty()
        {
            *active_scene = None;
        }
    }
}

fn builtin_scene_prompt(scene_id: &str) -> Option<&'static str> {
    match scene_id {
        "builtin_clean_dictation" => Some(
            "Lightly clean the transcript for readability while preserving the speaker meaning, wording choices, and factual content. Do not add new information.",
        ),
        "builtin_meeting_notes" => Some(
            "Rewrite the transcript as concise meeting notes with clear bullets, decisions, and action items. Preserve factual content and do not invent details.",
        ),
        "builtin_professional_email" => Some(
            "Rewrite the transcript as a concise professional email body. Use a greeting when the recipient is spoken, clear body paragraphs, and a light closing when appropriate. Do not add facts or generate a subject unless requested.",
        ),
        "builtin_support_reply" => Some(
            "Rewrite the transcript as a helpful customer support reply. Acknowledge the issue, give clear next steps, and avoid promising anything not stated.",
        ),
        "builtin_technical_explanation" => Some(
            "Rewrite the transcript as a clear technical explanation. Preserve precise terms, organize the reasoning, and avoid oversimplifying important details.",
        ),
        "builtin_code_comment" => Some(
            "Rewrite the transcript as a concise code review comment or inline engineering note. Keep it specific, actionable, and respectful.",
        ),
        "builtin_product_spec_notes" => Some(
            "Rewrite the transcript as product spec notes with goals, requirements, edge cases, and open questions. Do not invent decisions that were not spoken.",
        ),
        _ => None,
    }
}

pub(crate) fn scene_prompt_for_id(config: &AppConfig, scene_id: &str) -> Option<String> {
    let scene_id = scene_id.trim();
    config
        .system_scene_overrides
        .iter()
        .find(|scene| scene.id == scene_id)
        .map(|scene| scene.prompt_template.clone())
        .or_else(|| system_scene_prompt(scene_id).map(str::to_string))
        .or_else(|| builtin_scene_prompt(scene_id).map(str::to_string))
        .or_else(|| {
            config
                .custom_scenes
                .iter()
                .find(|scene| scene.id == scene_id)
                .map(|scene| scene.prompt_template.clone())
        })
}

fn default_system_scene_id_for_family(family: ContextFamily) -> Option<&'static str> {
    match family {
        ContextFamily::Email => Some("system_email"),
        ContextFamily::WorkChat => Some("system_work_chat"),
        ContextFamily::PersonalChat => Some("system_personal_chat"),
        ContextFamily::Document => Some("system_document"),
        ContextFamily::ProjectManagement => Some("system_project_management"),
        ContextFamily::DeveloperCollaboration => Some("system_developer_collaboration"),
        ContextFamily::PromptOrCode => Some("system_prompt_or_code"),
        ContextFamily::Support => Some("system_support"),
        ContextFamily::Social => Some("system_social"),
        ContextFamily::General => None,
    }
}

pub(crate) fn family_scene_prompt(config: &AppConfig, family: ContextFamily) -> Option<String> {
    let scene_id = config
        .family_scene_assignments
        .iter()
        .find(|assignment| assignment.family == family)
        .map(|assignment| assignment.scene_id.as_str())
        .or_else(|| default_system_scene_id_for_family(family))?;
    scene_prompt_for_id(config, scene_id)
}

pub(crate) fn automatic_scene_prompt(
    config: &AppConfig,
    family: ContextFamily,
    mapped_scene_id: Option<&str>,
) -> Option<String> {
    if config.active_scene.is_some() {
        return None;
    }

    mapped_scene_id
        .and_then(|scene_id| scene_prompt_for_id(config, scene_id))
        .or_else(|| family_scene_prompt(config, family))
}

fn sanitize_family_scene_assignments(
    assignments: &mut Vec<FamilySceneAssignment>,
    custom_scenes: &[CustomScene],
    system_scene_overrides: &[SystemSceneOverride],
) {
    let valid_custom_ids: HashSet<&str> = custom_scenes
        .iter()
        .map(|scene| scene.id.as_str())
        .collect();
    let mut seen_families = HashSet::new();

    for assignment in assignments.iter_mut() {
        assignment.scene_id = sanitize_scene_string(&assignment.scene_id, SCENE_ID_MAX_CHARS);
    }
    assignments.retain(|assignment| {
        !assignment.scene_id.is_empty()
            && (builtin_scene_prompt(&assignment.scene_id).is_some()
                || system_scene_prompt(&assignment.scene_id).is_some()
                || system_scene_overrides
                    .iter()
                    .any(|scene| scene.id == assignment.scene_id)
                || valid_custom_ids.contains(assignment.scene_id.as_str()))
            && seen_families.insert(assignment.family)
    });
}

// ─── ConfigManager (tauri-plugin-store backed) ───

/// True when a stored config predates the current built-in preset templates.
fn stored_presets_need_migration(value: &serde_json::Value) -> bool {
    value
        .get("builtin_presets_version")
        .and_then(serde_json::Value::as_u64)
        .is_none_or(|version| version < u64::from(BUILTIN_PRESETS_VERSION))
}

pub struct ConfigManager {
    app_handle: tauri::AppHandle,
    cache: Mutex<Option<AppConfig>>,
}

impl ConfigManager {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            cache: Mutex::new(None),
        }
    }

    pub async fn load(&self) -> Result<AppConfig> {
        if let Some(config) = self.cache.lock().unwrap_or_else(|e| e.into_inner()).clone() {
            return Ok(config);
        }

        let mut migrated = false;
        let config = match self.app_handle.store("settings.json") {
            Ok(store) => match store.get("app_config") {
                Some(val) => {
                    let onboarding_completed = store
                        .get("onboarding_completed")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false);
                    migrated = stored_presets_need_migration(&val);
                    AppConfig::from_stored_value_with_onboarding(val, onboarding_completed)
                        .unwrap_or_else(|_| AppConfig::new_install_default())
                }
                None => AppConfig::new_install_default(),
            },
            Err(_) => AppConfig::new_install_default(),
        };
        if migrated {
            // Write the migrated presets back, so the migration runs only once.
            if let Err(error) = self.persist_config(&config) {
                tracing::warn!("Failed to save the migrated presets: {error}");
            }
        }

        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) = Some(config.clone());
        Ok(config)
    }

    pub async fn save(&self, config: &AppConfig) -> Result<()> {
        let mut config = config.clone();
        config.normalize_values();
        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) = Some(config.clone());

        self.persist_config(&config)?;

        Ok(())
    }

    fn persist_config(&self, config: &AppConfig) -> Result<()> {
        let store = self
            .app_handle
            .store("settings.json")
            .map_err(|e| anyhow::anyhow!("Failed to open store: {}", e))?;
        let val = serde_json::to_value(config)?;
        store.set("app_config", val);
        store.save().map_err(|e| anyhow::anyhow!("{}", e))?;

        Ok(())
    }
}

// ─── DictionaryStore (SQLite backed) ───

/// Typelite no longer keeps a record of dictations. Older builds stored them in a `history`
/// table inside `typelite.db` (the same file that holds the dictionary), so drop that table and
/// its index on startup. Dropping a table in SQLite also drops its indexes and triggers; the
/// explicit `DROP INDEX` covers an index left behind by an interrupted older migration.
fn drop_legacy_history(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DROP INDEX IF EXISTS idx_history_created;
         DROP TABLE IF EXISTS history;",
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub id: i64,
    pub word: String,
    pub pronunciation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CorrectionRule {
    pub id: i64,
    pub pattern: String,
    pub replacement: String,
    pub enabled: bool,
}

pub struct DictionaryStore {
    conn: Mutex<Connection>,
}

impl DictionaryStore {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS dictionary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                pronunciation TEXT
            );
            CREATE TABLE IF NOT EXISTS correction_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL,
                replacement TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )?;
        drop_legacy_history(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub async fn add(&self, word: &str, pronunciation: Option<&str>) -> Result<()> {
        let word = validate_dictionary_text(word, 100, "dictionary_word")?;
        let pronunciation = pronunciation
            .map(|value| validate_dictionary_text(value, 100, "dictionary_pronunciation"))
            .transpose()?
            .filter(|value| !value.is_empty());
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if dictionary_identity_exists(&conn, &normalized_dictionary_identity(&word), None)? {
            anyhow::bail!("dictionary_duplicate");
        }
        conn.execute(
            "INSERT INTO dictionary (word, pronunciation) VALUES (?1, ?2)",
            rusqlite::params![word, pronunciation],
        )?;
        Ok(())
    }

    pub async fn update(&self, id: i64, word: &str, pronunciation: Option<&str>) -> Result<()> {
        let word = validate_dictionary_text(word, 100, "dictionary_word")?;
        let pronunciation = pronunciation
            .map(|value| validate_dictionary_text(value, 100, "dictionary_pronunciation"))
            .transpose()?
            .filter(|value| !value.is_empty());
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if dictionary_identity_exists(&conn, &normalized_dictionary_identity(&word), Some(id))? {
            anyhow::bail!("dictionary_duplicate");
        }
        let updated = conn.execute(
            "UPDATE dictionary SET word = ?2, pronunciation = ?3 WHERE id = ?1",
            rusqlite::params![id, word, pronunciation],
        )?;
        if updated == 0 {
            anyhow::bail!("dictionary_entry_not_found");
        }
        Ok(())
    }

    pub async fn remove(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM dictionary WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    }

    pub async fn list(&self) -> Result<Vec<DictionaryEntry>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt =
            conn.prepare("SELECT id, word, pronunciation FROM dictionary ORDER BY id ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(DictionaryEntry {
                id: row.get(0)?,
                word: row.get(1)?,
                pronunciation: row.get(2)?,
            })
        })?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    pub async fn words(&self) -> Vec<String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = match conn.prepare("SELECT word FROM dictionary") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };
        rows.filter_map(|r| r.ok()).collect()
    }

    pub async fn add_correction(&self, pattern: &str, replacement: &str) -> Result<()> {
        let pattern = validate_dictionary_text(pattern, 120, "correction_pattern")?;
        let replacement = validate_dictionary_text(replacement, 120, "correction_replacement")?;
        let identity = normalized_correction_identity(&pattern, &replacement);
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if correction_identity_exists(&conn, &identity, None)? {
            anyhow::bail!("correction_duplicate");
        }
        conn.execute(
            "INSERT INTO correction_rules (pattern, replacement, enabled) VALUES (?1, ?2, 1)",
            rusqlite::params![pattern, replacement],
        )?;
        Ok(())
    }

    pub async fn update_correction(
        &self,
        id: i64,
        pattern: &str,
        replacement: &str,
        enabled: bool,
    ) -> Result<()> {
        let pattern = validate_dictionary_text(pattern, 120, "correction_pattern")?;
        let replacement = validate_dictionary_text(replacement, 120, "correction_replacement")?;
        let identity = normalized_correction_identity(&pattern, &replacement);
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if correction_identity_exists(&conn, &identity, Some(id))? {
            anyhow::bail!("correction_duplicate");
        }
        let updated = conn.execute(
            "UPDATE correction_rules
             SET pattern = ?2, replacement = ?3, enabled = ?4
             WHERE id = ?1",
            rusqlite::params![id, pattern, replacement, if enabled { 1 } else { 0 }],
        )?;
        if updated == 0 {
            anyhow::bail!("correction_rule_not_found");
        }
        Ok(())
    }

    pub async fn remove_correction(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM correction_rules WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    }

    pub async fn set_correction_enabled(&self, id: i64, enabled: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE correction_rules SET enabled = ?2 WHERE id = ?1",
            rusqlite::params![id, if enabled { 1 } else { 0 }],
        )?;
        Ok(())
    }

    pub async fn correction_rules(&self) -> Result<Vec<CorrectionRule>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, pattern, replacement, enabled FROM correction_rules ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CorrectionRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                replacement: row.get(2)?,
                enabled: row.get::<_, i64>(3)? != 0,
            })
        })?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    pub async fn enabled_correction_rules(&self) -> Vec<CorrectionRule> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = match conn.prepare(
            "SELECT id, pattern, replacement, enabled FROM correction_rules WHERE enabled = 1 ORDER BY id ASC LIMIT 100",
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let rows = match stmt.query_map([], |row| {
            Ok(CorrectionRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                replacement: row.get(2)?,
                enabled: row.get::<_, i64>(3)? != 0,
            })
        }) {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };
        rows.filter_map(|r| r.ok()).collect()
    }

    pub(crate) fn with_transaction<T>(
        &self,
        operation: impl FnOnce(&rusqlite::Transaction<'_>) -> Result<T>,
    ) -> Result<T> {
        let mut conn = self.conn.lock().unwrap_or_else(|error| error.into_inner());
        let transaction = conn.transaction()?;
        let result = operation(&transaction)?;
        transaction.commit()?;
        Ok(result)
    }

    #[cfg(test)]
    pub(crate) fn execute_batch_for_test(&self, sql: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|error| error.into_inner());
        conn.execute_batch(sql)?;
        Ok(())
    }
}

pub(crate) fn normalized_dictionary_identity(value: &str) -> String {
    value.nfkc().collect::<String>().trim().to_lowercase()
}

pub(crate) fn normalized_correction_identity(pattern: &str, replacement: &str) -> (String, String) {
    (
        normalized_dictionary_identity(pattern),
        normalized_dictionary_identity(replacement),
    )
}

fn validate_dictionary_text(value: &str, max_chars: usize, field: &str) -> Result<String> {
    let value = value.replace('\0', "").trim().to_string();
    if value.is_empty() {
        anyhow::bail!("{field}_empty");
    }
    if value.chars().count() > max_chars {
        anyhow::bail!("{field}_too_long");
    }
    Ok(value)
}

fn dictionary_identity_exists(
    conn: &Connection,
    identity: &str,
    excluding_id: Option<i64>,
) -> Result<bool> {
    let mut statement = conn.prepare("SELECT id, word FROM dictionary")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (id, word) = row?;
        if Some(id) != excluding_id && normalized_dictionary_identity(&word) == identity {
            return Ok(true);
        }
    }
    Ok(false)
}

fn correction_identity_exists(
    conn: &Connection,
    identity: &(String, String),
    excluding_id: Option<i64>,
) -> Result<bool> {
    let mut statement = conn.prepare("SELECT id, pattern, replacement FROM correction_rules")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (id, pattern, replacement) = row?;
        if Some(id) != excluding_id
            && normalized_correction_identity(&pattern, &replacement) == *identity
        {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Plan `quick-speech-setup`: built-in (in-process) speech presets ───

    #[test]
    fn speech_presets_without_a_kind_parse_as_openai_compatible() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "speech_presets": [{
                "id": "my-speech",
                "name": "Mine",
                "base_url": "http://10.0.0.2:8000/v1",
                "model": "whisper",
                "language": "auto",
                "verified_at": 7
            }],
            "active_speech_preset_id": "my-speech",
            "builtin_presets_version": BUILTIN_PRESETS_VERSION
        }))
        .unwrap();
        let preset = config.active_speech_preset();
        assert_eq!(preset.kind, SpeechProviderKind::OpenaiCompatible);
        assert_eq!(preset.model_file, "");
        assert!(config.speech_ready());
    }

    #[test]
    fn built_in_speech_presets_round_trip_and_survive_the_template_migration() {
        let mut stored = AppConfig::default();
        let preset = stored.install_builtin_whisper("small", "ggml-small-q5_1.bin");
        stored.mark_speech_verified(&preset, 9);
        let mut value = serde_json::to_value(&stored).unwrap();
        assert_eq!(value["speech_presets"][0]["kind"], "builtin");
        assert_eq!(
            value["speech_presets"][0]["model_file"],
            "ggml-small-q5_1.bin"
        );
        // An old template version makes the migration run; it must keep this preset.
        value["builtin_presets_version"] = serde_json::json!(0);

        let config = AppConfig::from_stored_value_with_onboarding(value, false).unwrap();
        let active = config.active_speech_preset();
        assert_eq!(active.id, BUILTIN_WHISPER_PRESET_ID);
        assert!(active.is_builtin_whisper());
        assert_eq!(active.model, "small");
        assert_eq!(active.base_url, "");
        assert!(config.speech_ready());
    }

    #[test]
    fn install_adds_and_selects_one_built_in_preset() {
        let mut config = AppConfig::default();
        config.speech_presets.push(SpeechPreset::server(
            "mine",
            "Mine",
            "http://192.0.2.4:8000/v1",
            "m",
        ));
        config.active_speech_preset_id = "mine".into();
        let count = config.speech_presets.len();
        let first =
            config.install_builtin_whisper("large-v3-turbo", "ggml-large-v3-turbo-q5_0.bin");
        // The Built-in preset already exists (without a model file): it is filled in.
        assert_eq!(config.speech_presets.len(), count);
        assert_eq!(config.speech_presets[0], first);
        assert_eq!(config.active_speech_preset_id, BUILTIN_WHISPER_PRESET_ID);
        assert_eq!(first.name, "Built-in (this Mac)");
        assert!(
            !config.speech_ready(),
            "ready only after the automatic test"
        );
        assert!(config.mark_speech_verified(&first, 5));
        assert!(config.speech_ready());

        // The same model again keeps the result; another model replaces it and needs a test.
        config.install_builtin_whisper("large-v3-turbo", "ggml-large-v3-turbo-q5_0.bin");
        assert!(config.speech_ready());
        config.install_builtin_whisper("small", "ggml-small-q5_1.bin");
        assert_eq!(config.speech_presets.len(), count);
        assert_eq!(config.active_speech_preset().model, "small");
        assert!(!config.speech_ready());
    }

    #[test]
    fn a_built_in_preset_changes_connection_with_its_model_file_or_kind() {
        let a = SpeechPreset::builtin_whisper("small", "ggml-small-q5_1.bin");
        let mut b = a.clone();
        assert!(a.same_connection(&b));
        b.model_file = "ggml-large-v3-turbo-q5_0.bin".into();
        assert!(!a.same_connection(&b));
        let mut c = a.clone();
        c.kind = SpeechProviderKind::OpenaiCompatible;
        assert!(!a.same_connection(&c));

        let mut previous = AppConfig::default();
        let preset = previous.install_builtin_whisper("small", "ggml-small-q5_1.bin");
        previous.mark_speech_verified(&preset, 3);
        // A new language keeps a built-in preset ready: the model runs every language.
        let mut next = previous.clone();
        next.speech_presets[0].language = "en".into();
        invalidate_changed_presets(&previous, &mut next);
        assert!(next.speech_ready());
        next.speech_presets[0].model_file = "ggml-large-v3-turbo-q5_0.bin".into();
        invalidate_changed_presets(&previous, &mut next);
        assert!(!next.speech_ready());
    }

    #[test]
    fn normalising_a_built_in_preset_clears_server_fields() {
        let mut config = AppConfig::default();
        config.install_builtin_whisper("small", " ggml-small-q5_1.bin ");
        let mut server = SpeechPreset::server("s", "S", "http://192.0.2.4:8000/v1", "m");
        server.model_file = "stray.bin".into();
        config.speech_presets.push(server);
        config.speech_presets[0].base_url = "http://leftover".into();
        config.normalize_values();
        assert_eq!(config.speech_presets[0].base_url, "");
        assert_eq!(config.speech_presets[0].model_file, "ggml-small-q5_1.bin");
        assert_eq!(config.speech_presets[1].model_file, "");
    }

    #[test]
    fn reconcile_follows_the_model_files_on_disk() {
        let installed = |pairs: &[(&str, &str)]| -> Vec<(String, String)> {
            pairs
                .iter()
                .map(|(id, file)| (id.to_string(), file.to_string()))
                .collect()
        };
        let mut config = AppConfig::default();
        let preset =
            config.install_builtin_whisper("large-v3-turbo", "ggml-large-v3-turbo-q5_0.bin");
        config.mark_speech_verified(&preset, 1);

        // File present: nothing changes.
        let both = installed(&[
            ("large-v3-turbo", "ggml-large-v3-turbo-q5_0.bin"),
            ("small", "ggml-small-q5_1.bin"),
        ]);
        assert!(!config.reconcile_builtin_models(&both));
        assert!(config.speech_ready());

        // Its file is gone but another model is installed: switch, and test again.
        assert!(config.reconcile_builtin_models(&installed(&[("small", "ggml-small-q5_1.bin")])));
        assert_eq!(
            config.active_speech_preset().model_file,
            "ggml-small-q5_1.bin"
        );
        assert!(!config.speech_ready());

        // No model left: the preset stays active without a model file (not ready).
        assert!(config.reconcile_builtin_models(&[]));
        assert_eq!(config.active_speech_preset_id, BUILTIN_WHISPER_PRESET_ID);
        assert_eq!(config.active_speech_preset().model_file, "");
        assert_eq!(config.active_speech_preset().model, "small");
        assert!(!config.speech_ready());
        assert!(!config.reconcile_builtin_models(&[]));

        // A model appears again: the preset picks it up, preferring the model it names.
        let preset_model_back = installed(&[
            ("large-v3-turbo", "ggml-large-v3-turbo-q5_0.bin"),
            ("small", "ggml-small-q5_1.bin"),
        ]);
        assert!(config.reconcile_builtin_models(&preset_model_back));
        assert_eq!(
            config.active_speech_preset().model_file,
            "ggml-small-q5_1.bin"
        );
    }

    #[test]
    fn reconcile_keeps_another_active_preset() {
        let mut config = AppConfig::default();
        config.install_builtin_whisper("small", "ggml-small-q5_1.bin");
        config.speech_presets.push(SpeechPreset::server(
            "openai",
            "OpenAI",
            "https://api.openai.com/v1",
            "whisper-1",
        ));
        config.active_speech_preset_id = "openai".into();
        assert!(config.reconcile_builtin_models(&[]));
        assert_eq!(config.active_speech_preset_id, "openai");
    }

    #[test]
    fn app_config_seeds_builtin_presets_and_ignores_old_provider_keys() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "stt_api_key": "old-secret",
            "stt_language": "en",
            "llm_model": "old-model",
            "llm_base_url": "https://example.com/v1"
        }))
        .unwrap();

        assert_eq!(config.speech_presets, SpeechPreset::builtin_templates());
        assert_eq!(config.ai_presets, AiPreset::builtin_templates());
        assert_eq!(config.active_speech_preset_id, BUILTIN_SPEECH_PRESET_ID);
        assert_eq!(config.active_ai_preset_id, BUILTIN_AI_PRESET_ID);
        assert_eq!(config.speech_language(), None);

        let saved = serde_json::to_value(&config).unwrap();
        assert!(saved.get("stt_api_key").is_none());
        assert!(saved.get("llm_base_url").is_none());
    }

    #[test]
    fn app_config_seeds_empty_preset_lists() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "speech_presets": [],
            "ai_presets": [],
            "active_speech_preset_id": "missing",
            "active_ai_preset_id": ""
        }))
        .unwrap();

        // Speech has only the Built-in preset now (plan `two-tab-speech`).
        assert_eq!(config.speech_presets, SpeechPreset::builtin_templates());
        assert_eq!(config.ai_presets.len(), 4);
        assert_eq!(config.active_speech_preset_id, BUILTIN_SPEECH_PRESET_ID);
        assert_eq!(config.active_ai_preset_id, BUILTIN_AI_PRESET_ID);
    }

    #[test]
    fn app_config_normalizes_presets() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "speech_presets": [
                {"id": "a", "name": " First ", "base_url": " http://192.0.2.5:8000/v1/ ", "model": " m1 ", "language": ""},
                {"id": "a", "name": "", "base_url": "http://192.0.2.6:8000/v1", "model": "m2", "language": "multi"},
                {"id": "bad/id", "name": "Third", "base_url": "not a url", "model": "m3", "language": "zh"}
            ],
            "active_speech_preset_id": "gone",
            "ai_presets": [
                {"id": "x", "name": "Chat", "base_url": "http://localhost:11434/v1/", "model": "qwen3",
                 "extra_request_fields": {"reasoning_effort": "none"}}
            ],
            "active_ai_preset_id": "x",
            "builtin_presets_version": BUILTIN_PRESETS_VERSION
        }))
        .unwrap();

        // The Built-in preset is always there, in front.
        assert!(config.speech_presets[0].is_builtin_whisper());
        let speech = &config.speech_presets[1..];
        assert_eq!(speech.len(), 3);
        assert_eq!(speech[0].id, "a");
        assert_eq!(speech[0].name, "First");
        assert_eq!(speech[0].base_url, "http://192.0.2.5:8000/v1");
        assert_eq!(speech[0].model, "m1");
        assert_eq!(speech[0].language, "auto");
        // Duplicate and invalid ids get fresh random ids.
        assert_ne!(speech[1].id, "a");
        assert_ne!(speech[2].id, "bad/id");
        assert_ne!(speech[1].id, speech[2].id);
        // An empty name falls back to the model; "multi" means auto.
        assert_eq!(speech[1].name, "m2");
        assert_eq!(speech[1].language, "auto");
        // An invalid URL is kept (trimmed) so the user can fix it.
        assert_eq!(speech[2].base_url, "not a url");
        assert_eq!(speech[2].language, "zh");
        // A missing active id falls back to the first preset, the Built-in one.
        assert_eq!(config.active_speech_preset_id, BUILTIN_WHISPER_PRESET_ID);

        assert_eq!(
            config.active_ai_preset().base_url,
            "http://localhost:11434/v1"
        );
        assert_eq!(
            config.active_ai_preset().extra_request_fields["reasoning_effort"],
            "none"
        );
    }

    fn old_config(active_speech: &str, active_ai: &str) -> serde_json::Value {
        serde_json::json!({
            "speech_presets": [
                {"id": "builtin-whisper-local", "name": "Local whisper.cpp (Mac)",
                 "base_url": "http://127.0.0.1:8178/v1", "model": "large-v3-turbo",
                 "language": "auto", "builtin": true},
                {"id": "my-speech", "name": "Mine", "base_url": "http://192.0.2.7:8000/v1",
                 "model": "m", "language": "auto", "builtin": false}
            ],
            "active_speech_preset_id": active_speech,
            "ai_presets": [
                {"id": "builtin-ollama-pc", "name": "Old PC", "base_url": "http://192.0.2.8:11434/v1",
                 "model": "qwen3:4b-instruct-2507-q4_K_M", "builtin": true},
                {"id": "my-ai", "name": "Mine", "base_url": "http://192.0.2.9:11434/v1",
                 "model": "m", "builtin": false}
            ],
            "active_ai_preset_id": active_ai
        })
    }

    #[test]
    fn builtin_templates_have_stable_ids_and_no_private_addresses() {
        let speech: Vec<_> = SpeechPreset::builtin_templates()
            .into_iter()
            .map(|p| p.id)
            .collect();
        assert_eq!(speech, ["builtin-speech-this-mac"]);
        let ai: Vec<_> = AiPreset::builtin_templates()
            .into_iter()
            .map(|p| p.id)
            .collect();
        assert_eq!(
            ai,
            [
                "builtin-ai-ollama-local",
                "builtin-ai-ollama-lan",
                "builtin-ai-openai",
                "builtin-ai-groq"
            ]
        );
        let stored = serde_json::to_string(&AppConfig::default()).unwrap();
        assert!(!stored.contains("100."));
        assert!(!stored.contains("192.168."));
    }

    #[test]
    fn migration_replaces_old_builtins_and_keeps_user_presets() {
        let config =
            AppConfig::from_stored_value_with_onboarding(old_config("my-speech", "my-ai"), false)
                .unwrap();

        let ids: Vec<_> = config
            .speech_presets
            .iter()
            .map(|p| p.id.as_str())
            .collect();
        // Version 1 put the old templates back; version 2 drops them again (never edited).
        assert_eq!(ids, ["builtin-speech-this-mac", "my-speech"]);
        assert!(config
            .ai_presets
            .iter()
            .all(|p| p.id != "builtin-ollama-pc"));
        assert!(config.ai_presets.iter().any(|p| p.id == "my-ai"));
        assert_eq!(config.active_speech_preset_id, "my-speech");
        assert_eq!(config.active_ai_preset_id, "my-ai");
        // Without a completed onboarding nothing counts as tested.
        assert!(!config.speech_ready());
        assert!(!config.ai_ready());
        assert!(!config.shortcut_tour_completed);
        assert_eq!(config.builtin_presets_version, BUILTIN_PRESETS_VERSION);
    }

    #[test]
    fn migration_moves_a_removed_active_builtin_to_a_template() {
        let config = AppConfig::from_stored_value_with_onboarding(
            old_config("builtin-whisper-local", "builtin-ollama-pc"),
            true,
        )
        .unwrap();

        // Same URL and model as the old local template: that one becomes active, stays ready,
        // and so survives version 2 as a user preset.
        assert_eq!(config.active_speech_preset_id, "builtin-speech-local");
        assert!(config.speech_ready());
        assert!(!config.active_speech_preset().builtin);
        // No template matches the old AI preset: the first template is active, not ready.
        assert_eq!(config.active_ai_preset_id, BUILTIN_AI_PRESET_ID);
        assert!(!config.ai_ready());
        assert!(config.shortcut_tour_completed);
    }

    #[test]
    fn migration_keeps_user_presets_ready_after_a_completed_onboarding() {
        let config =
            AppConfig::from_stored_value_with_onboarding(old_config("my-speech", "my-ai"), true)
                .unwrap();
        assert!(config.speech_ready());
        assert!(config.ai_ready());
        assert!(config.shortcut_tour_completed);
    }

    #[test]
    fn migration_runs_only_once() {
        let mut config = AppConfig::default();
        config.speech_presets.push(SpeechPreset {
            builtin: true,
            ..SpeechPreset::server(
                "builtin-speech-groq",
                "Groq (your key)",
                "https://api.groq.com/openai/v1",
                "whisper-large-v3-turbo",
            )
        });
        let stored = serde_json::to_value(&config).unwrap();
        assert!(!stored_presets_need_migration(&stored));

        let loaded = AppConfig::from_stored_value_with_onboarding(stored, true).unwrap();
        assert_eq!(loaded.speech_presets.len(), 2);
        assert!(!loaded.speech_ready());
        assert!(!loaded.shortcut_tour_completed);
        assert!(stored_presets_need_migration(&old_config("a", "b")));
    }

    fn version_1_config(active: &str) -> serde_json::Value {
        let template = |id: &str, name: &str, url: &str, model: &str| {
            serde_json::json!({"id": id, "name": name, "base_url": url, "model": model,
                               "language": "auto", "builtin": true})
        };
        serde_json::json!({
            "speech_presets": [
                template("builtin-speech-local", "whisper.cpp on this Mac",
                         "http://127.0.0.1:8178/v1", "large-v3-turbo"),
                template("builtin-speech-lan", "Speech server on another computer",
                         "http://192.0.2.10:8000/v1", "Systran/faster-whisper-large-v3"),
                template("builtin-speech-openai", "OpenAI (your key)",
                         "https://api.openai.com/v1", "whisper-1"),
                {"id": "builtin-speech-groq", "name": "Groq (your key)",
                 "base_url": "https://api.groq.com/openai/v1", "model": "whisper-large-v3-turbo",
                 "language": "auto", "builtin": true, "verified_at": 11},
                {"id": "mine", "name": "Mine", "base_url": "http://192.0.2.7:8000/v1",
                 "model": "m", "language": "auto", "builtin": false}
            ],
            "active_speech_preset_id": active,
            "builtin_presets_version": 1
        })
    }

    #[test]
    fn version_2_drops_unedited_old_speech_templates_and_keeps_the_rest() {
        let config =
            AppConfig::from_stored_value_with_onboarding(version_1_config("mine"), true).unwrap();
        let ids: Vec<_> = config
            .speech_presets
            .iter()
            .map(|p| p.id.as_str())
            .collect();
        // Unedited, unused local and OpenAI templates go; the edited LAN address and the
        // tested Groq preset stay; the Built-in preset is added in front.
        assert_eq!(
            ids,
            [
                "builtin-speech-this-mac",
                "builtin-speech-lan",
                "builtin-speech-groq",
                "mine"
            ]
        );
        assert!(config.speech_presets[1..].iter().all(|p| !p.builtin));
        assert_eq!(config.speech_presets[2].verified_at, Some(11));
        assert_eq!(config.active_speech_preset_id, "mine");
        assert_eq!(config.builtin_presets_version, BUILTIN_PRESETS_VERSION);
        // AI presets are not touched by version 2.
        assert_eq!(config.ai_presets, AiPreset::builtin_templates());
    }

    #[test]
    fn version_2_keeps_the_active_old_template_and_an_installed_built_in_preset() {
        let mut value = version_1_config("builtin-speech-openai");
        value["speech_presets"].as_array_mut().unwrap().push(
            serde_json::to_value(SpeechPreset::builtin_whisper(
                "small",
                "ggml-small-q5_1.bin",
            ))
            .unwrap(),
        );
        let config = AppConfig::from_stored_value_with_onboarding(value, true).unwrap();
        assert_eq!(config.active_speech_preset_id, "builtin-speech-openai");
        assert!(!config.active_speech_preset().builtin);
        let builtin: Vec<_> = config
            .speech_presets
            .iter()
            .filter(|p| p.is_builtin_whisper())
            .collect();
        assert_eq!(builtin.len(), 1);
        assert_eq!(builtin[0].model_file, "ggml-small-q5_1.bin");
        assert!(config
            .speech_presets
            .iter()
            .all(|p| p.id != "builtin-speech-local"));
    }

    #[test]
    fn version_2_moves_a_missing_active_id_to_the_built_in_preset() {
        let config =
            AppConfig::from_stored_value_with_onboarding(version_1_config("gone"), false).unwrap();
        assert_eq!(config.active_speech_preset_id, BUILTIN_WHISPER_PRESET_ID);
        assert!(!config.speech_ready());
    }

    #[test]
    fn editing_a_preset_clears_its_test_result() {
        let mut previous = AppConfig::default();
        previous.speech_presets = vec![SpeechPreset::server(
            "s",
            "S",
            "http://192.0.2.4:8000/v1",
            "m",
        )];
        previous.speech_presets[0].verified_at = Some(5);
        previous.ai_presets[0].verified_at = Some(5);

        // Renaming keeps it.
        let mut next = previous.clone();
        next.speech_presets[0].name = "Renamed".to_string();
        invalidate_changed_presets(&previous, &mut next);
        assert_eq!(next.speech_presets[0].verified_at, Some(5));

        // URL, model, language and extra fields clear it.
        for edit in 0..3 {
            let mut next = previous.clone();
            match edit {
                0 => next.speech_presets[0].base_url = "http://192.0.2.1:8178/v1".to_string(),
                1 => next.speech_presets[0].model = "other".to_string(),
                _ => next.speech_presets[0].language = "en".to_string(),
            }
            invalidate_changed_presets(&previous, &mut next);
            assert_eq!(next.speech_presets[0].verified_at, None, "edit {edit}");
        }
        let mut next = previous.clone();
        next.ai_presets[0]
            .extra_request_fields
            .insert("reasoning_effort".to_string(), serde_json::json!("none"));
        invalidate_changed_presets(&previous, &mut next);
        assert_eq!(next.ai_presets[0].verified_at, None);

        // A Test of the edited values that passed before saving keeps its new result.
        let mut next = previous.clone();
        next.ai_presets[0].model = "other".to_string();
        next.ai_presets[0].verified_at = Some(9);
        invalidate_changed_presets(&previous, &mut next);
        assert_eq!(next.ai_presets[0].verified_at, Some(9));
    }

    #[test]
    fn a_test_counts_only_for_the_stored_connection() {
        let mut config = AppConfig::default();
        let mut tested = config.speech_presets[0].clone();
        tested.model = "unsaved-edit".to_string();
        assert!(!config.mark_speech_verified(&tested, 7));
        assert!(!config.speech_ready());

        let tested = config.speech_presets[0].clone();
        assert!(config.mark_speech_verified(&tested, 7));
        assert!(config.speech_ready());

        // A template with a placeholder URL can never be ready.
        let lan = config.ai_presets[1].clone();
        assert!(base_url_has_placeholder(&lan.base_url));
        assert!(!config.mark_ai_verified(&lan, 7));

        assert!(config.clear_verification(ServiceKind::Speech, BUILTIN_SPEECH_PRESET_ID));
        assert!(!config.speech_ready());
        assert!(!config.clear_verification(ServiceKind::Speech, BUILTIN_SPEECH_PRESET_ID));
    }

    #[test]
    fn placeholder_detection() {
        assert!(base_url_has_placeholder("http://<computer-ip>:8000/v1"));
        assert!(!base_url_has_placeholder("http://127.0.0.1:8000/v1"));
        assert!(!base_url_has_placeholder("http://a<b"));
    }

    #[test]
    fn speech_language_reads_the_active_preset() {
        let mut config = AppConfig::default();
        assert_eq!(config.speech_language(), None);

        config.speech_presets[0].language = "en".to_string();
        assert_eq!(config.speech_language(), Some("en"));
    }

    #[test]
    fn presets_survive_a_save_and_load_round_trip() {
        let mut config = AppConfig::default();
        let mut copy = config.speech_presets[0].clone();
        copy.id = "my-copy".to_string();
        copy.name = "My copy".to_string();
        copy.builtin = false;
        config.speech_presets.push(copy);
        config.active_speech_preset_id = "my-copy".to_string();

        let stored = serde_json::to_value(&config).unwrap();
        let loaded = AppConfig::from_stored_value(stored).unwrap();

        assert_eq!(loaded.speech_presets, config.speech_presets);
        assert_eq!(loaded.active_speech_preset_id, "my-copy");
    }

    #[test]
    fn app_config_defaults_missing_polish_preferences() {
        let value = serde_json::json!({
            "stt_api_key": "",
            "stt_language": "multi",
            "llm_api_key": "",
            "llm_model": "old-model",
            "llm_base_url": "https://example.com/v1",
            "polish_enabled": true,
            "translate_enabled": false,
            "target_lang": "en",
            "hotkey": "Ctrl+/",
            "hotkey_mode": "hold",
            "output_mode": "keyboard",
            "selected_text_enabled": false,
            "theme": "system",
            "auto_start": false,
            "close_to_tray": true,
            "start_minimized": false,
            "max_recording_seconds": 30,
            "ui_language": "en"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.polish_custom_prompt, "");
        assert_eq!(config.polish_chinese_script, "preserve");
        assert_eq!(config.polish_style, "clean");
    }

    #[test]
    fn recording_limit_migrates_historical_default_to_provider_auto() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "max_recording_seconds": 30
        }))
        .unwrap();

        assert_eq!(
            config.recording_limit_mode,
            crate::stt::capabilities::RecordingLimitMode::Auto
        );
        assert_eq!(config.custom_recording_limit_seconds, 600);
        assert_eq!(config.max_recording_seconds, 600);
    }

    #[test]
    fn recording_limit_migrates_historical_custom_value_without_losing_intent() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "max_recording_seconds": 120
        }))
        .unwrap();

        assert_eq!(
            config.recording_limit_mode,
            crate::stt::capabilities::RecordingLimitMode::Custom
        );
        assert_eq!(config.custom_recording_limit_seconds, 120);
        assert_eq!(config.max_recording_seconds, 120);
    }

    #[test]
    fn recording_limit_migrates_zero_to_a_safe_auto_default() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "max_recording_seconds": 0
        }))
        .unwrap();

        assert_eq!(
            config.recording_limit_mode,
            crate::stt::capabilities::RecordingLimitMode::Auto
        );
        assert_eq!(config.custom_recording_limit_seconds, 600);
        assert_eq!(config.max_recording_seconds, 600);
    }

    #[test]
    fn recording_limit_clamps_the_compatibility_mirror_but_preserves_new_user_intent_on_load() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "recording_limit_mode": "custom",
            "custom_recording_limit_seconds": 9999,
            "max_recording_seconds": 9999
        }))
        .unwrap();

        assert_eq!(
            config.recording_limit_mode,
            crate::stt::capabilities::RecordingLimitMode::Custom
        );
        assert_eq!(config.custom_recording_limit_seconds, 9999);
        assert_eq!(config.max_recording_seconds, 720);
    }

    #[test]
    fn app_config_voice_routing_flags_migrate_on_and_preserve_independent_kill_switches() {
        let missing = AppConfig::from_stored_value(serde_json::json!({})).unwrap();
        assert_eq!(
            missing.voice_routing_flags,
            crate::voice_intent::VoiceRoutingFlags::default()
        );

        let mut partial_value = serde_json::to_value(AppConfig::default()).unwrap();
        partial_value["voice_routing_flags"] = serde_json::json!({
            "draft_insert": false
        });
        let partial = AppConfig::from_stored_value(partial_value).unwrap();
        assert_eq!(
            partial.voice_routing_flags,
            crate::voice_intent::VoiceRoutingFlags {
                draft_insert: false,
                rewrite_selection: true,
                translate_selection: true,
                search: true,
            }
        );
    }

    #[test]
    fn translation_config_migrates_legacy_target_and_enforces_ordered_invariants() {
        let legacy = AppConfig::from_stored_value(serde_json::json!({
            "target_lang": "ja"
        }))
        .unwrap();
        assert_eq!(
            legacy.translation,
            TranslationConfig {
                targets: vec!["ja".to_string()],
                active_target: "ja".to_string(),
            }
        );
        assert_eq!(legacy.target_lang, "ja");

        let normalized = AppConfig::from_stored_value(serde_json::json!({
            "target_lang": "de",
            "translation": {
                "targets": [" FR ", "fr", "xx", "ja", "de", "es", "pt", "it"],
                "active_target": "ko"
            }
        }))
        .unwrap();
        // Trimmed to three; the legacy target wins as the active one.
        assert_eq!(normalized.translation.targets, ["fr", "ja", "de"]);
        assert_eq!(normalized.translation.active_target, "de");
        assert_eq!(normalized.target_lang, "de");

        let empty = AppConfig::from_stored_value(serde_json::json!({
            "target_lang": "xx",
            "translation": {
                "targets": [],
                "active_target": "xx"
            }
        }))
        .unwrap();
        assert_eq!(empty.translation.targets, ["en"]);
        assert_eq!(empty.translation.active_target, "en");
        assert_eq!(serde_json::to_value(&empty).unwrap()["target_lang"], "en");
    }

    #[test]
    fn translation_config_defaults_to_english_only() {
        let config = AppConfig::default();
        assert_eq!(config.translation.targets, ["en"]);
        assert_eq!(config.translation.active_target, "en");

        let round_trip =
            AppConfig::from_stored_value(serde_json::to_value(&config).unwrap()).unwrap();
        assert_eq!(round_trip.translation, config.translation);
        assert_eq!(round_trip.target_lang, "en");
    }

    #[test]
    fn translation_config_keeps_at_most_three_targets() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "translation": {
                "targets": ["en", "ja", "ko", "fr", "de"],
                "active_target": "ko"
            }
        }))
        .unwrap();
        assert_eq!(config.translation.targets, ["en", "ja", "ko"]);
        assert_eq!(config.translation.active_target, "ko");
    }

    #[test]
    fn translation_config_migrates_plain_chinese_to_simplified_keeping_order() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "target_lang": "zh",
            "translation": {
                "targets": ["ja", "zh", "en"],
                "active_target": "zh"
            }
        }))
        .unwrap();
        assert_eq!(config.translation.targets, ["ja", "zh-Hans", "en"]);
        assert_eq!(config.translation.active_target, "zh-Hans");
        assert_eq!(config.target_lang, "zh-Hans");

        let legacy_only = AppConfig::from_stored_value(serde_json::json!({
            "target_lang": "zh"
        }))
        .unwrap();
        assert_eq!(legacy_only.translation.targets, ["zh-Hans"]);
    }

    #[test]
    fn translation_codes_are_matched_case_insensitively_to_their_canonical_spelling() {
        assert_eq!(
            normalize_translation_code(" ZH-hant-hk ").as_deref(),
            Some("zh-Hant-HK")
        );
        assert_eq!(
            normalize_translation_code("zh-hant-tw").as_deref(),
            Some("zh-Hant-TW")
        );
        assert_eq!(normalize_translation_code("zh").as_deref(), Some("zh-Hans"));
        assert_eq!(normalize_translation_code("zh-hk"), None);
        assert_eq!(normalize_translation_code("EN").as_deref(), Some("en"));
    }

    #[test]
    fn switch_language_shortcut_defaults_to_shift_and_is_kept() {
        let config = AppConfig::default();
        assert_eq!(
            config.hotkeys.switch_language,
            Some(ShortcutBinding {
                primary: "Shift".to_string(),
                modifiers: Vec::new(),
            })
        );

        // Older configs without the field get the default.
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["hotkeys"]
            .as_object_mut()
            .unwrap()
            .remove("switchLanguage");
        let migrated = AppConfig::from_stored_value(value).unwrap();
        assert_eq!(
            migrated.hotkeys.switch_language,
            default_switch_language_binding()
        );

        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["hotkeys"]["switchLanguage"] =
            serde_json::json!({ "primary": "RightOption", "modifiers": [] });
        let custom = AppConfig::from_stored_value(value).unwrap();
        assert_eq!(
            custom
                .hotkeys
                .switch_language
                .and_then(|binding| binding.to_hotkey_string())
                .as_deref(),
            Some("RightOption")
        );
    }

    #[test]
    fn app_config_preserves_valid_polish_style() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["polish_style"] = serde_json::json!("structured");

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.polish_style, "structured");
    }

    #[test]
    fn app_config_normalizes_invalid_polish_style_to_clean() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["polish_style"] = serde_json::json!("marketplace-pack");

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.polish_style, "clean");
    }

    #[test]
    fn app_config_defaults_missing_clipboard_restore_preferences() {
        let value = serde_json::json!({
            "output_mode": "clipboard"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert!(config.restore_clipboard_after_paste);
        assert_eq!(config.paste_shortcut, "ctrlV");
    }

    #[test]
    fn shortcut_binding_accepts_native_single_key_triggers() {
        let fn_binding = ShortcutBinding::from_hotkey("Fn").expect("Fn parses");
        assert_eq!(fn_binding.primary, "Fn");
        assert!(fn_binding.modifiers.is_empty());
        assert_eq!(fn_binding.to_hotkey_string().as_deref(), Some("Fn"));

        let right_alt = ShortcutBinding::from_hotkey("RightAlt").expect("RightAlt parses");
        assert_eq!(right_alt.primary, "RightAlt");
        assert!(right_alt.modifiers.is_empty());
        assert_eq!(right_alt.to_hotkey_string().as_deref(), Some("RightAlt"));
    }

    #[test]
    fn shortcut_binding_accepts_native_mode_shortcuts() {
        let ask = ShortcutBinding::from_hotkey("Fn+Space").expect("Fn+Space parses");
        assert_eq!(ask.primary, "Space");
        assert_eq!(ask.modifiers, vec!["Fn".to_string()]);
        assert_eq!(ask.to_hotkey_string().as_deref(), Some("Fn+Space"));

        let translate =
            ShortcutBinding::from_hotkey("RightAlt+LeftShift").expect("RightAlt+LeftShift parses");
        assert_eq!(translate.primary, "LeftShift");
        assert_eq!(translate.modifiers, vec!["RightAlt".to_string()]);
        assert_eq!(
            translate.to_hotkey_string().as_deref(),
            Some("RightAlt+LeftShift")
        );
    }

    #[test]
    fn app_config_defaults_streaming_insert_to_disabled() {
        let value = serde_json::json!({});

        let config = AppConfig::from_stored_value(value).unwrap();

        assert!(!config.streaming_insert_enabled);
    }

    #[test]
    fn app_config_migrates_legacy_keyboard_output_to_auto_insertion_strategy() {
        let value = serde_json::json!({
            "output_mode": "keyboard"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.insertion_strategy, "auto");
        assert_eq!(config.output_mode, "keyboard");
    }

    #[test]
    fn app_config_migrates_legacy_clipboard_output_to_clipboard_paste_strategy() {
        let value = serde_json::json!({
            "output_mode": "clipboard"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.insertion_strategy, "clipboardPaste");
        assert_eq!(config.output_mode, "clipboard");
    }

    #[test]
    fn app_config_migrates_legacy_hotkeys_to_typed_config() {
        let value = serde_json::json!({
            "hotkey": "Ctrl+Shift+;",
            "ask_hotkey": "Ctrl+Alt+.",
            "hotkey_mode": "toggle"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(
            config.hotkeys.dictation,
            ShortcutBinding {
                primary: ";".to_string(),
                modifiers: vec!["Ctrl".to_string(), "Shift".to_string()],
            }
        );
        assert_eq!(
            config.hotkeys.ask,
            Some(ShortcutBinding {
                primary: ".".to_string(),
                modifiers: vec!["Ctrl".to_string(), "Alt".to_string()],
            })
        );
        assert_eq!(config.hotkeys.dictation_mode, "toggle");
        assert_eq!(config.hotkey, "Ctrl+Shift+;");
        assert_eq!(config.ask_hotkey, "Ctrl+Alt+.");
        assert_eq!(config.hotkey_mode, "toggle");
    }

    #[test]
    fn app_config_uses_typed_hotkeys_when_present() {
        let value = serde_json::json!({
            "hotkey": "Ctrl+/",
            "ask_hotkey": "Ctrl+.",
            "hotkey_mode": "hold",
            "hotkeys": {
                "dictation": { "primary": "-", "modifiers": ["Ctrl", "Shift"] },
                "ask": { "primary": ".", "modifiers": ["Ctrl"] },
                "translate": null,
                "editSelection": null,
                "switchScene": null,
                "openApp": null,
                "dictationMode": "toggle"
            }
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.hotkey, "Ctrl+Shift+-");
        assert_eq!(config.ask_hotkey, "Ctrl+.");
        assert_eq!(config.hotkey_mode, "toggle");
        assert_eq!(config.hotkeys.dictation.primary, "-");
        assert_eq!(config.hotkeys.dictation.modifiers, vec!["Ctrl", "Shift"]);
    }

    #[test]
    fn app_config_preserves_extended_typed_hotkey_roles_when_present() {
        let value = serde_json::json!({
            "hotkey": "Ctrl+/",
            "ask_hotkey": "Ctrl+.",
            "hotkey_mode": "hold",
            "hotkeys": {
                "dictation": { "primary": "-", "modifiers": ["Ctrl", "Shift"] },
                "ask": null,
                "translate": { "primary": "T", "modifiers": ["Ctrl", "Shift"] },
                "editSelection": { "primary": "E", "modifiers": ["Ctrl", "Shift"] },
                "switchScene": { "primary": "S", "modifiers": ["Ctrl", "Shift"] },
                "openApp": { "primary": "O", "modifiers": ["Ctrl", "Shift"] },
                "dictationMode": "toggle"
            }
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.hotkey, "Ctrl+Shift+-");
        assert_eq!(config.ask_hotkey, "");
        assert_eq!(config.hotkeys.ask, None);
        assert_eq!(
            config.hotkeys.translate,
            Some(ShortcutBinding {
                primary: "T".to_string(),
                modifiers: vec!["Ctrl".to_string(), "Shift".to_string()],
            })
        );
        assert_eq!(
            config.hotkeys.edit_selection,
            Some(ShortcutBinding {
                primary: "E".to_string(),
                modifiers: vec!["Ctrl".to_string(), "Shift".to_string()],
            })
        );
        assert_eq!(
            config.hotkeys.switch_scene,
            Some(ShortcutBinding {
                primary: "S".to_string(),
                modifiers: vec!["Ctrl".to_string(), "Shift".to_string()],
            })
        );
        assert_eq!(
            config.hotkeys.open_app,
            Some(ShortcutBinding {
                primary: "O".to_string(),
                modifiers: vec!["Ctrl".to_string(), "Shift".to_string()],
            })
        );
    }

    #[test]
    fn hotkey_binding_lists_migrate_legacy_scalars_and_mirror_primaries() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "hotkey": "Ctrl+Shift+;",
            "ask_hotkey": "Ctrl+Alt+.",
            "hotkey_mode": "toggle"
        }))
        .unwrap();

        assert_eq!(
            config.hotkeys.dictation_bindings,
            vec![config.hotkeys.dictation.clone()]
        );
        assert_eq!(
            config.hotkeys.ask_bindings,
            vec![config.hotkeys.ask.clone().unwrap()]
        );
        assert!(config.hotkeys.translate_bindings.is_empty());
        assert_eq!(config.hotkey, "Ctrl+Shift+;");
        assert_eq!(config.ask_hotkey, "Ctrl+Alt+.");
    }

    #[test]
    fn hotkey_normalisers_accept_native_capture_key_names() {
        let binding = ShortcutBinding::from_hotkey("rightshift+leftcommand+F13").unwrap();
        assert_eq!(binding.primary, "F13");
        assert_eq!(binding.modifiers, vec!["LeftCommand", "RightShift"]);

        // The last part is the primary; modifiers are sorted by rank.
        let binding = ShortcutBinding::from_hotkey("RightShift+Fn+End").unwrap();
        assert_eq!(
            binding.to_hotkey_string().as_deref(),
            Some("Fn+RightShift+End")
        );

        for name in [
            "LeftShift",
            "RightShift",
            "LeftControl",
            "RightControl",
            "LeftOption",
            "RightOption",
            "LeftCommand",
            "RightCommand",
            "Home",
            "PageUp",
            "PageDown",
            "F13",
            "F20",
        ] {
            assert!(
                ShortcutBinding::from_hotkey(&format!("{name}+K")).is_some(),
                "{name} as modifier"
            );
            assert_eq!(
                ShortcutBinding::from_hotkey(name).map(|b| b.primary),
                Some(name.to_string()),
                "{name} as primary"
            );
        }
        for name in [
            "Delete",
            "Insert",
            "Backspace",
            "Up",
            "Down",
            "Left",
            "Right",
        ] {
            assert!(ShortcutBinding::from_hotkey(&format!("RightCommand+{name}")).is_some());
        }
        // The same key cannot be both primary and modifier.
        assert!(ShortcutBinding::from_hotkey("End+End").is_none());
    }

    #[test]
    fn hotkey_binding_identity_is_unordered() {
        let stored = ShortcutBinding {
            primary: "RightShift".to_string(),
            modifiers: vec!["End".to_string()],
        };
        let captured = ShortcutBinding {
            primary: "End".to_string(),
            modifiers: vec!["RightShift".to_string()],
        };
        assert_eq!(
            shortcut_binding_identity(&stored),
            shortcut_binding_identity(&captured)
        );

        let mut bindings = vec![stored.clone(), captured];
        normalize_binding_list(&mut bindings);
        assert_eq!(bindings, vec![stored]);
    }

    #[test]
    fn hotkey_binding_lists_normalize_dedupe_clamp_and_preserve_order() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "hotkey": "Ctrl+/",
            "ask_hotkey": "Ctrl+.",
            "hotkeys": {
                "dictation": { "primary": "/", "modifiers": ["Ctrl"] },
                "ask": { "primary": ".", "modifiers": ["Ctrl"] },
                "translate": null,
                "dictationBindings": [
                    { "primary": ";", "modifiers": ["shift", "control"] },
                    { "primary": ";", "modifiers": ["Ctrl", "Shift"] },
                    { "primary": "D", "modifiers": ["Alt"] },
                    { "primary": "F8", "modifiers": [] },
                    { "primary": "F9", "modifiers": [] }
                ],
                "askBindings": [
                    { "primary": "A", "modifiers": ["Option"] },
                    { "primary": "A", "modifiers": ["Alt"] }
                ],
                "translateBindings": [],
                "editSelection": null,
                "switchScene": null,
                "openApp": null,
                "dictationMode": "hold"
            }
        }))
        .unwrap();

        assert_eq!(config.hotkeys.dictation_bindings.len(), 3);
        assert_eq!(
            config.hotkeys.dictation_bindings[0]
                .to_hotkey_string()
                .as_deref(),
            Some("Ctrl+Shift+;")
        );
        assert_eq!(
            config.hotkeys.dictation_bindings[1]
                .to_hotkey_string()
                .as_deref(),
            Some("Alt+D")
        );
        assert_eq!(
            config.hotkeys.dictation_bindings[2]
                .to_hotkey_string()
                .as_deref(),
            Some("F8")
        );
        assert_eq!(config.hotkey, "Ctrl+Shift+;");
        assert_eq!(config.hotkeys.ask_bindings.len(), 1);
        assert_eq!(config.ask_hotkey, "Option+A");
        assert_eq!(
            config.hotkeys.dictation,
            config.hotkeys.dictation_bindings[0]
        );
        assert_eq!(
            config.hotkeys.ask.as_ref(),
            config.hotkeys.ask_bindings.first()
        );
    }

    #[test]
    fn hotkey_binding_lists_drop_corruption_and_keep_dictation_nonempty() {
        let config = AppConfig::from_stored_value(serde_json::json!({
            "hotkey": "Ctrl+/",
            "ask_hotkey": "Ctrl+.",
            "hotkeys": {
                "dictation": { "primary": "/", "modifiers": ["Ctrl"] },
                "ask": { "primary": ".", "modifiers": ["Ctrl"] },
                "translate": null,
                "dictationBindings": [
                    { "primary": "", "modifiers": ["Ctrl"] }
                ],
                "askBindings": [
                    { "primary": ".", "modifiers": ["Ctrl", "Ctrl"] }
                ],
                "translateBindings": [
                    { "primary": "T", "modifiers": ["shift", "control"] }
                ],
                "editSelection": null,
                "switchScene": null,
                "openApp": null,
                "dictationMode": "hold"
            }
        }))
        .unwrap();

        assert_eq!(config.hotkeys.dictation_bindings.len(), 1);
        assert_eq!(
            config.hotkeys.dictation_bindings[0]
                .to_hotkey_string()
                .as_deref(),
            Some(default_dictation_hotkey())
        );
        assert!(config.hotkeys.ask_bindings.is_empty());
        assert_eq!(config.ask_hotkey, "");
        assert_eq!(
            config.hotkeys.translate_bindings[0]
                .to_hotkey_string()
                .as_deref(),
            Some("Ctrl+Shift+T")
        );
    }

    #[test]
    fn hotkey_binding_lists_survive_restart_and_export_legacy_primary_fields() {
        let mut original = AppConfig::default();
        original.hotkeys.dictation_bindings = vec![
            ShortcutBinding::from_hotkey("Ctrl+Shift+D").unwrap(),
            ShortcutBinding::from_hotkey("F8").unwrap(),
        ];
        original.hotkeys.ask_bindings = Vec::new();
        original.hotkeys.ask = None;
        original.hotkeys.translate_bindings = vec![
            ShortcutBinding::from_hotkey("Ctrl+Shift+T").unwrap(),
            ShortcutBinding::from_hotkey("F9").unwrap(),
        ];
        original.normalize_values();

        let stored = serde_json::to_value(&original).unwrap();
        assert_eq!(stored["hotkey"], "Ctrl+Shift+D");
        assert_eq!(stored["ask_hotkey"], "");
        assert_eq!(stored["hotkeys"]["dictation"]["primary"], "D");
        assert_eq!(
            stored["hotkeys"]["dictationBindings"]
                .as_array()
                .unwrap()
                .len(),
            2
        );

        let restarted = AppConfig::from_stored_value(stored).unwrap();
        assert_eq!(
            restarted.hotkeys.dictation_bindings,
            original.hotkeys.dictation_bindings
        );
        assert_eq!(
            restarted.hotkeys.ask_bindings,
            original.hotkeys.ask_bindings
        );
        assert_eq!(
            restarted.hotkeys.translate_bindings,
            original.hotkeys.translate_bindings
        );
    }

    #[test]
    fn app_config_preserves_explicit_copy_only_insertion_strategy() {
        let value = serde_json::json!({
            "output_mode": "keyboard",
            "insertion_strategy": "clipboardCopyOnly"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.insertion_strategy, "clipboardCopyOnly");
        assert_eq!(config.output_mode, "clipboard");
    }

    #[test]
    fn app_config_defaults_and_normalizes_windows_sendinput_newline_mode() {
        let default_value = serde_json::json!({});
        let default_config = AppConfig::from_stored_value(default_value).unwrap();
        assert_eq!(default_config.windows_sendinput_newline_mode, "enter");

        let explicit_value = serde_json::json!({
            "windows_sendinput_newline_mode": "shiftEnter"
        });
        let explicit_config = AppConfig::from_stored_value(explicit_value).unwrap();
        assert_eq!(explicit_config.windows_sendinput_newline_mode, "shiftEnter");

        let invalid_value = serde_json::json!({
            "windows_sendinput_newline_mode": "invalid"
        });
        let invalid_config = AppConfig::from_stored_value(invalid_value).unwrap();
        assert_eq!(invalid_config.windows_sendinput_newline_mode, "enter");
    }

    #[test]
    fn app_config_defaults_missing_custom_scenes() {
        let value = serde_json::json!({});

        let config = AppConfig::from_stored_value(value).unwrap();

        assert!(config.custom_scenes.is_empty());
        assert!(config.active_scene.is_none());
        assert!(config.family_scene_assignments.is_empty());
    }

    #[test]
    fn app_config_sanitizes_family_scene_assignments_against_available_scenes() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["custom_scenes"] = serde_json::json!([
            {
                "id": "custom_focus",
                "name": "Focus",
                "description": "",
                "prompt_template": "Use short status bullets.",
                "created_at": "",
                "updated_at": ""
            }
        ]);
        value["family_scene_assignments"] = serde_json::json!([
            { "family": "email", "scene_id": "  builtin_professional_email  " },
            { "family": "email", "scene_id": "builtin_clean_dictation" },
            { "family": "work_chat", "scene_id": "custom_focus" },
            { "family": "support", "scene_id": "missing_scene" },
            { "family": "general", "scene_id": "\0" }
        ]);

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(
            config.family_scene_assignments,
            vec![
                FamilySceneAssignment {
                    family: ContextFamily::Email,
                    scene_id: "builtin_professional_email".to_string(),
                },
                FamilySceneAssignment {
                    family: ContextFamily::WorkChat,
                    scene_id: "custom_focus".to_string(),
                },
            ]
        );
    }

    #[test]
    fn scene_prompt_resolution_supports_builtins_custom_scenes_and_compat_family_lookup() {
        let mut config = AppConfig::default();
        config.custom_scenes.push(CustomScene {
            id: "custom_focus".to_string(),
            name: "Focus".to_string(),
            description: String::new(),
            prompt_template: "Use short status bullets.".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        });
        config.family_scene_assignments = vec![FamilySceneAssignment {
            family: ContextFamily::WorkChat,
            scene_id: "custom_focus".to_string(),
        }];
        config.normalize_values();

        assert_eq!(
            scene_prompt_for_id(&config, "builtin_professional_email").as_deref(),
            Some(
                "Rewrite the transcript as a concise professional email body. Use a greeting when the recipient is spoken, clear body paragraphs, and a light closing when appropriate. Do not add facts or generate a subject unless requested."
            )
        );
        assert_eq!(
            scene_prompt_for_id(&config, "custom_focus").as_deref(),
            Some("Use short status bullets.")
        );
        assert_eq!(
            family_scene_prompt(&config, ContextFamily::WorkChat).as_deref(),
            Some("Use short status bullets.")
        );
        assert_eq!(
            family_scene_prompt(&config, ContextFamily::Email).as_deref(),
            Some(
                "Email system mode: produce an email body when there is enough content. Use a greeting when the recipient is spoken, concise body paragraphs, and a light closing when appropriate. Do not generate a subject unless explicitly requested."
            )
        );
        assert_eq!(scene_prompt_for_id(&config, "missing_scene"), None);

        assert_eq!(
            automatic_scene_prompt(
                &config,
                ContextFamily::WorkChat,
                Some("builtin_professional_email")
            )
            .as_deref(),
            scene_prompt_for_id(&config, "builtin_professional_email").as_deref()
        );
        assert_eq!(
            automatic_scene_prompt(&config, ContextFamily::WorkChat, Some("custom_focus"))
                .as_deref(),
            Some("Use short status bullets.")
        );
        assert_eq!(
            automatic_scene_prompt(&config, ContextFamily::WorkChat, None).as_deref(),
            Some("Use short status bullets.")
        );

        config.active_scene = Some(ActiveScene {
            id: "builtin_meeting_notes".to_string(),
            source: "builtin".to_string(),
            name: "Meeting Notes".to_string(),
            prompt_template: "Manual scene wins.".to_string(),
        });
        assert_eq!(
            automatic_scene_prompt(
                &config,
                ContextFamily::WorkChat,
                Some("builtin_professional_email")
            ),
            None
        );
    }

    #[test]
    fn system_scene_overrides_replace_default_system_prompts() {
        let mut config = AppConfig {
            system_scene_overrides: vec![SystemSceneOverride {
                id: "system_email".to_string(),
                prompt_template: "Use a warm email body with concise bullets.".to_string(),
            }],
            family_scene_assignments: vec![FamilySceneAssignment {
                family: ContextFamily::Email,
                scene_id: "system_email".to_string(),
            }],
            ..Default::default()
        };
        config.normalize_values();

        assert_eq!(
            scene_prompt_for_id(&config, "system_email").as_deref(),
            Some("Use a warm email body with concise bullets.")
        );
        assert_eq!(
            automatic_scene_prompt(&config, ContextFamily::Email, None).as_deref(),
            Some("Use a warm email body with concise bullets.")
        );
    }

    #[test]
    fn app_config_treats_null_system_scene_overrides_as_empty() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["system_scene_overrides"] = serde_json::Value::Null;

        let config = AppConfig::from_stored_value(value).unwrap();

        assert!(config.system_scene_overrides.is_empty());
    }

    #[test]
    fn app_config_sanitizes_custom_scenes_and_active_scene() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["custom_scenes"] = serde_json::json!([
            {
                "id": "  custom_keep  ",
                "name": format!("  Scene\0{}  ", "x".repeat(100)),
                "description": format!("  Desc\0{}  ", "y".repeat(300)),
                "prompt_template": format!("  Prompt\0{}  ", "z".repeat(5000)),
                "created_at": "  2026-06-30T00:00:00.000Z  ",
                "updated_at": "  2026-06-30T00:00:00.000Z  "
            }
        ]);
        value["active_scene"] = serde_json::json!({
            "id": "  custom_keep  ",
            "source": "custom",
            "name": "  Active\0 Scene  ",
            "prompt_template": "  Use bullets.\0  "
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.custom_scenes.len(), 1);
        let scene = &config.custom_scenes[0];
        assert_eq!(scene.id, "custom_keep");
        assert_eq!(scene.name.chars().count(), 80);
        assert!(scene.name.starts_with("Scene"));
        assert!(!scene.name.contains('\0'));
        assert_eq!(scene.description.chars().count(), 240);
        assert_eq!(scene.prompt_template.chars().count(), 4000);

        let active_scene = config
            .active_scene
            .expect("active scene should remain valid");
        assert_eq!(active_scene.id, "custom_keep");
        assert_eq!(active_scene.name, "Active Scene");
        assert_eq!(active_scene.prompt_template, "Use bullets.");
    }

    #[test]
    fn app_config_clears_empty_active_scene() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["active_scene"] = serde_json::json!({
            "id": "custom_empty",
            "source": "custom",
            "name": "Empty",
            "prompt_template": "   \0  "
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert!(config.active_scene.is_none());
    }

    #[test]
    fn app_config_sanitizes_custom_polish_prompt_and_clears_chinese_script() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value["polish_custom_prompt"] = serde_json::json!("  use formal tone\0  ");
        value["polish_chinese_script"] = serde_json::json!("traditional");

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.polish_custom_prompt, "use formal tone");
        assert_eq!(config.polish_chinese_script, "preserve");
    }

    #[test]
    fn app_config_new_install_defaults_auto_start_and_dock_icon() {
        let config = AppConfig::new_install_default();
        assert!(config.auto_start);
        assert!(config.show_in_dock);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn app_config_new_install_uses_fn_toggle_on_macos() {
        let config = AppConfig::new_install_default();
        assert_eq!(config.hotkey, "Fn");
        assert_eq!(config.hotkeys.dictation.primary, "Fn");
        assert_eq!(config.hotkeys.dictation.modifiers, Vec::<String>::new());
        assert_eq!(config.hotkey_mode, "toggle");
        assert_eq!(config.hotkeys.dictation_mode, "toggle");
        assert_eq!(config.ask_hotkey, "Fn+Space");
        assert_eq!(
            config
                .hotkeys
                .ask
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string),
            Some("Fn+Space".to_string())
        );
        assert_eq!(
            config
                .hotkeys
                .translate
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string),
            Some("Fn+LeftShift".to_string())
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn app_config_new_install_keeps_ctrl_slash_on_windows() {
        let config = AppConfig::new_install_default();
        assert_eq!(config.hotkey, "Ctrl+/");
        assert_eq!(config.hotkeys.dictation.primary, "/");
        assert_eq!(config.hotkeys.dictation.modifiers, vec!["Ctrl".to_string()]);
        assert_eq!(config.hotkey_mode, "hold");
        assert_eq!(config.hotkeys.dictation_mode, "hold");
        assert_eq!(config.ask_hotkey, "Ctrl+.");
        assert_eq!(
            config
                .hotkeys
                .ask
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string),
            Some("Ctrl+.".to_string())
        );
        assert_eq!(
            config
                .hotkeys
                .translate
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string),
            Some("Ctrl+Shift+/".to_string())
        );
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    #[test]
    fn app_config_new_install_keeps_ctrl_slash_on_linux() {
        let config = AppConfig::new_install_default();
        assert_eq!(config.hotkey, "Ctrl+/");
        assert_eq!(config.hotkey_mode, "hold");
        assert_eq!(config.ask_hotkey, "Ctrl+.");
        assert_eq!(
            config
                .hotkeys
                .translate
                .as_ref()
                .and_then(ShortcutBinding::to_hotkey_string),
            Some("Ctrl+Shift+/".to_string())
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn app_config_migrates_old_mac_default_hotkey_to_fn() {
        let value = serde_json::json!({
            "hotkey": "Option+/",
            "ask_hotkey": "Command+.",
            "hotkey_mode": "hold"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.hotkey, "Fn");
        assert_eq!(config.hotkeys.dictation.primary, "Fn");
        assert_eq!(config.hotkeys.dictation.modifiers, Vec::<String>::new());
        assert_eq!(config.hotkey_mode, "toggle");
        assert_eq!(config.hotkeys.dictation_mode, "toggle");
    }

    #[test]
    fn app_config_preserves_custom_hotkey_during_native_default_migration() {
        let value = serde_json::json!({
            "hotkey": "Ctrl+Shift+;",
            "ask_hotkey": "Ctrl+.",
            "hotkey_mode": "hold"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.hotkey, "Ctrl+Shift+;");
        assert_eq!(config.hotkeys.dictation.primary, ";");
        assert_eq!(
            config.hotkeys.dictation.modifiers,
            vec!["Ctrl".to_string(), "Shift".to_string()]
        );
        assert_eq!(config.hotkey_mode, "hold");
        assert_eq!(config.hotkeys.dictation_mode, "hold");
    }

    #[test]
    fn app_config_tolerates_removed_capsule_auto_hide_field() {
        let value = serde_json::json!({
            "theme": "dark",
            "capsule_auto_hide": false
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.theme, "dark");
        let saved = serde_json::to_value(&config).unwrap();
        assert!(saved.get("capsule_auto_hide").is_none());
    }

    #[test]
    fn app_config_mute_output_while_recording_defaults_false_for_old_configs() {
        assert!(!AppConfig::default().mute_output_while_recording);
        let old = AppConfig::from_stored_value(serde_json::json!({ "theme": "dark" })).unwrap();
        assert!(!old.mute_output_while_recording);
        let on = AppConfig::from_stored_value(serde_json::json!({
            "mute_output_while_recording": true
        }))
        .unwrap();
        assert!(on.mute_output_while_recording);
    }

    #[test]
    fn app_config_show_in_dock_defaults_true_for_old_configs() {
        assert!(AppConfig::default().show_in_dock);
        let old = AppConfig::from_stored_value(serde_json::json!({ "theme": "dark" })).unwrap();
        assert!(old.show_in_dock);
        let off =
            AppConfig::from_stored_value(serde_json::json!({ "show_in_dock": false })).unwrap();
        assert!(!off.show_in_dock);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn app_config_migrates_legacy_mac_alt_slash_label() {
        let value = serde_json::json!({
            "hotkey": "Alt+/"
        });

        let config = AppConfig::from_stored_value(value).unwrap();

        assert_eq!(config.hotkey, "Option+/");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn app_config_migrates_legacy_mac_ask_hotkey_defaults() {
        for legacy in [
            "Alt+Shift+/",
            "Option+Shift+/",
            "Command+Shift+/",
            "Command+/",
            "Command+。",
        ] {
            let value = serde_json::json!({
                "ask_hotkey": legacy
            });

            let config = AppConfig::from_stored_value(value).unwrap();

            assert_eq!(config.ask_hotkey, "Fn+Space");
        }
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn app_config_migrates_legacy_non_macos_ask_hotkey_defaults() {
        for legacy in ["Ctrl+Shift+/", "Control+Shift+/", "Ctrl+/", "Control+/"] {
            let value = serde_json::json!({
                "ask_hotkey": legacy
            });

            let config = AppConfig::from_stored_value(value).unwrap();

            #[cfg(not(target_os = "macos"))]
            assert_eq!(config.ask_hotkey, "Ctrl+.");
        }
    }

    fn temp_dictionary_store(name: &str) -> DictionaryStore {
        let path = std::env::temp_dir().join(format!(
            "typelite-dictionary-test-{}-{}.sqlite",
            name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        DictionaryStore::new(path).unwrap()
    }

    #[tokio::test]
    async fn dictionary_store_persists_correction_rules() {
        let store = temp_dictionary_store("correction-rules");

        store.add_correction(" 拓肯 ", " Token ").await.unwrap();
        let rules = store.correction_rules().await.unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].pattern, "拓肯");
        assert_eq!(rules[0].replacement, "Token");
        assert!(rules[0].enabled);
    }

    #[tokio::test]
    async fn dictionary_store_ignores_disabled_correction_rules_for_prompt() {
        let store = temp_dictionary_store("correction-rules-disabled");

        store.add_correction("泰普莱特", "Typelite").await.unwrap();
        let rules = store.correction_rules().await.unwrap();
        store
            .set_correction_enabled(rules[0].id, false)
            .await
            .unwrap();

        let enabled = store.enabled_correction_rules().await;

        assert!(enabled.is_empty());
    }

    #[tokio::test]
    async fn dictionary_store_updates_entries_and_rejects_normalized_duplicates() {
        let store = temp_dictionary_store("updates");
        store.add("Token", None).await.unwrap();
        store.add("TalkMore", Some("talk more")).await.unwrap();
        let entries = store.list().await.unwrap();

        store
            .update(entries[0].id, "Typelite", Some("type light"))
            .await
            .unwrap();
        assert!(store
            .update(entries[0].id, "ＴＡＬＫＭＯＲＥ", None)
            .await
            .is_err());

        let updated = store.list().await.unwrap();
        assert_eq!(updated[0].word, "Typelite");
        assert_eq!(updated[0].pronunciation.as_deref(), Some("type light"));
    }

    #[tokio::test]
    async fn dictionary_store_updates_correction_pair_and_enabled_state() {
        let store = temp_dictionary_store("correction-updates");
        store.add_correction("token", "Token").await.unwrap();
        store.add_correction("talk more", "TalkMore").await.unwrap();
        let rules = store.correction_rules().await.unwrap();

        store
            .update_correction(rules[0].id, "type light", "Typelite", false)
            .await
            .unwrap();
        assert!(store
            .update_correction(rules[0].id, "ＴＡＬＫ ＭＯＲＥ", "talkmore", true)
            .await
            .is_err());

        let updated = store.correction_rules().await.unwrap();
        assert_eq!(updated[0].pattern, "type light");
        assert_eq!(updated[0].replacement, "Typelite");
        assert!(!updated[0].enabled);
    }

    #[test]
    fn app_config_input_device_defaults_to_system_default_and_is_trimmed() {
        assert_eq!(AppConfig::default().input_device, "");
        let mut config = AppConfig {
            input_device: "  USB Mic \n".to_string(),
            ..AppConfig::default()
        };
        config.normalize_values();
        assert_eq!(config.input_device, "USB Mic");
    }

    #[test]
    fn app_config_tolerates_removed_history_fields() {
        let value = serde_json::json!({
            "history_enabled": true,
            "history_retention_days": 30,
            "history_max_entries": 250,
            "ui_language": "zh"
        });
        let config = AppConfig::from_stored_value(value).unwrap();
        assert_eq!(config.ui_language, "zh");

        let saved = serde_json::to_value(&config).unwrap();
        assert!(saved.get("history_enabled").is_none());
        assert!(saved.get("history_retention_days").is_none());
        assert!(saved.get("history_max_entries").is_none());
    }

    #[tokio::test]
    async fn dictionary_store_drops_legacy_history_table_and_keeps_dictionary() {
        let path = std::env::temp_dir().join(format!(
            "typelite-legacy-history-drop-{}.sqlite",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    raw_text TEXT NOT NULL,
                    polished_text TEXT NOT NULL
                );
                CREATE INDEX idx_history_created ON history(created_at DESC);
                INSERT INTO history (created_at, raw_text, polished_text)
                    VALUES ('2026-07-01T00:00:00', 'secret words', 'Secret words.');
                CREATE TABLE dictionary (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word TEXT NOT NULL,
                    pronunciation TEXT
                );
                INSERT INTO dictionary (word) VALUES ('Typelite');",
            )
            .unwrap();
        }

        let store = DictionaryStore::new(path.clone()).unwrap();
        let words = store.list().await.unwrap();
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].word, "Typelite");

        let conn = Connection::open(&path).unwrap();
        let leftovers: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('history', 'idx_history_created')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(leftovers, 0);
        let _ = std::fs::remove_file(&path);
    }
}
