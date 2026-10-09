//! Plan `voice-commands`: the installed apps a command may name, and the deterministic match
//! from a spoken name to one of them. Only an app found here is ever opened, switched to,
//! hidden or quit; a name or path from the AI is never used directly.

use std::path::{Path, PathBuf};

/// One installed app.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppEntry {
    /// The name Finder shows (the bundle's file name without `.app`).
    pub name: String,
    /// Other names: the localized display name, and built-in aliases ("Chrome").
    pub aliases: Vec<String>,
    /// The `.app` bundle.
    pub path: PathBuf,
}

/// The result of matching a spoken name.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolution {
    Found(AppEntry),
    /// Several apps match equally well; their names, for the panel.
    Ambiguous(Vec<String>),
    NotFound,
}

/// Common spoken names for apps whose real name is different. Matched after normalising.
const ALIASES: &[(&str, &str)] = &[
    ("chrome", "Google Chrome"),
    ("google", "Google Chrome"),
    ("vscode", "Visual Studio Code"),
    ("vs code", "Visual Studio Code"),
    ("code", "Visual Studio Code"),
    ("settings", "System Settings"),
    ("system preferences", "System Settings"),
    ("preferences", "System Settings"),
    ("設定", "System Settings"),
    ("设置", "System Settings"),
    ("系統設定", "System Settings"),
    ("系统设置", "System Settings"),
    ("システム設定", "System Settings"),
    ("ajustes", "System Settings"),
    ("réglages", "System Settings"),
    ("systemeinstellungen", "System Settings"),
    ("word", "Microsoft Word"),
    ("excel", "Microsoft Excel"),
    ("powerpoint", "Microsoft PowerPoint"),
    ("outlook", "Microsoft Outlook"),
    ("teams", "Microsoft Teams"),
    ("edge", "Microsoft Edge"),
    ("wechat", "WeChat"),
    ("微信", "WeChat"),
    ("訪達", "Finder"),
    ("访达", "Finder"),
    ("計算機", "Calculator"),
    ("计算器", "Calculator"),
    ("備忘錄", "Notes"),
    ("备忘录", "Notes"),
    ("メモ", "Notes"),
    ("終端機", "Terminal"),
    ("终端", "Terminal"),
    ("ターミナル", "Terminal"),
    ("app store", "App Store"),
    ("郵件", "Mail"),
    ("邮件", "Mail"),
    ("メール", "Mail"),
    ("日曆", "Calendar"),
    ("日历", "Calendar"),
    ("カレンダー", "Calendar"),
    ("相片", "Photos"),
    ("照片", "Photos"),
    ("写真", "Photos"),
    ("音樂", "Music"),
    ("音乐", "Music"),
    ("ミュージック", "Music"),
    ("訊息", "Messages"),
    ("信息", "Messages"),
    ("短信", "Messages"),
    ("メッセージ", "Messages"),
];

/// Lower case, without spaces, punctuation or a trailing `.app`, so "Visual Studio Code",
/// "visual-studio code" and "VisualStudioCode" compare equal.
pub fn normalize(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    let lower = lower.strip_suffix(".app").unwrap_or(&lower);
    lower.chars().filter(|c| c.is_alphanumeric()).collect()
}

/// The `.app` bundles in `dirs` (and their `Utilities` subfolders), sorted by name.
/// `display_name` gives the localized name of a bundle, when known.
pub fn scan(dirs: &[PathBuf], display_name: impl Fn(&Path) -> Option<String>) -> Vec<AppEntry> {
    let mut entries = Vec::new();
    let mut visit = |dir: &Path| {
        let Ok(read) = std::fs::read_dir(dir) else {
            return;
        };
        for item in read.flatten() {
            let path = item.path();
            if path.extension().and_then(|e| e.to_str()) != Some("app") {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let mut aliases = Vec::new();
            if let Some(display) = display_name(&path) {
                let display = display.strip_suffix(".app").unwrap_or(&display).to_string();
                if normalize(&display) != normalize(name) && !display.is_empty() {
                    aliases.push(display);
                }
            }
            entries.push(AppEntry {
                name: name.to_string(),
                aliases,
                path,
            });
        }
    };
    for dir in dirs {
        visit(dir);
        visit(&dir.join("Utilities"));
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name).then(a.path.cmp(&b.path)));
    // The same app in two folders (rare): keep the first.
    entries.dedup_by(|b, a| normalize(&a.name) == normalize(&b.name));
    entries
}

/// How well `spoken` matches `name`; 0 when it does not.
fn score(spoken: &str, name: &str) -> u32 {
    if spoken.is_empty() || name.is_empty() {
        return 0;
    }
    if spoken == name {
        return 100;
    }
    let spoken_len = spoken.chars().count();
    let name_len = name.chars().count();
    // "chrome" in "googlechrome", "studio" in "visualstudiocode": a long enough part.
    if spoken_len >= 4 && name.starts_with(spoken) {
        return 80;
    }
    if spoken_len >= 4 && name.contains(spoken) {
        return 70;
    }
    // Transcription slips: "spotfy", "safary".
    let allowed = match spoken_len.min(name_len) {
        0..=4 => 0,
        5..=8 => 1,
        _ => 2,
    };
    if allowed > 0 && spoken_len.abs_diff(name_len) <= allowed {
        let distance = levenshtein(spoken, name);
        if distance <= allowed {
            return 60 - distance as u32 * 5;
        }
    }
    0
}

fn levenshtein(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.chars().enumerate() {
        let mut previous = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let current = row[j + 1];
            row[j + 1] = (previous + usize::from(ca != *cb))
                .min(row[j] + 1)
                .min(row[j + 1] + 1);
            previous = current;
        }
    }
    row[b.len()]
}

/// The installed app `spoken` names: an exact name or alias first, then the best fuzzy match.
/// Two different apps with the same best score are ambiguous.
pub fn resolve(spoken: &str, apps: &[AppEntry]) -> Resolution {
    let key = normalize(spoken);
    if key.is_empty() {
        return Resolution::NotFound;
    }
    let alias_target = ALIASES
        .iter()
        .find(|(alias, _)| normalize(alias) == key)
        .map(|(_, real)| normalize(real));

    let mut best: Vec<(&AppEntry, u32)> = Vec::new();
    for app in apps {
        let names =
            std::iter::once(app.name.as_str()).chain(app.aliases.iter().map(String::as_str));
        let mut app_score = names
            .map(|name| score(&key, &normalize(name)))
            .max()
            .unwrap_or(0);
        if alias_target.as_deref() == Some(normalize(&app.name).as_str()) {
            app_score = app_score.max(95);
        }
        if app_score == 0 {
            continue;
        }
        match best.first().map(|(_, s)| *s) {
            Some(top) if app_score < top => {}
            Some(top) if app_score == top => best.push((app, app_score)),
            _ => best = vec![(app, app_score)],
        }
    }
    match best.as_slice() {
        [] => Resolution::NotFound,
        [(app, _)] => Resolution::Found((*app).clone()),
        many => Resolution::Ambiguous(
            many.iter()
                .take(4)
                .map(|(app, _)| app.name.clone())
                .collect(),
        ),
    }
}

/// Whether `utterance` names an installed app as a whole word. Names that are everyday words
/// ("Notes", "Music") do not count, so "write some notes" is not sent to the AI.
pub fn mentions_app(utterance: &str, apps: &[AppEntry]) -> bool {
    const EVERYDAY: &[&str] = &[
        "notes",
        "mail",
        "music",
        "photos",
        "maps",
        "messages",
        "news",
        "books",
        "calendar",
        "reminders",
        "contacts",
        "preview",
        "clock",
        "weather",
        "stocks",
        "home",
        "podcasts",
        "freeform",
        "passwords",
        "shortcuts",
        "calculator",
        "dictionary",
        "chess",
        "tips",
        "phone",
        "journal",
        "games",
        "console",
        "automator",
        "terminal",
        "photo booth",
        "font book",
    ];
    let words = |text: &str| -> String {
        let spaced: String = text
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { ' ' })
            .collect();
        format!(
            " {} ",
            spaced.split_whitespace().collect::<Vec<_>>().join(" ")
        )
    };
    let padded = words(utterance);
    let raw = utterance.to_lowercase();
    apps.iter()
        .flat_map(|app| std::iter::once(&app.name).chain(app.aliases.iter()))
        .map(|name| name.to_lowercase())
        .filter(|name| name.chars().count() >= 2 && !EVERYDAY.contains(&name.as_str()))
        .any(|name| {
            if name.is_ascii() {
                name.chars().count() >= 3 && padded.contains(&words(&name))
            } else {
                raw.contains(&name)
            }
        })
}

/// The folders scanned for apps: `/Applications`, `/System/Applications` and
/// `~/Applications`.
pub fn default_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(name: &str, aliases: &[&str]) -> AppEntry {
        AppEntry {
            name: name.into(),
            aliases: aliases.iter().map(|a| a.to_string()).collect(),
            path: PathBuf::from(format!("/Applications/{name}.app")),
        }
    }

    fn fixture() -> Vec<AppEntry> {
        vec![
            app("Safari", &[]),
            app("Google Chrome", &[]),
            app("Visual Studio Code", &[]),
            app("Slack", &[]),
            app("Spotify", &[]),
            app("System Settings", &["系統設定"]),
            app("Calculator", &["計算機"]),
            app("Microsoft Word", &[]),
            app("Microsoft Excel", &[]),
            app("Notes", &[]),
            app("WeChat", &["微信"]),
        ]
    }

    fn found(spoken: &str) -> Option<String> {
        match resolve(spoken, &fixture()) {
            Resolution::Found(app) => Some(app.name),
            _ => None,
        }
    }

    #[test]
    fn exact_names_ignore_case_spacing_and_punctuation() {
        assert_eq!(found("safari").as_deref(), Some("Safari"));
        assert_eq!(found("SAFARI").as_deref(), Some("Safari"));
        assert_eq!(
            found("visual studio code").as_deref(),
            Some("Visual Studio Code")
        );
        assert_eq!(
            found("VisualStudio-Code").as_deref(),
            Some("Visual Studio Code")
        );
        assert_eq!(found("Safari.app").as_deref(), Some("Safari"));
    }

    #[test]
    fn aliases_partial_names_and_localized_names() {
        assert_eq!(found("Chrome").as_deref(), Some("Google Chrome"));
        assert_eq!(found("VS Code").as_deref(), Some("Visual Studio Code"));
        assert_eq!(found("settings").as_deref(), Some("System Settings"));
        assert_eq!(found("系統設定").as_deref(), Some("System Settings"));
        assert_eq!(found("计算器").as_deref(), Some("Calculator"));
        assert_eq!(found("計算機").as_deref(), Some("Calculator"));
        assert_eq!(found("微信").as_deref(), Some("WeChat"));
        assert_eq!(found("studio").as_deref(), Some("Visual Studio Code"));
    }

    #[test]
    fn small_transcription_slips_still_match() {
        assert_eq!(found("Spotfy").as_deref(), Some("Spotify"));
        assert_eq!(found("Safary").as_deref(), Some("Safari"));
        assert_eq!(found("Slak"), None, "short names need an exact match");
    }

    #[test]
    fn unknown_and_ambiguous_names() {
        assert_eq!(resolve("Photoshop", &fixture()), Resolution::NotFound);
        assert_eq!(resolve("", &fixture()), Resolution::NotFound);
        assert_eq!(
            resolve("Microsoft", &fixture()),
            Resolution::Ambiguous(vec!["Microsoft Word".into(), "Microsoft Excel".into()])
        );
    }

    #[test]
    fn mentions_skip_everyday_words() {
        let apps = fixture();
        assert!(mentions_app("get Slack up", &apps));
        assert!(mentions_app("幫我搵微信", &apps));
        assert!(!mentions_app("write some notes about the meeting", &apps));
        assert!(!mentions_app("tell me a joke", &apps));
    }

    #[test]
    fn scan_reads_app_bundles_and_utilities_from_fixture_folders() {
        let root = std::env::temp_dir().join(format!("typelite-apps-{}", uuid::Uuid::new_v4()));
        let apps_dir = root.join("Applications");
        std::fs::create_dir_all(apps_dir.join("Safari.app")).unwrap();
        std::fs::create_dir_all(apps_dir.join("Slack.app")).unwrap();
        std::fs::create_dir_all(apps_dir.join("Utilities/Terminal.app")).unwrap();
        std::fs::create_dir_all(apps_dir.join("Not an app")).unwrap();
        std::fs::write(apps_dir.join("readme.txt"), "x").unwrap();
        let missing = root.join("missing");

        let entries = scan(&[apps_dir.clone(), missing], |path| {
            (path.file_stem()? == "Terminal").then(|| "終端機".to_string())
        });
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["Safari", "Slack", "Terminal"]);
        assert_eq!(entries[2].aliases, ["終端機"]);
        assert_eq!(entries[0].path, apps_dir.join("Safari.app"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
