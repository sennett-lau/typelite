//! Plan `language-prompt-library`: downloading the index and presets from GitHub.
//!
//! Every request is a plain HTTPS GET with no query string, no cookies and no identifiers, and a
//! fixed `User-Agent: Typelite`. The index is fetched with `If-None-Match`, so an unchanged
//! index costs one small response. A preset is accepted only when its size and SHA-256 equal the
//! index entry and it validates; a mismatch usually means the preset changed on `main` after the
//! index was fetched, so the index is fetched again once and the download retried.

use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};

use super::store::LibraryStore;
use super::{parse_index, parse_preset, Index, IndexEntry, Preset, MAX_FILE_BYTES};

/// Largest index the app accepts (a few hundred presets are well under this).
const MAX_INDEX_BYTES: usize = 2 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Why the index could not be fetched.
#[derive(Debug, Clone, PartialEq)]
pub enum FetchError {
    /// No connection, a timeout or a server error: the app works from its cache.
    Offline(String),
    /// The server answered with something that is not a valid index.
    Invalid(String),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::Offline(reason) => {
                write!(f, "The preset library is not reachable ({reason})")
            }
            FetchError::Invalid(reason) => {
                write!(f, "The preset library sent an invalid index ({reason})")
            }
        }
    }
}

/// The HTTP client for the library: no cookies, a fixed user agent.
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Typelite")
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap_or_default()
}

pub fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Fetches `index.json` (conditionally when a cached copy exists), saves it and returns it.
pub async fn refresh_index(
    client: &reqwest::Client,
    base_url: &str,
    store: &LibraryStore,
) -> Result<Index, FetchError> {
    let url = format!("{base_url}/index.json");
    let cached = store.cached_index();
    let mut request = client.get(&url);
    if cached.is_some() {
        if let Some(etag) = store.index_meta().etag {
            request = request.header(reqwest::header::IF_NONE_MATCH, etag);
        }
    }
    let started = Instant::now();
    let response = request.send().await;
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            tracing::info!(
                "Language presets: GET {url} failed after {} ms: {error}",
                started.elapsed().as_millis()
            );
            return Err(FetchError::Offline(error.to_string()));
        }
    };
    let status = response.status();
    if status == reqwest::StatusCode::NOT_MODIFIED {
        tracing::info!(
            "Language presets: GET {url} -> 304 in {} ms",
            started.elapsed().as_millis()
        );
        if let Some(index) = cached {
            let _ = store.touch_index(now_unix());
            return Ok(index);
        }
        return Err(FetchError::Invalid("304 without a cached index".into()));
    }
    if !status.is_success() {
        tracing::info!(
            "Language presets: GET {url} -> {} in {} ms",
            status.as_u16(),
            started.elapsed().as_millis()
        );
        return Err(FetchError::Offline(format!("HTTP {}", status.as_u16())));
    }
    let etag = response
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = response
        .bytes()
        .await
        .map_err(|error| FetchError::Offline(error.to_string()))?;
    tracing::info!(
        "Language presets: GET {url} -> {} ({} bytes) in {} ms",
        status.as_u16(),
        bytes.len(),
        started.elapsed().as_millis()
    );
    if bytes.len() > MAX_INDEX_BYTES {
        return Err(FetchError::Invalid("index is too large".into()));
    }
    let index = parse_index(&bytes).map_err(FetchError::Invalid)?;
    if let Err(error) = store.save_index(&bytes, etag.as_deref(), now_unix()) {
        tracing::warn!("Language presets: could not save the index: {error}");
    }
    Ok(index)
}

/// Downloads one preset file and checks it against its index entry.
async fn download_file(
    client: &reqwest::Client,
    base_url: &str,
    entry: &IndexEntry,
) -> Result<(Vec<u8>, Preset), String> {
    let url = format!("{base_url}/{}", entry.path);
    let started = Instant::now();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("The preset library is not reachable ({error})"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("The download failed ({error})"))?;
    tracing::info!(
        "Language presets: GET {url} -> {} ({} bytes) in {} ms",
        status.as_u16(),
        bytes.len(),
        started.elapsed().as_millis()
    );
    if !status.is_success() {
        return Err(format!("The download failed (HTTP {})", status.as_u16()));
    }
    if bytes.len() > MAX_FILE_BYTES
        || bytes.len() != entry.bytes
        || format!("{:x}", Sha256::digest(&bytes)) != entry.sha256
    {
        return Err(VERIFY_FAILED.into());
    }
    let preset = parse_preset(&entry.id, &bytes).map_err(|errors| {
        tracing::warn!(
            "Language presets: {} failed validation: {}",
            entry.id,
            errors.join("; ")
        );
        VERIFY_FAILED.to_string()
    })?;
    Ok((bytes.to_vec(), preset))
}

pub const VERIFY_FAILED: &str = "The preset could not be verified";

/// The current index entry and a verified, stored copy of preset `id`: from the store when that
/// version is already downloaded, else downloaded. Uses the cached index first; fetches it when
/// there is none or when the download does not match it.
pub async fn ensure_preset(
    client: &reqwest::Client,
    base_url: &str,
    store: &LibraryStore,
    id: &str,
) -> Result<(IndexEntry, Preset), String> {
    let mut index = match store.cached_index() {
        Some(index) => index,
        None => refresh_index(client, base_url, store)
            .await
            .map_err(|error| error.to_string())?,
    };
    let mut refreshed = false;
    loop {
        let Some(entry) = index.entry(id).cloned() else {
            if refreshed {
                return Err("The preset is not in the library".into());
            }
            index = refresh_index(client, base_url, store)
                .await
                .map_err(|error| error.to_string())?;
            refreshed = true;
            continue;
        };
        if let Ok(preset) = store.load_preset(id, &entry.sha256) {
            return Ok((entry, preset));
        }
        match download_file(client, base_url, &entry).await {
            Ok((bytes, preset)) => {
                store
                    .store_preset(id, &bytes)
                    .map_err(|error| format!("The preset could not be saved ({error})"))?;
                return Ok((entry, preset));
            }
            Err(error) if error == VERIFY_FAILED && !refreshed => {
                index = refresh_index(client, base_url, store)
                    .await
                    .map_err(|error| error.to_string())?;
                refreshed = true;
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::super::store::tests::{english_bytes, temp_store};
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// A reply of the fake library: status, extra headers and body.
    #[derive(Clone)]
    pub(crate) struct Reply {
        pub status: u16,
        pub headers: Vec<(String, String)>,
        pub body: Vec<u8>,
    }

    pub(crate) fn ok(body: Vec<u8>) -> Reply {
        Reply {
            status: 200,
            headers: Vec::new(),
            body,
        }
    }

    /// Routes by path; records the raw request heads it received.
    pub(crate) type Routes = Arc<Mutex<Vec<(String, Reply)>>>;

    /// A small HTTP server standing in for raw.githubusercontent.com. Returns its base URL, the
    /// routes (changeable while it runs) and the request heads it received.
    pub(crate) async fn fake_library(
        routes: Vec<(&str, Reply)>,
    ) -> (String, Routes, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!(
            "http://{}/presets/languages",
            listener.local_addr().unwrap()
        );
        let routes: Routes = Arc::new(Mutex::new(
            routes
                .into_iter()
                .map(|(path, reply)| (path.to_string(), reply))
                .collect(),
        ));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (shared_routes, shared_requests) = (routes.clone(), requests.clone());
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                let routes = shared_routes.clone();
                let requests = shared_requests.clone();
                tokio::spawn(async move {
                    let mut head = Vec::new();
                    let mut buf = [0u8; 4096];
                    loop {
                        let Ok(n) = socket.read(&mut buf).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        head.extend_from_slice(&buf[..n]);
                        if head.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let head = String::from_utf8_lossy(&head).to_string();
                    requests.lock().unwrap().push(head.clone());
                    let path = head
                        .split_whitespace()
                        .nth(1)
                        .unwrap_or_default()
                        .trim_start_matches("/presets/languages/")
                        .to_string();
                    let reply = routes
                        .lock()
                        .unwrap()
                        .iter()
                        .find(|(route, _)| *route == path)
                        .map(|(_, reply)| reply.clone())
                        .unwrap_or(Reply {
                            status: 404,
                            headers: Vec::new(),
                            body: b"not found".to_vec(),
                        });
                    let mut response = format!(
                        "HTTP/1.1 {} X\r\ncontent-length: {}\r\nconnection: close\r\n",
                        reply.status,
                        reply.body.len()
                    );
                    for (name, value) in &reply.headers {
                        response.push_str(&format!("{name}: {value}\r\n"));
                    }
                    response.push_str("\r\n");
                    let mut bytes = response.into_bytes();
                    bytes.extend_from_slice(&reply.body);
                    let _ = socket.write_all(&bytes).await;
                });
            }
        });
        (base, routes, requests)
    }

    /// An index with one entry for `bytes` under `id`, version `version`.
    pub(crate) fn index_for(id: &str, version: i64, bytes: &[u8]) -> Vec<u8> {
        let preset = parse_preset(id, bytes).unwrap();
        let mut entry = IndexEntry::from_preset(&preset);
        entry.version = version;
        serde_json::to_vec(&serde_json::json!({"format": 1, "presets": [entry]})).unwrap()
    }

    #[tokio::test]
    async fn the_index_is_fetched_once_and_then_revalidated_with_its_etag() {
        let store = temp_store("etag");
        let english = english_bytes();
        let mut index_reply = ok(index_for("english", 2, &english));
        index_reply.headers.push(("etag".into(), "\"v1\"".into()));
        let (base, routes, requests) = fake_library(vec![("index.json", index_reply)]).await;

        let index = refresh_index(&client(), &base, &store).await.unwrap();
        assert_eq!(index.entry("english").unwrap().version, 2);
        assert_eq!(store.index_meta().etag.as_deref(), Some("\"v1\""));

        // The server now says "not modified": the cached index is used.
        routes.lock().unwrap()[0].1 = Reply {
            status: 304,
            headers: Vec::new(),
            body: Vec::new(),
        };
        let again = refresh_index(&client(), &base, &store).await.unwrap();
        assert_eq!(again, index);

        let heads = requests.lock().unwrap().clone();
        assert_eq!(heads.len(), 2);
        assert!(!heads[0].to_lowercase().contains("if-none-match"));
        assert!(heads[1].to_lowercase().contains("if-none-match: \"v1\""));
        for head in &heads {
            let lower = head.to_lowercase();
            // Plain GETs: no query string, no cookies, a fixed user agent.
            assert!(head.starts_with("GET /presets/languages/index.json HTTP/1.1"));
            assert!(!lower.contains("cookie"));
            assert!(lower.contains("user-agent: typelite\r\n"));
        }
    }

    #[tokio::test]
    async fn an_unreachable_library_is_reported_as_offline() {
        let store = temp_store("offline");
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        assert!(matches!(
            refresh_index(&client(), &base, &store).await,
            Err(FetchError::Offline(_))
        ));
        let (base, _, _) = fake_library(vec![("index.json", ok(b"{nope".to_vec()))]).await;
        assert!(matches!(
            refresh_index(&client(), &base, &store).await,
            Err(FetchError::Invalid(_))
        ));
    }

    #[tokio::test]
    async fn a_preset_is_downloaded_verified_and_stored() {
        let store = temp_store("download");
        let english = english_bytes();
        let (base, _, requests) = fake_library(vec![
            ("index.json", ok(index_for("english", 2, &english))),
            ("english/preset.md", ok(english.clone())),
        ])
        .await;
        let (entry, preset) = ensure_preset(&client(), &base, &store, "english")
            .await
            .unwrap();
        assert_eq!(entry.version, 2);
        assert_eq!(preset.id, "english");
        assert!(store.has_preset("english", &entry.sha256));

        // Already downloaded: nothing is fetched again.
        let before = requests.lock().unwrap().len();
        ensure_preset(&client(), &base, &store, "english")
            .await
            .unwrap();
        assert_eq!(requests.lock().unwrap().len(), before);
    }

    #[tokio::test]
    async fn a_file_that_does_not_match_the_index_is_refused_after_one_retry() {
        let store = temp_store("mismatch");
        let english = english_bytes();
        let mut changed = english.clone();
        changed.extend_from_slice(b"\nMore text.\n");
        let (base, _, requests) = fake_library(vec![
            ("index.json", ok(index_for("english", 2, &english))),
            ("english/preset.md", ok(changed)),
        ])
        .await;
        let error = ensure_preset(&client(), &base, &store, "english")
            .await
            .unwrap_err();
        assert_eq!(error, VERIFY_FAILED);
        // index, file, index again, file again.
        assert_eq!(requests.lock().unwrap().len(), 4);
        assert!(!store.has_preset("english", &format!("{:x}", Sha256::digest(&english))));
    }

    #[tokio::test]
    async fn a_new_index_is_fetched_when_the_preset_changed_on_main() {
        let store = temp_store("changed");
        let english = english_bytes();
        let taiwan =
            std::fs::read(super::super::library_dir().join("mandarin-taiwan/preset.md")).unwrap();
        // The cached index is for an older file; the server has the new file and index.
        store
            .save_index(&index_for("mandarin-taiwan", 1, &taiwan), None, 1)
            .unwrap();
        let (base, _, _) = fake_library(vec![
            ("index.json", ok(index_for("english", 3, &english))),
            ("english/preset.md", ok(english.clone())),
        ])
        .await;
        let (entry, _) = ensure_preset(&client(), &base, &store, "english")
            .await
            .unwrap();
        assert_eq!(entry.version, 3);
    }
}
