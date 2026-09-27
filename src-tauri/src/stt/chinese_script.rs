//! Plan `qwen3-asr-support`: writes a transcript in the Chinese characters of the language the
//! language router picked for it. Qwen3-ASR, for example, writes Cantonese in Simplified
//! characters; a user whose language is Cantonese (Hong Kong) gets Hong Kong Traditional ones.
//!
//! Conversion is OpenCC's (the pure-Rust `ferrous-opencc`, with OpenCC's dictionaries built in):
//! characters only, no vocabulary changes. For Cantonese, two fixes follow that OpenCC cannot make
//! because it converts for written Chinese: 係 ("is") for 系/繫, and 覆 ("reply") for 復.

use std::sync::OnceLock;

use ferrous_opencc::config::BuiltinConfig;
use ferrous_opencc::OpenCC;

/// The characters a Chinese language is written in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChineseScript {
    /// Hong Kong Traditional, for Cantonese (Hong Kong).
    HongKong,
    /// Taiwan Traditional.
    Taiwan,
    Simplified,
}

impl ChineseScript {
    /// The script of a language code from the user's language list, or `None` for a language
    /// that is not Chinese or does not fix a script (plain `zh`).
    pub fn for_language(code: &str) -> Option<Self> {
        let lower = code.trim().to_ascii_lowercase();
        let mut parts = lower.split(['-', '_']);
        let language = parts.next()?;
        let rest: Vec<&str> = parts.collect();
        let has = |tag: &str| rest.contains(&tag);
        match language {
            "yue" => Some(if has("hans") {
                Self::Simplified
            } else {
                Self::HongKong
            }),
            "zh" if has("hans") || has("cn") || has("sg") => Some(Self::Simplified),
            "zh" if has("hk") || has("mo") => Some(Self::HongKong),
            "zh" if has("tw") || has("hant") => Some(Self::Taiwan),
            _ => None,
        }
    }

    fn converter(self) -> &'static OpenCC {
        static HONG_KONG: OnceLock<OpenCC> = OnceLock::new();
        static TAIWAN: OnceLock<OpenCC> = OnceLock::new();
        static SIMPLIFIED: OnceLock<OpenCC> = OnceLock::new();
        let (cell, config) = match self {
            Self::HongKong => (&HONG_KONG, BuiltinConfig::S2hk),
            Self::Taiwan => (&TAIWAN, BuiltinConfig::S2tw),
            Self::Simplified => (&SIMPLIFIED, BuiltinConfig::T2s),
        };
        cell.get_or_init(|| OpenCC::from_config(config).expect("built-in OpenCC config loads"))
    }
}

/// Words in which 系 or 繫 really is 系 or 繫. Everywhere else, Cantonese means 係 ("is").
const KEEP_XI: &[&str] = &[
    "系統",
    "系列",
    "系數",
    "體系",
    "派系",
    "科系",
    "學系",
    "聯繫",
    "維繫",
    "關係",
    "直系",
    "星系",
    "太陽系",
];
/// 復 before these means 覆, "reply" (覆你, 覆返個email).
const REPLY_AFTER: &[char] = &['你', '佢', '我', '返', '個'];

/// `text` in the characters of `script`. Text without Chinese characters comes back as it is.
pub fn convert(text: &str, script: ChineseScript) -> String {
    if !text.chars().any(is_han) {
        return text.to_string();
    }
    let converted = script.converter().convert(text);
    match script {
        ChineseScript::HongKong => cantonese_fixes(&converted),
        _ => converted,
    }
}

fn cantonese_fixes(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    'outer: while i < chars.len() {
        let c = chars[i];
        if c == '系' || c == '繫' {
            for word in KEEP_XI {
                let word: Vec<char> = word.chars().collect();
                for (offset, &wc) in word.iter().enumerate() {
                    if wc != c || offset > i || i - offset + word.len() > chars.len() {
                        continue;
                    }
                    if chars[i - offset..i - offset + word.len()] == word[..] {
                        out.push(c);
                        i += 1;
                        continue 'outer;
                    }
                }
            }
            out.push('係');
        } else if c == '復'
            && chars
                .get(i + 1)
                .is_some_and(|next| REPLY_AFTER.contains(next))
        {
            out.push('覆');
        } else {
            out.push(c);
        }
        i += 1;
    }
    out
}

fn is_han(c: char) -> bool {
    matches!(c as u32, 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0x20000..=0x2FA1F)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn languages_map_to_their_scripts() {
        assert_eq!(
            ChineseScript::for_language("zh-Hant-HK"),
            Some(ChineseScript::HongKong)
        );
        assert_eq!(
            ChineseScript::for_language("yue-Hant-HK"),
            Some(ChineseScript::HongKong)
        );
        assert_eq!(
            ChineseScript::for_language("yue"),
            Some(ChineseScript::HongKong)
        );
        assert_eq!(
            ChineseScript::for_language("zh-Hant-TW"),
            Some(ChineseScript::Taiwan)
        );
        assert_eq!(
            ChineseScript::for_language("zh-Hant"),
            Some(ChineseScript::Taiwan)
        );
        assert_eq!(
            ChineseScript::for_language("zh-Hans"),
            Some(ChineseScript::Simplified)
        );
        assert_eq!(
            ChineseScript::for_language("zh-CN"),
            Some(ChineseScript::Simplified)
        );
        assert_eq!(ChineseScript::for_language("zh"), None);
        assert_eq!(ChineseScript::for_language("en"), None);
        assert_eq!(ChineseScript::for_language("ja"), None);
    }

    #[test]
    fn qwen3_asr_cantonese_becomes_hong_kong_cantonese() {
        assert_eq!(
            convert(
                "我一直都keep住试紧广东话，但出嚟嘅效果好似唔系咁好咯。",
                ChineseScript::HongKong
            ),
            "我一直都keep住試緊廣東話，但出嚟嘅效果好似唔係咁好咯。"
        );
        assert_eq!(
            convert(
                "我仲未睇到你send嚟嘅file，等阵再复你。",
                ChineseScript::HongKong
            ),
            "我仲未睇到你send嚟嘅file，等陣再覆你。"
        );
        assert_eq!(
            convert("佢成日都迟到，真系好烦。", ChineseScript::HongKong),
            "佢成日都遲到，真係好煩。"
        );
    }

    #[test]
    fn real_xi_words_keep_their_character() {
        assert_eq!(
            convert("呢个系统同佢哋嘅关系系咁嘅", ChineseScript::HongKong),
            "呢個系統同佢哋嘅關係係咁嘅"
        );
        assert_eq!(convert("恢复系列", ChineseScript::HongKong), "恢復系列");
    }

    #[test]
    fn taiwan_and_simplified_have_no_cantonese_fixes() {
        assert_eq!(
            convert("我们明天开会", ChineseScript::Taiwan),
            "我們明天開會"
        );
        assert_eq!(
            convert("我們明天開會，聽日見", ChineseScript::Simplified),
            "我们明天开会，听日见"
        );
        assert_eq!(convert("这是系统", ChineseScript::Taiwan), "這是系統");
    }

    #[test]
    fn text_without_chinese_is_unchanged() {
        assert_eq!(
            convert("Hello there.", ChineseScript::HongKong),
            "Hello there."
        );
        assert_eq!(convert("", ChineseScript::Simplified), "");
    }
}
