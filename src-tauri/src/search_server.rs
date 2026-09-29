//! Plan `searxng-setup`: the Built-in web search provider. Typelite downloads SearXNG with a
//! private Python into `<app data>/search/`, runs it on 127.0.0.1 only, and updates it.
//!
//! Nothing is downloaded until the user presses Set up. The parts:
//! - `uv` (MIT/Apache), one binary from its GitHub release, checked with the release's SHA-256.
//!   It downloads a standalone Python and installs SearXNG's libraries, so the Mac needs no
//!   Python, git or Docker.
//! - SearXNG (AGPL-3.0) from one commit of its `master` branch. It is fetched at the user's
//!   request and runs as its own program; it is never part of Typelite's bundle.
//!
//! The server runs only while Typelite runs: started by the first web search (or at launch when
//! Built-in is chosen) and stopped at quit, like the built-in AI server (`llm/builtin.rs`).
//! SearXNG does not log queries; its output goes to `search/searxng.log`.

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

/// Progress events while setting up or updating (`SetupProgress`).
pub const SETUP_EVENT: &str = "search:setup_progress";
/// The port SearXNG gets when it is free.
pub const PREFERRED_PORT: u16 = 8888;
/// How long a search waits for a server that is starting.
pub const START_TIMEOUT: Duration = Duration::from_secs(15);
/// The Python version uv installs for SearXNG (it needs 3.11 or newer).
pub const PYTHON_VERSION: &str = "3.12";
const SEARXNG_REPO: &str = "searxng/searxng";
const UV_RELEASES: &str = "https://github.com/astral-sh/uv/releases/latest/download";

/// The files under `<app data>/search/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchPaths {
    pub root: PathBuf,
}

impl SearchPaths {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    pub fn uv(&self) -> PathBuf {
        self.root.join("bin").join("uv")
    }
    pub fn python_dir(&self) -> PathBuf {
        self.root.join("python")
    }
    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }
    pub fn install_dir(&self, commit: &str) -> PathBuf {
        self.root.join(format!("searxng-{}", short_commit(commit)))
    }
    pub fn venv_python(&self, commit: &str) -> PathBuf {
        self.install_dir(commit).join(".venv/bin/python")
    }
    pub fn settings(&self) -> PathBuf {
        self.root.join("settings.yml")
    }
    pub fn installed_file(&self) -> PathBuf {
        self.root.join("installed.json")
    }
    pub fn log(&self) -> PathBuf {
        self.root.join("searxng.log")
    }
}

fn short_commit(commit: &str) -> &str {
    &commit[..commit.len().min(12)]
}

/// What is set up: SearXNG's commit, its date, and when Typelite installed it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub commit: String,
    /// The commit's date (ISO 8601), shown as the version.
    pub commit_date: String,
    /// Seconds since 1970 when it was set up.
    pub installed_at: u64,
    /// The random `secret_key` in settings.yml, kept across updates.
    pub secret_key: String,
}

/// What Settings shows about the installed version (no secret key).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledInfo {
    pub commit: String,
    pub commit_date: String,
    pub installed_at: u64,
}

impl From<Installed> for InstalledInfo {
    fn from(installed: Installed) -> Self {
        Self {
            commit: installed.commit,
            commit_date: installed.commit_date,
            installed_at: installed.installed_at,
        }
    }
}

/// One setup or update step, for the progress bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SetupStep {
    DownloadingUv,
    InstallingPython,
    DownloadingSearxng,
    InstallingLibraries,
    Starting,
    Done,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
    pub step: SetupStep,
    /// Bytes downloaded so far and in all, for download steps.
    pub done: Option<u64>,
    pub total: Option<u64>,
}

/// Settings → Search: the Built-in provider's state.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinSearchStatus {
    pub installed: Option<InstalledInfo>,
    pub running: bool,
    pub port: Option<u16>,
    /// A setup or update is in progress.
    pub busy: bool,
}

/// The latest SearXNG commit, for Check for updates.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub latest_commit: String,
    pub latest_date: String,
    pub update_available: bool,
}

/// SearXNG's settings: this Mac only, JSON on, no limiter (it is not a public server).
pub fn settings_yaml(port: u16, secret_key: &str) -> String {
    format!(
        "# Written by Typelite (plan `searxng-setup`). Changes are replaced on the next setup.\n\
         use_default_settings: true\n\
         server:\n  bind_address: \"127.0.0.1\"\n  port: {port}\n  secret_key: \"{secret_key}\"\n  limiter: false\n  image_proxy: false\n\
         search:\n  formats: [html, json]\n"
    )
}

/// The uv release file for this Mac.
pub fn uv_asset() -> &'static str {
    if cfg!(target_arch = "x86_64") {
        "uv-x86_64-apple-darwin.tar.gz"
    } else {
        "uv-aarch64-apple-darwin.tar.gz"
    }
}

/// The hash in a `<file>.sha256` release file ("<hex>  <name>" or just "<hex>").
pub fn parse_sha256_file(text: &str) -> Option<String> {
    let hash = text.split_whitespace().next()?.to_ascii_lowercase();
    (hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())).then_some(hash)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// `preferred` when it is free on 127.0.0.1, else a free port the system picks.
pub fn free_port(preferred: u16) -> u16 {
    if std::net::TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return preferred;
    }
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(preferred)
}

fn new_secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Reads `installed.json`, or None when Built-in is not set up.
pub fn read_installed(paths: &SearchPaths) -> Option<Installed> {
    let text = std::fs::read_to_string(paths.installed_file()).ok()?;
    let installed: Installed = serde_json::from_str(&text).ok()?;
    paths
        .venv_python(&installed.commit)
        .exists()
        .then_some(installed)
}

fn write_installed(paths: &SearchPaths, installed: &Installed) -> Result<(), String> {
    let text = serde_json::to_string_pretty(installed).map_err(|e| e.to_string())?;
    std::fs::write(paths.installed_file(), text).map_err(|e| format!("save installed.json: {e}"))
}

/// Runs a setup command (uv, tar) and returns its error output when it fails.
fn run(command: &mut Command, what: &str) -> Result<(), String> {
    let output = command
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("{what}: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let last: Vec<&str> = stderr.lines().rev().take(6).collect();
    Err(format!(
        "{what} failed: {}",
        last.into_iter().rev().collect::<Vec<_>>().join(" | ")
    ))
}

fn uv_command(paths: &SearchPaths) -> Command {
    let mut command = Command::new(paths.uv());
    command
        .env("UV_PYTHON_INSTALL_DIR", paths.python_dir())
        .env("UV_CACHE_DIR", paths.cache_dir())
        .env("UV_NO_CONFIG", "1")
        // Only uv's own standalone Python, never one found on the Mac.
        .env("UV_PYTHON_PREFERENCE", "only-managed");
    command
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(job)
        .await
        .map_err(|e| format!("setup task: {e}"))?
}

/// Downloads `url` into memory, reporting progress under `step`.
async fn download(
    client: &reqwest::Client,
    url: &str,
    step: SetupStep,
    progress: &(dyn Fn(SetupProgress) + Send + Sync),
) -> Result<Vec<u8>, String> {
    let mut response = client
        .get(url)
        .header("User-Agent", "Typelite")
        .timeout(Duration::from_secs(600))
        .send()
        .await
        .map_err(|e| format!("download {url}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "download {url}: HTTP {}",
            response.status().as_u16()
        ));
    }
    let total = response.content_length();
    let mut bytes = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut last_report = Instant::now();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("download {url}: {e}"))?
    {
        bytes.extend_from_slice(&chunk);
        if last_report.elapsed() > Duration::from_millis(200) {
            last_report = Instant::now();
            progress(SetupProgress {
                step,
                done: Some(bytes.len() as u64),
                total,
            });
        }
    }
    Ok(bytes)
}

/// The latest commit on SearXNG's `master` and its date.
pub async fn latest_commit(client: &reqwest::Client) -> Result<(String, String), String> {
    let url = format!("https://api.github.com/repos/{SEARXNG_REPO}/commits/master");
    let value: serde_json::Value = client
        .get(&url)
        .header("User-Agent", "Typelite")
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("ask GitHub for SearXNG's latest version: {e}"))?
        .error_for_status()
        .map_err(|e| format!("ask GitHub for SearXNG's latest version: {e}"))?
        .json()
        .await
        .map_err(|e| format!("read GitHub's answer: {e}"))?;
    parse_commit(&value).ok_or_else(|| "GitHub's answer had no commit".to_string())
}

/// `sha` and `commit.committer.date` from GitHub's commit JSON.
pub fn parse_commit(value: &serde_json::Value) -> Option<(String, String)> {
    let sha = value.get("sha")?.as_str()?.to_string();
    let date = value
        .pointer("/commit/committer/date")
        .and_then(|d| d.as_str())
        .unwrap_or_default()
        .to_string();
    (sha.len() >= 7).then_some((sha, date))
}

/// The running SearXNG, if any.
struct Running {
    child: Child,
    port: u16,
    commit: String,
}

/// Manages the Built-in SearXNG: setup, update, remove, and its process.
pub struct SearchServer {
    paths: Mutex<Option<SearchPaths>>,
    running: Mutex<Option<Running>>,
    busy: AtomicBool,
    /// Serialises starts, so two searches do not start two servers.
    start_lock: tokio::sync::Mutex<()>,
}

static SERVER: OnceLock<SearchServer> = OnceLock::new();

pub fn server() -> &'static SearchServer {
    SERVER.get_or_init(|| SearchServer {
        paths: Mutex::new(None),
        running: Mutex::new(None),
        busy: AtomicBool::new(false),
        start_lock: tokio::sync::Mutex::new(()),
    })
}

/// Clears `busy` when a setup or update ends, however it ends.
struct BusyGuard<'a>(&'a AtomicBool);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl SearchServer {
    /// Called at startup with `<app data>/search`.
    pub fn set_root(&self, root: PathBuf) {
        *self.paths.lock().unwrap_or_else(|e| e.into_inner()) = Some(SearchPaths::new(root));
    }

    fn paths(&self) -> Result<SearchPaths, String> {
        self.paths
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .ok_or_else(|| "search folder not set".to_string())
    }

    pub fn is_installed(&self) -> bool {
        self.paths().ok().and_then(|p| read_installed(&p)).is_some()
    }

    fn begin(&self) -> Result<BusyGuard<'_>, String> {
        if self.busy.swap(true, Ordering::SeqCst) {
            return Err("A setup or update is already running.".to_string());
        }
        Ok(BusyGuard(&self.busy))
    }

    pub fn status(&self) -> BuiltinSearchStatus {
        let installed = self.paths().ok().and_then(|p| read_installed(&p));
        let mut running = self.running.lock().unwrap_or_else(|e| e.into_inner());
        let alive = match running.as_mut() {
            Some(server) => matches!(server.child.try_wait(), Ok(None)),
            None => false,
        };
        if !alive {
            *running = None;
        }
        BuiltinSearchStatus {
            installed: installed.map(InstalledInfo::from),
            running: alive,
            port: running.as_ref().map(|server| server.port),
            busy: self.busy.load(Ordering::SeqCst),
        }
    }

    /// The address of a running server, starting it when needed (plan: lazy start).
    pub async fn ensure_running(&self, client: &reqwest::Client) -> Result<String, String> {
        let _start = self.start_lock.lock().await;
        let status = self.status();
        if let (true, Some(port)) = (status.running, status.port) {
            return Ok(base_url(port));
        }
        let paths = self.paths()?;
        let installed = read_installed(&paths).ok_or("Built-in search is not set up")?;
        let port = self.start(&paths, &installed)?;
        wait_until_ready(client, port, START_TIMEOUT).await?;
        Ok(base_url(port))
    }

    /// Starts `installed` on a free port (writing settings.yml). Returns the port.
    fn start(&self, paths: &SearchPaths, installed: &Installed) -> Result<u16, String> {
        self.stop();
        let port = free_port(PREFERRED_PORT);
        std::fs::write(paths.settings(), settings_yaml(port, &installed.secret_key))
            .map_err(|e| format!("write settings.yml: {e}"))?;
        let log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(paths.log())
            .map_err(|e| format!("open searxng.log: {e}"))?;
        let child = Command::new(paths.venv_python(&installed.commit))
            .args(["-m", "searx.webapp"])
            .current_dir(paths.install_dir(&installed.commit))
            .env("SEARXNG_SETTINGS_PATH", paths.settings())
            .stdin(Stdio::null())
            .stdout(log.try_clone().map_err(|e| e.to_string())?)
            .stderr(log)
            .spawn()
            .map_err(|e| format!("start SearXNG: {e}"))?;
        tracing::info!(
            "Built-in search: SearXNG {} started on 127.0.0.1:{port} (pid {})",
            short_commit(&installed.commit),
            child.id()
        );
        *self.running.lock().unwrap_or_else(|e| e.into_inner()) = Some(Running {
            child,
            port,
            commit: installed.commit.clone(),
        });
        Ok(port)
    }

    /// Stops the server (at quit, before an update or removal).
    pub fn stop(&self) {
        if let Some(mut server) = self
            .running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
        {
            let _ = server.child.kill();
            let _ = server.child.wait();
            tracing::info!(
                "Built-in search: SearXNG {} stopped",
                short_commit(&server.commit)
            );
        }
    }

    /// Set up: uv, Python, the latest SearXNG, its libraries; then start and test it.
    pub async fn install(
        &self,
        client: &reqwest::Client,
        progress: &(dyn Fn(SetupProgress) + Send + Sync),
    ) -> Result<Installed, String> {
        let _busy = self.begin()?;
        let paths = self.paths()?;
        std::fs::create_dir_all(&paths.root).map_err(|e| format!("create search folder: {e}"))?;
        let started = Instant::now();
        ensure_uv(client, &paths, progress).await?;
        progress(step(SetupStep::InstallingPython));
        {
            let paths = paths.clone();
            blocking(move || {
                run(
                    uv_command(&paths).args(["python", "install", PYTHON_VERSION]),
                    "install Python",
                )
            })
            .await?;
        }
        let (commit, commit_date) = latest_commit(client).await?;
        let secret_key = read_installed(&paths)
            .map(|old| old.secret_key)
            .unwrap_or_else(new_secret);
        let installed = Installed {
            commit,
            commit_date,
            installed_at: now_secs(),
            secret_key,
        };
        install_searxng(client, &paths, &installed, progress).await?;
        progress(step(SetupStep::Starting));
        let old = read_installed(&paths);
        let port = self.start(&paths, &installed)?;
        if let Err(error) = wait_until_ready(client, port, START_TIMEOUT).await {
            self.stop();
            return Err(error);
        }
        write_installed(&paths, &installed)?;
        remove_old_installs(&paths, &installed.commit, old.as_ref());
        let _ = std::fs::remove_dir_all(paths.cache_dir());
        tracing::info!(
            "Built-in search: set up SearXNG {} in {:.0?}",
            short_commit(&installed.commit),
            started.elapsed()
        );
        progress(step(SetupStep::Done));
        Ok(installed)
    }

    /// Compares the installed commit with the latest one.
    pub async fn check_update(&self, client: &reqwest::Client) -> Result<UpdateCheck, String> {
        let installed = read_installed(&self.paths()?);
        let (latest_commit, latest_date) = latest_commit(client).await?;
        Ok(UpdateCheck {
            update_available: installed.is_none_or(|i| i.commit != latest_commit),
            latest_commit,
            latest_date,
        })
    }

    /// Update: installs the latest commit beside the old one and switches only when it works.
    pub async fn update(
        &self,
        client: &reqwest::Client,
        progress: &(dyn Fn(SetupProgress) + Send + Sync),
    ) -> Result<Installed, String> {
        let paths = self.paths()?;
        let Some(old) = read_installed(&paths) else {
            return self.install(client, progress).await;
        };
        let _busy = self.begin()?;
        let (commit, commit_date) = latest_commit(client).await?;
        if commit == old.commit {
            progress(step(SetupStep::Done));
            return Ok(old);
        }
        ensure_uv(client, &paths, progress).await?;
        let new = Installed {
            commit,
            commit_date,
            installed_at: now_secs(),
            secret_key: old.secret_key.clone(),
        };
        install_searxng(client, &paths, &new, progress).await?;
        progress(step(SetupStep::Starting));
        let was_running = self.status().running;
        let port = self.start(&paths, &new)?;
        if let Err(error) = wait_until_ready(client, port, START_TIMEOUT).await {
            // The new one does not work: keep the old one.
            self.stop();
            let _ = std::fs::remove_dir_all(paths.install_dir(&new.commit));
            if was_running {
                let _ = self.start(&paths, &old);
            }
            return Err(format!("{error} (kept the installed version)"));
        }
        write_installed(&paths, &new)?;
        remove_old_installs(&paths, &new.commit, Some(&old));
        let _ = std::fs::remove_dir_all(paths.cache_dir());
        tracing::info!(
            "Built-in search: updated SearXNG {} → {}",
            short_commit(&old.commit),
            short_commit(&new.commit)
        );
        progress(step(SetupStep::Done));
        Ok(new)
    }

    /// Stops the server and deletes everything under `search/`.
    pub fn remove(&self) -> Result<(), String> {
        let _busy = self.begin()?;
        self.stop();
        let paths = self.paths()?;
        if paths.root.exists() {
            std::fs::remove_dir_all(&paths.root)
                .map_err(|e| format!("remove search folder: {e}"))?;
        }
        tracing::info!("Built-in search: removed");
        Ok(())
    }
}

fn step(step: SetupStep) -> SetupProgress {
    SetupProgress {
        step,
        done: None,
        total: None,
    }
}

pub fn base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// Waits until SearXNG answers `/healthz`.
async fn wait_until_ready(
    client: &reqwest::Client,
    port: u16,
    timeout: Duration,
) -> Result<(), String> {
    let url = format!("{}/healthz", base_url(port));
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(response) = client
            .get(&url)
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if response.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    Err(format!(
        "SearXNG did not start within {} s (see searxng.log)",
        timeout.as_secs()
    ))
}

/// Downloads uv once, checked against the release's SHA-256.
async fn ensure_uv(
    client: &reqwest::Client,
    paths: &SearchPaths,
    progress: &(dyn Fn(SetupProgress) + Send + Sync),
) -> Result<(), String> {
    if paths.uv().exists() {
        return Ok(());
    }
    progress(step(SetupStep::DownloadingUv));
    let asset = uv_asset();
    let hash_text = client
        .get(format!("{UV_RELEASES}/{asset}.sha256"))
        .header("User-Agent", "Typelite")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("download uv's checksum: {e}"))?
        .text()
        .await
        .map_err(|e| format!("download uv's checksum: {e}"))?;
    let expected = parse_sha256_file(&hash_text).ok_or("uv's checksum file is not valid")?;
    let archive = download(
        client,
        &format!("{UV_RELEASES}/{asset}"),
        SetupStep::DownloadingUv,
        progress,
    )
    .await?;
    let actual = sha256_hex(&archive);
    if actual != expected {
        return Err(format!(
            "uv's download does not match its checksum ({actual} ≠ {expected})"
        ));
    }
    let paths = paths.clone();
    blocking(move || {
        let bin = paths
            .uv()
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        std::fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
        let tarball = paths.root.join("uv.tar.gz");
        std::fs::File::create(&tarball)
            .and_then(|mut f| f.write_all(&archive))
            .map_err(|e| format!("save uv: {e}"))?;
        // The archive holds `uv-<target>/uv` and `uvx`; keep only uv.
        let result = run(
            Command::new("tar")
                .arg("-xzf")
                .arg(&tarball)
                .arg("-C")
                .arg(&bin)
                .args(["--strip-components", "1"]),
            "unpack uv",
        );
        let _ = std::fs::remove_file(&tarball);
        let _ = std::fs::remove_file(bin.join("uvx"));
        result?;
        if !paths.uv().exists() {
            return Err("uv's archive had no uv".to_string());
        }
        Ok(())
    })
    .await
}

/// Downloads SearXNG at `installed.commit` into its folder and installs its libraries.
async fn install_searxng(
    client: &reqwest::Client,
    paths: &SearchPaths,
    installed: &Installed,
    progress: &(dyn Fn(SetupProgress) + Send + Sync),
) -> Result<(), String> {
    progress(step(SetupStep::DownloadingSearxng));
    let archive = download(
        client,
        &format!(
            "https://github.com/{SEARXNG_REPO}/archive/{}.tar.gz",
            installed.commit
        ),
        SetupStep::DownloadingSearxng,
        progress,
    )
    .await?;
    progress(step(SetupStep::InstallingLibraries));
    let paths = paths.clone();
    let commit = installed.commit.clone();
    blocking(move || {
        let dir = paths.install_dir(&commit);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let tarball = paths.root.join("searxng.tar.gz");
        std::fs::File::create(&tarball)
            .and_then(|mut f| f.write_all(&archive))
            .map_err(|e| format!("save SearXNG: {e}"))?;
        let unpacked = run(
            Command::new("tar")
                .arg("-xzf")
                .arg(&tarball)
                .arg("-C")
                .arg(&dir)
                .args(["--strip-components", "1"]),
            "unpack SearXNG",
        );
        let _ = std::fs::remove_file(&tarball);
        let installed = unpacked
            .and_then(|()| {
                run(
                    uv_command(&paths)
                        .args(["venv", "--python", PYTHON_VERSION])
                        .arg(dir.join(".venv")),
                    "create SearXNG's Python environment",
                )
            })
            .and_then(|()| {
                // SearXNG's own install steps: its build tools first, then SearXNG itself.
                run(
                    uv_command(&paths)
                        .args(["pip", "install", "--python"])
                        .arg(paths.venv_python(&commit))
                        .args([
                            "pip",
                            "setuptools",
                            "wheel",
                            "pyyaml",
                            "msgspec",
                            "typing_extensions",
                        ]),
                    "install SearXNG's build tools",
                )
            })
            .and_then(|()| {
                run(
                    uv_command(&paths)
                        .args(["pip", "install", "--no-build-isolation", "--python"])
                        .arg(paths.venv_python(&commit))
                        .arg("-e")
                        .arg(&dir),
                    "install SearXNG",
                )
            });
        if installed.is_err() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        installed
    })
    .await
}

/// Deletes install folders other than `keep` (the previous one once the new one works).
fn remove_old_installs(paths: &SearchPaths, keep: &str, _old: Option<&Installed>) {
    let keep_dir = paths.install_dir(keep);
    if let Ok(entries) = std::fs::read_dir(&paths.root) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_install = path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("searxng-"));
            if is_install && path.is_dir() && path != keep_dir {
                let _ = std::fs::remove_dir_all(&path);
            }
        }
    }
}

/// Emits progress to every window, for Settings and onboarding.
fn emitter(app: &tauri::AppHandle) -> impl Fn(SetupProgress) + Send + Sync {
    let app = app.clone();
    move |progress| {
        let _ = app.emit(SETUP_EVENT, progress);
    }
}

/// Called at startup: the search folder, and a start in the background when Built-in is chosen.
pub fn init(app: &tauri::AppHandle, config: &crate::storage::AppConfig) {
    if let Ok(data_dir) = app.path().app_data_dir() {
        server().set_root(data_dir.join("search"));
    }
    if config.web_search.provider == crate::web_search::SearchProviderKind::Builtin
        && server().is_installed()
    {
        let client = app.state::<reqwest::Client>().inner().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = server().ensure_running(&client).await {
                tracing::warn!("Built-in search: could not start at launch: {error}");
            }
        });
    }
}

#[tauri::command]
pub fn builtin_search_status() -> BuiltinSearchStatus {
    server().status()
}

#[tauri::command]
pub async fn install_builtin_search(
    app: tauri::AppHandle,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<BuiltinSearchStatus, String> {
    let progress = emitter(&app);
    server()
        .install(client.inner(), &progress)
        .await
        .inspect_err(|error| tracing::warn!("Built-in search: setup failed: {error}"))?;
    Ok(server().status())
}

#[tauri::command]
pub async fn check_builtin_search_update(
    client: tauri::State<'_, reqwest::Client>,
) -> Result<UpdateCheck, String> {
    server().check_update(client.inner()).await
}

#[tauri::command]
pub async fn update_builtin_search(
    app: tauri::AppHandle,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<BuiltinSearchStatus, String> {
    let progress = emitter(&app);
    server()
        .update(client.inner(), &progress)
        .await
        .inspect_err(|error| tracing::warn!("Built-in search: update failed: {error}"))?;
    Ok(server().status())
}

#[tauri::command]
pub fn remove_builtin_search() -> Result<BuiltinSearchStatus, String> {
    server().remove()?;
    Ok(server().status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_listen_on_this_mac_only_with_json_on() {
        let yaml = settings_yaml(8890, "abc123");
        assert!(yaml.contains("bind_address: \"127.0.0.1\""));
        assert!(yaml.contains("port: 8890"));
        assert!(yaml.contains("secret_key: \"abc123\""));
        assert!(yaml.contains("limiter: false"));
        assert!(yaml.contains("formats: [html, json]"));
        assert!(yaml.contains("use_default_settings: true"));
    }

    #[test]
    fn checksum_files_are_read_in_both_forms() {
        let hash = "a".repeat(64);
        assert_eq!(
            parse_sha256_file(&format!("{hash}  uv-aarch64-apple-darwin.tar.gz\n")),
            Some(hash.clone())
        );
        assert_eq!(parse_sha256_file(&hash.to_uppercase()), Some(hash));
        assert_eq!(parse_sha256_file("not a hash"), None);
        assert_eq!(parse_sha256_file(""), None);
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn github_commit_json_gives_the_commit_and_its_date() {
        let value = serde_json::json!({
            "sha": "0123456789abcdef0123456789abcdef01234567",
            "commit": { "committer": { "date": "2026-09-28T10:00:00Z" } }
        });
        assert_eq!(
            parse_commit(&value),
            Some((
                "0123456789abcdef0123456789abcdef01234567".to_string(),
                "2026-09-28T10:00:00Z".to_string()
            ))
        );
        assert_eq!(
            parse_commit(&serde_json::json!({ "message": "rate limited" })),
            None
        );
    }

    #[test]
    fn install_folders_are_named_by_the_short_commit() {
        let paths = SearchPaths::new(PathBuf::from("/tmp/search"));
        let commit = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(
            paths.install_dir(commit),
            PathBuf::from("/tmp/search/searxng-0123456789ab")
        );
        assert_eq!(
            paths.venv_python(commit),
            PathBuf::from("/tmp/search/searxng-0123456789ab/.venv/bin/python")
        );
        assert_eq!(paths.uv(), PathBuf::from("/tmp/search/bin/uv"));
    }

    #[test]
    fn installed_needs_its_python_to_count() {
        let root = std::env::temp_dir().join(format!("typelite-search-{}", uuid::Uuid::new_v4()));
        let paths = SearchPaths::new(root.clone());
        std::fs::create_dir_all(&root).unwrap();
        let installed = Installed {
            commit: "0123456789abcdef".into(),
            commit_date: "2026-09-28T10:00:00Z".into(),
            installed_at: 1,
            secret_key: "s".into(),
        };
        write_installed(&paths, &installed).unwrap();
        assert_eq!(read_installed(&paths), None, "no Python yet: not set up");
        let python = paths.venv_python(&installed.commit);
        std::fs::create_dir_all(python.parent().unwrap()).unwrap();
        std::fs::write(&python, "").unwrap();
        assert_eq!(read_installed(&paths), Some(installed));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_busy_port_gives_another_free_one() {
        let taken = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = taken.local_addr().unwrap().port();
        let other = free_port(port);
        assert_ne!(other, port);
        assert!(std::net::TcpListener::bind(("127.0.0.1", other)).is_ok());
    }

    #[test]
    fn remove_old_installs_keeps_only_the_active_one() {
        let root = std::env::temp_dir().join(format!("typelite-search-{}", uuid::Uuid::new_v4()));
        let paths = SearchPaths::new(root.clone());
        for commit in ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"] {
            std::fs::create_dir_all(paths.install_dir(commit)).unwrap();
        }
        std::fs::create_dir_all(root.join("bin")).unwrap();
        remove_old_installs(&paths, "bbbbbbbbbbbbbbbb", None);
        assert!(!paths.install_dir("aaaaaaaaaaaaaaaa").exists());
        assert!(paths.install_dir("bbbbbbbbbbbbbbbb").exists());
        assert!(root.join("bin").exists(), "uv stays");
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A real setup: downloads uv, Python and SearXNG (about 200 MB), starts it, searches once,
    /// updates (a no-op when nothing changed), then removes everything. Needs the internet.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "downloads SearXNG; run by hand"]
    async fn real_setup_search_update_and_remove() {
        let root = std::env::temp_dir().join(format!("typelite-search-{}", uuid::Uuid::new_v4()));
        let server = SearchServer {
            paths: Mutex::new(Some(SearchPaths::new(root.clone()))),
            running: Mutex::new(None),
            busy: AtomicBool::new(false),
            start_lock: tokio::sync::Mutex::new(()),
        };
        let client = reqwest::Client::new();
        let steps = Mutex::new(Vec::new());
        let progress = |p: SetupProgress| {
            let mut steps = steps.lock().unwrap();
            if steps.last() != Some(&p.step) {
                println!("step {:?}", p.step);
                steps.push(p.step);
            }
        };
        let started = Instant::now();
        let installed = server.install(&client, &progress).await.expect("setup");
        println!("set up {} in {:.0?}", installed.commit, started.elapsed());
        let du = std::process::Command::new("du")
            .args(["-sm"])
            .arg(&root)
            .output()
            .unwrap();
        println!("on disk: {}", String::from_utf8_lossy(&du.stdout).trim());
        assert!(server.status().running);
        let base = server.ensure_running(&client).await.unwrap();
        let config = crate::web_search::WebSearchConfig {
            provider: crate::web_search::SearchProviderKind::Searxng,
            base_url: base.clone(),
        };
        let (count, took) = crate::web_search::test_provider(&client, &config, "")
            .await
            .expect("a search through the built-in server");
        println!("{base}: {count} results in {took:.0?}");
        let check = server.check_update(&client).await.unwrap();
        assert!(!check.update_available, "{check:?}");
        server.update(&client, &progress).await.expect("update");
        server.remove().unwrap();
        assert!(!root.exists());
        assert!(!server.status().running);
    }
}
