//! Plan `ask-translate-and-live-questions`: which language a spoken instruction asks for
//! ("translate this into Japanese", "翻譯成廣東話"), mapped to the translation codes in
//! `storage::SUPPORTED_TRANSLATION_LANGUAGES`.
//!
//! Chinese variants map to one of three codes: plain "Chinese" is Simplified (`zh-Hans`),
//! "Cantonese" / "Hong Kong" is `zh-Hant-HK` and "Taiwan(ese)" is `zh-Hant-TW`. A bare
//! "Traditional Chinese" names no region, so it becomes the first Traditional variant the user
//! chose, or `zh-Hant-HK` when they chose none.

/// The instruction sent to the AI when the user selects text, presses Translate and says
/// nothing: translate the selection into the target language.
pub const SELECTION_TRANSLATE_INSTRUCTION: &str =
    "Translate the selected text. Keep its meaning, tone and formatting.";

/// What a language name in speech stands for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Spoken {
    Code(&'static str),
    /// "Traditional Chinese" with no region.
    TraditionalChinese,
}

/// English names, lowercase. Longer phrases come first where they share a start with a
/// shorter one, but matching always prefers the longest phrase at a position anyway.
const ENGLISH_NAMES: &[(&str, Spoken)] = &[
    ("hong kong traditional chinese", Spoken::Code("zh-Hant-HK")),
    ("hong kong chinese", Spoken::Code("zh-Hant-HK")),
    ("hong kong cantonese", Spoken::Code("zh-Hant-HK")),
    ("hong kong", Spoken::Code("zh-Hant-HK")),
    ("hongkong", Spoken::Code("zh-Hant-HK")),
    ("cantonese", Spoken::Code("zh-Hant-HK")),
    ("taiwanese traditional chinese", Spoken::Code("zh-Hant-TW")),
    ("taiwan traditional chinese", Spoken::Code("zh-Hant-TW")),
    ("taiwanese chinese", Spoken::Code("zh-Hant-TW")),
    ("taiwanese mandarin", Spoken::Code("zh-Hant-TW")),
    ("taiwan chinese", Spoken::Code("zh-Hant-TW")),
    ("taiwanese", Spoken::Code("zh-Hant-TW")),
    ("taiwan", Spoken::Code("zh-Hant-TW")),
    ("traditional chinese", Spoken::TraditionalChinese),
    ("simplified chinese", Spoken::Code("zh-Hans")),
    ("mainland chinese", Spoken::Code("zh-Hans")),
    ("mandarin chinese", Spoken::Code("zh-Hans")),
    ("mandarin", Spoken::Code("zh-Hans")),
    ("chinese", Spoken::Code("zh-Hans")),
    ("english", Spoken::Code("en")),
    ("japanese", Spoken::Code("ja")),
    ("korean", Spoken::Code("ko")),
    ("french", Spoken::Code("fr")),
    ("german", Spoken::Code("de")),
    ("spanish", Spoken::Code("es")),
    ("portuguese", Spoken::Code("pt")),
    ("russian", Spoken::Code("ru")),
    ("arabic", Spoken::Code("ar")),
    ("hindi", Spoken::Code("hi")),
    ("thai", Spoken::Code("th")),
    ("vietnamese", Spoken::Code("vi")),
    ("italian", Spoken::Code("it")),
    ("dutch", Spoken::Code("nl")),
    ("turkish", Spoken::Code("tr")),
    // "polish" alone is usually the verb ("polish this"), so only these forms count.
    ("into polish", Spoken::Code("pl")),
    ("in polish", Spoken::Code("pl")),
    ("polish language", Spoken::Code("pl")),
    ("ukrainian", Spoken::Code("uk")),
    ("indonesian", Spoken::Code("id")),
    ("malay", Spoken::Code("ms")),
];

/// Chinese names, in Simplified and Traditional characters.
const CHINESE_NAMES: &[(&str, Spoken)] = &[
    // Hong Kong / Cantonese.
    ("香港繁体中文", Spoken::Code("zh-Hant-HK")),
    ("香港繁體中文", Spoken::Code("zh-Hant-HK")),
    ("香港繁体", Spoken::Code("zh-Hant-HK")),
    ("香港繁體", Spoken::Code("zh-Hant-HK")),
    ("香港中文", Spoken::Code("zh-Hant-HK")),
    ("港式中文", Spoken::Code("zh-Hant-HK")),
    ("香港话", Spoken::Code("zh-Hant-HK")),
    ("香港話", Spoken::Code("zh-Hant-HK")),
    ("广东话", Spoken::Code("zh-Hant-HK")),
    ("廣東話", Spoken::Code("zh-Hant-HK")),
    ("粤语", Spoken::Code("zh-Hant-HK")),
    ("粵語", Spoken::Code("zh-Hant-HK")),
    ("港式", Spoken::Code("zh-Hant-HK")),
    ("香港", Spoken::Code("zh-Hant-HK")),
    // Taiwan.
    ("台湾繁体中文", Spoken::Code("zh-Hant-TW")),
    ("台灣繁體中文", Spoken::Code("zh-Hant-TW")),
    ("台湾繁体", Spoken::Code("zh-Hant-TW")),
    ("台灣繁體", Spoken::Code("zh-Hant-TW")),
    ("台湾中文", Spoken::Code("zh-Hant-TW")),
    ("台灣中文", Spoken::Code("zh-Hant-TW")),
    ("台湾", Spoken::Code("zh-Hant-TW")),
    ("台灣", Spoken::Code("zh-Hant-TW")),
    ("臺灣", Spoken::Code("zh-Hant-TW")),
    // Traditional, no region.
    ("繁体中文", Spoken::TraditionalChinese),
    ("繁體中文", Spoken::TraditionalChinese),
    ("正体中文", Spoken::TraditionalChinese),
    ("正體中文", Spoken::TraditionalChinese),
    ("繁体字", Spoken::TraditionalChinese),
    ("繁體字", Spoken::TraditionalChinese),
    ("繁体", Spoken::TraditionalChinese),
    ("繁體", Spoken::TraditionalChinese),
    // Simplified.
    ("简体中文", Spoken::Code("zh-Hans")),
    ("簡體中文", Spoken::Code("zh-Hans")),
    ("简体字", Spoken::Code("zh-Hans")),
    ("簡體字", Spoken::Code("zh-Hans")),
    ("简体", Spoken::Code("zh-Hans")),
    ("簡體", Spoken::Code("zh-Hans")),
    ("普通话", Spoken::Code("zh-Hans")),
    ("普通話", Spoken::Code("zh-Hans")),
    ("中文", Spoken::Code("zh-Hans")),
    ("汉语", Spoken::Code("zh-Hans")),
    ("漢語", Spoken::Code("zh-Hans")),
    ("华语", Spoken::Code("zh-Hans")),
    ("華語", Spoken::Code("zh-Hans")),
    // Other languages.
    ("英文", Spoken::Code("en")),
    ("英语", Spoken::Code("en")),
    ("英語", Spoken::Code("en")),
    ("日本语", Spoken::Code("ja")),
    ("日本語", Spoken::Code("ja")),
    ("日文", Spoken::Code("ja")),
    ("日语", Spoken::Code("ja")),
    ("日語", Spoken::Code("ja")),
    ("韩国语", Spoken::Code("ko")),
    ("韓國語", Spoken::Code("ko")),
    ("韩文", Spoken::Code("ko")),
    ("韓文", Spoken::Code("ko")),
    ("韩语", Spoken::Code("ko")),
    ("韓語", Spoken::Code("ko")),
    ("法文", Spoken::Code("fr")),
    ("法语", Spoken::Code("fr")),
    ("法語", Spoken::Code("fr")),
    ("德文", Spoken::Code("de")),
    ("德语", Spoken::Code("de")),
    ("德語", Spoken::Code("de")),
    ("西班牙文", Spoken::Code("es")),
    ("西班牙语", Spoken::Code("es")),
    ("西班牙語", Spoken::Code("es")),
    ("葡萄牙文", Spoken::Code("pt")),
    ("葡萄牙语", Spoken::Code("pt")),
    ("葡萄牙語", Spoken::Code("pt")),
    ("俄文", Spoken::Code("ru")),
    ("俄语", Spoken::Code("ru")),
    ("俄語", Spoken::Code("ru")),
    ("阿拉伯文", Spoken::Code("ar")),
    ("阿拉伯语", Spoken::Code("ar")),
    ("阿拉伯語", Spoken::Code("ar")),
    ("印地文", Spoken::Code("hi")),
    ("印地语", Spoken::Code("hi")),
    ("印地語", Spoken::Code("hi")),
    ("泰文", Spoken::Code("th")),
    ("泰语", Spoken::Code("th")),
    ("泰語", Spoken::Code("th")),
    ("越南文", Spoken::Code("vi")),
    ("越南语", Spoken::Code("vi")),
    ("越南語", Spoken::Code("vi")),
    ("意大利文", Spoken::Code("it")),
    ("意大利语", Spoken::Code("it")),
    ("意大利語", Spoken::Code("it")),
    ("義大利文", Spoken::Code("it")),
    ("義大利語", Spoken::Code("it")),
    ("荷兰文", Spoken::Code("nl")),
    ("荷兰语", Spoken::Code("nl")),
    ("荷蘭文", Spoken::Code("nl")),
    ("荷蘭語", Spoken::Code("nl")),
    ("土耳其文", Spoken::Code("tr")),
    ("土耳其语", Spoken::Code("tr")),
    ("土耳其語", Spoken::Code("tr")),
    ("波兰文", Spoken::Code("pl")),
    ("波兰语", Spoken::Code("pl")),
    ("波蘭文", Spoken::Code("pl")),
    ("波蘭語", Spoken::Code("pl")),
    ("乌克兰文", Spoken::Code("uk")),
    ("乌克兰语", Spoken::Code("uk")),
    ("烏克蘭文", Spoken::Code("uk")),
    ("烏克蘭語", Spoken::Code("uk")),
    ("印度尼西亚语", Spoken::Code("id")),
    ("印度尼西亞語", Spoken::Code("id")),
    ("印尼文", Spoken::Code("id")),
    ("印尼语", Spoken::Code("id")),
    ("印尼語", Spoken::Code("id")),
    ("马来文", Spoken::Code("ms")),
    ("马来语", Spoken::Code("ms")),
    ("馬來文", Spoken::Code("ms")),
    ("馬來語", Spoken::Code("ms")),
];

fn is_word_char(character: char) -> bool {
    character.is_ascii_alphanumeric()
}

/// Every language name in `text` as `(start, end, meaning)`, taking the longest name at each
/// position and never overlapping. English names must stand as whole words.
fn find_names(text: &str) -> Vec<(usize, usize, Spoken)> {
    let lower = text.to_lowercase();
    // Treat line breaks and repeated spaces as one space so "hong  kong" still matches.
    let lower: String = lower.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut found = Vec::new();
    let mut index = 0;
    while index < lower.len() {
        let rest = &lower[index..];
        let before = lower[..index].chars().next_back();
        let mut best: Option<(usize, Spoken)> = None;
        for (name, meaning) in ENGLISH_NAMES {
            if !rest.starts_with(name) || before.is_some_and(is_word_char) {
                continue;
            }
            let after = rest[name.len()..].chars().next();
            if after.is_some_and(is_word_char) {
                continue;
            }
            if best.is_none_or(|(length, _)| name.len() > length) {
                best = Some((name.len(), *meaning));
            }
        }
        for (name, meaning) in CHINESE_NAMES {
            if rest.starts_with(name) && best.is_none_or(|(length, _)| name.len() > length) {
                best = Some((name.len(), *meaning));
            }
        }
        match best {
            Some((length, meaning)) => {
                found.push((index, index + length, meaning));
                index += length;
            }
            None => {
                index += rest.chars().next().map_or(1, char::len_utf8);
            }
        }
    }
    found
}

/// The target language named in `utterance`, as a translation code, or `None` when it names
/// none. With several names ("from English into Japanese") the last one wins, since the target
/// comes after "into" / "成" in both languages. `chosen_targets` is the user's language list,
/// used only to pick the region for a bare "Traditional Chinese".
pub fn spoken_translation_target(utterance: &str, chosen_targets: &[String]) -> Option<String> {
    let (_, _, meaning) = find_names(utterance).into_iter().last()?;
    Some(match meaning {
        Spoken::Code(code) => code.to_string(),
        Spoken::TraditionalChinese => chosen_targets
            .iter()
            .filter_map(|code| crate::storage::normalize_translation_code(code))
            .find(|code| code.starts_with("zh-Hant"))
            .unwrap_or_else(|| "zh-Hant-HK".to_string()),
    })
}

/// Where the target of a selection translation came from (logged, never the text).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetSource {
    /// The user named the language.
    Speech,
    /// The active translation language (after any Switch language presses).
    Active,
}

impl TargetSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Speech => "speech",
            Self::Active => "active",
        }
    }
}

/// The target language of a selection translation: a language named in speech, else the
/// active translation language. `utterance` is empty when the user said nothing.
pub fn resolve_selection_translation_target(
    utterance: &str,
    active_target: &str,
    chosen_targets: &[String],
) -> (String, TargetSource) {
    match spoken_translation_target(utterance, chosen_targets) {
        Some(code) => (code, TargetSource::Speech),
        None => (active_target.to_string(), TargetSource::Active),
    }
}

/// Plan `translate-selection-panel`: whether an Ask instruction about a highlight asks for its
/// translation ("translate to English", "translate this", "what does this say in Japanese",
/// "翻译成英文", "翻譯一下", "英語に翻訳して"). The translation then shows in the Ask panel.
///
/// The instruction must start with a translate verb, after optional openings ("please",
/// "can you", "请", "帮我把这段"), so "don't translate this" or "why is this translated so
/// badly" stay questions. When it names no language Typelite knows, it must be only the verb
/// ("translate this", "翻译一下"): "translate this to Klingon" names a language Typelite cannot
/// map, so it is not quietly translated into the default language; it stays an Ask answer.
pub fn is_selection_translation_request(utterance: &str) -> bool {
    let names_language = !find_names(utterance).is_empty();
    let lower = utterance.trim().to_lowercase();
    let text: String = lower.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = text.trim_matches(|c: char| c.is_ascii_punctuation() || "，。！？：、 ".contains(c));

    // English: "please translate this to English", "what does this say in Japanese".
    let mut rest = text;
    for _ in 0..4 {
        match ENGLISH_OPENINGS
            .iter()
            .find(|lead| rest.starts_with(**lead))
        {
            Some(lead) => rest = rest[lead.len()..].trim_start_matches([' ', ',']),
            None => break,
        }
    }
    if let Some(after) = rest.strip_prefix("translate") {
        if after.is_empty() || after.starts_with(' ') {
            return names_language || is_bare_object(after, ENGLISH_BARE_OBJECTS);
        }
    }
    if names_language && ENGLISH_SAY_IN.iter().any(|lead| rest.starts_with(lead)) {
        return true;
    }

    // Chinese and Japanese: "请帮我把这段翻译成英文", "翻譯一下", "英語に翻訳して".
    let mut rest = text;
    for _ in 0..4 {
        rest = rest.trim_start_matches(|c: char| c.is_whitespace() || "，,：:".contains(c));
        match CHINESE_OPENINGS
            .iter()
            .find(|lead| rest.starts_with(**lead))
        {
            Some(lead) => rest = &rest[lead.len()..],
            None => break,
        }
    }
    for verb in ["翻译", "翻譯"] {
        if let Some(after) = rest.strip_prefix(verb) {
            return names_language || is_bare_object(after, CHINESE_BARE_OBJECTS);
        }
    }
    // Japanese puts the verb last: "英語に翻訳して", "翻訳して".
    if text.contains("翻訳") {
        return names_language || text.starts_with("翻訳");
    }
    false
}

/// Openings before an English instruction; they can stack ("hey, can you please").
const ENGLISH_OPENINGS: &[&str] = &[
    "please",
    "can you",
    "could you",
    "would you",
    "will you",
    "hey",
    // "okay" before "ok", which is its prefix.
    "okay",
    "ok",
    "now",
];

/// "What does this say in Japanese": a translation only when a known language follows.
const ENGLISH_SAY_IN: &[&str] = &[
    "what does this say in ",
    "what does it say in ",
    "what is this in ",
    "what's this in ",
    "say this in ",
    "how do you say this in ",
];

/// What may follow a bare "translate" when no language is named.
const ENGLISH_BARE_OBJECTS: &[&str] = &[
    "this",
    "it",
    "that",
    "the selection",
    "the highlight",
    "the text",
    "this text",
    "this for me",
    "it for me",
    "for me",
    "please",
    "this please",
    "it please",
];

/// Openings before a Chinese instruction ("请", "帮我", "把这段"); they can stack.
const CHINESE_OPENINGS: &[&str] = &[
    "请",
    "請",
    "帮我",
    "幫我",
    "麻烦",
    "麻煩",
    "可以",
    "能不能",
    "把这段",
    "把這段",
    "把这个",
    "把這個",
    "将这段",
    "將這段",
    "把它",
    "把",
];

/// What may follow a bare "翻译" when no language is named.
const CHINESE_BARE_OBJECTS: &[&str] = &[
    "一下",
    "下",
    "这段",
    "這段",
    "这个",
    "這個",
    "它",
    "吧",
    "一下吧",
    "一下这段",
    "一下這段",
];

/// Whether `after` (what follows the verb) is empty or only a plain object like "this".
fn is_bare_object(after: &str, objects: &[&str]) -> bool {
    let after = after.trim_matches(|c: char| c.is_whitespace() || c.is_ascii_punctuation());
    after.is_empty() || objects.contains(&after)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(utterance: &str) -> Option<String> {
        spoken_translation_target(utterance, &[])
    }

    #[test]
    fn english_language_names_map_to_codes() {
        assert_eq!(
            target("translate this into Japanese").as_deref(),
            Some("ja")
        );
        assert_eq!(target("Translate this to French.").as_deref(), Some("fr"));
        assert_eq!(target("make it German please").as_deref(), Some("de"));
        assert_eq!(target("translate this").as_deref(), None);
        assert_eq!(target("").as_deref(), None);
    }

    #[test]
    fn chinese_variants_spoken_in_english_map_to_the_three_codes() {
        for (utterance, expected) in [
            ("translate this into Chinese", "zh-Hans"),
            ("translate this into Simplified Chinese", "zh-Hans"),
            ("translate this into Mandarin", "zh-Hans"),
            ("translate this into Hong Kong Chinese", "zh-Hant-HK"),
            ("translate this into Cantonese", "zh-Hant-HK"),
            ("translate this into Taiwanese Chinese", "zh-Hant-TW"),
            ("translate this into Taiwanese", "zh-Hant-TW"),
            ("translate to Taiwan Chinese", "zh-Hant-TW"),
            ("translate this into Traditional Chinese", "zh-Hant-HK"),
        ] {
            assert_eq!(target(utterance).as_deref(), Some(expected), "{utterance}");
        }
    }

    #[test]
    fn chinese_variants_spoken_in_chinese_map_to_the_three_codes() {
        for (utterance, expected) in [
            ("把这段翻译成中文", "zh-Hans"),
            ("把这段翻译成简体中文", "zh-Hans"),
            ("把這段翻譯成繁體中文", "zh-Hant-HK"),
            ("翻譯成廣東話", "zh-Hant-HK"),
            ("翻译成粤语", "zh-Hant-HK"),
            ("翻譯成香港中文", "zh-Hant-HK"),
            ("翻譯成台灣中文", "zh-Hant-TW"),
            ("翻译成台湾繁体", "zh-Hant-TW"),
            ("把這段翻譯成日文", "ja"),
            ("翻译成英文", "en"),
        ] {
            assert_eq!(target(utterance).as_deref(), Some(expected), "{utterance}");
        }
    }

    #[test]
    fn traditional_chinese_follows_the_users_chosen_region() {
        let chosen = vec!["en".to_string(), "zh-Hant-TW".to_string()];
        assert_eq!(
            spoken_translation_target("translate into traditional chinese", &chosen).as_deref(),
            Some("zh-Hant-TW")
        );
        assert_eq!(
            spoken_translation_target("翻譯成繁體", &chosen).as_deref(),
            Some("zh-Hant-TW")
        );
    }

    #[test]
    fn the_last_named_language_is_the_target() {
        assert_eq!(
            target("translate this from English into Japanese").as_deref(),
            Some("ja")
        );
        assert_eq!(target("把英文翻譯成日文").as_deref(), Some("ja"));
    }

    #[test]
    fn english_names_need_whole_words() {
        // "thai" inside "thailand", "polish" as the verb inside "polished" etc.
        assert_eq!(target("the polished draft").as_deref(), None);
        assert_eq!(target("englishman").as_deref(), None);
        assert_eq!(target("Thailand trip").as_deref(), None);
        assert_eq!(target("polish this paragraph").as_deref(), None);
        assert_eq!(target("translate this into Polish").as_deref(), Some("pl"));
    }

    #[test]
    fn selection_target_prefers_speech_then_the_active_language() {
        let chosen = vec!["en".to_string(), "ja".to_string()];
        assert_eq!(
            resolve_selection_translation_target("into Cantonese please", "ja", &chosen),
            ("zh-Hant-HK".to_string(), TargetSource::Speech)
        );
        assert_eq!(
            resolve_selection_translation_target("make it shorter", "ja", &chosen),
            ("ja".to_string(), TargetSource::Active)
        );
        // No speech at all.
        assert_eq!(
            resolve_selection_translation_target("", "en", &chosen),
            ("en".to_string(), TargetSource::Active)
        );
    }

    #[test]
    fn translation_requests_on_a_highlight_are_recognised() {
        for utterance in [
            "Translate to English.",
            "translate this into Japanese",
            "Please translate this to French",
            "Can you translate it into Traditional Chinese?",
            "translate",
            "Translate this.",
            "translate this for me",
            "What does this say in English?",
            "翻译成英文",
            "请帮我把这段翻译成日文",
            "翻譯一下",
            "幫我翻譯成廣東話",
            "翻译",
            "英語に翻訳して",
            "翻訳して",
        ] {
            assert!(
                is_selection_translation_request(utterance),
                "{utterance} should be a translation request"
            );
        }
    }

    #[test]
    fn questions_and_unknown_languages_are_not_translation_requests() {
        for utterance in [
            "Don't translate this",
            "Why is this translated so badly?",
            "What does this mean?",
            "Summarise this",
            "translate this to Klingon",
            "translate this into a pirate voice",
            "make this shorter",
            "这段是什么意思",
            "翻译成火星文",
            "What does this say?",
            "",
        ] {
            assert!(
                !is_selection_translation_request(utterance),
                "{utterance} should not be a translation request"
            );
        }
    }
}
