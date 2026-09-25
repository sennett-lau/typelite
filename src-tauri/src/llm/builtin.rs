//! Plan `ai-polish-setup`: Built-in AI. Typelite runs llama.cpp's `llama-server` as a separate
//! program on this Mac and sends it the same OpenAI-compatible chat requests as any other AI
//! preset.
//!
//! - The program ships inside the app bundle next to the main executable (a Tauri external
//!   binary, built by `scripts/build-llama-server.sh`). Without it Built-in AI reports
//!   [`ServerError::BinaryMissing`]; the rest of the app works.
//! - It listens on 127.0.0.1 on a free port, with every layer on the GPU, a 4096-token context,
//!   one request slot, thinking off (`--reasoning off`) and no web UI. Each start gets a new
//!   random API key (passed in the environment, not on the command line), so other programs
//!   and web pages cannot use it.
//! - [`ServerManager::ensure`] starts it on demand and waits for `/health`; a server that died
//!   is started again on the next request. It is stopped when Typelite quits, when another AI
//!   engine is picked, and when its model is deleted.
//! - Its log goes to the Typelite log filtered to errors, load and timing lines (see
//!   [`log_level_for`]); llama-server never prints the prompt or the answer at its default
//!   verbosity.
//!
//! The first start after install or update compiles llama.cpp's Metal shaders, which takes one
//! to two minutes; macOS caches the result, and later starts take a few seconds.

use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;

use crate::error::AppError;
use crate::storage::{AiPreset, AppConfig};

use super::LlmConfig;

/// The program's name inside `Typelite.app/Contents/MacOS/`.
pub const SERVER_BINARY_NAME: &str = "llama-server";
/// Context size in tokens: a dictation, the polish prompt and the answer fit easily.
pub const CONTEXT_TOKENS: u32 = 4096;
/// Long enough for the first start, which compiles the Metal shaders.
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(240);
const HEALTH_POLL: Duration = Duration::from_millis(250);

/// Why the built-in server is not available.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServerError {
    /// This copy of Typelite has no `llama-server` program.
    BinaryMissing,
    /// The model file is not downloaded (or the models folder is unknown).
    ModelMissing,
    /// The program could not be started.
    Spawn(String),
    /// The program stopped before it was ready (for example, the model did not load).
    Exited(String),
    /// It did not answer `/health` within [`STARTUP_TIMEOUT`].
    Timeout,
    /// Built-in AI was switched off while the server was starting.
    Stopped,
}

impl std::fmt::Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServerError::BinaryMissing => write!(
                f,
                "The built-in AI server (llama-server) is missing from this copy of Typelite."
            ),
            ServerError::ModelMissing => write!(f, "The built-in AI model is not downloaded."),
            ServerError::Spawn(reason) => {
                write!(f, "Could not start the built-in AI server: {reason}")
            }
            ServerError::Exited(reason) => {
                write!(
                    f,
                    "The built-in AI server stopped while loading the model: {reason}"
                )
            }
            ServerError::Timeout => write!(
                f,
                "The built-in AI server did not start within {} minutes.",
                STARTUP_TIMEOUT.as_secs() / 60
            ),
            ServerError::Stopped => write!(f, "Built-in AI was switched off."),
        }
    }
}

/// Where to send requests while the server runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    /// `http://127.0.0.1:<port>/v1`
    pub base_url: String,
    /// Sent as `Authorization: Bearer <key>`.
    pub api_key: String,
}

/// The program, its arguments and extra environment for one start.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchSpec {
    pub binary: PathBuf,
    pub args: Vec<String>,
    pub envs: Vec<(String, String)>,
}

/// The arguments of one server start (see the module comment).
pub fn launch_spec(
    binary: &Path,
    model_path: &Path,
    model_alias: &str,
    port: u16,
    api_key: &str,
) -> LaunchSpec {
    let args = [
        "--model",
        &model_path.to_string_lossy(),
        "--alias",
        model_alias,
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "--n-gpu-layers",
        "999",
        "--ctx-size",
        &CONTEXT_TOKENS.to_string(),
        "--parallel",
        "1",
        "--reasoning",
        "off",
        "--no-webui",
        "--offline",
        "--cors-origins",
        "localhost",
    ]
    .iter()
    .map(|arg| arg.to_string())
    .collect();
    LaunchSpec {
        binary: binary.to_path_buf(),
        args,
        envs: vec![("LLAMA_API_KEY".to_string(), api_key.to_string())],
    }
}

/// A started server program.
pub trait ServerChild: Send {
    fn pid(&self) -> u32;
    /// `Some(description)` once the program has exited.
    fn exit_status(&mut self) -> Option<String>;
    fn kill(&mut self);
}

/// Starts server programs and asks them whether they are ready. The real one runs
/// `llama-server`; tests use a fake.
#[async_trait]
pub trait Launcher: Send + Sync {
    fn find_binary(&self) -> Option<PathBuf>;
    fn spawn(&self, spec: &LaunchSpec) -> std::io::Result<Box<dyn ServerChild>>;
    /// True when `GET {origin}/health` answers 200 (the model is loaded).
    async fn healthy(&self, origin: &str) -> bool;
}

struct Running {
    child: Box<dyn ServerChild>,
    model_path: PathBuf,
    endpoint: Endpoint,
}

/// Owns the one `llama-server` process.
pub struct ServerManager {
    launcher: Box<dyn Launcher>,
    /// One start at a time; a second caller waits and then reuses the started server.
    gate: tokio::sync::Mutex<()>,
    running: Mutex<Option<Running>>,
    /// Bumped by `stop`, so a start that was under way when Built-in AI was switched off does
    /// not leave a server behind.
    generation: AtomicU64,
    models_dir: Mutex<Option<PathBuf>>,
    pid_file: Mutex<Option<PathBuf>>,
    startup_timeout: Duration,
    poll: Duration,
}

impl ServerManager {
    pub fn new(launcher: Box<dyn Launcher>) -> Self {
        Self {
            launcher,
            gate: tokio::sync::Mutex::new(()),
            running: Mutex::new(None),
            generation: AtomicU64::new(0),
            models_dir: Mutex::new(None),
            pid_file: Mutex::new(None),
            startup_timeout: STARTUP_TIMEOUT,
            poll: HEALTH_POLL,
        }
    }

    #[cfg(test)]
    fn with_timing(mut self, startup_timeout: Duration, poll: Duration) -> Self {
        self.startup_timeout = startup_timeout;
        self.poll = poll;
        self
    }

    /// Sets the models folder and the file that remembers the server's process id. A server
    /// left running by a Typelite that crashed is stopped here.
    pub fn set_paths(&self, models_dir: PathBuf, pid_file: PathBuf) {
        stop_stale_server(&pid_file);
        *lock(&self.models_dir) = Some(models_dir);
        *lock(&self.pid_file) = Some(pid_file);
    }

    pub fn binary_available(&self) -> bool {
        self.launcher.find_binary().is_some()
    }

    /// The model file the running server serves, if one runs.
    pub fn running_model_file(&self) -> Option<String> {
        let mut running = lock(&self.running);
        let current = running.as_mut()?;
        if current.child.exit_status().is_some() {
            return None;
        }
        current
            .model_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
    }

    /// Returns the address of a server running `model_file`, starting it (or starting it
    /// again) first when needed.
    pub async fn ensure(&self, model_file: &str, alias: &str) -> Result<Endpoint, ServerError> {
        let _gate = self.gate.lock().await;
        let dir = lock(&self.models_dir)
            .clone()
            .ok_or(ServerError::ModelMissing)?;
        let model_path = dir.join(model_file);
        if model_file.trim().is_empty() || !model_path.is_file() {
            return Err(ServerError::ModelMissing);
        }

        {
            let mut running = lock(&self.running);
            if let Some(current) = running.as_mut() {
                match current.child.exit_status() {
                    None if current.model_path == model_path => {
                        return Ok(current.endpoint.clone())
                    }
                    None => {}
                    Some(status) => {
                        tracing::warn!(
                            "Built-in AI server had stopped ({status}); starting it again"
                        )
                    }
                }
            }
        }
        self.stop();
        let generation = self.generation.load(Ordering::SeqCst);

        let binary = self
            .launcher
            .find_binary()
            .ok_or(ServerError::BinaryMissing)?;
        let port = free_port().map_err(|error| ServerError::Spawn(error.to_string()))?;
        let api_key = uuid::Uuid::new_v4().simple().to_string();
        let spec = launch_spec(&binary, &model_path, alias, port, &api_key);
        let started = Instant::now();
        let mut child = self
            .launcher
            .spawn(&spec)
            .map_err(|error| ServerError::Spawn(error.to_string()))?;
        self.write_pid(Some(child.pid()));
        tracing::info!(
            "Built-in AI server starting: {} on port {port}",
            model_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default()
        );

        let origin = format!("http://127.0.0.1:{port}");
        loop {
            if self.launcher.healthy(&origin).await {
                break;
            }
            if let Some(status) = child.exit_status() {
                self.write_pid(None);
                tracing::warn!("Built-in AI server exited while starting: {status}");
                return Err(ServerError::Exited(status));
            }
            if started.elapsed() >= self.startup_timeout {
                child.kill();
                self.write_pid(None);
                tracing::warn!("Built-in AI server did not become ready; stopped it");
                return Err(ServerError::Timeout);
            }
            tokio::time::sleep(self.poll).await;
        }
        if self.generation.load(Ordering::SeqCst) != generation {
            child.kill();
            self.write_pid(None);
            return Err(ServerError::Stopped);
        }
        tracing::info!(
            "Built-in AI server ready in {:.1} s",
            started.elapsed().as_secs_f64()
        );
        let endpoint = Endpoint {
            base_url: format!("{origin}/v1"),
            api_key,
        };
        *lock(&self.running) = Some(Running {
            child,
            model_path,
            endpoint: endpoint.clone(),
        });
        Ok(endpoint)
    }

    /// Stops the server if one runs (and any start under way). Safe to call at any time,
    /// including from the app's exit handler.
    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let previous = lock(&self.running).take();
        if let Some(mut current) = previous {
            current.child.kill();
            self.write_pid(None);
            tracing::info!("Built-in AI server stopped");
        }
    }

    fn write_pid(&self, pid: Option<u32>) {
        let Some(path) = lock(&self.pid_file).clone() else {
            return;
        };
        let result = match pid {
            Some(pid) => std::fs::write(&path, pid.to_string()),
            None => match std::fs::remove_file(&path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                other => other,
            },
        };
        if let Err(error) = result {
            tracing::warn!("Could not update {}: {error}", path.display());
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

/// Stops a `llama-server` a crashed Typelite left behind (its id is in `pid_file`). Only a
/// process that really is `llama-server` is stopped.
fn stop_stale_server(pid_file: &Path) {
    let Ok(text) = std::fs::read_to_string(pid_file) else {
        return;
    };
    let _ = std::fs::remove_file(pid_file);
    let Ok(pid) = text.trim().parse::<u32>() else {
        return;
    };
    let name = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default();
    if name.ends_with(SERVER_BINARY_NAME) || name.contains("llama-server-") {
        tracing::info!("Stopping a built-in AI server left from an earlier run (pid {pid})");
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .status();
    }
}

/// Which level a line of llama-server's log gets in the Typelite log, or `None` to drop it.
/// Lines look like `0.02.681.426 I srv  llama_server: model loaded`; the letter is the level.
/// Errors, the load and listen lines and the per-request timing totals are kept.
pub fn log_level_for(line: &str) -> Option<tracing::Level> {
    let mut parts = line.split_whitespace();
    let _time = parts.next()?;
    match parts.next()? {
        "E" => Some(tracing::Level::WARN),
        "I" if line.contains("model loaded")
            || line.contains("listening on")
            || line.contains("total time") =>
        {
            Some(tracing::Level::INFO)
        }
        _ => None,
    }
}

/// Where the `llama-server` program is: next to the main executable (the app bundle's
/// `Contents/MacOS/`, where Tauri puts external binaries), or with the target triple in its
/// name. `TYPELITE_LLAMA_SERVER` overrides it; debug builds also look in
/// `src-tauri/binaries/`, where the build script puts it.
pub fn find_server_binary() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("TYPELITE_LLAMA_SERVER") {
        let path = PathBuf::from(path);
        return path.is_file().then_some(path);
    }
    let triple_name = format!("{SERVER_BINARY_NAME}-{}", env!("TYPELITE_TARGET_TRIPLE"));
    let mut candidates = Vec::new();
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
    {
        candidates.push(dir.join(SERVER_BINARY_NAME));
        candidates.push(dir.join(&triple_name));
    }
    if cfg!(debug_assertions) {
        candidates.push(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(&triple_name),
        );
    }
    candidates.into_iter().find(|path| path.is_file())
}

/// Runs the real `llama-server`.
pub struct ProcessLauncher {
    client: reqwest::Client,
}

impl ProcessLauncher {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

impl Default for ProcessLauncher {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Launcher for ProcessLauncher {
    fn find_binary(&self) -> Option<PathBuf> {
        find_server_binary()
    }

    fn spawn(&self, spec: &LaunchSpec) -> std::io::Result<Box<dyn ServerChild>> {
        let mut command = std::process::Command::new(&spec.binary);
        command
            .args(&spec.args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        // llama-server reads LLAMA_ARG_* settings from the environment; only ours count.
        for (name, _) in std::env::vars_os() {
            if name.to_string_lossy().starts_with("LLAMA_") {
                command.env_remove(name);
            }
        }
        for (name, value) in &spec.envs {
            command.env(name, value);
        }
        let mut child = command.spawn()?;
        let last_error = Arc::new(Mutex::new(String::new()));
        if let Some(stdout) = child.stdout.take() {
            forward_log(stdout, last_error.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            forward_log(stderr, last_error.clone());
        }
        Ok(Box::new(ProcessChild { child, last_error }))
    }

    async fn healthy(&self, origin: &str) -> bool {
        matches!(
            self.client.get(format!("{origin}/health")).send().await,
            Ok(response) if response.status().is_success()
        )
    }
}

/// Copies the kept lines of the server's output into the Typelite log (on its own thread).
fn forward_log(stream: impl std::io::Read + Send + 'static, last_error: Arc<Mutex<String>>) {
    std::thread::spawn(move || {
        for line in std::io::BufReader::new(stream).lines() {
            let Ok(line) = line else { break };
            let line: String = line.chars().take(300).collect();
            match log_level_for(&line) {
                Some(tracing::Level::WARN) => {
                    tracing::warn!("[llama-server] {line}");
                    *lock(&last_error) = line;
                }
                Some(_) => tracing::info!("[llama-server] {line}"),
                None => {}
            }
        }
    });
}

struct ProcessChild {
    child: std::process::Child,
    last_error: Arc<Mutex<String>>,
}

impl ServerChild for ProcessChild {
    fn pid(&self) -> u32 {
        self.child.id()
    }

    fn exit_status(&mut self) -> Option<String> {
        match self.child.try_wait() {
            Ok(Some(status)) => {
                let last = lock(&self.last_error).clone();
                Some(if last.is_empty() {
                    status.to_string()
                } else {
                    format!("{status}; last error: {last}")
                })
            }
            Ok(None) => None,
            Err(error) => Some(error.to_string()),
        }
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// The app's one server manager.
pub fn server() -> &'static ServerManager {
    static SERVER: std::sync::OnceLock<ServerManager> = std::sync::OnceLock::new();
    SERVER.get_or_init(|| ServerManager::new(Box::new(ProcessLauncher::new())))
}

/// The address and key to use for `preset`: its own for a server preset, the running built-in
/// server's (started when needed) for the Built-in preset.
pub async fn endpoint_for(preset: &AiPreset, api_key: String) -> Result<Endpoint, ServerError> {
    if !preset.is_builtin_llama() {
        return Ok(Endpoint {
            base_url: preset.base_url.clone(),
            api_key,
        });
    }
    server().ensure(&preset.model_file, &preset.model).await
}

/// The preset with its runtime address filled in, and the key to send.
pub async fn resolve_preset(
    preset: &AiPreset,
    api_key: String,
) -> Result<(AiPreset, String), ServerError> {
    let endpoint = endpoint_for(preset, api_key).await?;
    let mut resolved = preset.clone();
    resolved.base_url = endpoint.base_url;
    Ok((resolved, endpoint.api_key))
}

/// The chat settings for the active AI preset (plan `ai-polish-setup`: the polish pipeline itself
/// is unchanged; only the address and key come from the running built-in server).
pub async fn llm_config(preset: &AiPreset, api_key: String) -> Result<LlmConfig, AppError> {
    let (resolved, api_key) = resolve_preset(preset, api_key)
        .await
        .map_err(|error| AppError::Config(error.to_string()))?;
    Ok(LlmConfig::from_preset(&resolved, api_key))
}

/// The automatic test after setup: one short clean-up request, like a real polish. Returns the
/// round-trip time in milliseconds; an empty answer counts as a failure (a thinking model that
/// used its whole budget would give one).
pub async fn test_request(endpoint: &Endpoint, model: &str) -> Result<u32, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|error| error.to_string())?;
    let body = super::protocol::build_chat_body(
        model,
        vec![
            serde_json::json!({"role": "system", "content":
                "Clean up the dictated text: remove filler words and fix the punctuation. \
                 Reply with the text only."}),
            serde_json::json!({"role": "user", "content":
                "um so this is a quick test of the built in model"}),
        ],
        48,
        0.3,
        false,
        &serde_json::Map::new(),
    );
    let url = super::protocol::chat_endpoint(&endpoint.base_url)?;
    let request = super::protocol::apply_auth_headers(client.post(url), &endpoint.api_key)
        .json(&body)
        .timeout(super::protocol::REQUEST_TIMEOUT);
    let started = Instant::now();
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let body: serde_json::Value = response.json().await.map_err(|error| error.to_string())?;
    let elapsed = started.elapsed().as_millis() as u32;
    if super::protocol::response_text(&body).trim().is_empty() {
        return Err("the model returned an empty answer".to_string());
    }
    Ok(elapsed)
}

/// What the built-in server should do for this config: run the Built-in preset's model when it
/// is the active, tested AI preset, otherwise nothing.
pub fn wanted_model(config: &AppConfig) -> Option<(String, String)> {
    let preset = config.active_ai_preset();
    (preset.is_builtin_llama() && !preset.model_file.is_empty() && preset.verified_at.is_some())
        .then(|| (preset.model_file.clone(), preset.model.clone()))
}

/// Starts or stops the built-in server to match `config` (at app start and after the AI engine
/// changed). Starting runs in the background.
pub fn sync_with_config(config: &AppConfig) {
    match wanted_model(config) {
        Some((model_file, alias)) => {
            if server().running_model_file().as_deref() == Some(model_file.as_str()) {
                return;
            }
            tauri::async_runtime::spawn(async move {
                if let Err(error) = server().ensure(&model_file, &alias).await {
                    tracing::warn!("Built-in AI server did not start: {error}");
                }
            });
        }
        None => server().stop(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    /// A fake launcher: `healthy` answers true after `ready_after` checks; `exit_after` makes
    /// the child report an exit after that many status checks.
    struct Fake {
        binary: Option<PathBuf>,
        ready_after: usize,
        exit_after: Option<usize>,
        health_checks: Arc<AtomicUsize>,
        spawned: Arc<Mutex<Vec<LaunchSpec>>>,
        children: Arc<Mutex<Vec<Arc<FakeState>>>>,
    }

    #[derive(Default)]
    struct FakeState {
        killed: std::sync::atomic::AtomicBool,
        status_checks: AtomicUsize,
        exit_after: Option<usize>,
    }

    struct FakeChild(Arc<FakeState>);

    impl ServerChild for FakeChild {
        fn pid(&self) -> u32 {
            4242
        }
        fn exit_status(&mut self) -> Option<String> {
            if self.0.killed.load(Ordering::SeqCst) {
                return Some("killed".into());
            }
            let checks = self.0.status_checks.fetch_add(1, Ordering::SeqCst) + 1;
            match self.0.exit_after {
                Some(limit) if checks >= limit => Some("exit status: 1".into()),
                _ => None,
            }
        }
        fn kill(&mut self) {
            self.0.killed.store(true, Ordering::SeqCst);
        }
    }

    #[async_trait]
    impl Launcher for Fake {
        fn find_binary(&self) -> Option<PathBuf> {
            self.binary.clone()
        }
        fn spawn(&self, spec: &LaunchSpec) -> std::io::Result<Box<dyn ServerChild>> {
            lock(&self.spawned).push(spec.clone());
            let state = Arc::new(FakeState {
                exit_after: self.exit_after,
                ..FakeState::default()
            });
            lock(&self.children).push(state.clone());
            self.health_checks.store(0, Ordering::SeqCst);
            Ok(Box::new(FakeChild(state)))
        }
        async fn healthy(&self, _origin: &str) -> bool {
            self.health_checks.fetch_add(1, Ordering::SeqCst) + 1 >= self.ready_after
        }
    }

    struct Setup {
        manager: ServerManager,
        spawned: Arc<Mutex<Vec<LaunchSpec>>>,
        children: Arc<Mutex<Vec<Arc<FakeState>>>>,
        dir: PathBuf,
    }

    fn setup(name: &str, binary: bool, ready_after: usize, exit_after: Option<usize>) -> Setup {
        let dir = std::env::temp_dir().join(format!(
            "typelite-llama-{name}-{}-{}",
            std::process::id(),
            crate::storage::now_unix_ms()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.gguf"), b"model a").unwrap();
        std::fs::write(dir.join("b.gguf"), b"model b").unwrap();
        let spawned = Arc::new(Mutex::new(Vec::new()));
        let children = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            binary: binary.then(|| PathBuf::from("/fake/llama-server")),
            ready_after,
            exit_after,
            health_checks: Arc::new(AtomicUsize::new(0)),
            spawned: spawned.clone(),
            children: children.clone(),
        };
        let manager = ServerManager::new(Box::new(fake))
            .with_timing(Duration::from_millis(200), Duration::from_millis(1));
        manager.set_paths(dir.clone(), dir.join("llama-server.pid"));
        Setup {
            manager,
            spawned,
            children,
            dir,
        }
    }

    #[test]
    fn the_launch_spec_has_the_plan_settings_and_keeps_the_key_off_the_command_line() {
        let spec = launch_spec(
            Path::new("/app/llama-server"),
            Path::new("/models/m.gguf"),
            "qwen3-4b",
            5555,
            "secret",
        );
        let args = spec.args.join(" ");
        for part in [
            "--model /models/m.gguf",
            "--host 127.0.0.1",
            "--port 5555",
            "--n-gpu-layers 999",
            "--ctx-size 4096",
            "--reasoning off",
            "--no-webui",
            "--offline",
            "--alias qwen3-4b",
        ] {
            assert!(args.contains(part), "missing {part} in {args}");
        }
        assert!(!args.contains("secret"));
        assert_eq!(
            spec.envs,
            vec![("LLAMA_API_KEY".to_string(), "secret".to_string())]
        );
    }

    #[tokio::test]
    async fn ensure_starts_once_waits_for_health_and_reuses_the_server() {
        let s = setup("reuse", true, 3, None);
        let first = s.manager.ensure("a.gguf", "m").await.unwrap();
        assert!(first.base_url.starts_with("http://127.0.0.1:"));
        assert!(first.base_url.ends_with("/v1"));
        assert_eq!(first.api_key.len(), 32);
        assert_eq!(
            std::fs::read_to_string(s.dir.join("llama-server.pid")).unwrap(),
            "4242"
        );
        let again = s.manager.ensure("a.gguf", "m").await.unwrap();
        assert_eq!(first, again);
        assert_eq!(lock(&s.spawned).len(), 1);
        assert_eq!(s.manager.running_model_file().as_deref(), Some("a.gguf"));

        // Another model restarts it with a new key.
        let other = s.manager.ensure("b.gguf", "m").await.unwrap();
        assert_ne!(other.api_key, first.api_key);
        assert_eq!(lock(&s.spawned).len(), 2);
        assert!(lock(&s.children)[0].killed.load(Ordering::SeqCst));

        s.manager.stop();
        assert!(lock(&s.children)[1].killed.load(Ordering::SeqCst));
        assert!(s.manager.running_model_file().is_none());
        assert!(!s.dir.join("llama-server.pid").exists());
    }

    #[tokio::test]
    async fn a_server_that_died_is_started_again_on_the_next_request() {
        let s = setup("restart", true, 1, None);
        s.manager.ensure("a.gguf", "m").await.unwrap();
        lock(&s.children)[0].killed.store(true, Ordering::SeqCst);
        assert!(s.manager.running_model_file().is_none());
        s.manager.ensure("a.gguf", "m").await.unwrap();
        assert_eq!(lock(&s.spawned).len(), 2);
    }

    #[tokio::test]
    async fn missing_binary_model_exit_and_timeout_are_reported() {
        let s = setup("errors", false, 1, None);
        assert_eq!(
            s.manager.ensure("a.gguf", "m").await,
            Err(ServerError::BinaryMissing)
        );
        assert!(!s.manager.binary_available());
        assert_eq!(
            s.manager.ensure("missing.gguf", "m").await,
            Err(ServerError::ModelMissing)
        );
        assert_eq!(
            s.manager.ensure("", "m").await,
            Err(ServerError::ModelMissing)
        );

        let s = setup("exit", true, usize::MAX, Some(2));
        assert_eq!(
            s.manager.ensure("a.gguf", "m").await,
            Err(ServerError::Exited("exit status: 1".into()))
        );

        let s = setup("timeout", true, usize::MAX, None);
        assert_eq!(
            s.manager.ensure("a.gguf", "m").await,
            Err(ServerError::Timeout)
        );
        assert!(lock(&s.children)[0].killed.load(Ordering::SeqCst));
        assert!(s.manager.running_model_file().is_none());
    }

    #[test]
    fn only_errors_loads_and_timings_reach_the_log() {
        let keep = [
            "0.02.681.426 I srv  llama_server: model loaded",
            "0.02.681.430 I srv  llama_server: listening on http://127.0.0.1:18431",
            "0.13.023.925 I slot print_timing: id  0 | task 24 |       total time =     312.28 ms /    12 tokens",
            "0.00.100.000 E srv  load_model: failed to load model",
        ];
        for line in keep {
            assert!(log_level_for(line).is_some(), "{line}");
        }
        assert_eq!(log_level_for(keep[3]), Some(tracing::Level::WARN));
        for line in [
            "0.12.711.639 W slot   operator(): id  0 | task 24 | n_past was set to 47",
            "0.00.066.332 I srv  llama_server: initializing ...",
            "ggml_metal_init: found device",
            "",
        ] {
            assert_eq!(log_level_for(line), None, "{line}");
        }
    }

    #[test]
    fn the_server_runs_only_for_an_active_tested_built_in_preset() {
        let mut config = AppConfig::default();
        assert_eq!(wanted_model(&config), None);
        let preset = config.install_builtin_llama("qwen3-4b", "Qwen3-4B-Instruct-2507-Q4_K_M.gguf");
        assert_eq!(wanted_model(&config), None);
        config.mark_ai_verified(&preset, 5);
        assert_eq!(
            wanted_model(&config),
            Some((
                "Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
                "qwen3-4b".to_string()
            ))
        );
        config.ai_presets.push(AiPreset::server(
            "mine",
            "Mine",
            "http://192.0.2.3:11434/v1",
            "m",
        ));
        config.active_ai_preset_id = "mine".to_string();
        assert_eq!(wanted_model(&config), None);
    }

    #[tokio::test]
    async fn server_presets_keep_their_own_address_and_key() {
        let preset = AiPreset::server("mine", "Mine", "http://192.0.2.3:11434/v1", "m");
        let (resolved, key) = resolve_preset(&preset, "sk-1".into()).await.unwrap();
        assert_eq!(resolved, preset);
        assert_eq!(key, "sk-1");
    }
}
