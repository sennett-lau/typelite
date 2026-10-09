#[cfg(not(target_os = "macos"))]
use enigo::{Direction, Enigo, Key, Keyboard, Settings as EnigoSettings};

/// How long to wait for the app to put the selection on the clipboard after ⌘C. Browsers can
/// take well over 100 ms, so the clipboard is polled instead of read once.
const CLIPBOARD_COPY_TIMEOUT_MS: u64 = 500;
const CLIPBOARD_POLL_MS: u64 = 25;
/// How long to wait for the shortcut's own modifier keys (Control, Shift, ...) to be released,
/// so the app sees a plain ⌘C and not, say, ⌃⌘C.
const MODIFIER_RELEASE_TIMEOUT_MS: u64 = 400;

/// Plan `translate-selection-panel`: whether a run reads the highlight. Ask (answer, translate,
/// edit the highlight) and Translate (translate the highlight in place) always do; it is what
/// they are for. Dictate does only when the user turned on "Use selected text as polish
/// context" (`selected_text_enabled`), since it sends the highlight to the AI on every dictation.
pub fn should_capture_selection(
    mode: crate::voice_intent::VoiceMode,
    selected_text_enabled: bool,
) -> bool {
    match mode {
        crate::voice_intent::VoiceMode::Ask | crate::voice_intent::VoiceMode::Translate => true,
        crate::voice_intent::VoiceMode::Dictate => selected_text_enabled,
    }
}

/// Polls `read` every `poll` until it returns something other than the sentinel (the app
/// copied), or `timeout` passes. Returns the last value read.
fn wait_for_clipboard_change(
    mut read: impl FnMut() -> Option<String>,
    sentinel: &str,
    timeout: std::time::Duration,
    poll: std::time::Duration,
) -> Option<String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let value = read();
        if value.as_deref() != Some(sentinel) || std::time::Instant::now() >= deadline {
            return value;
        }
        std::thread::sleep(poll);
    }
}

/// Whether osascript's error output says macOS refused the Apple Event to System Events
/// (Automation permission, error -1743) or the keystroke (Accessibility, error 1002).
fn is_permission_error(stderr: &str) -> bool {
    stderr.contains("-1743") || stderr.contains("1002") || stderr.contains("not allowed")
}

#[cfg(target_os = "macos")]
mod modifiers {
    // CGEventSourceFlagsState reads the modifier keys held right now (no permission needed).
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceFlagsState(state_id: i32) -> u64;
    }
    /// kCGEventSourceStateHIDSystemState: the hardware state.
    const HID_SYSTEM_STATE: i32 = 1;
    /// Shift, Control, Option and Command. Fn is left out: in hold mode it stays down for the
    /// whole recording and does not change ⌘C.
    const MASK: u64 = 0x0002_0000 | 0x0004_0000 | 0x0008_0000 | 0x0010_0000;

    pub fn any_held() -> bool {
        // SAFETY: a plain query with a valid state id.
        unsafe { CGEventSourceFlagsState(HID_SYSTEM_STATE) & MASK != 0 }
    }
}

#[cfg(target_os = "macos")]
fn wait_for_modifier_release() {
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_millis(MODIFIER_RELEASE_TIMEOUT_MS);
    while modifiers::any_held() {
        if std::time::Instant::now() >= deadline {
            tracing::debug!("Selected text: modifier keys still held; copying anyway");
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(CLIPBOARD_POLL_MS));
    }
}

#[cfg(not(target_os = "macos"))]
fn wait_for_modifier_release() {}

pub fn selected_text_from_clipboard_result(
    selected: Option<String>,
    sentinel: &str,
) -> Option<String> {
    match selected {
        Some(text) if !text.trim().is_empty() && text != sentinel => Some(text),
        _ => None,
    }
}

fn clipboard_copy_sentinel() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!(
        "__typelite_copy_sentinel_{}_{}__",
        std::process::id(),
        nanos
    )
}

#[cfg(target_os = "macos")]
fn copy_selected_text_to_clipboard() -> bool {
    // The same System Events route as the paste (⌘V) in `output/clipboard.rs`, so it needs no
    // permission the paste does not already need: Accessibility, and Automation of System
    // Events (asked once, on first use).
    match std::process::Command::new("/usr/bin/osascript")
        .args([
            "-e",
            r#"tell application "System Events" to keystroke "c" using command down"#,
        ])
        .output()
    {
        Ok(output) if output.status.success() => true,
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if is_permission_error(&stderr) {
                tracing::warn!(
                    "Selected text: macOS refused the copy keystroke. Allow Typelite in System \
                     Settings → Privacy & Security → Accessibility and → Automation → System Events"
                );
            } else {
                tracing::warn!(
                    "macOS selected-text copy failed with exit code: {:?}",
                    output.status.code()
                );
            }
            false
        }
        Err(e) => {
            tracing::warn!("Failed to run osascript for selected-text copy: {}", e);
            false
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn copy_selected_text_to_clipboard() -> bool {
    let Ok(mut enigo) = Enigo::new(&EnigoSettings::default()) else {
        return false;
    };

    let pressed = enigo.key(Key::Control, Direction::Press).is_ok();
    if pressed {
        let _ = enigo.key(Key::Unicode('c'), Direction::Click);
        let _ = enigo.key(Key::Control, Direction::Release);
    }
    pressed
}

pub fn capture_selected_text() -> Option<String> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    let backup = clipboard.get_text().ok();
    let sentinel = clipboard_copy_sentinel();
    let _ = clipboard.set_text(&sentinel);

    wait_for_modifier_release();
    let started = std::time::Instant::now();
    let selected = if copy_selected_text_to_clipboard() {
        wait_for_clipboard_change(
            || clipboard.get_text().ok(),
            &sentinel,
            std::time::Duration::from_millis(CLIPBOARD_COPY_TIMEOUT_MS),
            std::time::Duration::from_millis(CLIPBOARD_POLL_MS),
        )
    } else {
        tracing::debug!("Selected text copy shortcut could not be sent");
        None
    };

    if let Some(ref b) = backup {
        let _ = clipboard.set_text(b);
    } else {
        let _ = clipboard.set_text("");
    }

    tracing::info!(
        "Selected text capture: backup_len={}, selected_len={}, wait_ms={}",
        backup.as_deref().map(|s| s.len()).unwrap_or(0),
        selected
            .as_deref()
            .filter(|text| *text != sentinel)
            .map(|s| s.len())
            .unwrap_or(0),
        started.elapsed().as_millis()
    );

    let result = selected_text_from_clipboard_result(selected, &sentinel);
    if result.is_none() {
        tracing::debug!("Selected text capture did not produce fresh clipboard text");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice_intent::VoiceMode;

    #[test]
    fn ask_and_translate_always_read_the_highlight_dictate_only_when_enabled() {
        for enabled in [false, true] {
            assert!(should_capture_selection(VoiceMode::Ask, enabled));
            assert!(should_capture_selection(VoiceMode::Translate, enabled));
        }
        assert!(!should_capture_selection(VoiceMode::Dictate, false));
        assert!(should_capture_selection(VoiceMode::Dictate, true));
    }

    #[test]
    fn clipboard_is_polled_until_the_app_copies() {
        let mut reads = vec!["S", "S", "copied"].into_iter();
        let value = wait_for_clipboard_change(
            || reads.next().map(str::to_string),
            "S",
            std::time::Duration::from_secs(1),
            std::time::Duration::from_millis(1),
        );
        assert_eq!(value.as_deref(), Some("copied"));
    }

    #[test]
    fn clipboard_polling_gives_up_after_the_timeout() {
        let value = wait_for_clipboard_change(
            || Some("S".to_string()),
            "S",
            std::time::Duration::from_millis(20),
            std::time::Duration::from_millis(5),
        );
        assert_eq!(selected_text_from_clipboard_result(value, "S"), None);
    }

    #[test]
    fn permission_refusals_are_recognised() {
        assert!(is_permission_error(
            "execution error: Not authorized to send Apple events to System Events. (-1743)"
        ));
        assert!(is_permission_error(
            "System Events got an error: osascript is not allowed to send keystrokes. (1002)"
        ));
        assert!(!is_permission_error("syntax error"));
    }

    #[test]
    fn selected_text_rejects_copy_sentinel_when_clipboard_was_unchanged() {
        assert_eq!(
            selected_text_from_clipboard_result(Some("__sentinel__".to_string()), "__sentinel__"),
            None
        );
    }

    #[test]
    fn selected_text_accepts_text_that_matches_previous_clipboard_backup() {
        assert_eq!(
            selected_text_from_clipboard_result(Some("selected text".to_string()), "__sentinel__"),
            Some("selected text".to_string())
        );
    }

    #[test]
    fn selected_text_rejects_whitespace_only_clipboard() {
        assert_eq!(
            selected_text_from_clipboard_result(Some(" \n\t ".to_string()), "__sentinel__"),
            None
        );
    }
}
