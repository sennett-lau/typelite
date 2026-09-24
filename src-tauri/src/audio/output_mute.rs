//! "Mute other audio while recording" (Settings → General → Audio).
//!
//! When a recording starts and the setting is on, Typelite mutes the default output device if
//! it is not muted already, and remembers that it did so. When the recording ends, it unmutes
//! only if Typelite was the one that muted it, so sound the user muted stays muted.
//!
//! Crash safety: while Typelite holds the mute, a small flag file (`muted-by-typelite`) sits in
//! the app data folder. If the app dies mid-recording, the next start sees the flag, unmutes
//! and deletes it (see [`init`]).
//!
//! The state handling is plain Rust behind two small traits so it can be unit-tested; the
//! CoreAudio calls live in [`coreaudio_backend`] and only build on macOS.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// Reads and sets the mute state of the system's default output device.
pub(crate) trait OutputMuteBackend {
    /// `Some(true)` when muted, `None` when the device cannot report it.
    fn is_muted(&self) -> Option<bool>;
    /// Returns `true` when the change was applied.
    fn set_muted(&self, muted: bool) -> bool;
}

/// Stores the "Typelite muted the output" marker that survives a crash.
pub(crate) trait MuteFlagStore {
    fn exists(&self) -> bool;
    fn write(&self);
    fn remove(&self);
}

/// Recording sessions that asked for muting, and whether Typelite currently holds the mute.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct MuteState {
    sessions: u32,
    muted_by_us: bool,
}

impl MuteState {
    /// A recording with the setting on has started.
    pub(crate) fn begin(&mut self, backend: &impl OutputMuteBackend, flag: &impl MuteFlagStore) {
        self.sessions += 1;
        if self.sessions > 1 || self.muted_by_us {
            return;
        }
        // Already muted (by the user or another app): leave it alone and do not claim it.
        if backend.is_muted() != Some(false) {
            return;
        }
        // Write the flag first so a crash right after muting still gets repaired.
        flag.write();
        if backend.set_muted(true) {
            self.muted_by_us = true;
        } else {
            flag.remove();
        }
    }

    /// That recording has ended, for any reason.
    pub(crate) fn end(&mut self, backend: &impl OutputMuteBackend, flag: &impl MuteFlagStore) {
        self.sessions = self.sessions.saturating_sub(1);
        if self.sessions > 0 || !self.muted_by_us {
            return;
        }
        self.muted_by_us = false;
        backend.set_muted(false);
        flag.remove();
    }
}

/// On startup: if a previous run muted the output and never restored it, unmute now.
pub(crate) fn restore_after_crash(backend: &impl OutputMuteBackend, flag: &impl MuteFlagStore) {
    if flag.exists() {
        if backend.is_muted() == Some(true) {
            backend.set_muted(false);
        }
        flag.remove();
        tracing::info!("Restored output audio muted by a previous Typelite run");
    }
}

struct FileFlag(PathBuf);

impl MuteFlagStore for FileFlag {
    fn exists(&self) -> bool {
        self.0.exists()
    }
    fn write(&self) {
        if let Err(error) = std::fs::write(&self.0, b"1") {
            tracing::warn!("Failed to write output-mute flag: {error}");
        }
    }
    fn remove(&self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

const FLAG_FILE_NAME: &str = "muted-by-typelite";

static FLAG_PATH: OnceLock<PathBuf> = OnceLock::new();
static STATE: Mutex<MuteState> = Mutex::new(MuteState {
    sessions: 0,
    muted_by_us: false,
});

/// Call once at startup with the app data folder. Repairs a mute left by a crash.
pub fn init(data_dir: &std::path::Path) {
    let path = data_dir.join(FLAG_FILE_NAME);
    let _ = FLAG_PATH.set(path.clone());
    #[cfg(target_os = "macos")]
    restore_after_crash(&coreaudio_backend::DefaultOutput, &FileFlag(path));
    #[cfg(not(target_os = "macos"))]
    let _ = path;
}

/// Held by the audio capture thread for as long as the microphone records. Muting happens
/// when it is created and the unmute when it is dropped, so every way a recording can end
/// (stop, cancel, error, pipeline reset) restores the sound.
pub struct RecordingMute {
    _private: (),
}

impl RecordingMute {
    pub fn begin() -> Self {
        with_platform(|state, backend, flag| state.begin(backend, flag));
        Self { _private: () }
    }
}

impl Drop for RecordingMute {
    fn drop(&mut self) {
        with_platform(|state, backend, flag| state.end(backend, flag));
    }
}

#[cfg(target_os = "macos")]
fn with_platform(
    action: impl FnOnce(&mut MuteState, &coreaudio_backend::DefaultOutput, &FileFlag),
) {
    let Some(path) = FLAG_PATH.get() else {
        return;
    };
    let mut state = STATE.lock().unwrap_or_else(|error| error.into_inner());
    action(
        &mut state,
        &coreaudio_backend::DefaultOutput,
        &FileFlag(path.clone()),
    );
}

#[cfg(not(target_os = "macos"))]
fn with_platform(_action: impl FnOnce(&mut MuteState, &NoOutput, &FileFlag)) {
    // Muting other audio is macOS only for now.
    let _ = (&STATE, FLAG_PATH.get());
}

#[cfg(not(target_os = "macos"))]
struct NoOutput;

#[cfg(not(target_os = "macos"))]
impl OutputMuteBackend for NoOutput {
    fn is_muted(&self) -> Option<bool> {
        None
    }
    fn set_muted(&self, _muted: bool) -> bool {
        false
    }
}

/// CoreAudio access to the default output device.
///
/// CoreAudio models every device and the system itself as an "audio object" with
/// properties. A property is addressed by a selector (what), a scope (input, output or
/// global) and an element (channel; 0 means the main element):
/// - `kAudioHardwarePropertyDefaultOutputDevice` on the system object
///   (`kAudioObjectSystemObject`) gives the `AudioDeviceID` of the current default output.
/// - `kAudioDevicePropertyMute` on that device's output scope is a `UInt32`, 1 = muted.
///
/// `AudioObjectGetPropertyData` / `AudioObjectSetPropertyData` read and write a property;
/// they return an `OSStatus` where 0 means success. Some devices (for example HDMI outputs)
/// have no settable mute; then Typelite simply leaves the sound as it is.
#[cfg(target_os = "macos")]
mod coreaudio_backend {
    use super::OutputMuteBackend;
    use coreaudio_sys::{
        kAudioDevicePropertyMute, kAudioDevicePropertyScopeOutput,
        kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyElementMain,
        kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject, AudioDeviceID,
        AudioObjectGetPropertyData, AudioObjectIsPropertySettable, AudioObjectPropertyAddress,
        AudioObjectSetPropertyData, Boolean,
    };
    use std::ffi::c_void;

    pub(crate) struct DefaultOutput;

    fn default_output_device() -> Option<AudioDeviceID> {
        let address = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut device: AudioDeviceID = 0;
        let mut size = std::mem::size_of::<AudioDeviceID>() as u32;
        // SAFETY: `device` and `size` are valid for writes and `size` matches `device`.
        let status = unsafe {
            AudioObjectGetPropertyData(
                kAudioObjectSystemObject,
                &address,
                0,
                std::ptr::null(),
                &mut size,
                &mut device as *mut AudioDeviceID as *mut c_void,
            )
        };
        (status == 0 && device != 0).then_some(device)
    }

    fn mute_address() -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        }
    }

    impl OutputMuteBackend for DefaultOutput {
        fn is_muted(&self) -> Option<bool> {
            let device = default_output_device()?;
            let address = mute_address();
            let mut muted: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            // SAFETY: `muted` and `size` are valid for writes and `size` matches `muted`.
            let status = unsafe {
                AudioObjectGetPropertyData(
                    device,
                    &address,
                    0,
                    std::ptr::null(),
                    &mut size,
                    &mut muted as *mut u32 as *mut c_void,
                )
            };
            (status == 0).then_some(muted != 0)
        }

        fn set_muted(&self, muted: bool) -> bool {
            let Some(device) = default_output_device() else {
                return false;
            };
            let address = mute_address();
            let mut settable: Boolean = 0;
            // SAFETY: `settable` is valid for writes.
            let status = unsafe { AudioObjectIsPropertySettable(device, &address, &mut settable) };
            if status != 0 || settable == 0 {
                return false;
            }
            let value: u32 = u32::from(muted);
            // SAFETY: `value` lives for the call and the size matches its type.
            let status = unsafe {
                AudioObjectSetPropertyData(
                    device,
                    &address,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<u32>() as u32,
                    &value as *const u32 as *const c_void,
                )
            };
            status == 0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct FakeOutput {
        muted: Cell<Option<bool>>,
        settable: bool,
    }

    impl FakeOutput {
        fn new(muted: bool) -> Self {
            Self {
                muted: Cell::new(Some(muted)),
                settable: true,
            }
        }
    }

    impl OutputMuteBackend for FakeOutput {
        fn is_muted(&self) -> Option<bool> {
            self.muted.get()
        }
        fn set_muted(&self, muted: bool) -> bool {
            if !self.settable {
                return false;
            }
            self.muted.set(Some(muted));
            true
        }
    }

    #[derive(Default)]
    struct FakeFlag(Cell<bool>);

    impl MuteFlagStore for FakeFlag {
        fn exists(&self) -> bool {
            self.0.get()
        }
        fn write(&self) {
            self.0.set(true);
        }
        fn remove(&self) {
            self.0.set(false);
        }
    }

    #[test]
    fn mutes_unmuted_output_and_restores_it_when_the_recording_ends() {
        let output = FakeOutput::new(false);
        let flag = FakeFlag::default();
        let mut state = MuteState::default();

        state.begin(&output, &flag);
        assert_eq!(output.is_muted(), Some(true));
        assert!(flag.exists());

        state.end(&output, &flag);
        assert_eq!(output.is_muted(), Some(false));
        assert!(!flag.exists());
    }

    #[test]
    fn leaves_output_the_user_already_muted_alone() {
        let output = FakeOutput::new(true);
        let flag = FakeFlag::default();
        let mut state = MuteState::default();

        state.begin(&output, &flag);
        assert!(!flag.exists());
        state.end(&output, &flag);

        assert_eq!(
            output.is_muted(),
            Some(true),
            "never unmute the user's own mute"
        );
    }

    #[test]
    fn overlapping_recordings_unmute_only_after_the_last_one_ends() {
        let output = FakeOutput::new(false);
        let flag = FakeFlag::default();
        let mut state = MuteState::default();

        state.begin(&output, &flag);
        state.begin(&output, &flag);
        state.end(&output, &flag);
        assert_eq!(output.is_muted(), Some(true));
        state.end(&output, &flag);
        assert_eq!(output.is_muted(), Some(false));
    }

    #[test]
    fn device_without_settable_mute_is_left_unchanged_and_not_flagged() {
        let output = FakeOutput {
            muted: Cell::new(Some(false)),
            settable: false,
        };
        let flag = FakeFlag::default();
        let mut state = MuteState::default();

        state.begin(&output, &flag);
        assert!(!flag.exists());
        state.end(&output, &flag);
        assert_eq!(output.is_muted(), Some(false));
    }

    #[test]
    fn unknown_mute_state_is_not_touched() {
        let output = FakeOutput {
            muted: Cell::new(None),
            settable: true,
        };
        let flag = FakeFlag::default();
        let mut state = MuteState::default();

        state.begin(&output, &flag);
        state.end(&output, &flag);
        assert_eq!(output.is_muted(), None);
        assert!(!flag.exists());
    }

    #[test]
    fn crash_flag_unmutes_and_is_deleted_on_startup() {
        let output = FakeOutput::new(true);
        let flag = FakeFlag::default();
        flag.write();

        restore_after_crash(&output, &flag);

        assert_eq!(output.is_muted(), Some(false));
        assert!(!flag.exists());
    }

    #[test]
    fn no_crash_flag_means_startup_leaves_a_muted_output_alone() {
        let output = FakeOutput::new(true);
        let flag = FakeFlag::default();

        restore_after_crash(&output, &flag);

        assert_eq!(output.is_muted(), Some(true));
    }

    #[test]
    fn file_flag_round_trips_on_disk() {
        let path = std::env::temp_dir().join(format!(
            "typelite-mute-flag-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let flag = FileFlag(path);
        assert!(!flag.exists());
        flag.write();
        assert!(flag.exists());
        flag.remove();
        assert!(!flag.exists());
    }
}
