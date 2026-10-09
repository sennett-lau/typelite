//! Plan `voice-commands`: the deterministic first pass. It recognises short spoken instructions
//! such as "open Safari", "打開 Spotify" or "Safari を開いて" without the AI, offline and in a
//! few microseconds. It only splits the utterance into an action and a target; whether the
//! target is a real app is decided later (`apps.rs`).
//!
//! It is deliberately conservative: a question, a negation or a long sentence is never a
//! command, so normal Ask answers are not hijacked.

use super::{Action, Command, FolderKind};

/// What the first pass decided.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Detection {
    /// A command pattern matched.
    Command(Command),
    /// No pattern matched, but the utterance looks like it may be an instruction to the
    /// computer (a command verb in some language, or short and naming an app). The AI decides.
    Maybe,
    /// Not a command: Ask answers it as usual.
    NotCommand,
}

/// Longest utterance (in characters) that can be a command.
const MAX_COMMAND_CHARS: usize = 80;
/// Most words a Latin-script target can have ("Visual Studio Code Insiders" is four).
const MAX_TARGET_WORDS: usize = 5;
/// Most characters a target can have.
const MAX_TARGET_CHARS: usize = 40;
/// Most words an utterance can have to be sent to the AI as a possible command.
const MAX_MAYBE_WORDS: usize = 10;

/// Polite openings that turn a question into a request ("can you open Safari?").
const REQUEST_PREFIXES: &[&str] = &[
    "can you please ",
    "could you please ",
    "would you please ",
    "can you ",
    "could you ",
    "would you ",
    "will you ",
    "peux-tu ",
    "pouvez-vous ",
    "tu peux ",
    "puedes ",
    "podrías ",
    "kannst du ",
    "könntest du ",
    "可唔可以",
    "可不可以",
    "能不能",
    "能唔能",
    "可以",
];

/// Words in front of the verb that carry no meaning for the command.
const FILLER_PREFIXES: &[&str] = &[
    "please ",
    "hey typelite ",
    "typelite ",
    "ok ",
    "okay ",
    "now ",
    "go ahead and ",
    "i want to ",
    "i'd like to ",
    "let's ",
    "por favor ",
    "s'il te plaît ",
    "s'il vous plaît ",
    "bitte ",
    "幫我",
    "帮我",
    "唔該",
    "唔该",
    "麻煩你",
    "麻烦你",
    "麻煩",
    "麻烦",
    "請你",
    "请你",
    "請",
    "请",
    "同我",
    "給我",
    "给我",
    "你",
];

const FILLER_SUFFIXES: &[&str] = &[
    " please",
    " for me",
    " now",
    " por favor",
    " s'il te plaît",
    " s'il vous plaît",
    " bitte",
    "ください",
    "下さい",
    "吧",
    "啦",
    "呀",
    "啊",
    "喇",
    "先",
    "嗎",
    "吗",
    "嘛",
];

/// A negation anywhere makes it "not a command" ("don't open Safari").
const NEGATIONS: &[&str] = &[
    " don't ",
    " do not ",
    " never ",
    " dont ",
    " no ",
    " ne ",
    " n'",
    " nicht ",
    "唔好",
    "不要",
    "別",
    "别",
    "唔使",
    "ないで",
];

/// Verbs that come before the target, with the action they mean. Longest first within a
/// language so "open up" wins over "open". Latin verbs end with a space (a whole word).
const PREFIX_VERBS: &[(&str, Action)] = &[
    // English
    ("open up ", Action::OpenApp),
    ("open ", Action::OpenApp),
    ("launch ", Action::OpenApp),
    ("start ", Action::OpenApp),
    ("fire up ", Action::OpenApp),
    ("switch over to ", Action::SwitchTo),
    ("switch to ", Action::SwitchTo),
    ("go to ", Action::SwitchTo),
    ("jump to ", Action::SwitchTo),
    ("change to ", Action::SwitchTo),
    ("bring up ", Action::SwitchTo),
    ("hide ", Action::HideApp),
    ("quit ", Action::QuitApp),
    ("close ", Action::QuitApp),
    ("exit ", Action::QuitApp),
    ("run the shortcut ", Action::RunShortcut),
    ("run shortcut ", Action::RunShortcut),
    // Spanish
    ("ábreme ", Action::OpenApp),
    ("abre ", Action::OpenApp),
    ("abrir ", Action::OpenApp),
    ("abra ", Action::OpenApp),
    ("inicia ", Action::OpenApp),
    ("lanza ", Action::OpenApp),
    ("cambia a ", Action::SwitchTo),
    ("cambiar a ", Action::SwitchTo),
    ("ve a ", Action::SwitchTo),
    ("ir a ", Action::SwitchTo),
    ("pasa a ", Action::SwitchTo),
    ("oculta ", Action::HideApp),
    ("ocultar ", Action::HideApp),
    ("esconde ", Action::HideApp),
    ("cierra ", Action::QuitApp),
    ("cerrar ", Action::QuitApp),
    ("sal de ", Action::QuitApp),
    ("salir de ", Action::QuitApp),
    // French
    ("ouvre ", Action::OpenApp),
    ("ouvrir ", Action::OpenApp),
    ("ouvrez ", Action::OpenApp),
    ("lance ", Action::OpenApp),
    ("lancer ", Action::OpenApp),
    ("démarre ", Action::OpenApp),
    ("passe à ", Action::SwitchTo),
    ("passer à ", Action::SwitchTo),
    ("va sur ", Action::SwitchTo),
    ("aller sur ", Action::SwitchTo),
    ("bascule vers ", Action::SwitchTo),
    ("bascule sur ", Action::SwitchTo),
    ("masque ", Action::HideApp),
    ("masquer ", Action::HideApp),
    ("cache ", Action::HideApp),
    ("quitte ", Action::QuitApp),
    ("quitter ", Action::QuitApp),
    ("ferme ", Action::QuitApp),
    ("fermer ", Action::QuitApp),
    // German
    ("öffne ", Action::OpenApp),
    ("öffnen ", Action::OpenApp),
    ("starte ", Action::OpenApp),
    ("wechsle zu ", Action::SwitchTo),
    ("wechsel zu ", Action::SwitchTo),
    ("gehe zu ", Action::SwitchTo),
    ("geh zu ", Action::SwitchTo),
    ("verstecke ", Action::HideApp),
    ("verberge ", Action::HideApp),
    ("beende ", Action::QuitApp),
    ("schließe ", Action::QuitApp),
    ("schliesse ", Action::QuitApp),
    // Chinese (Cantonese, Mandarin; Traditional and Simplified). No space needed.
    ("打開", Action::OpenApp),
    ("打开", Action::OpenApp),
    ("開啟", Action::OpenApp),
    ("开启", Action::OpenApp),
    ("啟動", Action::OpenApp),
    ("启动", Action::OpenApp),
    ("開", Action::OpenApp),
    ("开", Action::OpenApp),
    ("切換到", Action::SwitchTo),
    ("切换到", Action::SwitchTo),
    ("切換去", Action::SwitchTo),
    ("切换去", Action::SwitchTo),
    ("轉去", Action::SwitchTo),
    ("转去", Action::SwitchTo),
    ("轉到", Action::SwitchTo),
    ("转到", Action::SwitchTo),
    ("跳去", Action::SwitchTo),
    ("返去", Action::SwitchTo),
    ("回到", Action::SwitchTo),
    ("隱藏", Action::HideApp),
    ("隐藏", Action::HideApp),
    ("收埋", Action::HideApp),
    ("關閉", Action::QuitApp),
    ("关闭", Action::QuitApp),
    ("退出", Action::QuitApp),
    ("結束", Action::QuitApp),
    ("结束", Action::QuitApp),
    ("閂", Action::QuitApp),
    ("闩", Action::QuitApp),
    ("關", Action::QuitApp),
    ("关", Action::QuitApp),
];

/// Single-character Chinese verbs are also the first character of common words ("開心" happy,
/// "關於" about, "開會" a meeting). After these characters the verb is not a command.
const CHINESE_VERB_BLOCKERS: &[&str] = &[
    "心", "會", "会", "始", "發", "发", "車", "车", "門", "门", "玩笑", "於", "于", "係", "系",
    "注", "鍵", "键", "頭", "头", "放", "學", "学", "工", "業", "业", "口", "燈", "灯",
];

/// Verbs that come after the target (Japanese, and German infinitives).
const SUFFIX_VERBS: &[(&str, Action)] = &[
    ("を開いて", Action::OpenApp),
    ("を開けて", Action::OpenApp),
    ("を開く", Action::OpenApp),
    ("を起動して", Action::OpenApp),
    ("を起動", Action::OpenApp),
    ("開いて", Action::OpenApp),
    ("に切り替えて", Action::SwitchTo),
    ("に切り替え", Action::SwitchTo),
    ("へ切り替えて", Action::SwitchTo),
    ("に移動して", Action::SwitchTo),
    ("を隠して", Action::HideApp),
    ("を非表示にして", Action::HideApp),
    ("を終了して", Action::QuitApp),
    ("を終了", Action::QuitApp),
    ("を閉じて", Action::QuitApp),
    ("を閉じる", Action::QuitApp),
    (" öffnen", Action::OpenApp),
    (" starten", Action::OpenApp),
    (" ausblenden", Action::HideApp),
    (" verstecken", Action::HideApp),
    (" beenden", Action::QuitApp),
    (" schließen", Action::QuitApp),
];

/// German verbs that wrap the target ("mach Safari auf", "blende Safari aus").
const CIRCUMFIX_VERBS: &[(&str, &str, Action)] = &[
    ("mach ", " auf", Action::OpenApp),
    ("wechsle ", " zu", Action::SwitchTo),
    ("blende ", " aus", Action::HideApp),
    ("mach ", " zu", Action::QuitApp),
];

/// Articles and words around a target that are not part of the name.
const TARGET_PREFIXES: &[&str] = &[
    "the ",
    "my ",
    "app ",
    "application ",
    "el ",
    "la app ",
    "la aplicación ",
    "la ",
    "l'application ",
    "l'appli ",
    "l'app ",
    "l'",
    "le ",
    "die app ",
    "die ",
    "das ",
    "den ",
    "一下",
    "個",
    "个",
];
const TARGET_SUFFIXES: &[&str] = &[
    " app",
    " application",
    " window",
    " folder",
    " shortcut",
    " carpeta",
    " dossier",
    " ordner",
    " 應用程式",
    " 应用程序",
    "應用程式",
    "应用程序",
    "資料夾",
    "文件夹",
    "フォルダ",
    "アプリ",
    "一下",
];

/// Folder names that `open` may show in Finder.
const FOLDERS: &[(&str, FolderKind)] = &[
    ("downloads", FolderKind::Downloads),
    ("download", FolderKind::Downloads),
    ("下載", FolderKind::Downloads),
    ("下载", FolderKind::Downloads),
    ("ダウンロード", FolderKind::Downloads),
    ("descargas", FolderKind::Downloads),
    ("téléchargements", FolderKind::Downloads),
    ("desktop", FolderKind::Desktop),
    ("桌面", FolderKind::Desktop),
    ("デスクトップ", FolderKind::Desktop),
    ("escritorio", FolderKind::Desktop),
    ("bureau", FolderKind::Desktop),
    ("schreibtisch", FolderKind::Desktop),
    ("documents", FolderKind::Documents),
    ("文件", FolderKind::Documents),
    ("文檔", FolderKind::Documents),
    ("文档", FolderKind::Documents),
    ("書類", FolderKind::Documents),
    ("documentos", FolderKind::Documents),
    ("dokumente", FolderKind::Documents),
    ("applications", FolderKind::Applications),
    ("applications folder", FolderKind::Applications),
    ("aplicaciones", FolderKind::Applications),
    ("programme", FolderKind::Applications),
];

/// Words that suggest an instruction even when no full pattern matched; they send a short
/// utterance to the AI.
const COMMAND_HINTS: &[&str] = &[
    "open",
    "launch",
    "switch",
    "quit",
    "close",
    "hide",
    "bring up",
    "pull up",
    "fire up",
    "start up",
    "get ",
    "abre",
    "abrir",
    "ouvre",
    "ouvrir",
    "öffne",
    "打開",
    "打开",
    "切換",
    "切换",
    "退出",
    "隱藏",
    "隐藏",
    "開いて",
    "起動",
    "切り替え",
    "終了",
];

/// The command in `utterance`, if it is one. `mentions_app` tells whether the utterance names
/// an installed app (for the "Maybe" decision only; it never makes a command by itself).
pub fn detect(utterance: &str, mentions_app: impl Fn(&str) -> bool) -> Detection {
    let text = utterance.trim();
    if text.is_empty() || text.chars().count() > MAX_COMMAND_CHARS || text.contains('\n') {
        return Detection::NotCommand;
    }
    let lower = text.to_lowercase();
    let padded = format!(" {lower} ");
    if NEGATIONS.iter().any(|negation| padded.contains(negation)) {
        return Detection::NotCommand;
    }

    let mut rest = trim_punctuation(&lower);
    let mut original = trim_punctuation(text);
    let is_question = lower.ends_with('?') || lower.ends_with('？');
    let mut polite_request = false;
    for prefix in REQUEST_PREFIXES {
        if let Some(stripped) = strip_prefix_ci(rest, prefix) {
            original = tail(original, rest, stripped);
            rest = stripped;
            polite_request = true;
            break;
        }
    }
    if is_question && !polite_request {
        return Detection::NotCommand;
    }
    (rest, original) = strip_fillers(rest, original);

    if let Some(command) = match_patterns(rest, original) {
        return Detection::Command(command);
    }

    let words = rest.split_whitespace().count();
    let short = words <= MAX_MAYBE_WORDS && rest.chars().count() <= MAX_COMMAND_CHARS / 2;
    if !short || is_question && !polite_request {
        return Detection::NotCommand;
    }
    let hinted = COMMAND_HINTS
        .iter()
        .any(|hint| hint_matches(&format!(" {rest} "), hint));
    if hinted || (words <= 6 && mentions_app(original)) {
        Detection::Maybe
    } else {
        Detection::NotCommand
    }
}

fn hint_matches(padded: &str, hint: &str) -> bool {
    if hint.is_ascii() && !hint.ends_with(' ') {
        padded.contains(&format!(" {hint} "))
    } else {
        padded.contains(hint)
    }
}

fn match_patterns(rest: &str, original: &str) -> Option<Command> {
    for (verb, action) in PREFIX_VERBS {
        let Some(target_lower) = strip_prefix_ci(rest, verb) else {
            continue;
        };
        if !verb.ends_with(' ')
            && CHINESE_VERB_BLOCKERS
                .iter()
                .any(|blocker| target_lower.trim_start().starts_with(blocker))
            && verb.chars().count() == 1
        {
            continue;
        }
        let target = tail(original, rest, target_lower);
        if let Some(command) = command_for(*action, target) {
            return Some(command);
        }
    }
    for (verb, action) in SUFFIX_VERBS {
        if let Some(head) = strip_suffix_ci(rest, verb) {
            let target = &original[..head.len().min(original.len())];
            if let Some(command) = command_for(*action, target) {
                return Some(command);
            }
        }
    }
    for (start, end, action) in CIRCUMFIX_VERBS {
        if let Some(inner) = strip_prefix_ci(rest, start).and_then(|r| strip_suffix_ci(r, end)) {
            let offset = rest.len() - strip_prefix_ci(rest, start)?.len();
            let target = original.get(offset..offset + inner.len()).unwrap_or(inner);
            if let Some(command) = command_for(*action, target) {
                return Some(command);
            }
        }
    }
    None
}

/// Builds the command for `action` and a raw target, or `None` when the target is empty or
/// too long to be a name.
fn command_for(action: Action, raw_target: &str) -> Option<Command> {
    let target = clean_target(raw_target);
    if target.is_empty()
        || target.chars().count() > MAX_TARGET_CHARS
        || target.split_whitespace().count() > MAX_TARGET_WORDS
    {
        return None;
    }
    if action == Action::OpenApp || action == Action::SwitchTo {
        if let Some(url) = spoken_url(&target) {
            return Some(Command {
                action: Action::OpenUrl,
                target: url,
            });
        }
    }
    if action == Action::OpenApp {
        let lower = target.to_lowercase();
        if let Some((_, folder)) = FOLDERS.iter().find(|(name, _)| *name == lower) {
            return Some(Command {
                action: Action::OpenFolder,
                target: folder.as_str().to_string(),
            });
        }
    }
    Some(Command { action, target })
}

fn clean_target(raw: &str) -> String {
    let mut target = raw
        .trim()
        .trim_matches(|c: char| "\"'“”「」『』".contains(c));
    loop {
        let before = target;
        for prefix in TARGET_PREFIXES {
            if let Some(stripped) = strip_prefix_ci(target, prefix) {
                target = stripped.trim_start();
            }
        }
        for suffix in TARGET_SUFFIXES {
            if let Some(stripped) = strip_suffix_ci(target, suffix) {
                target = stripped.trim_end();
            }
        }
        if before == target {
            break;
        }
    }
    target.trim().to_string()
}

/// A spoken web address: "github.com", "github dot com", "https://example.org/page".
/// Returns the address as said (with "dot" turned into "."); `url.rs` validates it.
fn spoken_url(target: &str) -> Option<String> {
    let lower = target.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return (!target.contains(char::is_whitespace)).then(|| target.to_string());
    }
    let joined = lower
        .replace(" dot ", ".")
        .replace(" punto ", ".")
        .replace(" point ", ".");
    let candidate = joined.trim();
    if candidate.contains(char::is_whitespace) || !candidate.contains('.') {
        return None;
    }
    let host = candidate.split('/').next().unwrap_or_default();
    let tld = host.rsplit('.').next().unwrap_or_default();
    let labels_ok = host.split('.').all(|label| {
        !label.is_empty() && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    });
    (labels_ok && (2..=24).contains(&tld.len()) && tld.chars().all(|c| c.is_ascii_alphabetic()))
        .then(|| candidate.to_string())
}

fn trim_punctuation(text: &str) -> &str {
    text.trim()
        .trim_end_matches(|c: char| ".,!?。，！？、…~".contains(c))
        .trim()
}

fn strip_fillers<'a>(mut rest: &'a str, mut original: &'a str) -> (&'a str, &'a str) {
    loop {
        let before = rest;
        for prefix in FILLER_PREFIXES {
            if let Some(stripped) = strip_prefix_ci(rest, prefix) {
                original = tail(original, rest, stripped);
                rest = stripped.trim_start();
                original = original.trim_start();
            }
        }
        for suffix in FILLER_SUFFIXES {
            if let Some(stripped) = strip_suffix_ci(rest, suffix) {
                rest = stripped.trim_end().trim_end_matches(',').trim_end();
                original = &original[..rest.len().min(original.len())];
            }
        }
        if before == rest {
            return (rest, original);
        }
    }
}

/// The part of `original` that corresponds to `rest_tail`, a suffix of `rest` (the lower-case
/// copy). Lower-casing can change byte lengths for a few letters; then the lower-case text is
/// used.
fn tail<'a>(original: &'a str, rest: &'a str, rest_tail: &'a str) -> &'a str {
    if original.len() == rest.len() {
        let start = rest.len() - rest_tail.len();
        if let Some(part) = original.get(start..) {
            return part;
        }
    }
    rest_tail
}

/// `text` without `prefix`, ignoring case. `text` is already lower case, so a plain prefix
/// check is enough; this also accepts original-case text.
fn strip_prefix_ci<'a>(text: &'a str, prefix: &str) -> Option<&'a str> {
    let head = text.get(..prefix.len())?;
    (head.to_lowercase() == prefix).then(|| &text[prefix.len()..])
}

fn strip_suffix_ci<'a>(text: &'a str, suffix: &str) -> Option<&'a str> {
    let start = text.len().checked_sub(suffix.len())?;
    let tail = text.get(start..)?;
    (tail.to_lowercase() == suffix && start > 0).then(|| &text[..start])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_apps(_: &str) -> bool {
        false
    }

    fn command(utterance: &str) -> Option<(Action, String)> {
        match detect(utterance, no_apps) {
            Detection::Command(command) => Some((command.action, command.target)),
            _ => None,
        }
    }

    #[test]
    fn english_commands_keep_the_spoken_name() {
        assert_eq!(
            command("Open Safari."),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("open up Google Chrome"),
            Some((Action::OpenApp, "Google Chrome".into()))
        );
        assert_eq!(
            command("Please launch the Notes app"),
            Some((Action::OpenApp, "Notes".into()))
        );
        assert_eq!(
            command("Switch to Slack"),
            Some((Action::SwitchTo, "Slack".into()))
        );
        assert_eq!(
            command("Go to Visual Studio Code"),
            Some((Action::SwitchTo, "Visual Studio Code".into()))
        );
        assert_eq!(
            command("Hide Spotify"),
            Some((Action::HideApp, "Spotify".into()))
        );
        assert_eq!(
            command("Quit Zoom please"),
            Some((Action::QuitApp, "Zoom".into()))
        );
        assert_eq!(
            command("Close Messages"),
            Some((Action::QuitApp, "Messages".into()))
        );
        assert_eq!(
            command("Can you open Safari?"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Run the shortcut Morning Routine"),
            Some((Action::RunShortcut, "Morning Routine".into()))
        );
    }

    #[test]
    fn urls_and_folders_are_their_own_actions() {
        assert_eq!(
            command("Open github.com"),
            Some((Action::OpenUrl, "github.com".into()))
        );
        assert_eq!(
            command("open github dot com"),
            Some((Action::OpenUrl, "github.com".into()))
        );
        assert_eq!(
            command("Go to https://example.org/page"),
            Some((Action::OpenUrl, "https://example.org/page".into()))
        );
        assert_eq!(
            command("Open my Downloads folder"),
            Some((Action::OpenFolder, "downloads".into()))
        );
        assert_eq!(
            command("打開下載"),
            Some((Action::OpenFolder, "downloads".into()))
        );
        assert_eq!(
            command("Ouvre le bureau"),
            Some((Action::OpenFolder, "desktop".into()))
        );
    }

    #[test]
    fn chinese_and_cantonese_commands() {
        assert_eq!(
            command("打開 Spotify"),
            Some((Action::OpenApp, "Spotify".into()))
        );
        assert_eq!(
            command("開 Chrome"),
            Some((Action::OpenApp, "Chrome".into()))
        );
        assert_eq!(
            command("帮我打开微信"),
            Some((Action::OpenApp, "微信".into()))
        );
        assert_eq!(
            command("幫我開一下Safari啦"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("切換到 Slack"),
            Some((Action::SwitchTo, "Slack".into()))
        );
        assert_eq!(
            command("轉去Notes"),
            Some((Action::SwitchTo, "Notes".into()))
        );
        assert_eq!(
            command("隱藏 Spotify"),
            Some((Action::HideApp, "Spotify".into()))
        );
        assert_eq!(
            command("關閉 Zoom。"),
            Some((Action::QuitApp, "Zoom".into()))
        );
        assert_eq!(
            command("可唔可以開Safari呀？"),
            Some((Action::OpenApp, "Safari".into()))
        );
    }

    #[test]
    fn japanese_spanish_french_german_commands() {
        assert_eq!(
            command("Safari を開いて"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Safariを開いてください"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Slackに切り替えて"),
            Some((Action::SwitchTo, "Slack".into()))
        );
        assert_eq!(
            command("Zoomを終了して"),
            Some((Action::QuitApp, "Zoom".into()))
        );
        assert_eq!(
            command("Abre Safari"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Cambia a Slack, por favor"),
            Some((Action::SwitchTo, "Slack".into()))
        );
        assert_eq!(
            command("Cierra la aplicación Zoom"),
            Some((Action::QuitApp, "Zoom".into()))
        );
        assert_eq!(
            command("Ouvre Safari"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Passe à Slack"),
            Some((Action::SwitchTo, "Slack".into()))
        );
        assert_eq!(
            command("Quitte Zoom"),
            Some((Action::QuitApp, "Zoom".into()))
        );
        assert_eq!(
            command("Öffne Safari"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Safari öffnen"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Wechsle zu Slack"),
            Some((Action::SwitchTo, "Slack".into()))
        );
        assert_eq!(
            command("Mach Safari auf"),
            Some((Action::OpenApp, "Safari".into()))
        );
        assert_eq!(
            command("Blende Spotify aus"),
            Some((Action::HideApp, "Spotify".into()))
        );
        assert_eq!(
            command("Beende Zoom"),
            Some((Action::QuitApp, "Zoom".into()))
        );
    }

    #[test]
    fn questions_negations_and_sentences_are_not_commands() {
        for utterance in [
            "What does open source mean?",
            "How do I open a PDF in Preview?",
            "Should I quit my job?",
            "Don't open Safari",
            "Do not close Zoom",
            "唔好打開 Safari",
            "不要关闭微信",
            "Safariを開かないで",
            "No abras Safari",
            "N'ouvre pas Safari",
            "Öffne Safari nicht",
            "開心啲",
            "關於呢個問題你點睇",
            "开会要准备什么",
            "Open the letter and tell me what it says about the meeting tomorrow",
            "Explain quantum computing",
            "Write a haiku about autumn",
            "Safari是甚麼？",
        ] {
            assert_eq!(command(utterance), None, "{utterance}");
        }
        assert_eq!(
            detect("Explain quantum computing", no_apps),
            Detection::NotCommand
        );
        assert_eq!(
            detect("What does open source mean?", no_apps),
            Detection::NotCommand
        );
    }

    #[test]
    fn unusual_phrasing_with_a_hint_or_an_app_name_goes_to_the_ai() {
        assert_eq!(
            detect("could you get Slack up for me", |name| name
                .contains("Slack")),
            Detection::Maybe
        );
        assert_eq!(
            detect("Slack in front", |name| name.contains("Slack")),
            Detection::Maybe
        );
        assert_eq!(
            detect("I need the calculator open", no_apps),
            Detection::Maybe
        );
        assert_eq!(detect("Tell me a joke", no_apps), Detection::NotCommand);
        assert_eq!(
            detect("Is Slack down today?", |_| true),
            Detection::NotCommand
        );
    }
}
