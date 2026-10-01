//! Plan `auto-update`: new versions from GitHub Releases, through Tauri's updater plugin.
//!
//! Each release carries `latest.json` (the newest version, its notes, and a signed
//! `Typelite.app.tar.gz` per platform). The app reads it from
//! `…/releases/latest/download/latest.json` (see `plugins.updater` in tauri.conf.json), checks
//! the download against the public key in the same place, replaces itself and restarts.
//!
//! With `auto_update` on (the default) Typelite checks shortly after start and every few hours,
//! downloads a new version in the background and then asks, on Home, to restart. With it off it
//! only checks when the user presses Check for updates, and Home offers Update. A check asks
//! GitHub for that one file; nothing about the user or what they said is sent.
//!
//! The development build (`dev-build` feature) never updates itself: its update would be the
//! release app, which is a different app.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager};

/// Sent to every window when the status changes (Home's bar, Settings → System).
pub const UPDATE_STATUS_EVENT: &str = "update:status";
/// The first automatic check waits this long after start, so it never slows the launch.
#[cfg_attr(feature = "dev-build", allow(dead_code))]
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(20);
/// Then it checks this often while Typelite runs.
#[cfg_attr(feature = "dev-build", allow(dead_code))]
const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// A download that takes longer than this (the Mac slept, the network went away) is given up,
/// so the next check can run; otherwise the status would stay Downloading until a restart.
#[cfg_attr(feature = "dev-build", allow(dead_code))]
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Whether this program can update itself: a release build inside a `.app` bundle. A debug
/// build or `tauri dev` runs `target/debug/typelite`, and the updater would replace that
/// folder with the release app.
pub fn self_updatable() -> bool {
    if cfg!(feature = "dev-build") || cfg!(debug_assertions) {
        return false;
    }
    std::env::current_exe()
        .map(|exe| exe.to_string_lossy().contains("/Contents/MacOS/"))
        .unwrap_or(false)
}

/// Whether the app bundle can be replaced without an administrator password: its folder
/// (`/Applications`, say) lets this user write. Otherwise the plugin would ask for the
/// password in a dialog with no context, so an automatic check only offers the update.
#[cfg_attr(feature = "dev-build", allow(dead_code))]
fn bundle_replaceable() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    // <folder>/Typelite.app/Contents/MacOS/typelite
    let Some(folder) = exe.ancestors().nth(4) else {
        return false;
    };
    let probe = folder.join(".typelite-update-check");
    let writable = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .is_ok();
    let _ = std::fs::remove_file(&probe);
    writable
}

/// What Home and Settings show about updates.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateStatus {
    /// Nothing checked yet in this run.
    Idle,
    Checking,
    /// This is the newest version.
    #[serde(rename_all = "camelCase")]
    UpToDate {
        checked_at: u64,
    },
    /// A newer version exists and is not downloaded (auto-update off, or before it starts).
    #[serde(rename_all = "camelCase")]
    Available {
        version: String,
        notes: String,
    },
    #[serde(rename_all = "camelCase")]
    Downloading {
        version: String,
        downloaded: u64,
        total: Option<u64>,
    },
    /// Installed; takes effect after a restart.
    #[serde(rename_all = "camelCase")]
    Ready {
        version: String,
        notes: String,
    },
    Failed {
        message: String,
    },
    /// The development build, which never updates itself.
    Disabled,
}

#[derive(Default)]
pub struct UpdateState {
    status: Mutex<Option<UpdateStatus>>,
    /// A check or an install is running; a second one waits for nothing and returns.
    #[cfg_attr(feature = "dev-build", allow(dead_code))]
    busy: tokio::sync::Mutex<()>,
}

impl UpdateState {
    pub fn status(&self) -> UpdateStatus {
        if !self_updatable() {
            return UpdateStatus::Disabled;
        }
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or(UpdateStatus::Idle)
    }

    #[cfg_attr(feature = "dev-build", allow(dead_code))]
    fn set(&self, app: &tauri::AppHandle, status: UpdateStatus) {
        *self.status.lock().unwrap_or_else(|e| e.into_inner()) = Some(status.clone());
        let _ = app.emit(UPDATE_STATUS_EVENT, status);
    }
}

#[cfg_attr(feature = "dev-build", allow(dead_code))]
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Whether the status already has a newer version in hand (so a new check need not run).
pub fn has_update_in_hand(status: &UpdateStatus) -> bool {
    matches!(
        status,
        UpdateStatus::Downloading { .. } | UpdateStatus::Ready { .. }
    )
}

#[cfg(not(feature = "dev-build"))]
mod imp {
    use super::*;
    use tauri_plugin_updater::UpdaterExt;

    /// Asks GitHub for `latest.json`. Returns the update when it is newer than this version.
    async fn fetch(app: &tauri::AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
        let updater = app.updater().map_err(|e| e.to_string())?;
        updater.check().await.map_err(|e| e.to_string())
    }

    /// One check; with `install`, also downloads and installs a newer version.
    pub async fn check(app: &tauri::AppHandle, install: bool) -> UpdateStatus {
        let state = app.state::<UpdateState>();
        let Ok(_busy) = state.busy.try_lock() else {
            return state.status();
        };
        if has_update_in_hand(&state.status()) {
            return state.status();
        }
        state.set(app, UpdateStatus::Checking);
        let update = match fetch(app).await {
            Ok(Some(update)) => update,
            Ok(None) => {
                tracing::info!(
                    "Updates: {} is the newest version",
                    app.package_info().version
                );
                let status = UpdateStatus::UpToDate {
                    checked_at: now_secs(),
                };
                state.set(app, status.clone());
                return status;
            }
            Err(error) => {
                tracing::warn!("Updates: check failed: {error}");
                let status = UpdateStatus::Failed { message: error };
                state.set(app, status.clone());
                return status;
            }
        };
        let version = update.version.clone();
        let notes = update.body.clone().unwrap_or_default();
        tracing::info!("Updates: {version} is available");
        if !install || !bundle_replaceable() {
            if install {
                tracing::info!("Updates: the app's folder needs an administrator; offering it");
            }
            let status = UpdateStatus::Available { version, notes };
            state.set(app, status.clone());
            return status;
        }
        download_and_install(app, update).await
    }

    /// Downloads, checks the signature and installs; the new version runs after a restart.
    async fn download_and_install(
        app: &tauri::AppHandle,
        update: tauri_plugin_updater::Update,
    ) -> UpdateStatus {
        let state = app.state::<UpdateState>();
        let version = update.version.clone();
        let notes = update.body.clone().unwrap_or_default();
        state.set(
            app,
            UpdateStatus::Downloading {
                version: version.clone(),
                downloaded: 0,
                total: None,
            },
        );
        let progress_app = app.clone();
        let progress_version = version.clone();
        let mut downloaded: u64 = 0;
        let mut last_sent = std::time::Instant::now();
        let download = update.download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                if last_sent.elapsed() > Duration::from_millis(250) {
                    last_sent = std::time::Instant::now();
                    progress_app.state::<UpdateState>().set(
                        &progress_app,
                        UpdateStatus::Downloading {
                            version: progress_version.clone(),
                            downloaded,
                            total,
                        },
                    );
                }
            },
            || {},
        );
        let result = match tokio::time::timeout(DOWNLOAD_TIMEOUT, download).await {
            Ok(result) => result.map_err(|error| error.to_string()),
            Err(_) => Err(format!(
                "the download did not finish within {} minutes",
                DOWNLOAD_TIMEOUT.as_secs() / 60
            )),
        };
        let status = match result {
            Ok(()) => {
                tracing::info!("Updates: {version} installed; restart to use it");
                UpdateStatus::Ready { version, notes }
            }
            Err(error) => {
                tracing::warn!("Updates: install of {version} failed: {error}");
                UpdateStatus::Failed { message: error }
            }
        };
        state.set(app, status.clone());
        status
    }

    /// Checks again and installs the version the status offers (Update on Home or Settings).
    pub async fn install(app: &tauri::AppHandle) -> UpdateStatus {
        let state = app.state::<UpdateState>();
        let Ok(_busy) = state.busy.try_lock() else {
            return state.status();
        };
        match fetch(app).await {
            Ok(Some(update)) => download_and_install(app, update).await,
            Ok(None) => {
                let status = UpdateStatus::UpToDate {
                    checked_at: now_secs(),
                };
                state.set(app, status.clone());
                status
            }
            Err(error) => {
                let status = UpdateStatus::Failed { message: error };
                state.set(app, status.clone());
                status
            }
        }
    }
}

/// Starts the automatic checks. Each round reads the setting again, so turning Automatic
/// updates off stops them without a restart.
pub fn start(app: &tauri::AppHandle) {
    app.manage(UpdateState::default());
    if !self_updatable() {
        tracing::info!("Updates: off (not a release app bundle)");
        return;
    }
    #[cfg(not(feature = "dev-build"))]
    {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(FIRST_CHECK_DELAY).await;
            loop {
                let enabled = match app.state::<crate::storage::ConfigManager>().load().await {
                    Ok(config) => config.auto_update,
                    Err(_) => true,
                };
                if enabled {
                    imp::check(&app, true).await;
                }
                tokio::time::sleep(CHECK_INTERVAL).await;
            }
        });
    }
}

#[tauri::command]
pub fn update_status(state: tauri::State<'_, UpdateState>) -> UpdateStatus {
    state.status()
}

/// Settings → Check for updates. With automatic updates on, a newer version is also
/// downloaded; otherwise Home and Settings offer Update.
#[tauri::command]
pub async fn check_for_update(
    app: tauri::AppHandle,
    config: tauri::State<'_, crate::storage::ConfigManager>,
) -> Result<UpdateStatus, String> {
    #[cfg(feature = "dev-build")]
    {
        let _ = (app, config);
        Ok(UpdateStatus::Disabled)
    }
    #[cfg(not(feature = "dev-build"))]
    {
        if !self_updatable() {
            return Ok(UpdateStatus::Disabled);
        }
        let install = config.load().await.map(|c| c.auto_update).unwrap_or(true);
        Ok(imp::check(&app, install).await)
    }
}

/// Home or Settings → Update: downloads and installs the newer version.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    #[cfg(feature = "dev-build")]
    {
        let _ = app;
        Ok(UpdateStatus::Disabled)
    }
    #[cfg(not(feature = "dev-build"))]
    {
        if !self_updatable() {
            return Ok(UpdateStatus::Disabled);
        }
        Ok(imp::install(&app).await)
    }
}

/// Home → Restart to update: starts the installed version. `request_restart` goes through the
/// normal exit (`RunEvent::Exit` in lib.rs: the speech model is freed, the built-in AI and
/// search servers stop); `restart` from a command would skip that and abort in GGML's
/// exit-time cleanup with a model loaded.
#[tauri::command]
pub fn restart_to_update(app: tauri::AppHandle) {
    tracing::info!("Updates: restarting into the new version");
    app.request_restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_serialize_for_the_ui() {
        let value = serde_json::to_value(UpdateStatus::Downloading {
            version: "1.1.0".into(),
            downloaded: 10,
            total: Some(100),
        })
        .unwrap();
        assert_eq!(value["state"], "downloading");
        assert_eq!(value["version"], "1.1.0");
        assert_eq!(value["total"], 100);
        let ready = serde_json::to_value(UpdateStatus::Ready {
            version: "1.1.0".into(),
            notes: "What's New".into(),
        })
        .unwrap();
        assert_eq!(ready["state"], "ready");
        let up_to_date = serde_json::to_value(UpdateStatus::UpToDate { checked_at: 5 }).unwrap();
        assert_eq!(up_to_date["state"], "upToDate");
        assert_eq!(up_to_date["checkedAt"], 5);
    }

    #[test]
    fn a_download_or_installed_update_is_not_checked_again() {
        assert!(has_update_in_hand(&UpdateStatus::Ready {
            version: "1.1.0".into(),
            notes: String::new()
        }));
        assert!(!has_update_in_hand(&UpdateStatus::Available {
            version: "1.1.0".into(),
            notes: String::new()
        }));
        assert!(!has_update_in_hand(&UpdateStatus::Idle));
    }

    #[test]
    fn the_first_check_waits_and_then_repeats_every_six_hours() {
        assert_eq!(FIRST_CHECK_DELAY, Duration::from_secs(20));
        assert_eq!(CHECK_INTERVAL, Duration::from_secs(21_600));
        assert_eq!(DOWNLOAD_TIMEOUT, Duration::from_secs(900));
    }

    #[test]
    fn a_test_binary_never_updates_itself() {
        // `cargo test` runs target/debug/deps/…, not a .app bundle.
        assert!(!self_updatable());
        assert_eq!(UpdateState::default().status(), UpdateStatus::Disabled);
    }
}
