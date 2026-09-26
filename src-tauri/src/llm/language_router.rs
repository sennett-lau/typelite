//! Plan `language-prompt-library`: the user's chosen languages as the prompt sees them
//! (effective instructions and recognition data), and the polish router that picks at most one
//! of them for a dictation.
//!
//! Router steps, over the languages that are on and apply to polish, in list order:
//! 1. hints: the language with the most of its hints (preset + user) found in the transcript;
//! 2. else the first language whose speech codes include the detected language and that does
//!    not require a hint;
//! 3. else none: plain polish.

use crate::llm::language_library::{self, store::LibraryStore};
use crate::storage::AppConfig;

/// Where a language's instructions come from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstructionsSource {
    /// The built-in default in `llm::prompt`.
    Builtin,
    /// A downloaded library preset, as rendered.
    Preset { id: String, version: i64 },
    /// The user's own text (maybe based on a preset).
    Edited,
}

/// One chosen language, resolved.
#[derive(Debug, Clone, PartialEq)]
pub struct LanguageProfile {
    pub code: String,
    /// Off: plain translation and no polish notes.
    pub enabled: bool,
    /// The effective instructions: the user's text, the rendered preset, or the built-in default.
    pub instructions: String,
    pub source: InstructionsSource,
    /// Speech codes from the preset (none without one).
    pub detect_codes: Vec<String>,
    /// The preset's hints, then the user's own.
    pub hints: Vec<String>,
    pub require_hint: bool,
    /// Takes part in polish routing (a preset meant only for translation does not, unless the
    /// user edited its text).
    pub polish: bool,
}

/// Resolves every chosen language in list order. `store` is where downloaded presets live; a
/// missing or damaged preset falls back to the built-in default (and is logged).
pub fn language_profiles(config: &AppConfig, store: Option<&LibraryStore>) -> Vec<LanguageProfile> {
    config
        .translation
        .targets
        .iter()
        .map(|code| language_profile(config, store, code))
        .collect()
}

/// Resolves one language code (chosen or not).
pub fn language_profile(
    config: &AppConfig,
    store: Option<&LibraryStore>,
    code: &str,
) -> LanguageProfile {
    let settings = config
        .translation
        .language(code)
        .cloned()
        .unwrap_or_default();
    let preset = settings.library_preset.as_ref().and_then(|reference| {
        let store = store?;
        match store.load_preset(&reference.id, &reference.sha256) {
            Ok(preset) => Some(preset),
            Err(error) => {
                tracing::warn!(
                    "Language {code}: preset {} v{} is not usable ({error:?}); using the \
                     built-in instructions",
                    reference.id,
                    reference.version
                );
                None
            }
        }
    });
    let (instructions, source) = match (&settings.instructions, &preset) {
        (Some(text), _) => (text.clone(), InstructionsSource::Edited),
        (None, Some(preset)) => (
            language_library::render_for_code(preset, code),
            InstructionsSource::Preset {
                id: preset.id.clone(),
                version: preset.version,
            },
        ),
        (None, None) => (
            crate::llm::prompt::default_translation_instructions(code),
            InstructionsSource::Builtin,
        ),
    };
    let mut hints = preset
        .as_ref()
        .map(|preset| preset.hints.clone())
        .unwrap_or_default();
    for hint in &settings.user_hints {
        if !hints.contains(hint) {
            hints.push(hint.clone());
        }
    }
    LanguageProfile {
        code: code.to_string(),
        enabled: settings.enabled,
        instructions,
        source,
        detect_codes: preset
            .as_ref()
            .map(|preset| preset.detect_codes.clone())
            .unwrap_or_default(),
        hints,
        require_hint: preset.as_ref().is_some_and(|preset| preset.require_hint),
        polish: preset
            .as_ref()
            .is_none_or(|preset| preset.applies_to_polish() || settings.instructions.is_some()),
    }
}

/// The router's decision for one dictation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// `index` into the profiles; `found` distinct hints matched.
    Hint { index: usize, found: usize },
    /// `index` into the profiles, picked by the detected speech code.
    Detected { index: usize, code: String },
    /// No language: the detected code belongs to a language that requires a hint.
    NeedsHint { detected: String, language: String },
    /// No language: the detected code is not one of the languages.
    NotChosen { detected: String },
    /// No language: nothing was detected and no hint matched.
    Nothing,
}

impl Route {
    /// The chosen profile index, if any.
    pub fn index(&self) -> Option<usize> {
        match self {
            Route::Hint { index, .. } | Route::Detected { index, .. } => Some(*index),
            _ => None,
        }
    }

    /// The log line: codes, names and counts only, never text.
    pub fn describe(&self, profiles: &[LanguageProfile]) -> String {
        let code = |index: &usize| {
            profiles
                .get(*index)
                .map(|profile| profile.code.as_str())
                .unwrap_or("?")
        };
        match self {
            Route::Hint { index, found } => format!("{} (hint, {found} found)", code(index)),
            Route::Detected {
                index,
                code: detected,
            } => {
                format!("{} (detected {detected})", code(index))
            }
            Route::NeedsHint { detected, language } => {
                format!("none (detected {detected}; {language} needs a hint)")
            }
            Route::NotChosen { detected } => {
                format!("none (detected {detected}; not one of the languages)")
            }
            Route::Nothing => "none (no language detected, no hint)".to_string(),
        }
    }
}

/// Picks the language of `transcript` among `profiles` (see the module docs). `detected` is the
/// speech code the recognizer reported, if any.
pub fn route(profiles: &[LanguageProfile], transcript: &str, detected: Option<&str>) -> Route {
    let candidates: Vec<(usize, &LanguageProfile)> = profiles
        .iter()
        .enumerate()
        .filter(|(_, profile)| profile.enabled && profile.polish)
        .collect();

    let mut best: Option<(usize, usize)> = None;
    for (index, profile) in &candidates {
        let found = count_hints(&profile.hints, transcript);
        if found > 0 && best.is_none_or(|(_, most)| found > most) {
            best = Some((*index, found));
        }
    }
    if let Some((index, found)) = best {
        return Route::Hint { index, found };
    }

    let Some(detected) = detected.map(str::trim).filter(|code| !code.is_empty()) else {
        return Route::Nothing;
    };
    let hears = |profile: &LanguageProfile| profile.detect_codes.iter().any(|c| c == detected);
    if let Some((index, _)) = candidates
        .iter()
        .find(|(_, profile)| hears(profile) && !profile.require_hint)
    {
        return Route::Detected {
            index: *index,
            code: detected.to_string(),
        };
    }
    match candidates.iter().find(|(_, profile)| hears(profile)) {
        Some((_, profile)) => Route::NeedsHint {
            detected: detected.to_string(),
            language: profile.code.clone(),
        },
        None => Route::NotChosen {
            detected: detected.to_string(),
        },
    }
}

/// Distinct hints found in `transcript`.
pub fn count_hints(hints: &[String], transcript: &str) -> usize {
    let lower = transcript.to_lowercase();
    hints
        .iter()
        .filter(|hint| !hint.is_empty() && hint_matches(&hint.to_lowercase(), &lower))
        .count()
}

/// Scripts written with spaces between words: a hint in one of them must match a whole word.
/// Chinese, Japanese, Thai and similar are matched anywhere.
fn is_spaced_letter(c: char) -> bool {
    let code = c as u32;
    c.is_alphanumeric()
        && code < 0x2E80
        && !(0x0E00..=0x109F).contains(&code)
        && !(0x1780..=0x17FF).contains(&code)
}

fn hint_matches(hint: &str, text: &str) -> bool {
    if !hint.chars().all(is_spaced_letter) {
        return text.contains(hint);
    }
    text.match_indices(hint).any(|(start, found)| {
        let before = text[..start].chars().next_back();
        let after = text[start + found.len()..].chars().next();
        !before.is_some_and(is_spaced_letter) && !after.is_some_and(is_spaced_letter)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::language_library::store::tests::temp_store;
    use crate::storage::{LibraryPresetRef, TranslationLanguageSettings};

    fn repository_preset(id: &str) -> Vec<u8> {
        std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../presets/languages/{id}/preset.md")),
        )
        .unwrap()
    }

    /// Hong Kong Chinese with the Cantonese preset, then English with the English preset (the
    /// mock's setup), with the presets stored in a temp library.
    fn mock_setup(user_hints: &[&str]) -> (AppConfig, LibraryStore) {
        let store = temp_store("router");
        let mut config = AppConfig::default();
        config.translation.targets = vec!["zh-Hant-HK".to_string(), "en".to_string()];
        for (code, id) in [("zh-Hant-HK", "cantonese-hong-kong"), ("en", "english")] {
            let bytes = repository_preset(id);
            let sha256 = store.store_preset(id, &bytes).unwrap();
            let version = language_library::parse_preset(id, &bytes).unwrap().version;
            config.translation.languages.insert(
                code.to_string(),
                TranslationLanguageSettings {
                    library_preset: Some(LibraryPresetRef {
                        id: id.to_string(),
                        version,
                        sha256,
                    }),
                    user_hints: if code == "zh-Hant-HK" {
                        user_hints.iter().map(|h| h.to_string()).collect()
                    } else {
                        Vec::new()
                    },
                    ..TranslationLanguageSettings::default()
                },
            );
        }
        (config, store)
    }

    fn routed(config: &AppConfig, store: &LibraryStore, text: &str, heard: &str) -> Option<String> {
        let profiles = language_profiles(config, Some(store));
        route(&profiles, text, Some(heard))
            .index()
            .map(|index| profiles[index].code.clone())
    }

    /// The mock's five cases.
    #[test]
    fn the_mock_cases_route_as_agreed() {
        let (config, store) = mock_setup(&[]);
        assert_eq!(
            routed(&config, &store, "我今日好忙，唔得閒食飯", "zh").as_deref(),
            Some("zh-Hant-HK")
        );
        // Mandarin: `zh`, no Cantonese hint, and Hong Kong requires one.
        assert_eq!(routed(&config, &store, "我今天很忙，没空吃饭", "zh"), None);
        assert_eq!(
            routed(
                &config,
                &store,
                "Can you check the deadline for the proposal?",
                "en"
            )
            .as_deref(),
            Some("en")
        );
        // 聽日 is a preset hint.
        assert_eq!(
            routed(&config, &store, "我聽日要present個proposal", "zh").as_deref(),
            Some("zh-Hant-HK")
        );
        assert_eq!(
            routed(
                &config,
                &store,
                "¿Podemos vernos mañana por la tarde?",
                "es"
            ),
            None
        );
    }

    #[test]
    fn route_reasons_are_logged_without_text() {
        let (config, store) = mock_setup(&[]);
        let profiles = language_profiles(&config, Some(&store));
        let text = "我今日好忙，唔得閒食飯";
        let hint = route(&profiles, text, Some("zh"));
        assert_eq!(hint, Route::Hint { index: 0, found: 2 });
        assert_eq!(hint.describe(&profiles), "zh-Hant-HK (hint, 2 found)");
        assert!(!hint.describe(&profiles).contains(text));
        let needs = route(&profiles, "我今天很忙", Some("zh"));
        assert_eq!(
            needs.describe(&profiles),
            "none (detected zh; zh-Hant-HK needs a hint)"
        );
        assert_eq!(
            route(&profiles, "hola", Some("es")).describe(&profiles),
            "none (detected es; not one of the languages)"
        );
        assert_eq!(route(&profiles, "hola", None), Route::Nothing);
        assert_eq!(
            route(&profiles, "hello", Some("en")),
            Route::Detected {
                index: 1,
                code: "en".into()
            }
        );
    }

    #[test]
    fn user_hints_count_and_off_languages_are_skipped() {
        let (mut config, store) = mock_setup(&["没空"]);
        // The user's own hint makes this Mandarin sentence route to Hong Kong.
        assert_eq!(
            routed(&config, &store, "我今天很忙，没空吃饭", "zh").as_deref(),
            Some("zh-Hant-HK")
        );
        // Off: no longer a candidate, by hint or by code.
        config
            .translation
            .languages
            .get_mut("zh-Hant-HK")
            .unwrap()
            .enabled = false;
        assert_eq!(routed(&config, &store, "我今天很忙，没空吃饭", "zh"), None);
        config.translation.languages.get_mut("en").unwrap().enabled = false;
        assert_eq!(routed(&config, &store, "hello", "en"), None);
    }

    #[test]
    fn most_hints_win_then_list_order() {
        let profile = |code: &str, hints: &[&str]| LanguageProfile {
            code: code.into(),
            enabled: true,
            instructions: String::new(),
            source: InstructionsSource::Builtin,
            detect_codes: vec!["zh".into()],
            hints: hints.iter().map(|h| h.to_string()).collect(),
            require_hint: false,
            polish: true,
        };
        let profiles = vec![profile("a", &["嘅"]), profile("b", &["嘅", "咗"])];
        assert_eq!(route(&profiles, "佢食咗嘅", None).index(), Some(1));
        assert_eq!(route(&profiles, "嘅", None).index(), Some(0));
        // Detected code: the first in list order that does not require a hint.
        assert_eq!(route(&profiles, "x", Some("zh")).index(), Some(0));
    }

    #[test]
    fn word_hints_match_whole_words_only() {
        let hints = vec!["arvo".to_string(), "嘅".to_string()];
        assert_eq!(count_hints(&hints, "See you this Arvo!"), 1);
        assert_eq!(count_hints(&hints, "carvolution"), 0);
        assert_eq!(count_hints(&hints, "佢嘅書"), 1);
        assert_eq!(count_hints(&hints, "arvo 嘅"), 2);
    }

    #[test]
    fn languages_without_a_preset_route_only_by_user_hints() {
        let mut config = AppConfig::default();
        config.translation.targets = vec!["en".to_string(), "ja".to_string()];
        let profiles = language_profiles(&config, None);
        assert_eq!(profiles[0].source, InstructionsSource::Builtin);
        assert!(profiles[0].detect_codes.is_empty());
        assert_eq!(route(&profiles, "hello", Some("en")).index(), None);

        config.translation.languages.insert(
            "ja".to_string(),
            TranslationLanguageSettings {
                user_hints: vec!["です".to_string()],
                instructions: Some("Polite Japanese.".to_string()),
                ..TranslationLanguageSettings::default()
            },
        );
        let profiles = language_profiles(&config, None);
        assert_eq!(profiles[1].source, InstructionsSource::Edited);
        assert_eq!(profiles[1].instructions, "Polite Japanese.");
        assert_eq!(route(&profiles, "そうです", Some("ja")).index(), Some(1));
    }

    #[test]
    fn a_missing_preset_file_falls_back_to_the_built_in_text() {
        let (config, _) = mock_setup(&[]);
        let empty = temp_store("router-empty");
        let profiles = language_profiles(&config, Some(&empty));
        assert_eq!(profiles[0].source, InstructionsSource::Builtin);
        assert_eq!(
            profiles[0].instructions,
            crate::llm::prompt::default_translation_instructions("zh-Hant-HK")
        );
        assert!(profiles[0].detect_codes.is_empty());
    }

    #[test]
    fn a_preset_is_rendered_for_the_language() {
        let (config, store) = mock_setup(&["得閒"]);
        let profiles = language_profiles(&config, Some(&store));
        let hk = &profiles[0];
        assert_eq!(
            hk.source,
            InstructionsSource::Preset {
                id: "cantonese-hong-kong".into(),
                version: 2
            }
        );
        assert!(hk.instructions.starts_with("Written Cantonese"));
        assert_eq!(hk.detect_codes, ["yue", "zh"]);
        assert!(hk.require_hint);
        // The user's hint is already a preset hint: listed once.
        assert_eq!(hk.hints.iter().filter(|h| *h == "得閒").count(), 1);
    }
}
