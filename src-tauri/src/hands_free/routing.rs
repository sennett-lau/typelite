//! Plan `hands-free-mode` (routing.md): what a hands-free request is, by its meaning.
//!
//! A hands-free request is recorded like Ask anything and then routed:
//!
//! - "type …" / "dictate …" / "write down …" (Cantonese 打 / 寫低, Mandarin 输入 / 写下 …):
//!   dictate the rest into the focused app, as the Dictate shortcut would.
//! - "write …" without a draft object ("write I'll be there at six"): dictate as well. "Write an
//!   email to …" / 写一封 … stays Ask's draft command.
//! - "open …" / "switch to …" (打开 / 切換到 …): a voice command, when that feature exists.
//!   Until then the hook returns "not handled" and the request goes to Ask.
//! - Anything else goes to Ask unchanged, so Ask's own intent detection still finds questions,
//!   translations ("translate … into French"), drafts, edits and searches.

/// Where a hands-free request goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HandsFreeRoute {
    /// Dictate this text (the request without its "type" prefix).
    Dictate(String),
    /// A voice command ("open Safari"); the text after the verb.
    VoiceCommand(String),
    /// Ask anything with the whole request.
    Ask,
}

/// Latin prefixes that always mean "dictate the rest".
const DICTATE_PREFIXES_EN: &[&str] = &[
    "type out",
    "type in",
    "type",
    "dictate",
    "write down",
    "write out",
    "note down",
];
/// "write" means "dictate" unless it is followed by one of these (then it is Ask's draft
/// command: "write an email", "write me a reply", "write back to Tom").
const DRAFT_OBJECTS_EN: &[&str] = &[
    "a",
    "an",
    "the",
    "me",
    "us",
    "him",
    "her",
    "them",
    "back",
    "to",
    "some",
    "something",
    "another",
    "my",
    "our",
    "your",
];
/// Chinese prefixes that always mean "dictate the rest" (Cantonese and Mandarin, both scripts).
const DICTATE_PREFIXES_ZH: &[&str] = &[
    "幫我打",
    "帮我打",
    "打字",
    "輸入",
    "输入",
    "寫低",
    "写低",
    "寫下",
    "写下",
    "記低",
    "记低",
    "聽寫",
    "听写",
];
/// Chinese draft prefixes (Ask's grammar); a bare 写 / 寫 not followed by these dictates.
const DRAFT_PREFIXES_ZH: &[&str] = &[
    "写一封",
    "寫一封",
    "写一份",
    "寫一份",
    "写个",
    "寫個",
    "写封",
    "寫封",
    "帮我写",
    "幫我寫",
];
/// 打 after these is another word (打开 open, 打电话 call, 打算 plan ...), not "type".
const NOT_TYPE_AFTER_DA: &[char] = &[
    '开', '開', '电', '電', '算', '工', '车', '車', '扫', '掃', '球', '架', '包', '折', '印', '卡',
    '针', '針', '听', '聽', '招', '败', '敗', '破', '扮', '理',
];
/// Latin prefixes of a voice command.
const COMMAND_PREFIXES_EN: &[&str] = &["switch to", "open", "launch", "go to", "bring up"];
const COMMAND_PREFIXES_ZH: &[&str] = &[
    "切换到",
    "切換到",
    "打开",
    "打開",
    "开启",
    "開啟",
    "转去",
    "轉去",
];

/// Routes a hands-free request.
pub fn route(request: &str) -> HandsFreeRoute {
    let text = trim_lead(request);
    if text.is_empty() {
        return HandsFreeRoute::Ask;
    }
    if let Some(rest) =
        after_any_en(text, COMMAND_PREFIXES_EN).or_else(|| after_any_zh(text, COMMAND_PREFIXES_ZH))
    {
        return HandsFreeRoute::VoiceCommand(rest);
    }
    if let Some(rest) =
        after_any_en(text, DICTATE_PREFIXES_EN).or_else(|| after_any_zh(text, DICTATE_PREFIXES_ZH))
    {
        return HandsFreeRoute::Dictate(rest);
    }
    if let Some(rest) = after_en(text, "write") {
        let first = rest
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        if !DRAFT_OBJECTS_EN.contains(&first.as_str()) {
            return HandsFreeRoute::Dictate(rest);
        }
        return HandsFreeRoute::Ask;
    }
    if DRAFT_PREFIXES_ZH.iter().any(|p| text.starts_with(p)) {
        return HandsFreeRoute::Ask;
    }
    if let Some(rest) = after_any_zh(text, &["写", "寫"]) {
        return HandsFreeRoute::Dictate(rest);
    }
    if let Some(after) = text.strip_prefix('打') {
        if after
            .chars()
            .next()
            .is_some_and(|next| !NOT_TYPE_AFTER_DA.contains(&next))
        {
            if let Some(rest) = payload(after) {
                return HandsFreeRoute::Dictate(rest);
            }
        }
    }
    HandsFreeRoute::Ask
}

/// Plan `hands-free-mode`: the hook for spoken app commands ("open Safari", "switch to Mail").
/// Voice commands are a separate feature (branch `feature/voice-commands`); until it is on main
/// this returns false and the caller sends the request to Ask instead. When that feature lands,
/// call its executor here and return true when it handled the command.
pub fn run_voice_command(_app: &tauri::AppHandle, _command: &str) -> bool {
    false
}

/// Drops leading punctuation and filler a transcript may start with ("…", ", type ...").
fn trim_lead(text: &str) -> &str {
    text.trim_start_matches(|c: char| !c.is_alphanumeric())
        .trim_end()
}

/// The non-empty payload after a prefix, without the punctuation that joins them.
fn payload(rest: &str) -> Option<String> {
    let rest = rest
        .trim_start_matches(|c: char| c.is_whitespace() || is_joiner(c))
        .trim();
    (!rest.is_empty()).then(|| rest.to_string())
}

fn is_joiner(c: char) -> bool {
    matches!(
        c,
        ',' | ':' | ';' | '-' | '，' | '：' | '；' | '、' | '—' | '.' | '。'
    )
}

/// The payload after a Latin prefix that ends at a word boundary, case-insensitively.
fn after_en(text: &str, prefix: &str) -> Option<String> {
    let head = text.get(..prefix.len())?;
    if !head.eq_ignore_ascii_case(prefix) {
        return None;
    }
    let rest = &text[prefix.len()..];
    if rest.chars().next().is_some_and(char::is_alphanumeric) {
        return None;
    }
    payload(rest)
}

fn after_any_en(text: &str, prefixes: &[&str]) -> Option<String> {
    prefixes.iter().find_map(|prefix| after_en(text, prefix))
}

fn after_any_zh(text: &str, prefixes: &[&str]) -> Option<String> {
    prefixes
        .iter()
        .find_map(|prefix| text.strip_prefix(prefix).and_then(payload))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dictate(text: &str) -> HandsFreeRoute {
        HandsFreeRoute::Dictate(text.to_string())
    }

    #[test]
    fn type_prefixes_dictate_the_rest() {
        assert_eq!(route("Type I'll be late."), dictate("I'll be late."));
        assert_eq!(route("type: hello world"), dictate("hello world"));
        assert_eq!(
            route("Type out, see you at six."),
            dictate("see you at six.")
        );
        assert_eq!(
            route("Dictate thanks for the update"),
            dictate("thanks for the update")
        );
        assert_eq!(route("Write down buy milk."), dictate("buy milk."));
        assert_eq!(
            route("Write I'll call you back."),
            dictate("I'll call you back.")
        );
        assert_eq!(route("...type ok"), dictate("ok"));
    }

    #[test]
    fn chinese_and_cantonese_prefixes_dictate() {
        assert_eq!(route("打我今晚唔返嚟食飯"), dictate("我今晚唔返嚟食飯"));
        assert_eq!(route("幫我打，收到"), dictate("收到"));
        assert_eq!(route("寫低聽日開會"), dictate("聽日開會"));
        assert_eq!(route("输入明天见"), dictate("明天见"));
        assert_eq!(route("写：明天下午三点开会"), dictate("明天下午三点开会"));
        assert_eq!(route("寫我遲啲到"), dictate("我遲啲到"));
    }

    #[test]
    fn drafts_questions_and_translations_stay_with_ask() {
        for text in [
            "Write an email to Tom about Friday",
            "write me a reply saying yes",
            "Write back to Anna",
            "What's the weather in Hong Kong?",
            "Translate good morning into French",
            "Typically, how long does it take?",
            "Typewriters are old.",
            "写一封邮件给老板",
            "幫我寫一封信",
            "打算几点出发？",
            "打电话给妈妈",
            "",
            "type",
        ] {
            assert_eq!(route(text), HandsFreeRoute::Ask, "{text:?}");
        }
    }

    #[test]
    fn open_and_switch_go_to_the_voice_command_hook() {
        assert_eq!(
            route("Open Safari."),
            HandsFreeRoute::VoiceCommand("Safari.".to_string())
        );
        assert_eq!(
            route("switch to Mail"),
            HandsFreeRoute::VoiceCommand("Mail".to_string())
        );
        assert_eq!(
            route("打開 Safari"),
            HandsFreeRoute::VoiceCommand("Safari".to_string())
        );
        assert_eq!(
            route("切换到微信"),
            HandsFreeRoute::VoiceCommand("微信".to_string())
        );
        // "Opening hours?" is not "open".
        assert_eq!(route("Opening hours of the library?"), HandsFreeRoute::Ask);
    }
}
