//! Plan 0018: is there a text field to paste into?
//!
//! Before a Dictate or Translate result is pasted, Typelite asks macOS Accessibility for the
//! focused UI element of the whole system (the element keyboard input goes to, in whatever app
//! is frontmost) and reads its role and a few attributes. Only a clear "this is not a text
//! field" skips the paste; the pill then offers a Copy button instead. When the answer is not
//! clear (an error, no focused element, or a role that apps also use for their custom text
//! views), Typelite pastes as before, because some web, Electron and custom-drawn apps report
//! their fields poorly and must not lose paste.
//!
//! The decision itself is a pure function over the role and attributes
//! ([`decide_focus`]), so it is tested without any app.

/// What the focus check found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusDecision {
    /// A text field (or something that takes text) has focus: paste.
    Editable,
    /// Focus is clearly on something that does not take text (a list, a button, an image):
    /// do not paste; offer the Copy pill.
    NotEditable,
    /// Could not tell: paste as before.
    Unknown,
}

/// What Accessibility reported about the focused element. Only role names and flags; the
/// element's text is never read.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FocusedElementInfo {
    /// `AXRole`, for example `AXTextField`.
    pub role: Option<String>,
    /// `AXSubrole`, for example `AXSearchField`.
    pub subrole: Option<String>,
    /// `AXValue` can be set.
    pub value_settable: bool,
    /// `AXSelectedTextRange` can be set (a caret or selection that can move).
    pub selected_range_settable: bool,
    /// The element sits inside editable web content (`AXEditableAncestor`, WebKit and
    /// Chromium).
    pub has_editable_ancestor: bool,
}

/// Roles that take typed text.
const TEXT_ROLES: &[&str] = &["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"];

/// Subroles of text fields (their role is `AXTextField`, but some apps only set the subrole).
const TEXT_SUBROLES: &[&str] = &["AXSearchField", "AXSecureTextField"];

/// Roles that clearly do not take pasted text. Deliberately short: roles that apps also use for
/// custom text views or canvases (`AXGroup`, `AXScrollArea`, `AXWindow`, `AXWebArea`,
/// `AXTable`, `AXLayoutArea`, ...) are not here, so they stay `Unknown` and still paste.
const NON_TEXT_ROLES: &[&str] = &[
    "AXList",
    "AXOutline",
    "AXBrowser",
    "AXButton",
    "AXCheckBox",
    "AXRadioButton",
    "AXRadioGroup",
    "AXPopUpButton",
    "AXMenuButton",
    "AXDisclosureTriangle",
    "AXSlider",
    "AXIncrementor",
    "AXImage",
    "AXTabGroup",
    "AXToolbar",
    "AXMenu",
    "AXMenuBar",
    "AXMenuBarItem",
    "AXMenuItem",
    "AXLink",
    "AXColorWell",
    "AXScrollBar",
    "AXSplitter",
    "AXProgressIndicator",
    "AXLevelIndicator",
    "AXDockItem",
];

/// Decides from what Accessibility reported. `None` means no focused element was reported or
/// the query failed.
pub fn decide_focus(info: Option<&FocusedElementInfo>) -> FocusDecision {
    let Some(info) = info else {
        return FocusDecision::Unknown;
    };
    let role = info.role.as_deref().unwrap_or("");
    let subrole = info.subrole.as_deref().unwrap_or("");
    if TEXT_ROLES.contains(&role) || TEXT_SUBROLES.contains(&subrole) {
        return FocusDecision::Editable;
    }
    // A movable caret, or editable web content (contenteditable, rich editors), takes text
    // whatever its role says.
    if info.selected_range_settable || info.has_editable_ancestor {
        return FocusDecision::Editable;
    }
    if NON_TEXT_ROLES.contains(&role) {
        // Sliders, check boxes and pop-ups have a settable value too, so the role wins here.
        return FocusDecision::NotEditable;
    }
    if info.value_settable {
        return FocusDecision::Editable;
    }
    FocusDecision::Unknown
}

/// Asks Accessibility about the focused element and decides. Takes a few milliseconds (each
/// attribute is a message to the focused app, capped by a short timeout). Logs the decision
/// with the role name only.
pub fn check_focus() -> FocusDecision {
    let start = std::time::Instant::now();
    let info = platform::focused_element_info();
    let decision = decide_focus(info.as_ref());
    tracing::info!(
        "Focus check: {:?} (role={}, subrole={}) in {} ms",
        decision,
        info.as_ref()
            .and_then(|info| info.role.as_deref())
            .unwrap_or("none"),
        info.as_ref()
            .and_then(|info| info.subrole.as_deref())
            .unwrap_or("none"),
        start.elapsed().as_millis()
    );
    decision
}

#[cfg(target_os = "macos")]
mod platform {
    //! Raw calls into the macOS Accessibility API (ApplicationServices). An `AXUIElement` is
    //! a handle to a UI element in another app; reading an attribute sends that app a message.

    use super::FocusedElementInfo;
    use std::ffi::{c_char, c_void, CStr};
    use std::ptr;

    type AXUIElementRef = *const c_void;
    type CFTypeRef = *const c_void;
    type CFStringRef = *const c_void;
    type AXError = i32;
    type Boolean = u8;

    const AX_ERROR_SUCCESS: AXError = 0;
    const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    /// Upper bound for one attribute read, so a hung app cannot stall the paste for long
    /// (the default is about 6 s). A healthy app answers in well under a millisecond.
    const MESSAGING_TIMEOUT_SECONDS: f32 = 0.15;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> AXError;
        fn AXUIElementIsAttributeSettable(
            element: AXUIElementRef,
            attribute: CFStringRef,
            settable: *mut Boolean,
        ) -> AXError;
        fn AXUIElementSetMessagingTimeout(element: AXUIElementRef, timeout: f32) -> AXError;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithBytes(
            allocator: *const c_void,
            bytes: *const u8,
            length: isize,
            encoding: u32,
            is_external: Boolean,
        ) -> CFStringRef;
        fn CFStringGetCString(
            string: CFStringRef,
            buffer: *mut c_char,
            size: isize,
            encoding: u32,
        ) -> Boolean;
        fn CFGetTypeID(cf: CFTypeRef) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFRelease(cf: CFTypeRef);
    }

    /// A Core Foundation object this code owns; released on drop.
    struct Owned(CFTypeRef);

    impl Owned {
        fn new(value: CFTypeRef) -> Option<Self> {
            (!value.is_null()).then_some(Self(value))
        }
    }

    impl Drop for Owned {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0) }
        }
    }

    fn cf_string(text: &str) -> Option<Owned> {
        Owned::new(unsafe {
            CFStringCreateWithBytes(
                ptr::null(),
                text.as_ptr(),
                text.len() as isize,
                CF_STRING_ENCODING_UTF8,
                0,
            )
        })
    }

    fn copy_attribute(element: AXUIElementRef, name: &str) -> Option<Owned> {
        let attribute = cf_string(name)?;
        let mut value: CFTypeRef = ptr::null();
        let error = unsafe { AXUIElementCopyAttributeValue(element, attribute.0, &mut value) };
        if error != AX_ERROR_SUCCESS {
            return None;
        }
        Owned::new(value)
    }

    fn string_attribute(element: AXUIElementRef, name: &str) -> Option<String> {
        let value = copy_attribute(element, name)?;
        if unsafe { CFGetTypeID(value.0) != CFStringGetTypeID() } {
            return None;
        }
        // Role names are short ASCII identifiers.
        let mut buffer = [0 as c_char; 128];
        let ok = unsafe {
            CFStringGetCString(
                value.0,
                buffer.as_mut_ptr(),
                buffer.len() as isize,
                CF_STRING_ENCODING_UTF8,
            )
        };
        if ok == 0 {
            return None;
        }
        let text = unsafe { CStr::from_ptr(buffer.as_ptr()) };
        Some(text.to_string_lossy().into_owned())
    }

    fn is_settable(element: AXUIElementRef, name: &str) -> bool {
        let Some(attribute) = cf_string(name) else {
            return false;
        };
        let mut settable: Boolean = 0;
        let error = unsafe { AXUIElementIsAttributeSettable(element, attribute.0, &mut settable) };
        error == AX_ERROR_SUCCESS && settable != 0
    }

    /// Reads the focused element's role and flags, or `None` when no element is focused or
    /// Accessibility is not available (for example without the permission).
    pub(super) fn focused_element_info() -> Option<FocusedElementInfo> {
        let system = Owned::new(unsafe { AXUIElementCreateSystemWide() })?;
        unsafe { AXUIElementSetMessagingTimeout(system.0, MESSAGING_TIMEOUT_SECONDS) };
        let focused = copy_attribute(system.0, "AXFocusedUIElement")?;
        unsafe { AXUIElementSetMessagingTimeout(focused.0, MESSAGING_TIMEOUT_SECONDS) };

        let mut info = FocusedElementInfo {
            role: string_attribute(focused.0, "AXRole"),
            subrole: string_attribute(focused.0, "AXSubrole"),
            ..FocusedElementInfo::default()
        };
        // A text role decides on its own; skip the extra messages.
        if super::decide_focus(Some(&info)) == super::FocusDecision::Editable {
            return Some(info);
        }
        info.selected_range_settable = is_settable(focused.0, "AXSelectedTextRange");
        info.value_settable = is_settable(focused.0, "AXValue");
        info.has_editable_ancestor = copy_attribute(focused.0, "AXEditableAncestor").is_some();
        Some(info)
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::FocusedElementInfo;

    /// Not implemented outside macOS: always "could not tell", so output pastes as before.
    pub(super) fn focused_element_info() -> Option<FocusedElementInfo> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn role(role: &str) -> FocusedElementInfo {
        FocusedElementInfo {
            role: Some(role.to_string()),
            ..FocusedElementInfo::default()
        }
    }

    #[test]
    fn no_focused_element_or_error_is_unknown() {
        assert_eq!(decide_focus(None), FocusDecision::Unknown);
        assert_eq!(
            decide_focus(Some(&FocusedElementInfo::default())),
            FocusDecision::Unknown
        );
    }

    #[test]
    fn text_roles_are_editable() {
        for name in ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"] {
            assert_eq!(
                decide_focus(Some(&role(name))),
                FocusDecision::Editable,
                "{name}"
            );
        }
        let secure = FocusedElementInfo {
            role: Some("AXGroup".to_string()),
            subrole: Some("AXSecureTextField".to_string()),
            ..FocusedElementInfo::default()
        };
        assert_eq!(decide_focus(Some(&secure)), FocusDecision::Editable);
    }

    #[test]
    fn clear_non_text_roles_are_not_editable() {
        for name in ["AXList", "AXOutline", "AXBrowser", "AXButton", "AXImage"] {
            assert_eq!(
                decide_focus(Some(&role(name))),
                FocusDecision::NotEditable,
                "{name}"
            );
        }
    }

    #[test]
    fn a_settable_value_does_not_make_a_slider_editable() {
        let slider = FocusedElementInfo {
            value_settable: true,
            ..role("AXSlider")
        };
        assert_eq!(decide_focus(Some(&slider)), FocusDecision::NotEditable);
    }

    #[test]
    fn a_movable_caret_or_editable_web_content_is_editable_whatever_the_role() {
        let caret = FocusedElementInfo {
            selected_range_settable: true,
            ..role("AXList")
        };
        assert_eq!(decide_focus(Some(&caret)), FocusDecision::Editable);
        let web = FocusedElementInfo {
            has_editable_ancestor: true,
            ..role("AXWebArea")
        };
        assert_eq!(decide_focus(Some(&web)), FocusDecision::Editable);
    }

    #[test]
    fn ambiguous_containers_stay_unknown_so_they_still_paste() {
        for name in [
            "AXGroup",
            "AXScrollArea",
            "AXWindow",
            "AXApplication",
            "AXWebArea",
            "AXTable",
            "AXLayoutArea",
            "AXUnknown",
        ] {
            assert_eq!(
                decide_focus(Some(&role(name))),
                FocusDecision::Unknown,
                "{name}"
            );
        }
    }

    #[test]
    fn an_unknown_role_with_a_settable_value_is_editable() {
        let custom = FocusedElementInfo {
            value_settable: true,
            ..role("AXGroup")
        };
        assert_eq!(decide_focus(Some(&custom)), FocusDecision::Editable);
    }
}
