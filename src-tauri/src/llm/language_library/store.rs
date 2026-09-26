//! Plan `language-prompt-library`: the downloaded language presets on disk.
//!
//! ```text
//! <app data>/language-presets/
//!   index.json            the last index.json fetched from GitHub
//!   index-meta.json       its ETag and when it was fetched
//!   updates.json          automatic updates, for the "Updated automatically" banner
//!   <id>/<sha256>.md      one file per downloaded version, named by its hash
//! ```
//!
//! Files are named by their hash so a preview of a newer version never breaks a language that
//! still uses the older one. Every read checks the hash and validates the file again.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{is_sha256, is_slug, parse_index, parse_preset, Index, Preset};

/// ETag and fetch time of the cached index.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct IndexMeta {
    pub etag: Option<String>,
    /// Unix seconds of the last successful fetch (200 or 304).
    pub fetched_at: Option<i64>,
    /// Unix seconds of the last daily auto-update check.
    pub auto_checked_at: Option<i64>,
}

/// One automatic update of a language (plan: "Updated automatically to vN").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoUpdateRecord {
    pub id: String,
    pub from: i64,
    pub to: i64,
    /// Unix seconds.
    pub at: i64,
}

/// Why a stored preset could not be used.
#[derive(Debug, Clone, PartialEq)]
pub enum LoadError {
    Missing,
    Damaged(String),
}

#[derive(Debug, Clone)]
pub struct LibraryStore {
    dir: PathBuf,
}

impl LibraryStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// The store inside the app's data folder.
    pub fn in_app_data(app_data_dir: &Path) -> Self {
        Self::new(app_data_dir.join("language-presets"))
    }

    fn index_path(&self) -> PathBuf {
        self.dir.join("index.json")
    }

    fn meta_path(&self) -> PathBuf {
        self.dir.join("index-meta.json")
    }

    fn updates_path(&self) -> PathBuf {
        self.dir.join("updates.json")
    }

    /// `<id>/<sha256>.md`, or `None` for an id or hash that could leave the folder.
    fn preset_path(&self, id: &str, sha256: &str) -> Option<PathBuf> {
        (is_slug(id) && is_sha256(sha256)).then(|| self.dir.join(id).join(format!("{sha256}.md")))
    }

    /// The cached index, if there is a readable one.
    pub fn cached_index(&self) -> Option<Index> {
        let bytes = std::fs::read(self.index_path()).ok()?;
        parse_index(&bytes).ok()
    }

    pub fn index_meta(&self) -> IndexMeta {
        std::fs::read(self.meta_path())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    /// Saves a freshly fetched index with its ETag.
    pub fn save_index(&self, bytes: &[u8], etag: Option<&str>, now: i64) -> std::io::Result<()> {
        write_atomic(&self.index_path(), bytes)?;
        let mut meta = self.index_meta();
        meta.etag = etag.map(str::to_string);
        meta.fetched_at = Some(now);
        self.save_meta(&meta)
    }

    /// Notes that the daily auto-update check ran.
    pub fn mark_auto_checked(&self, now: i64) -> std::io::Result<()> {
        let mut meta = self.index_meta();
        meta.auto_checked_at = Some(now);
        self.save_meta(&meta)
    }

    /// Notes that the server said the cached index is still current (HTTP 304).
    pub fn touch_index(&self, now: i64) -> std::io::Result<()> {
        let mut meta = self.index_meta();
        meta.fetched_at = Some(now);
        self.save_meta(&meta)
    }

    fn save_meta(&self, meta: &IndexMeta) -> std::io::Result<()> {
        let json = serde_json::to_vec_pretty(meta).map_err(std::io::Error::other)?;
        write_atomic(&self.meta_path(), &json)
    }

    /// True when the version with this hash is on disk (not checked; see `load_preset`).
    pub fn has_preset(&self, id: &str, sha256: &str) -> bool {
        self.preset_path(id, sha256)
            .is_some_and(|path| path.is_file())
    }

    /// Stores a verified download and returns its hash.
    pub fn store_preset(&self, id: &str, bytes: &[u8]) -> std::io::Result<String> {
        let sha256 = format!("{:x}", Sha256::digest(bytes));
        let path = self
            .preset_path(id, &sha256)
            .ok_or_else(|| std::io::Error::other("invalid preset id"))?;
        write_atomic(&path, bytes)?;
        Ok(sha256)
    }

    /// Reads, hash-checks and validates a stored version.
    pub fn load_preset(&self, id: &str, sha256: &str) -> Result<Preset, LoadError> {
        let path = self.preset_path(id, sha256).ok_or(LoadError::Missing)?;
        let bytes = std::fs::read(&path).map_err(|_| LoadError::Missing)?;
        if format!("{:x}", Sha256::digest(&bytes)) != sha256 {
            return Err(LoadError::Damaged("hash does not match".into()));
        }
        parse_preset(id, &bytes).map_err(|errors| LoadError::Damaged(errors.join("; ")))
    }

    /// Removes the stored versions of `id` whose hash is not in `keep`.
    pub fn prune(&self, id: &str, keep: &[String]) {
        if !is_slug(id) {
            return;
        }
        let Ok(entries) = std::fs::read_dir(self.dir.join(id)) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(hash) = name.strip_suffix(".md") else {
                continue;
            };
            if is_sha256(hash) && !keep.iter().any(|kept| kept == hash) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    /// Automatic updates by language code.
    pub fn updates(&self) -> BTreeMap<String, AutoUpdateRecord> {
        std::fs::read(self.updates_path())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn record_update(&self, code: &str, record: AutoUpdateRecord) -> std::io::Result<()> {
        let mut updates = self.updates();
        updates.insert(code.to_string(), record);
        let json = serde_json::to_vec_pretty(&updates).map_err(std::io::Error::other)?;
        write_atomic(&self.updates_path(), &json)
    }
}

/// Writes a file through a temporary file and a rename, so a crash never leaves half a file.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("part");
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(&temporary, path)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A fresh, empty store in the temp folder.
    pub(crate) fn temp_store(name: &str) -> LibraryStore {
        let dir = std::env::temp_dir().join(format!(
            "typelite-language-presets-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        LibraryStore::new(dir)
    }

    pub(crate) fn english_bytes() -> Vec<u8> {
        std::fs::read(super::super::library_dir().join("english/preset.md")).unwrap()
    }

    #[test]
    fn a_stored_preset_is_read_back_and_checked() {
        let store = temp_store("read");
        let bytes = english_bytes();
        let sha = store.store_preset("english", &bytes).unwrap();
        assert!(store.has_preset("english", &sha));
        let preset = store.load_preset("english", &sha).unwrap();
        assert_eq!(preset.id, "english");

        // A changed file is refused, and a missing one is reported as missing.
        let path = store.preset_path("english", &sha).unwrap();
        std::fs::write(&path, b"changed").unwrap();
        assert!(matches!(
            store.load_preset("english", &sha),
            Err(LoadError::Damaged(_))
        ));
        assert!(matches!(
            store.load_preset("english", &"0".repeat(64)),
            Err(LoadError::Missing)
        ));
        // Ids and hashes that could leave the folder are never used as paths.
        assert!(matches!(
            store.load_preset("../x", &sha),
            Err(LoadError::Missing)
        ));
        assert!(!store.has_preset("english", "../../etc"));
    }

    #[test]
    fn a_stored_file_under_another_id_is_refused() {
        let store = temp_store("other-id");
        let sha = store
            .store_preset("mandarin-taiwan", &english_bytes())
            .unwrap();
        assert!(matches!(
            store.load_preset("mandarin-taiwan", &sha),
            Err(LoadError::Damaged(_))
        ));
    }

    #[test]
    fn prune_keeps_only_the_listed_versions() {
        let store = temp_store("prune");
        let old = store.store_preset("english", b"old").unwrap();
        let new = store.store_preset("english", &english_bytes()).unwrap();
        store.prune("english", std::slice::from_ref(&new));
        assert!(store.has_preset("english", &new));
        assert!(!store.has_preset("english", &old));
    }

    #[test]
    fn index_meta_and_updates_round_trip() {
        let store = temp_store("meta");
        assert_eq!(store.index_meta(), IndexMeta::default());
        assert!(store.cached_index().is_none());
        let index = std::fs::read(super::super::library_dir().join("index.json")).unwrap();
        store.save_index(&index, Some("\"abc\""), 100).unwrap();
        assert_eq!(store.index_meta().etag.as_deref(), Some("\"abc\""));
        assert_eq!(store.index_meta().fetched_at, Some(100));
        store.touch_index(200).unwrap();
        assert_eq!(store.index_meta().fetched_at, Some(200));
        assert_eq!(store.index_meta().etag.as_deref(), Some("\"abc\""));
        assert!(store.cached_index().unwrap().entry("english").is_some());

        let record = AutoUpdateRecord {
            id: "english".into(),
            from: 1,
            to: 2,
            at: 300,
        };
        store.record_update("en", record.clone()).unwrap();
        assert_eq!(store.updates()["en"], record);
    }
}
