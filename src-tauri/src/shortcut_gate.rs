//! Plan `onboarding-shortcut-gate`: which shortcut roles may run right now.
//!
//! While onboarding is not finished, no shortcut starts anything and the pill never shows,
//! except on the tutorial's exercise pages, where the frontend opens the gate for exactly the
//! role being taught (`set_shortcut_gate`). The gate starts closed when the stored
//! `onboarding_completed` flag is not set, so nothing slips through before the webview loads.
//!
//! Every entry point asks the same gate: `hotkey::handle_hotkey_role_event` (native listener
//! and global shortcuts), the native listener's swallow decision (a gated key passes through to
//! the focused app), the `typelite toggle` / `typelite ask` command-line actions and the tray.
//! Escape (`HotkeyRole::Cancel`) is never gated.

use crate::hotkey::HotkeyRole;
use serde::Deserialize;
use std::collections::BTreeSet;
use std::sync::{Arc, RwLock};

/// What the gate allows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutGate {
    /// Normal use: every role.
    All,
    /// Onboarding: only these roles (empty: none).
    Only(BTreeSet<HotkeyRole>),
}

impl ShortcutGate {
    /// Nothing allowed (except Escape, which is never gated).
    pub fn closed() -> Self {
        Self::Only(BTreeSet::new())
    }

    /// The gate at app start: open once onboarding was finished, closed before that.
    pub fn at_startup(onboarding_completed: bool) -> Self {
        if onboarding_completed {
            Self::All
        } else {
            Self::closed()
        }
    }

    /// True when a press of `role` may do something now.
    pub fn allows(&self, role: HotkeyRole) -> bool {
        match self {
            Self::All => true,
            Self::Only(roles) => role == HotkeyRole::Cancel || roles.contains(&role),
        }
    }

    /// Builds the gate the frontend asked for. Unknown role names are an error, so a typo
    /// cannot silently open or close the gate.
    pub fn from_request(request: ShortcutGateRequest) -> Result<Self, String> {
        match request {
            ShortcutGateRequest::Keyword(keyword) if keyword == "all" => Ok(Self::All),
            ShortcutGateRequest::Keyword(other) => Err(format!(
                "unknown shortcut gate \"{other}\" (expected \"all\" or a list of roles)"
            )),
            ShortcutGateRequest::Roles(names) => names
                .iter()
                .map(|name| {
                    HotkeyRole::from_name(name)
                        .ok_or_else(|| format!("unknown shortcut role \"{name}\""))
                })
                .collect::<Result<BTreeSet<_>, _>>()
                .map(Self::Only),
        }
    }

    /// Short text for the log: `all` or the allowed role names.
    pub fn describe(&self) -> String {
        match self {
            Self::All => "all".to_string(),
            Self::Only(roles) if roles.is_empty() => "none".to_string(),
            Self::Only(roles) => roles
                .iter()
                .map(|role| role.as_str())
                .collect::<Vec<_>>()
                .join(", "),
        }
    }
}

/// The argument of `set_shortcut_gate`: the string `"all"`, or a list of role names as
/// `HotkeyRole::as_str` writes them (`dictation`, `translate`, `switchLanguage`, `ask`, …).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum ShortcutGateRequest {
    Keyword(String),
    Roles(Vec<String>),
}

/// The live gate, shared by the key listener thread, dispatch and the command. Reads are
/// cheap (the listener asks on every key press) and never wait on the listener.
#[derive(Debug, Clone)]
pub struct ShortcutGateState(Arc<RwLock<ShortcutGate>>);

impl ShortcutGateState {
    pub fn new(gate: ShortcutGate) -> Self {
        Self(Arc::new(RwLock::new(gate)))
    }

    pub fn get(&self) -> ShortcutGate {
        self.0.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn allows(&self, role: HotkeyRole) -> bool {
        self.0
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .allows(role)
    }

    /// Replaces the gate and returns the previous one.
    pub fn set(&self, gate: ShortcutGate) -> ShortcutGate {
        std::mem::replace(
            &mut *self.0.write().unwrap_or_else(|e| e.into_inner()),
            gate,
        )
    }
}

/// True when `role` may run now. Without a gate in the app state (tests, early startup
/// paths) everything is allowed, as before this plan. Logs a gated press at debug level with
/// the role only.
pub fn allows(handle: &tauri::AppHandle, role: HotkeyRole) -> bool {
    use tauri::Manager;
    let allowed = handle
        .try_state::<ShortcutGateState>()
        .is_none_or(|gate| gate.allows(role));
    if !allowed {
        tracing::debug!(role = role.as_str(), "shortcut gated during onboarding");
    }
    allowed
}

/// The run that must be cancelled when the gate becomes `gate`: the active run's role, when
/// the new gate no longer allows it. See plan `onboarding-shortcut-gate` for why the run is
/// cancelled rather than left to finish.
pub fn run_to_cancel(gate: &ShortcutGate, active_run: Option<HotkeyRole>) -> Option<HotkeyRole> {
    active_run.filter(|role| !gate.allows(*role))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roles(names: &[&str]) -> ShortcutGateRequest {
        ShortcutGateRequest::Roles(names.iter().map(|name| name.to_string()).collect())
    }

    const CONFIGURABLE: [HotkeyRole; 7] = [
        HotkeyRole::Dictation,
        HotkeyRole::Ask,
        HotkeyRole::TranslateSelection,
        HotkeyRole::EditSelection,
        HotkeyRole::SwitchScene,
        HotkeyRole::OpenApp,
        HotkeyRole::SwitchLanguage,
    ];

    #[test]
    fn startup_gate_is_closed_until_onboarding_is_finished() {
        let closed = ShortcutGate::at_startup(false);
        for role in CONFIGURABLE {
            assert!(!closed.allows(role), "{} must be gated", role.as_str());
        }
        let open = ShortcutGate::at_startup(true);
        assert_eq!(open, ShortcutGate::All);
        for role in CONFIGURABLE {
            assert!(open.allows(role));
        }
    }

    #[test]
    fn escape_cancel_is_never_gated() {
        assert!(ShortcutGate::closed().allows(HotkeyRole::Cancel));
        assert!(ShortcutGate::from_request(roles(&["ask"]))
            .unwrap()
            .allows(HotkeyRole::Cancel));
    }

    #[test]
    fn each_tutorial_step_allows_only_its_roles() {
        let dictate = ShortcutGate::from_request(roles(&["dictation"])).unwrap();
        assert!(dictate.allows(HotkeyRole::Dictation));
        assert!(!dictate.allows(HotkeyRole::TranslateSelection));
        assert!(!dictate.allows(HotkeyRole::SwitchLanguage));
        assert!(!dictate.allows(HotkeyRole::Ask));

        let translate =
            ShortcutGate::from_request(roles(&["translate", "switchLanguage"])).unwrap();
        assert!(translate.allows(HotkeyRole::TranslateSelection));
        assert!(translate.allows(HotkeyRole::SwitchLanguage));
        assert!(!translate.allows(HotkeyRole::Dictation));
        assert!(!translate.allows(HotkeyRole::Ask));

        let ask = ShortcutGate::from_request(roles(&["ask"])).unwrap();
        assert!(ask.allows(HotkeyRole::Ask));
        assert!(!ask.allows(HotkeyRole::Dictation));
        assert!(!ask.allows(HotkeyRole::TranslateSelection));

        let none = ShortcutGate::from_request(roles(&[])).unwrap();
        assert_eq!(none, ShortcutGate::closed());
        assert_eq!(none.describe(), "none");
    }

    #[test]
    fn requests_parse_all_and_reject_unknown_names() {
        let all: ShortcutGateRequest = serde_json::from_str("\"all\"").unwrap();
        assert_eq!(ShortcutGate::from_request(all), Ok(ShortcutGate::All));
        let list: ShortcutGateRequest =
            serde_json::from_str("[\"translate\",\"switchLanguage\"]").unwrap();
        assert_eq!(
            ShortcutGate::from_request(list).unwrap().describe(),
            "translate, switchLanguage"
        );
        assert!(ShortcutGate::from_request(ShortcutGateRequest::Keyword("none".into())).is_err());
        assert!(ShortcutGate::from_request(roles(&["dictate"])).is_err());
    }

    #[test]
    fn state_set_returns_the_previous_gate() {
        let state = ShortcutGateState::new(ShortcutGate::at_startup(false));
        assert!(!state.allows(HotkeyRole::Dictation));
        let previous = state.set(ShortcutGate::All);
        assert_eq!(previous, ShortcutGate::closed());
        assert!(state.allows(HotkeyRole::Dictation));
        assert_eq!(state.get(), ShortcutGate::All);
    }

    #[test]
    fn closing_the_gate_cancels_only_a_run_it_no_longer_allows() {
        let ask_only = ShortcutGate::from_request(roles(&["ask"])).unwrap();
        assert_eq!(
            run_to_cancel(&ask_only, Some(HotkeyRole::TranslateSelection)),
            Some(HotkeyRole::TranslateSelection)
        );
        assert_eq!(run_to_cancel(&ask_only, Some(HotkeyRole::Ask)), None);
        assert_eq!(run_to_cancel(&ask_only, None), None);
        assert_eq!(
            run_to_cancel(&ShortcutGate::All, Some(HotkeyRole::Dictation)),
            None
        );
    }
}
