//! Plan `voice-commands`: the macOS calls behind each action, through AppKit's `NSWorkspace`
//! (the object that opens files, URLs and apps for the user) and `NSRunningApplication` (one
//! running app: hide, terminate). Other platforms do nothing and report failure.

use std::path::Path;

use super::{AppEntry, Executor};

pub struct MacExecutor;

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::{CStr, CString};
    use std::path::Path;

    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    unsafe fn ns_string(text: &str) -> Option<*mut AnyObject> {
        let c = CString::new(text).ok()?;
        let s: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: c.as_ptr()];
        (!s.is_null()).then_some(s)
    }

    unsafe fn rust_string(s: *mut AnyObject) -> Option<String> {
        if s.is_null() {
            return None;
        }
        let utf8: *const std::ffi::c_char = msg_send![s, UTF8String];
        (!utf8.is_null()).then(|| CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }

    unsafe fn workspace() -> Option<*mut AnyObject> {
        let ws: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        (!ws.is_null()).then_some(ws)
    }

    /// `[[NSWorkspace sharedWorkspace] openURL:]`: opens a file URL (an app bundle launches
    /// or comes to the front, a folder opens in Finder) or a web URL in the default browser.
    pub fn open_url_string(url: &str, file: bool) -> bool {
        objc2::rc::autoreleasepool(|_| unsafe {
            let (Some(ws), Some(text)) = (workspace(), ns_string(url)) else {
                return false;
            };
            let url: *mut AnyObject = if file {
                msg_send![class!(NSURL), fileURLWithPath: text]
            } else {
                msg_send![class!(NSURL), URLWithString: text]
            };
            if url.is_null() {
                return false;
            }
            msg_send![ws, openURL: url]
        })
    }

    /// Runs `f` on the running app whose bundle is at `path`, if any.
    pub fn with_running_app(path: &Path, f: impl Fn(*mut AnyObject) -> bool) -> Option<bool> {
        let wanted = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        objc2::rc::autoreleasepool(|_| unsafe {
            let ws = workspace()?;
            let apps: *mut AnyObject = msg_send![ws, runningApplications];
            if apps.is_null() {
                return None;
            }
            let count: usize = msg_send![apps, count];
            for index in 0..count {
                let app: *mut AnyObject = msg_send![apps, objectAtIndex: index];
                let url: *mut AnyObject = msg_send![app, bundleURL];
                if url.is_null() {
                    continue;
                }
                let app_path: *mut AnyObject = msg_send![url, path];
                let Some(app_path) = rust_string(app_path) else {
                    continue;
                };
                let app_path = std::path::PathBuf::from(app_path);
                let app_path = std::fs::canonicalize(&app_path).unwrap_or(app_path);
                if app_path == wanted {
                    return Some(f(app));
                }
            }
            None
        })
    }

    /// `[[NSFileManager defaultManager] displayNameAtPath:]`: the name Finder shows, in the
    /// user's language ("計算機" for Calculator).
    pub fn display_name(path: &Path) -> Option<String> {
        objc2::rc::autoreleasepool(|_| unsafe {
            let manager: *mut AnyObject = msg_send![class!(NSFileManager), defaultManager];
            let text = ns_string(path.to_str()?)?;
            let name: *mut AnyObject = msg_send![manager, displayNameAtPath: text];
            rust_string(name)
        })
    }
}

impl Executor for MacExecutor {
    fn is_running(&self, app: &AppEntry) -> bool {
        #[cfg(target_os = "macos")]
        return mac::with_running_app(&app.path, |_| true).is_some();
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app;
            false
        }
    }

    fn open_app(&self, app: &AppEntry) -> bool {
        self.open_folder(&app.path)
    }

    fn hide_app(&self, app: &AppEntry) -> bool {
        #[cfg(target_os = "macos")]
        return mac::with_running_app(&app.path, |running| unsafe {
            objc2::msg_send![running, hide]
        })
        .unwrap_or(false);
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app;
            false
        }
    }

    /// `terminate` asks the app to quit, like ⌘Q: it may still ask to save documents.
    fn quit_app(&self, app: &AppEntry) -> bool {
        #[cfg(target_os = "macos")]
        return mac::with_running_app(&app.path, |running| unsafe {
            objc2::msg_send![running, terminate]
        })
        .unwrap_or(false);
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app;
            false
        }
    }

    fn open_url(&self, url: &url::Url) -> bool {
        #[cfg(target_os = "macos")]
        return mac::open_url_string(url.as_str(), false);
        #[cfg(not(target_os = "macos"))]
        {
            let _ = url;
            false
        }
    }

    fn open_folder(&self, path: &Path) -> bool {
        #[cfg(target_os = "macos")]
        return path
            .to_str()
            .is_some_and(|path| mac::open_url_string(path, true));
        #[cfg(not(target_os = "macos"))]
        {
            let _ = path;
            false
        }
    }

    /// `shortcuts run <name>` with a name from `list_shortcuts`; started, not waited for.
    /// The name is one argument, never parsed by a shell.
    fn run_shortcut(&self, name: &str) -> bool {
        #[cfg(target_os = "macos")]
        return std::process::Command::new("/usr/bin/shortcuts")
            .args(["run", name])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .is_ok();
        #[cfg(not(target_os = "macos"))]
        {
            let _ = name;
            false
        }
    }
}

/// The localized name of an app bundle (macOS only).
pub fn display_name(path: &Path) -> Option<String> {
    #[cfg(target_os = "macos")]
    return mac::display_name(path);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        None
    }
}

/// The user's Shortcuts (`shortcuts list`), one name per line.
pub fn list_shortcuts() -> Vec<String> {
    #[cfg(target_os = "macos")]
    if let Ok(output) = std::process::Command::new("/usr/bin/shortcuts")
        .arg("list")
        .output()
    {
        if output.status.success() {
            return String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect();
        }
    }
    Vec::new()
}
