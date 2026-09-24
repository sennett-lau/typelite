//! Permission checks for the onboarding welcome screen: Microphone and Automation.
//! (Accessibility has its own commands in `misc.rs`.)
//!
//! How macOS privacy permissions ("TCC") work, in short:
//! - macOS keeps one answer per app and per permission. The first time an app uses a protected
//!   resource, macOS shows a system prompt; the answer is stored and the prompt never comes back.
//!   After a "Don't Allow" the user must flip the switch in System Settings → Privacy & Security.
//! - Until the user answers, the status is "not determined".
//! - The prompt text comes from `Info.plist` (`NSMicrophoneUsageDescription`,
//!   `NSAppleEventsUsageDescription`). Without that key macOS denies silently.
//! - The grant belongs to the app's code signature. An ad-hoc signed dev build gets a new
//!   signature on every build, so a new build may be asked again (see CLAUDE.md).

use serde::Serialize;

/// Status of one permission, as the onboarding rows show it.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    Granted,
    Denied,
    /// The user has not answered yet (or macOS cannot tell right now).
    NotDetermined,
}

/// Maps `AVAuthorizationStatus` (an Objective-C `NSInteger`) to our status.
/// 0 = not determined, 1 = restricted (parental controls / MDM), 2 = denied, 3 = authorized.
fn microphone_status_from_av(value: isize) -> PermissionStatus {
    match value {
        3 => PermissionStatus::Granted,
        1 | 2 => PermissionStatus::Denied,
        _ => PermissionStatus::NotDetermined,
    }
}

/// Maps an Apple Event permission result (`OSStatus`) to our status.
/// 0 = allowed, -1743 (`errAEEventNotPermitted`) = the user said no,
/// -1744 (`errAEEventWouldRequireUserConsent`) = not asked yet, -600 = System Events not running.
fn automation_status_from_os_status(value: i32) -> PermissionStatus {
    match value {
        0 => PermissionStatus::Granted,
        -1743 => PermissionStatus::Denied,
        _ => PermissionStatus::NotDetermined,
    }
}

/// Maps the result of the probe AppleScript. `osascript` prints the Apple Event error number
/// in its error text, for example `execution error: Not authorized to send Apple events to
/// System Events. (-1743)`.
fn automation_status_from_osascript(success: bool, stderr: &str) -> PermissionStatus {
    if success {
        PermissionStatus::Granted
    } else if stderr.contains("-1743") {
        PermissionStatus::Denied
    } else {
        PermissionStatus::NotDetermined
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use super::PermissionStatus;
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Mutex;

    // AVFoundation is Apple's audio/video framework. `AVCaptureDevice` is its class for
    // cameras and microphones, and it owns the Microphone permission API. We call it through
    // the Objective-C runtime (`objc2`), so no extra bindings crate is needed.
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        /// The `NSString` constant that means "audio" (the microphone) to AVFoundation.
        static AVMediaTypeAudio: *const AnyObject;
    }

    fn capture_device_class() -> Option<&'static AnyClass> {
        AnyClass::get(c"AVCaptureDevice")
    }

    /// `[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]`. Never shows a prompt.
    pub fn microphone_status() -> PermissionStatus {
        let Some(class) = capture_device_class() else {
            return PermissionStatus::NotDetermined;
        };
        // SAFETY: the class method exists on every supported macOS and takes an NSString.
        let value: isize =
            unsafe { msg_send![class, authorizationStatusForMediaType: AVMediaTypeAudio] };
        super::microphone_status_from_av(value)
    }

    /// `[AVCaptureDevice requestAccessForMediaType:completionHandler:]`. Shows the system prompt
    /// only while the status is "not determined"; otherwise macOS calls the handler at once with
    /// the stored answer. The handler runs on a background thread, so we hand the answer back
    /// through a one-shot channel.
    pub async fn request_microphone() -> PermissionStatus {
        let Some(class) = capture_device_class() else {
            return PermissionStatus::NotDetermined;
        };
        let (sender, receiver) = tokio::sync::oneshot::channel::<bool>();
        {
            // The block is not `Send`, so it lives in this scope and is dropped before the
            // `.await` below (AVFoundation keeps its own copy).
            let sender = Mutex::new(Some(sender));
            let handler = RcBlock::new(move |granted: Bool| {
                if let Some(sender) = sender.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    let _ = sender.send(granted.as_bool());
                }
            });
            // SAFETY: AVFoundation copies the block and calls it exactly once.
            let _: () = unsafe {
                msg_send![
                    class,
                    requestAccessForMediaType: AVMediaTypeAudio,
                    completionHandler: &*handler
                ]
            };
        }
        match receiver.await {
            Ok(true) => PermissionStatus::Granted,
            Ok(false) => microphone_status(),
            Err(_) => microphone_status(),
        }
    }

    const SYSTEM_EVENTS_BUNDLE_ID: &str = "com.apple.systemevents";

    // Last answer seen from the probe script, used when macOS cannot answer on its own
    // (System Events not running). 0 = none, 1 = granted, 2 = denied.
    static LAST_AUTOMATION_ANSWER: AtomicU8 = AtomicU8::new(0);

    fn remember(status: PermissionStatus) {
        let value = match status {
            PermissionStatus::Granted => 1,
            PermissionStatus::Denied => 2,
            PermissionStatus::NotDetermined => return,
        };
        LAST_AUTOMATION_ANSWER.store(value, Ordering::Relaxed);
    }

    /// Automation = permission to send Apple Events (AppleScript) to another app. Typelite
    /// sends them to "System Events" to press ⌘V and to read the frontmost app. This check
    /// never shows a prompt.
    pub fn automation_status() -> PermissionStatus {
        let raw = crate::app_detector::platform::automation_permission_status(
            SYSTEM_EVENTS_BUNDLE_ID,
            false,
        );
        let status = super::automation_status_from_os_status(raw);
        if status == PermissionStatus::NotDetermined && raw != -1744 {
            // -600: System Events is not running, so macOS cannot say. Use our last answer.
            return match LAST_AUTOMATION_ANSWER.load(Ordering::Relaxed) {
                1 => PermissionStatus::Granted,
                2 => PermissionStatus::Denied,
                _ => PermissionStatus::NotDetermined,
            };
        }
        remember(status);
        status
    }

    /// Runs a harmless AppleScript against System Events. The first time, macOS shows
    /// "Typelite wants to control System Events" and `osascript` waits for the answer.
    pub fn request_automation() -> PermissionStatus {
        let output = std::process::Command::new("/usr/bin/osascript")
            .args([
                "-e",
                r#"tell application "System Events" to get name of first process"#,
            ])
            .output();
        let status = match output {
            Ok(output) => super::automation_status_from_osascript(
                output.status.success(),
                &String::from_utf8_lossy(&output.stderr),
            ),
            Err(error) => {
                tracing::warn!("Failed to run osascript for the Automation prompt: {error}");
                PermissionStatus::NotDetermined
            }
        };
        remember(status);
        status
    }
}

/// Current Microphone permission, without prompting.
#[tauri::command]
pub fn get_microphone_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        mac::microphone_status()
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::Granted
    }
}

/// Ask for the Microphone permission (shows the macOS prompt the first time) and return
/// the answer.
#[tauri::command]
pub async fn request_microphone_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        mac::request_microphone().await
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::Granted
    }
}

/// Current Automation (Apple Events to System Events) permission, without prompting.
#[tauri::command]
pub async fn get_automation_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(mac::automation_status)
            .await
            .unwrap_or(PermissionStatus::NotDetermined)
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::Granted
    }
}

/// Ask for the Automation permission (shows the macOS prompt the first time) and return the
/// answer. Runs on a blocking thread because `osascript` waits while the prompt is open.
#[tauri::command]
pub async fn request_automation_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(mac::request_automation)
            .await
            .unwrap_or(PermissionStatus::NotDetermined)
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::Granted
    }
}

/// The System Settings → Privacy & Security page for `pane`, as an
/// `x-apple.systempreferences:` URL. Only the three panes onboarding needs are allowed.
fn privacy_settings_url(pane: &str) -> Option<&'static str> {
    match pane {
        "microphone" => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        }
        "accessibility" => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        }
        "automation" => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
        }
        _ => None,
    }
}

/// Open System Settings on a privacy page. Needed after the user once chose "Don't Allow":
/// macOS never shows that prompt again, so the switch must be turned on by hand.
#[tauri::command]
pub fn open_privacy_settings(pane: String) -> Result<(), String> {
    let url = privacy_settings_url(&pane).ok_or_else(|| format!("Unknown privacy pane: {pane}"))?;
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg(url)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with {status}"))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn privacy_settings_url_only_knows_onboarding_panes() {
        assert!(privacy_settings_url("microphone").is_some_and(|u| u.ends_with("Microphone")));
        assert!(privacy_settings_url("automation").is_some_and(|u| u.ends_with("Automation")));
        assert!(privacy_settings_url("accessibility")
            .is_some_and(|u| u.ends_with("Privacy_Accessibility")));
        assert_eq!(privacy_settings_url("camera"), None);
    }

    #[test]
    fn microphone_status_maps_av_authorization_values() {
        assert_eq!(
            microphone_status_from_av(0),
            PermissionStatus::NotDetermined
        );
        assert_eq!(microphone_status_from_av(1), PermissionStatus::Denied);
        assert_eq!(microphone_status_from_av(2), PermissionStatus::Denied);
        assert_eq!(microphone_status_from_av(3), PermissionStatus::Granted);
    }

    #[test]
    fn automation_status_maps_apple_event_results() {
        assert_eq!(
            automation_status_from_os_status(0),
            PermissionStatus::Granted
        );
        assert_eq!(
            automation_status_from_os_status(-1743),
            PermissionStatus::Denied
        );
        assert_eq!(
            automation_status_from_os_status(-1744),
            PermissionStatus::NotDetermined
        );
        assert_eq!(
            automation_status_from_os_status(-600),
            PermissionStatus::NotDetermined
        );
    }

    #[test]
    fn automation_probe_maps_denied_error_and_success() {
        assert_eq!(
            automation_status_from_osascript(true, ""),
            PermissionStatus::Granted
        );
        assert_eq!(
            automation_status_from_osascript(
                false,
                "execution error: Not authorized to send Apple events to System Events. (-1743)"
            ),
            PermissionStatus::Denied
        );
        assert_eq!(
            automation_status_from_osascript(false, "execution error: something else (-1728)"),
            PermissionStatus::NotDetermined
        );
    }

    #[test]
    fn permission_status_serializes_snake_case() {
        assert_eq!(
            serde_json::to_string(&PermissionStatus::NotDetermined).unwrap(),
            "\"not_determined\""
        );
    }
}
