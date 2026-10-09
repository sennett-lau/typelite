//! Plan `voice-commands` (level 1): through the Ask shortcut, the user says a simple
//! instruction ("open Safari", "打開 Spotify", "Slack に切り替えて") and Typelite carries it
//! out: open, switch to, hide or quit an app, open a web address or a known folder, or run a
//! Shortcut by name. Off by default (Settings → General → Voice commands).
//!
//! Flow: deterministic patterns (`patterns.rs`) first; the configured AI (`ai.rs`, tool calls
//! or strict JSON) only for short phrasings the patterns miss. A target is always resolved
//! against the installed apps (`apps.rs`), the fixed folder list or the user's Shortcuts; no
//! shell command, path or bundle from the AI is ever used. Quitting asks for confirmation.
//!
//! Privacy: the utterance and the target are never logged; only the action, the outcome and
//! the timing.

pub mod ai;
pub mod apps;
pub mod patterns;
mod platform;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

pub use apps::{AppEntry, Resolution};
use patterns::Detection;

/// What a command does.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    OpenApp,
    SwitchTo,
    HideApp,
    QuitApp,
    OpenUrl,
    OpenFolder,
    RunShortcut,
}

impl Action {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenApp => "open_app",
            Self::SwitchTo => "switch_to",
            Self::HideApp => "hide_app",
            Self::QuitApp => "quit_app",
            Self::OpenUrl => "open_url",
            Self::OpenFolder => "open_folder",
            Self::RunShortcut => "run_shortcut",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        [
            Self::OpenApp,
            Self::SwitchTo,
            Self::HideApp,
            Self::QuitApp,
            Self::OpenUrl,
            Self::OpenFolder,
            Self::RunShortcut,
        ]
        .into_iter()
        .find(|action| action.as_str() == name)
    }

    fn targets_app(self) -> bool {
        matches!(
            self,
            Self::OpenApp | Self::SwitchTo | Self::HideApp | Self::QuitApp
        )
    }
}

/// A folder `open_folder` may show. Nothing else is ever opened in Finder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FolderKind {
    Downloads,
    Desktop,
    Documents,
    Applications,
}

impl FolderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Downloads => "downloads",
            Self::Desktop => "desktop",
            Self::Documents => "documents",
            Self::Applications => "applications",
        }
    }

    fn from_name(name: &str) -> Option<Self> {
        match name.trim().to_lowercase().as_str() {
            "downloads" | "download" => Some(Self::Downloads),
            "desktop" => Some(Self::Desktop),
            "documents" => Some(Self::Documents),
            "applications" => Some(Self::Applications),
            _ => None,
        }
    }

    fn path(self) -> Option<std::path::PathBuf> {
        if self == Self::Applications {
            return Some("/Applications".into());
        }
        let home = std::path::PathBuf::from(std::env::var_os("HOME")?);
        Some(home.join(match self {
            Self::Downloads => "Downloads",
            Self::Desktop => "Desktop",
            _ => "Documents",
        }))
    }
}

/// An action and its spoken target, before resolution.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Command {
    pub action: Action,
    pub target: String,
}

/// How a command ended, for the pill and the Ask panel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CommandStatus {
    /// Done; the pill showed it and no panel opens.
    Done,
    /// Quit waits for Confirm in the panel.
    NeedsConfirm,
    /// No app (or Shortcut) with that name.
    NoMatch,
    /// Several apps match; the panel lists them.
    Ambiguous,
    /// Hide or quit an app that is not running.
    NotRunning,
    /// Not a web address Typelite opens (only http and https).
    InvalidUrl,
    /// macOS refused (or this platform cannot do it).
    Failed,
}

/// The command's result, sent to the Ask window.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutcome {
    pub action: Action,
    pub status: CommandStatus,
    /// The app's real name when resolved, otherwise what was heard.
    pub target: String,
    /// For `Ambiguous`: the matching apps.
    pub candidates: Vec<String>,
    /// For `NeedsConfirm`: the token `confirm_voice_command` takes.
    pub confirm_token: Option<String>,
}

impl CommandOutcome {
    fn new(action: Action, status: CommandStatus, target: impl Into<String>) -> Self {
        Self {
            action,
            status,
            target: target.into(),
            candidates: Vec::new(),
            confirm_token: None,
        }
    }
}

/// Payload of `ask:command`: the pill shows "Opening Safari" while it runs.
pub const COMMAND_EVENT: &str = "ask:command";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPill {
    pub action: Action,
    pub target: String,
}

/// Only http and https addresses with a host and no user info; "example.com" becomes
/// "https://example.com".
pub fn validate_url(spoken: &str) -> Option<url::Url> {
    let text = spoken.trim();
    if text.is_empty() || text.contains(char::is_whitespace) {
        return None;
    }
    let with_scheme = if text.contains("://") {
        text.to_string()
    } else {
        format!("https://{text}")
    };
    let url = url::Url::parse(&with_scheme).ok()?;
    let host = url.host_str()?;
    let ok = matches!(url.scheme(), "http" | "https")
        && !host.is_empty()
        && (host.contains('.') || host == "localhost")
        && url.username().is_empty()
        && url.password().is_none();
    ok.then_some(url)
}

// ---------------------------------------------------------------------------------------------
// Quit confirmation

/// How long a Confirm button stays valid.
const CONFIRM_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Debug)]
struct PendingQuit {
    token: String,
    app: AppEntry,
    created: Instant,
}

/// The one quit waiting for Confirm. A new one replaces it; closing the panel (✕, Escape,
/// Cancel) or a new Ask run clears it; a token works once.
#[derive(Default)]
pub struct PendingStore {
    pending: Mutex<Option<PendingQuit>>,
}

impl PendingStore {
    fn put(&self, app: AppEntry, now: Instant) -> String {
        let token = uuid::Uuid::new_v4().to_string();
        *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = Some(PendingQuit {
            token: token.clone(),
            app,
            created: now,
        });
        token
    }

    fn take(&self, token: &str, now: Instant) -> Option<AppEntry> {
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        let valid = guard
            .as_ref()
            .is_some_and(|p| p.token == token && now.duration_since(p.created) <= CONFIRM_TTL);
        if valid {
            guard.take().map(|p| p.app)
        } else {
            None
        }
    }

    pub fn clear(&self) {
        *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

static PENDING: std::sync::OnceLock<PendingStore> = std::sync::OnceLock::new();

fn pending() -> &'static PendingStore {
    PENDING.get_or_init(PendingStore::default)
}

/// Drops a quit waiting for Confirm (the Ask panel closed).
pub fn clear_pending() {
    pending().clear();
}

// ---------------------------------------------------------------------------------------------
// Running a command

/// What `prepare` decided before anything is executed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Plan {
    /// Execute this.
    Run(Resolved),
    /// Show this outcome without executing anything.
    Report(CommandOutcome),
}

/// A command whose target is checked.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolved {
    App(Action, AppEntry),
    Url(url::Url),
    Folder(FolderKind),
    Shortcut(String),
}

/// Checks a command's target: an installed app, a valid address, a known folder or an
/// existing Shortcut. `shortcuts` lists the user's Shortcuts (read only when needed).
pub fn prepare(
    command: &Command,
    apps: &[AppEntry],
    shortcuts: impl FnOnce() -> Vec<String>,
) -> Plan {
    let action = command.action;
    match action {
        _ if action.targets_app() => match apps::resolve(&command.target, apps) {
            Resolution::Found(app) => Plan::Run(Resolved::App(action, app)),
            Resolution::Ambiguous(candidates) => Plan::Report(CommandOutcome {
                candidates,
                ..CommandOutcome::new(action, CommandStatus::Ambiguous, &command.target)
            }),
            Resolution::NotFound => Plan::Report(CommandOutcome::new(
                action,
                CommandStatus::NoMatch,
                &command.target,
            )),
        },
        Action::OpenUrl => match validate_url(&command.target) {
            Some(url) => Plan::Run(Resolved::Url(url)),
            None => Plan::Report(CommandOutcome::new(
                action,
                CommandStatus::InvalidUrl,
                &command.target,
            )),
        },
        Action::OpenFolder => match FolderKind::from_name(&command.target) {
            Some(folder) => Plan::Run(Resolved::Folder(folder)),
            None => Plan::Report(CommandOutcome::new(
                action,
                CommandStatus::NoMatch,
                &command.target,
            )),
        },
        _ => {
            let wanted = command.target.trim().to_lowercase();
            match shortcuts().into_iter().find(|s| s.to_lowercase() == wanted) {
                Some(name) => Plan::Run(Resolved::Shortcut(name)),
                None => Plan::Report(CommandOutcome::new(
                    action,
                    CommandStatus::NoMatch,
                    &command.target,
                )),
            }
        }
    }
}

impl Resolved {
    fn action(&self) -> Action {
        match self {
            Self::App(action, _) => *action,
            Self::Url(_) => Action::OpenUrl,
            Self::Folder(_) => Action::OpenFolder,
            Self::Shortcut(_) => Action::RunShortcut,
        }
    }

    /// What the pill and panel show.
    fn label(&self) -> String {
        match self {
            Self::App(_, app) => app.name.clone(),
            Self::Url(url) => url.host_str().unwrap_or_default().to_string(),
            Self::Folder(folder) => folder.as_str().to_string(),
            Self::Shortcut(name) => name.clone(),
        }
    }
}

/// The macOS side, behind a trait so the flow can be tested without touching real apps.
pub trait Executor {
    fn is_running(&self, app: &AppEntry) -> bool;
    fn open_app(&self, app: &AppEntry) -> bool;
    fn hide_app(&self, app: &AppEntry) -> bool;
    fn quit_app(&self, app: &AppEntry) -> bool;
    fn open_url(&self, url: &url::Url) -> bool;
    fn open_folder(&self, path: &std::path::Path) -> bool;
    fn run_shortcut(&self, name: &str) -> bool;
}

/// Carries out a checked command. Quit only stores the confirmation and returns
/// `NeedsConfirm`.
pub fn execute(
    resolved: Resolved,
    executor: &dyn Executor,
    store: &PendingStore,
) -> CommandOutcome {
    let action = resolved.action();
    let label = resolved.label();
    let status = |ok: bool| {
        if ok {
            CommandStatus::Done
        } else {
            CommandStatus::Failed
        }
    };
    let outcome = |status| CommandOutcome::new(action, status, label.clone());
    match &resolved {
        // Opening the bundle launches it, or brings it (all its windows) to the front when it
        // runs. Switching to an app that is not running opens it too.
        Resolved::App(Action::OpenApp | Action::SwitchTo, app) => {
            outcome(status(executor.open_app(app)))
        }
        Resolved::App(action @ (Action::HideApp | Action::QuitApp), app) => {
            if !executor.is_running(app) {
                return outcome(CommandStatus::NotRunning);
            }
            if *action == Action::HideApp {
                return outcome(status(executor.hide_app(app)));
            }
            let token = store.put(app.clone(), Instant::now());
            CommandOutcome {
                confirm_token: Some(token),
                ..outcome(CommandStatus::NeedsConfirm)
            }
        }
        Resolved::App(..) => outcome(CommandStatus::Failed),
        Resolved::Url(url) => outcome(status(executor.open_url(url))),
        Resolved::Folder(folder) => match folder.path() {
            Some(path) => outcome(status(executor.open_folder(&path))),
            None => outcome(CommandStatus::Failed),
        },
        Resolved::Shortcut(name) => outcome(status(executor.run_shortcut(name))),
    }
}

/// Confirm in the panel: quits the app stored under `token`.
pub fn confirm(token: &str, executor: &dyn Executor, store: &PendingStore) -> Result<(), String> {
    let app = store
        .take(token, Instant::now())
        .ok_or_else(|| "This confirmation has expired.".to_string())?;
    if executor.quit_app(&app) {
        tracing::info!("Voice command: action=quit_app outcome=done (confirmed)");
        Ok(())
    } else {
        tracing::info!("Voice command: action=quit_app outcome=failed (confirmed)");
        Err("The app did not quit.".to_string())
    }
}

/// The installed apps, scanned at most once a minute.
fn installed_apps() -> Vec<AppEntry> {
    static CACHE: Mutex<Option<(Instant, Vec<AppEntry>)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, apps)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(60) {
            return apps.clone();
        }
    }
    let apps = apps::scan(&apps::default_dirs(), platform::display_name);
    *cache = Some((Instant::now(), apps.clone()));
    apps
}

/// Where the decision came from, for the log.
fn source_name(from_ai: bool) -> &'static str {
    if from_ai {
        "ai"
    } else {
        "patterns"
    }
}

/// The Ask hook. Returns `None` when `utterance` is not a command, so Ask answers it as
/// usual. `llm` gives the AI configuration, only when the AI is needed.
pub async fn run<F, Fut>(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    utterance: &str,
    llm: F,
) -> Option<CommandOutcome>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Option<crate::llm::LlmConfig>>,
{
    use tauri::Emitter;

    let started = Instant::now();
    clear_pending();
    let apps = tokio::task::spawn_blocking(installed_apps)
        .await
        .unwrap_or_default();
    let detection = patterns::detect(utterance, |text| apps::mentions_app(text, &apps));

    let pattern_command = match &detection {
        Detection::NotCommand => return None,
        Detection::Command(command) => Some(command.clone()),
        Detection::Maybe => None,
    };
    // A pattern whose app target is unknown ("open source") is checked with the AI.
    let pattern_plan = pattern_command
        .as_ref()
        .map(|command| (command, prepare(command, &apps, platform::list_shortcuts)));
    let (plan, from_ai) = match pattern_plan {
        Some((command, Plan::Report(outcome)))
            if command.action.targets_app() && outcome.status == CommandStatus::NoMatch =>
        {
            match ask_ai(client, utterance, llm).await {
                AiResult::Command(ai_command) => {
                    (prepare(&ai_command, &apps, platform::list_shortcuts), true)
                }
                AiResult::NotCommand => {
                    log(None, "not_command", true, started);
                    return None;
                }
                // No AI: a short spoken name gets "No app called X"; anything longer is a
                // normal Ask.
                AiResult::Unavailable if command.target.split_whitespace().count() <= 3 => {
                    (Plan::Report(outcome), false)
                }
                AiResult::Unavailable => return None,
            }
        }
        Some((_, plan)) => (plan, false),
        None => match ask_ai(client, utterance, llm).await {
            AiResult::Command(command) => {
                (prepare(&command, &apps, platform::list_shortcuts), true)
            }
            AiResult::NotCommand | AiResult::Unavailable => {
                log(None, "not_command", true, started);
                return None;
            }
        },
    };

    let outcome = match plan {
        Plan::Report(outcome) => outcome,
        Plan::Run(resolved) => {
            let _ = app.emit(
                COMMAND_EVENT,
                CommandPill {
                    action: resolved.action(),
                    target: resolved.label(),
                },
            );
            let outcome = execute(resolved, &platform::MacExecutor, pending());
            if outcome.status == CommandStatus::Done {
                // Let the pill show "Opening Safari" for a moment.
                tokio::time::sleep(Duration::from_millis(900)).await;
            }
            outcome
        }
    };
    log(
        Some(outcome.action),
        status_name(outcome.status),
        from_ai,
        started,
    );
    Some(outcome)
}

fn status_name(status: CommandStatus) -> &'static str {
    match status {
        CommandStatus::Done => "done",
        CommandStatus::NeedsConfirm => "needs_confirm",
        CommandStatus::NoMatch => "no_match",
        CommandStatus::Ambiguous => "ambiguous",
        CommandStatus::NotRunning => "not_running",
        CommandStatus::InvalidUrl => "invalid_url",
        CommandStatus::Failed => "failed",
    }
}

fn log(action: Option<Action>, outcome: &str, from_ai: bool, started: Instant) {
    tracing::info!(
        "Voice command: action={} outcome={} source={} ({} ms)",
        action.map_or("none", Action::as_str),
        outcome,
        source_name(from_ai),
        started.elapsed().as_millis()
    );
}

enum AiResult {
    Command(Command),
    NotCommand,
    Unavailable,
}

async fn ask_ai<F, Fut>(client: &reqwest::Client, utterance: &str, llm: F) -> AiResult
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Option<crate::llm::LlmConfig>>,
{
    let Some(config) = llm().await else {
        return AiResult::Unavailable;
    };
    match ai::classify(client, &config, utterance).await {
        Ok(ai::AiDecision::Command(command)) => AiResult::Command(command),
        Ok(ai::AiDecision::NotCommand) => AiResult::NotCommand,
        Ok(ai::AiDecision::Unreadable) => AiResult::Unavailable,
        Err(error) => {
            // A status or transport message; never the utterance.
            tracing::warn!("Voice command check failed ({error})");
            AiResult::Unavailable
        }
    }
}

/// Confirm in the Ask panel.
#[tauri::command]
pub fn confirm_voice_command(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let result = confirm(&token, &platform::MacExecutor, pending());
    crate::ask_panel::close(&app);
    result
}

/// Cancel in the Ask panel.
#[tauri::command]
pub fn cancel_voice_command(app: tauri::AppHandle) {
    clear_pending();
    crate::ask_panel::close(&app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct FakeExecutor {
        running: bool,
        calls: RefCell<Vec<String>>,
    }

    impl Executor for FakeExecutor {
        fn is_running(&self, _: &AppEntry) -> bool {
            self.running
        }
        fn open_app(&self, app: &AppEntry) -> bool {
            self.calls.borrow_mut().push(format!("open {}", app.name));
            true
        }
        fn hide_app(&self, app: &AppEntry) -> bool {
            self.calls.borrow_mut().push(format!("hide {}", app.name));
            true
        }
        fn quit_app(&self, app: &AppEntry) -> bool {
            self.calls.borrow_mut().push(format!("quit {}", app.name));
            true
        }
        fn open_url(&self, url: &url::Url) -> bool {
            self.calls.borrow_mut().push(format!("url {url}"));
            true
        }
        fn open_folder(&self, path: &std::path::Path) -> bool {
            self.calls
                .borrow_mut()
                .push(format!("folder {}", path.display()));
            true
        }
        fn run_shortcut(&self, name: &str) -> bool {
            self.calls.borrow_mut().push(format!("shortcut {name}"));
            true
        }
    }

    fn apps() -> Vec<AppEntry> {
        ["Safari", "Slack", "Zoom"]
            .iter()
            .map(|name| AppEntry {
                name: name.to_string(),
                aliases: vec![],
                path: format!("/Applications/{name}.app").into(),
            })
            .collect()
    }

    fn cmd(action: Action, target: &str) -> Command {
        Command {
            action,
            target: target.into(),
        }
    }

    fn no_shortcuts() -> Vec<String> {
        vec![]
    }

    #[test]
    fn urls_must_be_http_or_https_with_a_host() {
        assert_eq!(
            validate_url("github.com").unwrap().as_str(),
            "https://github.com/"
        );
        assert_eq!(
            validate_url("http://example.org/a?b=1").unwrap().as_str(),
            "http://example.org/a?b=1"
        );
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ftp://example.com",
            "https://user:pw@example.com",
            "not a url",
            "localhost:8080/x y",
            "",
            "https://",
            "safari",
        ] {
            assert!(validate_url(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn prepare_checks_every_target() {
        assert!(matches!(
            prepare(&cmd(Action::OpenApp, "safari"), &apps(), no_shortcuts),
            Plan::Run(Resolved::App(Action::OpenApp, ref app)) if app.name == "Safari"
        ));
        assert!(matches!(
            prepare(&cmd(Action::OpenApp, "Photoshop"), &apps(), no_shortcuts),
            Plan::Report(CommandOutcome {
                status: CommandStatus::NoMatch,
                ..
            })
        ));
        assert!(matches!(
            prepare(
                &cmd(Action::OpenUrl, "javascript:alert(1)"),
                &apps(),
                no_shortcuts
            ),
            Plan::Report(CommandOutcome {
                status: CommandStatus::InvalidUrl,
                ..
            })
        ));
        assert_eq!(
            prepare(&cmd(Action::OpenFolder, "Downloads"), &apps(), no_shortcuts),
            Plan::Run(Resolved::Folder(FolderKind::Downloads))
        );
        assert!(matches!(
            prepare(&cmd(Action::OpenFolder, "/etc"), &apps(), no_shortcuts),
            Plan::Report(CommandOutcome {
                status: CommandStatus::NoMatch,
                ..
            })
        ));
        assert_eq!(
            prepare(
                &cmd(Action::RunShortcut, "morning routine"),
                &apps(),
                || vec!["Morning Routine".into()]
            ),
            Plan::Run(Resolved::Shortcut("Morning Routine".into()))
        );
        assert!(matches!(
            prepare(&cmd(Action::RunShortcut, "rm -rf /"), &apps(), || vec![
                "Morning Routine".into()
            ]),
            Plan::Report(CommandOutcome {
                status: CommandStatus::NoMatch,
                ..
            })
        ));
    }

    #[test]
    fn open_switch_and_hide_run_at_once() {
        let store = PendingStore::default();
        let executor = FakeExecutor {
            running: true,
            ..Default::default()
        };
        let Plan::Run(resolved) = prepare(&cmd(Action::SwitchTo, "slack"), &apps(), no_shortcuts)
        else {
            panic!()
        };
        let outcome = execute(resolved, &executor, &store);
        assert_eq!(outcome.status, CommandStatus::Done);
        assert_eq!(outcome.target, "Slack");
        let Plan::Run(resolved) = prepare(&cmd(Action::HideApp, "zoom"), &apps(), no_shortcuts)
        else {
            panic!()
        };
        assert_eq!(
            execute(resolved, &executor, &store).status,
            CommandStatus::Done
        );
        assert_eq!(*executor.calls.borrow(), ["open Slack", "hide Zoom"]);
    }

    #[test]
    fn hide_or_quit_a_closed_app_says_not_running() {
        let store = PendingStore::default();
        let executor = FakeExecutor::default();
        let Plan::Run(resolved) = prepare(&cmd(Action::QuitApp, "zoom"), &apps(), no_shortcuts)
        else {
            panic!()
        };
        assert_eq!(
            execute(resolved, &executor, &store).status,
            CommandStatus::NotRunning
        );
        assert!(executor.calls.borrow().is_empty());
    }

    #[test]
    fn quit_waits_for_confirm_and_the_token_works_once() {
        let store = PendingStore::default();
        let executor = FakeExecutor {
            running: true,
            ..Default::default()
        };
        let Plan::Run(resolved) = prepare(&cmd(Action::QuitApp, "zoom"), &apps(), no_shortcuts)
        else {
            panic!()
        };
        let outcome = execute(resolved, &executor, &store);
        assert_eq!(outcome.status, CommandStatus::NeedsConfirm);
        assert!(
            executor.calls.borrow().is_empty(),
            "nothing quits before Confirm"
        );
        let token = outcome.confirm_token.unwrap();

        assert!(confirm("wrong", &executor, &store).is_err());
        assert!(confirm(&token, &executor, &store).is_ok());
        assert_eq!(*executor.calls.borrow(), ["quit Zoom"]);
        assert!(
            confirm(&token, &executor, &store).is_err(),
            "a token works once"
        );
    }

    #[test]
    fn cancel_and_expiry_drop_the_pending_quit() {
        let store = PendingStore::default();
        let executor = FakeExecutor {
            running: true,
            ..Default::default()
        };
        let zoom = apps().remove(2);
        let token = store.put(zoom.clone(), Instant::now());
        store.clear();
        assert!(confirm(&token, &executor, &store).is_err());

        let old = Instant::now() - CONFIRM_TTL - Duration::from_secs(1);
        let token = store.put(zoom, old);
        assert!(store.take(&token, Instant::now()).is_none());
        assert!(executor.calls.borrow().is_empty());
    }
}
