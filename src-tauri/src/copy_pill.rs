//! Plan 0018: the Copy pill. When a Dictate or Translate result is ready and focus is clearly
//! not on a text field, the result is not pasted. It is kept here instead, the clipboard is
//! left alone, and the pill shows the start of the text with a Copy button. The pill closes on
//! Copy, on Escape, when its countdown runs out, or when a new run starts.

use crate::output::focus::FocusDecision;
use crate::output::InsertionStrategy;
use std::sync::{Arc, Mutex};

/// Event that shows the Copy pill (payload [`CopyOffer`]) or closes it (payload `null`).
pub const COPY_OFFER_EVENT: &str = "pipeline:copy_offer";

/// What the pill shows: the full result (it truncates the preview itself) and, for a
/// translation, the target language code for the language tag.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyOffer {
    pub text: String,
    pub target_lang: Option<String>,
}

/// A run that may end in the Copy pill (Dictate and Translate; Ask never does). Carries the
/// language tag the pill would show.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CopyPillRun {
    pub target_lang: Option<String>,
}

/// The result waiting in the pill, if the pill is up. Cloned handles share one slot.
#[derive(Debug, Clone, Default)]
pub struct CopyOfferSlot(Arc<Mutex<Option<String>>>);

impl CopyOfferSlot {
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<String>> {
        self.0.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// Keeps `text` for the pill, replacing an older offer.
    pub fn hold(&self, text: &str) {
        *self.lock() = Some(text.to_string());
    }

    /// True while the pill offers a result (Escape then closes the pill).
    pub fn is_up(&self) -> bool {
        self.lock().is_some()
    }

    /// Takes the result for Copy; the pill then shows "Copied" and closes by itself.
    pub fn take(&self) -> Option<String> {
        self.lock().take()
    }

    /// Drops the offer. Returns true when there was one.
    pub fn clear(&self) -> bool {
        self.lock().take().is_some()
    }
}

/// Paths that paste or type into the focused app. Copy-only output never pastes, so it never
/// needs the pill.
fn strategy_pastes(strategy: InsertionStrategy) -> bool {
    strategy != InsertionStrategy::ClipboardCopyOnly
}

/// Whether a result goes to the Copy pill instead of being pasted. `focus` runs only when it
/// matters (it asks Accessibility). Only a clear "not a text field" holds the result: unknown
/// focus pastes as before, and a changed target app keeps its own copy-to-clipboard fallback.
pub fn should_hold_for_copy_pill(
    run: Option<&CopyPillRun>,
    strategy: InsertionStrategy,
    target_still_matches: bool,
    focus: impl FnOnce() -> FocusDecision,
) -> bool {
    run.is_some()
        && strategy_pastes(strategy)
        && target_still_matches
        && focus() == FocusDecision::NotEditable
}

/// Whether live streaming into the app may start. Streaming types while the AI is still
/// writing, so the focus is checked before it starts: with no text field, the run does not
/// stream and its final result goes through [`should_hold_for_copy_pill`] (checked again then,
/// because the user may click into a field meanwhile).
pub fn streaming_allowed(run: Option<&CopyPillRun>, focus: impl FnOnce() -> FocusDecision) -> bool {
    run.is_none() || focus() != FocusDecision::NotEditable
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run() -> CopyPillRun {
        CopyPillRun::default()
    }

    #[test]
    fn a_dictation_with_no_text_field_is_held_for_the_pill() {
        assert!(should_hold_for_copy_pill(
            Some(&run()),
            InsertionStrategy::Auto,
            true,
            || FocusDecision::NotEditable
        ));
        assert!(should_hold_for_copy_pill(
            Some(&run()),
            InsertionStrategy::ClipboardPaste,
            true,
            || FocusDecision::NotEditable
        ));
    }

    #[test]
    fn editable_or_unknown_focus_pastes_as_before() {
        for focus in [FocusDecision::Editable, FocusDecision::Unknown] {
            assert!(!should_hold_for_copy_pill(
                Some(&run()),
                InsertionStrategy::Auto,
                true,
                || focus
            ));
        }
    }

    #[test]
    fn ask_copy_only_and_changed_targets_never_ask_for_focus() {
        let never = || -> FocusDecision { panic!("focus must not be checked") };
        assert!(!should_hold_for_copy_pill(
            None,
            InsertionStrategy::Auto,
            true,
            never
        ));
        assert!(!should_hold_for_copy_pill(
            Some(&run()),
            InsertionStrategy::ClipboardCopyOnly,
            true,
            never
        ));
        assert!(!should_hold_for_copy_pill(
            Some(&run()),
            InsertionStrategy::Auto,
            false,
            never
        ));
    }

    #[test]
    fn streaming_is_skipped_only_when_there_is_no_text_field() {
        assert!(!streaming_allowed(Some(&run()), || {
            FocusDecision::NotEditable
        }));
        assert!(streaming_allowed(Some(&run()), || FocusDecision::Unknown));
        assert!(streaming_allowed(Some(&run()), || FocusDecision::Editable));
        assert!(streaming_allowed(None, || panic!("Ask does not check")));
    }

    #[test]
    fn the_slot_keeps_one_offer_until_copied_or_closed() {
        let slot = CopyOfferSlot::default();
        assert!(!slot.is_up());
        slot.hold("first");
        slot.hold("second");
        let shared = slot.clone();
        assert!(shared.is_up());
        assert_eq!(shared.take().as_deref(), Some("second"));
        assert!(!slot.is_up());
        assert!(!slot.clear());
        slot.hold("third");
        assert!(slot.clear());
        assert_eq!(slot.take(), None);
    }

    #[test]
    fn the_offer_serializes_for_the_frontend() {
        let offer = CopyOffer {
            text: "Hi".to_string(),
            target_lang: Some("ja".to_string()),
        };
        assert_eq!(
            serde_json::to_value(offer).unwrap(),
            serde_json::json!({ "text": "Hi", "targetLang": "ja" })
        );
    }
}
