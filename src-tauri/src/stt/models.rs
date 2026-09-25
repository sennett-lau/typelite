//! Plan `quick-speech-setup`: the Whisper model files that Quick setup downloads for the built-in
//! speech provider.
//!
//! Models come from the official whisper.cpp repository on Hugging Face and are checked
//! against a SHA-256 written into this file. They live in `<app data>/models/` (on macOS
//! `~/Library/Application Support/dev.typelite.mac/models/`). A download goes to
//! `<file>.part` first, resumes with an HTTP `Range` request when the server allows it, and is
//! renamed into place only after the checksum matches.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

/// Where the model files are downloaded from: `{MODEL_BASE_URL}/{file_name}`.
pub const MODEL_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// Id of the model Quick setup picks by default.
pub const DEFAULT_MODEL_ID: &str = "large-v3-turbo";

/// One downloadable model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownModel {
    /// Stable id, stored as the preset's `model`.
    pub id: &'static str,
    pub file_name: &'static str,
    pub size_bytes: u64,
    /// Lower-case hex SHA-256 of the whole file.
    pub sha256: &'static str,
}

/// The models Quick setup offers. The SHA-256 values are the `x-linked-etag` headers of the
/// Hugging Face files (the LFS object id, which is the file's SHA-256).
pub const KNOWN_MODELS: &[KnownModel] = &[
    KnownModel {
        id: "large-v3-turbo",
        file_name: "ggml-large-v3-turbo-q5_0.bin",
        size_bytes: 574_041_195,
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    },
    KnownModel {
        id: "small",
        file_name: "ggml-small-q5_1.bin",
        size_bytes: 190_085_487,
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    },
];

pub fn known_model(id: &str) -> Option<&'static KnownModel> {
    KNOWN_MODELS.iter().find(|model| model.id == id)
}

pub fn known_model_by_file(file_name: &str) -> Option<&'static KnownModel> {
    KNOWN_MODELS
        .iter()
        .find(|model| model.file_name == file_name)
}

/// The `models` folder inside the app data folder.
pub fn models_dir_in(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models")
}

fn part_path(dir: &Path, model: &KnownModel) -> PathBuf {
    dir.join(format!("{}.part", model.file_name))
}

/// A model file found on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModel {
    pub id: String,
    pub file_name: String,
    pub size_bytes: u64,
}

/// The known models whose file is fully in place (a `.part` file does not count). The file
/// size must match; the checksum was checked before the file got its name.
pub fn installed_models(dir: &Path) -> Vec<InstalledModel> {
    KNOWN_MODELS
        .iter()
        .filter_map(|model| {
            let metadata = std::fs::metadata(dir.join(model.file_name)).ok()?;
            (metadata.is_file() && metadata.len() == model.size_bytes).then(|| InstalledModel {
                id: model.id.to_string(),
                file_name: model.file_name.to_string(),
                size_bytes: model.size_bytes,
            })
        })
        .collect()
}

/// `(id, file name)` of each installed model, for `AppConfig::reconcile_builtin_models`.
pub fn installed_pairs(dir: &Path) -> Vec<(String, String)> {
    installed_models(dir)
        .into_iter()
        .map(|model| (model.id, model.file_name))
        .collect()
}

/// Deletes a model file and any partial download of it.
pub fn delete_model(dir: &Path, model: &KnownModel) -> std::io::Result<()> {
    for path in [dir.join(model.file_name), part_path(dir, model)] {
        match std::fs::remove_file(&path) {
            Ok(()) => tracing::info!("Deleted {}", path.display()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// Why a download did not finish. The frontend turns `code` into the messages of
/// behaviour.md.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum DownloadError {
    /// No connection, HTTP error, or the transfer broke off.
    Network { reason: String },
    /// Not enough free disk space (model size + 10 %).
    DiskSpace {
        #[serde(rename = "neededBytes")]
        needed_bytes: u64,
        #[serde(rename = "availableBytes")]
        available_bytes: u64,
    },
    /// The file did not match its SHA-256; it was deleted.
    Checksum,
    /// The user pressed Cancel. The partial file is kept so a retry can resume.
    Cancelled,
    /// Writing the file failed.
    Io { reason: String },
    /// The file is in place but whisper.cpp could not load or run it (the automatic test
    /// after the download).
    Load { reason: String },
}

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadError::Network { reason } => write!(f, "download failed: {reason}"),
            DownloadError::DiskSpace {
                needed_bytes,
                available_bytes,
            } => write!(
                f,
                "not enough disk space: need {needed_bytes} bytes, {available_bytes} available"
            ),
            DownloadError::Checksum => write!(f, "checksum mismatch"),
            DownloadError::Cancelled => write!(f, "cancelled"),
            DownloadError::Io { reason } => write!(f, "file error: {reason}"),
            DownloadError::Load { reason } => write!(f, "{reason}"),
        }
    }
}

fn io_error(error: std::io::Error) -> DownloadError {
    DownloadError::Io {
        reason: error.to_string(),
    }
}

/// Download progress, sent to the frontend about ten times a second.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    /// Recent transfer speed; 0 until it can be measured.
    pub bytes_per_second: u64,
}

/// Most progress callbacks per second.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
/// A transfer that sends nothing for this long counts as broken.
const STALL_TIMEOUT: Duration = Duration::from_secs(30);

/// Free bytes needed before downloading: what is still missing plus 10 % of the model size.
pub fn needed_free_bytes(model_size: u64, already_downloaded: u64) -> u64 {
    model_size.saturating_sub(already_downloaded) + model_size / 10
}

/// Everything one download needs. `available_space` is injected so tests can pretend the
/// disk is full.
pub struct DownloadRequest<'a> {
    pub client: &'a reqwest::Client,
    pub url: String,
    pub dir: &'a Path,
    pub model: KnownModel,
    pub cancel: tokio::sync::watch::Receiver<bool>,
    pub available_space: &'a (dyn Fn(&Path) -> std::io::Result<u64> + Send + Sync),
}

/// The real free-space check (bytes available to this user on the disk holding `path`).
pub fn disk_available_space(path: &Path) -> std::io::Result<u64> {
    fs4::available_space(path)
}

/// Downloads, verifies and moves one model into place. Returns the final path.
///
/// Steps: check free disk space, download to `<file>.part` (resuming a partial file with
/// `Range` when the server answers 206), check SHA-256 (deleting the file on mismatch), then
/// rename it to `<file>`. `on_progress` is called at most ten times a second and once at the
/// end of the transfer.
pub async fn download_model(
    mut request: DownloadRequest<'_>,
    mut on_progress: impl FnMut(DownloadProgress) + Send,
) -> Result<PathBuf, DownloadError> {
    let model = request.model;
    let dir = request.dir;
    tokio::fs::create_dir_all(dir).await.map_err(io_error)?;
    let final_path = dir.join(model.file_name);
    let part = part_path(dir, &model);

    let mut existing = tokio::fs::metadata(&part)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if existing > model.size_bytes {
        // Larger than the model: not ours to resume.
        let _ = tokio::fs::remove_file(&part).await;
        existing = 0;
    }

    let needed = needed_free_bytes(model.size_bytes, existing);
    let available = (request.available_space)(dir).map_err(io_error)?;
    if available < needed {
        return Err(DownloadError::DiskSpace {
            needed_bytes: needed,
            available_bytes: available,
        });
    }

    if existing < model.size_bytes {
        transfer(&mut request, &part, existing, &mut on_progress).await?;
    } else {
        on_progress(DownloadProgress {
            downloaded_bytes: existing,
            total_bytes: model.size_bytes,
            bytes_per_second: 0,
        });
    }

    let started = Instant::now();
    let hash_path = part.clone();
    let digest = tokio::task::spawn_blocking(move || sha256_file(&hash_path))
        .await
        .map_err(|error| DownloadError::Io {
            reason: error.to_string(),
        })?
        .map_err(io_error)?;
    tracing::info!(
        "Model {}: SHA-256 checked in {} ms",
        model.file_name,
        started.elapsed().as_millis()
    );
    if digest != model.sha256 {
        tracing::warn!("Model {}: checksum mismatch, file deleted", model.file_name);
        let _ = tokio::fs::remove_file(&part).await;
        return Err(DownloadError::Checksum);
    }
    tokio::fs::rename(&part, &final_path)
        .await
        .map_err(io_error)?;
    Ok(final_path)
}

/// Streams the file into `part`, starting at `existing` bytes.
async fn transfer(
    request: &mut DownloadRequest<'_>,
    part: &Path,
    existing: u64,
    on_progress: &mut (impl FnMut(DownloadProgress) + Send),
) -> Result<(), DownloadError> {
    let total = request.model.size_bytes;
    let mut http = request.client.get(&request.url);
    if existing > 0 {
        http = http.header(reqwest::header::RANGE, format!("bytes={existing}-"));
    }
    let network = |error: reqwest::Error| DownloadError::Network {
        reason: error.to_string(),
    };
    let response = tokio::select! {
        response = http.send() => response.map_err(network)?,
        _ = cancelled(&mut request.cancel) => return Err(DownloadError::Cancelled),
    };
    let status = response.status();
    let resumed = status == reqwest::StatusCode::PARTIAL_CONTENT && existing > 0;
    if !status.is_success() {
        return Err(DownloadError::Network {
            reason: format!("HTTP {}", status.as_u16()),
        });
    }
    let mut file = if resumed {
        tracing::info!(
            "Model {}: resuming at {existing} bytes",
            request.model.file_name
        );
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(part)
            .await
            .map_err(io_error)?
    } else {
        tokio::fs::File::create(part).await.map_err(io_error)?
    };
    let mut downloaded = if resumed { existing } else { 0 };

    let mut stream = response.bytes_stream();
    let mut last_report = Instant::now() - PROGRESS_INTERVAL;
    let mut speed = SpeedMeter::new(downloaded);
    loop {
        let next = tokio::select! {
            next = tokio::time::timeout(STALL_TIMEOUT, stream.next()) => next,
            _ = cancelled(&mut request.cancel) => {
                let _ = file.flush().await;
                return Err(DownloadError::Cancelled);
            }
        };
        let chunk = match next {
            Err(_) => {
                let _ = file.flush().await;
                return Err(DownloadError::Network {
                    reason: "the connection stalled".to_string(),
                });
            }
            Ok(None) => break,
            Ok(Some(Err(error))) => {
                let _ = file.flush().await;
                return Err(network(error));
            }
            Ok(Some(Ok(chunk))) => chunk,
        };
        if downloaded + chunk.len() as u64 > total {
            let _ = file.flush().await;
            drop(file);
            let _ = tokio::fs::remove_file(part).await;
            return Err(DownloadError::Checksum);
        }
        file.write_all(&chunk).await.map_err(io_error)?;
        downloaded += chunk.len() as u64;
        let now = Instant::now();
        speed.add(now, downloaded);
        if now.duration_since(last_report) >= PROGRESS_INTERVAL {
            last_report = now;
            on_progress(DownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: total,
                bytes_per_second: speed.bytes_per_second(),
            });
        }
    }
    file.flush().await.map_err(io_error)?;
    file.sync_all().await.map_err(io_error)?;
    on_progress(DownloadProgress {
        downloaded_bytes: downloaded,
        total_bytes: total,
        bytes_per_second: speed.bytes_per_second(),
    });
    if downloaded < total {
        return Err(DownloadError::Network {
            reason: format!("the connection closed after {downloaded} of {total} bytes"),
        });
    }
    Ok(())
}

/// Resolves when the cancel flag becomes true (or its sender is gone and it was set).
async fn cancelled(cancel: &mut tokio::sync::watch::Receiver<bool>) {
    loop {
        if *cancel.borrow_and_update() {
            return;
        }
        if cancel.changed().await.is_err() {
            // The sender is gone without cancelling: never resolve.
            std::future::pending::<()>().await;
        }
    }
}

/// Transfer speed over the last few seconds.
struct SpeedMeter {
    samples: std::collections::VecDeque<(Instant, u64)>,
}

const SPEED_WINDOW: Duration = Duration::from_secs(3);

impl SpeedMeter {
    fn new(start_bytes: u64) -> Self {
        let mut samples = std::collections::VecDeque::new();
        samples.push_back((Instant::now(), start_bytes));
        Self { samples }
    }

    fn add(&mut self, at: Instant, bytes: u64) {
        self.samples.push_back((at, bytes));
        while self.samples.len() > 2
            && at.duration_since(self.samples[0].0) > SPEED_WINDOW
            && at.duration_since(self.samples[1].0) >= SPEED_WINDOW / 2
        {
            self.samples.pop_front();
        }
    }

    fn bytes_per_second(&self) -> u64 {
        let (Some(first), Some(last)) = (self.samples.front(), self.samples.back()) else {
            return 0;
        };
        let secs = last.0.duration_since(first.0).as_secs_f64();
        if secs < 0.2 {
            return 0;
        }
        ((last.1.saturating_sub(first.1)) as f64 / secs) as u64
    }
}

/// Lower-case hex SHA-256 of a file.
pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn known_models_are_unique_and_well_formed() {
        assert_eq!(KNOWN_MODELS.len(), 2);
        assert!(known_model(DEFAULT_MODEL_ID).is_some());
        for model in KNOWN_MODELS {
            assert_eq!(model.sha256.len(), 64, "{}", model.id);
            assert!(model
                .sha256
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
            assert!(model.file_name.starts_with("ggml-") && model.file_name.ends_with(".bin"));
            assert_eq!(known_model_by_file(model.file_name), Some(model));
        }
        let turbo = known_model("large-v3-turbo").unwrap();
        assert_eq!(turbo.file_name, "ggml-large-v3-turbo-q5_0.bin");
        assert_eq!(
            turbo.sha256,
            "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
        );
        let small = known_model("small").unwrap();
        assert!(small.size_bytes < 200_000_000 && small.size_bytes > 180_000_000);
        assert!(known_model("tiny").is_none());
    }

    #[test]
    fn needed_space_is_the_missing_part_plus_ten_percent() {
        assert_eq!(needed_free_bytes(1000, 0), 1100);
        assert_eq!(needed_free_bytes(1000, 400), 700);
        assert_eq!(needed_free_bytes(1000, 1000), 100);
    }

    #[test]
    fn sha256_of_a_file() {
        let dir = temp_dir("sha");
        let path = dir.join("abc");
        std::fs::write(&path, b"abc").unwrap();
        assert_eq!(
            sha256_file(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn installed_models_need_the_full_file_and_delete_removes_part_files() {
        let dir = temp_dir("installed");
        let small = known_model("small").unwrap();
        // A short file with the right name is not an installed model.
        std::fs::write(dir.join(small.file_name), b"short").unwrap();
        assert!(installed_models(&dir).is_empty());
        let file = std::fs::File::create(dir.join(small.file_name)).unwrap();
        file.set_len(small.size_bytes).unwrap();
        std::fs::write(dir.join("ggml-large-v3-turbo-q5_0.bin.part"), b"x").unwrap();
        assert_eq!(
            installed_models(&dir),
            vec![InstalledModel {
                id: "small".into(),
                file_name: small.file_name.into(),
                size_bytes: small.size_bytes,
            }]
        );
        assert_eq!(
            installed_pairs(&dir),
            vec![("small".to_string(), small.file_name.to_string())]
        );

        delete_model(&dir, small).unwrap();
        delete_model(&dir, known_model("large-v3-turbo").unwrap()).unwrap();
        assert!(std::fs::read_dir(&dir).unwrap().next().is_none());
        // Deleting again is fine.
        delete_model(&dir, small).unwrap();
    }

    // ─── Download against a local HTTP server ───

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "typelite-models-{name}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn body(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i * 7 % 251) as u8).collect()
    }

    fn sha_hex(data: &[u8]) -> &'static str {
        let hex: String = Sha256::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        Box::leak(hex.into_boxed_str())
    }

    fn test_model(data: &[u8], sha: &'static str) -> KnownModel {
        KnownModel {
            id: "test",
            file_name: "ggml-test.bin",
            size_bytes: data.len() as u64,
            sha256: sha,
        }
    }

    #[derive(Clone, Copy)]
    struct ServerOptions {
        /// Honour `Range` with 206.
        ranges: bool,
        /// Send only the first n bytes of the body, then close.
        cut_after: Option<usize>,
        /// Sleep between 1 KB writes.
        slow: bool,
    }

    /// A tiny HTTP/1.1 server that serves `data` at any path. Returns its URL and a list of
    /// the `Range` headers it saw.
    async fn serve(
        data: Vec<u8>,
        options: ServerOptions,
    ) -> (String, Arc<std::sync::Mutex<Vec<Option<String>>>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/ggml-test.bin", listener.local_addr().unwrap());
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let seen_by_server = seen.clone();
        let data = Arc::new(data);
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let data = data.clone();
                let seen = seen_by_server.clone();
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    let mut buf = [0u8; 1024];
                    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                        let Ok(n) = socket.read(&mut buf).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        request.extend_from_slice(&buf[..n]);
                    }
                    let text = String::from_utf8_lossy(&request).to_string();
                    let range = text
                        .lines()
                        .find(|l| l.to_ascii_lowercase().starts_with("range:"))
                        .map(|l| l[6..].trim().to_string());
                    seen.lock().unwrap().push(range.clone());
                    let start = match (&range, options.ranges) {
                        (Some(r), true) => r
                            .trim_start_matches("bytes=")
                            .trim_end_matches('-')
                            .parse::<usize>()
                            .unwrap_or(0),
                        _ => 0,
                    };
                    let slice = &data[start.min(data.len())..];
                    let head = if start > 0 {
                        format!(
                            "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nConnection: close\r\n\r\n",
                            slice.len(),
                            start,
                            data.len() - 1,
                            data.len()
                        )
                    } else {
                        format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n",
                            slice.len()
                        )
                    };
                    let _ = socket.write_all(head.as_bytes()).await;
                    let send = options
                        .cut_after
                        .map_or(slice.len(), |n| n.min(slice.len()));
                    for chunk in slice[..send].chunks(1024) {
                        if socket.write_all(chunk).await.is_err() {
                            return;
                        }
                        if options.slow {
                            tokio::time::sleep(Duration::from_millis(20)).await;
                        }
                    }
                    let _ = socket.shutdown().await;
                });
            }
        });
        (url, seen)
    }

    fn plenty(_: &Path) -> std::io::Result<u64> {
        Ok(u64::MAX)
    }

    const FULL: ServerOptions = ServerOptions {
        ranges: true,
        cut_after: None,
        slow: false,
    };

    async fn run(
        url: &str,
        dir: &Path,
        model: KnownModel,
        cancel: tokio::sync::watch::Receiver<bool>,
        space: &(dyn Fn(&Path) -> std::io::Result<u64> + Send + Sync),
        progress: &mut Vec<DownloadProgress>,
    ) -> Result<PathBuf, DownloadError> {
        let client = reqwest::Client::new();
        download_model(
            DownloadRequest {
                client: &client,
                url: url.to_string(),
                dir,
                model,
                cancel,
                available_space: space,
            },
            |p| progress.push(p),
        )
        .await
    }

    #[tokio::test]
    async fn downloads_verifies_and_moves_the_file_into_place() {
        let data = body(200_000);
        let model = test_model(&data, sha_hex(&data));
        let (url, seen) = serve(data.clone(), FULL).await;
        let dir = temp_dir("ok");
        let (_tx, rx) = tokio::sync::watch::channel(false);
        let mut progress = Vec::new();

        let path = run(&url, &dir, model, rx, &plenty, &mut progress)
            .await
            .unwrap();

        assert_eq!(path, dir.join("ggml-test.bin"));
        assert_eq!(std::fs::read(&path).unwrap(), data);
        assert!(!dir.join("ggml-test.bin.part").exists());
        let last = progress.last().unwrap();
        assert_eq!(last.downloaded_bytes, 200_000);
        assert_eq!(last.total_bytes, 200_000);
        assert_eq!(seen.lock().unwrap().as_slice(), &[None]);
    }

    #[tokio::test]
    async fn resumes_a_partial_download_with_a_range_request() {
        let data = body(100_000);
        let model = test_model(&data, sha_hex(&data));
        let dir = temp_dir("resume");
        std::fs::write(dir.join("ggml-test.bin.part"), &data[..40_000]).unwrap();
        let (url, seen) = serve(data.clone(), FULL).await;
        let (_tx, rx) = tokio::sync::watch::channel(false);
        let mut progress = Vec::new();

        let path = run(&url, &dir, model, rx, &plenty, &mut progress)
            .await
            .unwrap();

        assert_eq!(std::fs::read(path).unwrap(), data);
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            &[Some("bytes=40000-".to_string())]
        );
        assert!(progress.iter().all(|p| p.downloaded_bytes >= 40_000));
    }

    #[tokio::test]
    async fn starts_over_when_the_server_ignores_the_range() {
        let data = body(50_000);
        let model = test_model(&data, sha_hex(&data));
        let dir = temp_dir("norange");
        std::fs::write(dir.join("ggml-test.bin.part"), vec![9u8; 10_000]).unwrap();
        let (url, _) = serve(
            data.clone(),
            ServerOptions {
                ranges: false,
                ..FULL
            },
        )
        .await;
        let (_tx, rx) = tokio::sync::watch::channel(false);

        let path = run(&url, &dir, model, rx, &plenty, &mut Vec::new())
            .await
            .unwrap();
        assert_eq!(std::fs::read(path).unwrap(), data);
    }

    #[tokio::test]
    async fn a_broken_transfer_keeps_the_part_file_for_a_retry() {
        let data = body(80_000);
        let model = test_model(&data, sha_hex(&data));
        let dir = temp_dir("cut");
        let (url, _) = serve(
            data.clone(),
            ServerOptions {
                cut_after: Some(30_000),
                ..FULL
            },
        )
        .await;
        let (_tx, rx) = tokio::sync::watch::channel(false);

        let error = run(&url, &dir, model, rx.clone(), &plenty, &mut Vec::new())
            .await
            .unwrap_err();
        assert!(matches!(error, DownloadError::Network { .. }), "{error:?}");
        let part_len = std::fs::metadata(dir.join("ggml-test.bin.part"))
            .unwrap()
            .len();
        assert!(part_len > 0 && part_len <= 30_000);

        // The retry resumes and completes against a healthy server.
        let (url, seen) = serve(data.clone(), FULL).await;
        let path = run(&url, &dir, model, rx, &plenty, &mut Vec::new())
            .await
            .unwrap();
        assert_eq!(std::fs::read(path).unwrap(), data);
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            &[Some(format!("bytes={part_len}-"))]
        );
    }

    #[tokio::test]
    async fn checksum_mismatch_deletes_the_file() {
        let data = body(20_000);
        let model = test_model(
            &data,
            "0000000000000000000000000000000000000000000000000000000000000000",
        );
        let (url, _) = serve(data, FULL).await;
        let dir = temp_dir("checksum");
        let (_tx, rx) = tokio::sync::watch::channel(false);

        let error = run(&url, &dir, model, rx, &plenty, &mut Vec::new())
            .await
            .unwrap_err();
        assert_eq!(error, DownloadError::Checksum);
        assert!(!dir.join("ggml-test.bin").exists());
        assert!(!dir.join("ggml-test.bin.part").exists());
    }

    #[tokio::test]
    async fn not_enough_disk_space_stops_before_downloading() {
        let data = body(10_000);
        let model = test_model(&data, sha_hex(&data));
        let (url, seen) = serve(data, FULL).await;
        let dir = temp_dir("space");
        let (_tx, rx) = tokio::sync::watch::channel(false);
        let small_disk = |_: &Path| -> std::io::Result<u64> { Ok(5_000) };

        let error = run(&url, &dir, model, rx, &small_disk, &mut Vec::new())
            .await
            .unwrap_err();
        assert_eq!(
            error,
            DownloadError::DiskSpace {
                needed_bytes: 11_000,
                available_bytes: 5_000
            }
        );
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn cancel_stops_the_transfer_and_keeps_the_part_file() {
        let data = body(400_000);
        let model = test_model(&data, sha_hex(&data));
        let (url, _) = serve(data, ServerOptions { slow: true, ..FULL }).await;
        let dir = temp_dir("cancel");
        let (tx, rx) = tokio::sync::watch::channel(false);
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_in_callback = calls.clone();
        let client = reqwest::Client::new();
        let started = Instant::now();

        let download = download_model(
            DownloadRequest {
                client: &client,
                url,
                dir: &dir,
                model,
                cancel: rx,
                available_space: &plenty,
            },
            move |_| {
                calls_in_callback.fetch_add(1, Ordering::SeqCst);
            },
        );
        let cancel = async {
            tokio::time::sleep(Duration::from_millis(300)).await;
            tx.send(true).unwrap();
        };
        let (result, ()) = tokio::join!(download, cancel);

        assert_eq!(result.unwrap_err(), DownloadError::Cancelled);
        assert!(started.elapsed() < Duration::from_secs(3));
        assert!(dir.join("ggml-test.bin.part").exists());
        assert!(!dir.join("ggml-test.bin").exists());
        // Throttled to about ten per second: ~15 chunks arrive in 300 ms, but only a few
        // progress callbacks run.
        assert!(calls.load(Ordering::SeqCst) <= 5);
    }

    #[test]
    fn speed_meter_measures_recent_throughput() {
        let start = Instant::now();
        let mut meter = SpeedMeter {
            samples: std::collections::VecDeque::from([(start, 0)]),
        };
        assert_eq!(meter.bytes_per_second(), 0);
        meter.add(start + Duration::from_secs(1), 1_000_000);
        meter.add(start + Duration::from_secs(2), 2_000_000);
        assert_eq!(meter.bytes_per_second(), 1_000_000);
        // Old samples drop out of the window, so a slowdown shows.
        for s in 3..=10 {
            meter.add(
                start + Duration::from_secs(s),
                2_000_000 + (s - 2) * 100_000,
            );
        }
        assert!(meter.bytes_per_second() < 200_000);
    }
}
