//! Dictionary transfer through public production APIs. Only synthetic content is used.
//! Fixtures, database creation/seeding, read-back assertions and cleanup are untimed.
use std::hint::black_box;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tokio::runtime::Runtime;
use typelite_lib::dictionary_io::{
    commit_dictionary_import, export_dictionary_json, parse_dictionary_import, ImportFormat,
    ParsedDictionaryImport, ParsedDictionaryRow, MAX_IMPORT_BYTES,
};
use typelite_lib::storage::{CorrectionRule, DictionaryEntry, DictionaryStore};

use super::{SAMPLES, WARMUPS};

struct Fixture {
    dictionary: Vec<DictionaryEntry>,
    corrections: Vec<CorrectionRule>,
    json: Value,
    bytes: Vec<u8>,
}

impl Fixture {
    fn new(rows: usize) -> Self {
        assert_eq!(rows % 2, 0);
        let dictionary: Vec<_> = (0..rows / 2)
            .map(|index| DictionaryEntry {
                id: index as i64 + 1,
                word: if index == 0 {
                    "詞語\"quoted\"".into()
                } else {
                    format!("term-{index:04}")
                },
                pronunciation: (index % 3 == 0).then(|| format!("say-{index:04}")),
            })
            .collect();
        let corrections: Vec<_> = (0..rows / 2)
            .map(|index| CorrectionRule {
                id: index as i64 + 1,
                pattern: format!("wrong-{index:04}"),
                replacement: if index == 0 {
                    "正確\ntext\\path".into()
                } else {
                    format!("right-{index:04}")
                },
                enabled: index % 3 != 0,
            })
            .collect();
        // Keep the input independent of production export formatting and implementation.
        let json = json!({
            "format": "typelite_dictionary",
            "version": 1,
            "dictionary": dictionary.iter().map(|entry| json!({
                "word": entry.word, "pronunciation": entry.pronunciation,
            })).collect::<Vec<_>>(),
            "correctionRules": corrections.iter().map(|rule| json!({
                "pattern": rule.pattern, "replacement": rule.replacement,
                "enabled": rule.enabled,
            })).collect::<Vec<_>>(),
        });
        let bytes = serde_json::to_vec(&json).unwrap();
        assert!(bytes.len() <= MAX_IMPORT_BYTES);
        Self {
            dictionary,
            corrections,
            json,
            bytes,
        }
    }

    fn rows(&self) -> usize {
        self.dictionary.len() + self.corrections.len()
    }

    fn parsed(&self) -> ParsedDictionaryImport {
        let parsed = parse_dictionary_import(&self.bytes, ImportFormat::Json).unwrap();
        assert_eq!(parsed.rows.len(), self.rows());
        assert_eq!(parsed.skipped_invalid, 0);
        assert!(parsed.errors.is_empty());
        parsed
    }

    fn check_store(&self, runtime: &Runtime, store: &DictionaryStore) {
        let dictionary = runtime.block_on(store.list()).unwrap();
        let corrections = runtime.block_on(store.correction_rules()).unwrap();
        assert_eq!(dictionary.len(), self.dictionary.len());
        assert_eq!(corrections.len(), self.corrections.len());
        for (actual, expected) in dictionary.iter().zip(&self.dictionary) {
            assert_eq!(actual.word, expected.word);
            assert_eq!(actual.pronunciation, expected.pronunciation);
        }
        for (actual, expected) in corrections.iter().zip(&self.corrections) {
            assert_eq!(actual.pattern, expected.pattern);
            assert_eq!(actual.replacement, expected.replacement);
            assert_eq!(actual.enabled, expected.enabled);
        }
        assert!(dictionary.windows(2).all(|pair| pair[0].id < pair[1].id));
        assert!(corrections.windows(2).all(|pair| pair[0].id < pair[1].id));
    }
}

struct ScratchStore {
    store: Option<DictionaryStore>,
    directory: PathBuf,
}

impl ScratchStore {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "typelite-dictionary-bench-{}-{nonce}",
            std::process::id()
        ));
        // Never reuse a pre-existing directory or operate on the user's database.
        std::fs::create_dir(&directory).unwrap();
        let store = DictionaryStore::new(directory.join("dictionary.sqlite")).unwrap();
        Self {
            store: Some(store),
            directory,
        }
    }

    fn store(&self) -> &DictionaryStore {
        self.store.as_ref().unwrap()
    }
}

impl Drop for ScratchStore {
    fn drop(&mut self) {
        // Close SQLite before removing its database, WAL and shared-memory files.
        drop(self.store.take());
        if let Err(error) = std::fs::remove_dir_all(&self.directory) {
            eprintln!("Could not clean dictionary benchmark directory: {error}");
        }
    }
}

fn export_json(fixture: &Fixture, iterations: usize) -> Value {
    let expected = serde_json::to_string_pretty(&fixture.json).unwrap();
    assert_eq!(
        export_dictionary_json(&fixture.dictionary, &fixture.corrections).unwrap(),
        expected,
        "export must preserve field order, escaping, nulls and whitespace"
    );
    let mut samples = Vec::with_capacity(SAMPLES);
    for sample in 0..WARMUPS + SAMPLES {
        let start = Instant::now();
        for _ in 0..iterations {
            black_box(
                export_dictionary_json(
                    black_box(&fixture.dictionary),
                    black_box(&fixture.corrections),
                )
                .unwrap(),
            );
        }
        if sample >= WARMUPS {
            samples.push(start.elapsed().as_secs_f64() * 1e6 / iterations as f64);
        }
    }
    json!({
        "id": format!("dictionary/export-json-{}", fixture.rows()),
        "unit": "us/op", "samples_us": samples,
        "workload": {
            "rows": fixture.rows(), "dictionary_rows": fixture.dictionary.len(),
            "correction_rows": fixture.corrections.len(),
            "input_json_bytes": fixture.bytes.len(), "output_bytes": expected.len(),
            "iterations_per_sample": iterations, "warmups": WARMUPS, "samples": SAMPLES,
        },
    })
}

fn import_json(fixture: &Fixture, runtime: &Runtime, duplicate_rows: usize) -> Value {
    let parsed = fixture.parsed();
    assert_eq!(duplicate_rows % 2, 0);
    assert!(duplicate_rows <= fixture.rows());
    let seed = ParsedDictionaryImport {
        rows: parsed
            .rows
            .iter()
            .filter(|row| matches!(row, ParsedDictionaryRow::Dictionary { .. }))
            .take(duplicate_rows / 2)
            .chain(
                parsed
                    .rows
                    .iter()
                    .filter(|row| matches!(row, ParsedDictionaryRow::Correction { .. }))
                    .take(duplicate_rows / 2),
            )
            .cloned()
            .collect(),
        skipped_invalid: 0,
        errors: Vec::new(),
    };
    let mut samples = Vec::with_capacity(SAMPLES);
    for sample in 0..WARMUPS + SAMPLES {
        let scratch = ScratchStore::new();
        if duplicate_rows > 0 {
            let report = runtime
                .block_on(commit_dictionary_import(scratch.store(), seed.clone()))
                .unwrap();
            assert_eq!(report.accepted, duplicate_rows);
        }

        let start = Instant::now();
        let parsed =
            parse_dictionary_import(black_box(&fixture.bytes), ImportFormat::Json).unwrap();
        let report = runtime
            .block_on(commit_dictionary_import(scratch.store(), parsed))
            .unwrap();
        let elapsed = start.elapsed();

        assert_eq!(report.accepted, fixture.rows() - duplicate_rows);
        assert_eq!(report.skipped_duplicates, duplicate_rows);
        assert_eq!(report.skipped_invalid, 0);
        assert!(report.errors.is_empty());
        fixture.check_store(runtime, scratch.store());
        if sample >= WARMUPS {
            samples.push(elapsed.as_secs_f64() * 1e6);
        }
    }
    let suffix = if duplicate_rows > 0 {
        format!("-{}pct-duplicates", 100 * duplicate_rows / fixture.rows())
    } else {
        String::new()
    };
    json!({
        "id": format!("dictionary/import-json-{}{suffix}", fixture.rows()),
        "unit": "us/op", "samples_us": samples,
        "workload": {
            "rows": fixture.rows(), "dictionary_rows": fixture.dictionary.len(),
            "correction_rows": fixture.corrections.len(), "input_json_bytes": fixture.bytes.len(),
            "existing_rows": duplicate_rows, "accepted_rows": fixture.rows() - duplicate_rows,
            "iterations_per_sample": 1, "warmups": WARMUPS, "samples": SAMPLES,
            "database": "fresh temporary SQLite WAL, default durability",
            "boundary": "JSON parse and transactional commit; setup, seed and read-back excluded",
        },
    })
}

pub fn run() -> Vec<Value> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap();
    let mut results = Vec::new();
    for (rows, iterations) in [(0, 100), (2, 100), (20, 100), (1_000, 10), (10_000, 1)] {
        let fixture = Fixture::new(rows);
        results.push(export_json(&fixture, iterations));
        results.push(import_json(&fixture, &runtime, 0));
        if matches!(rows, 2 | 10_000) {
            results.push(import_json(&fixture, &runtime, rows));
        }
        if rows == 10_000 {
            results.push(import_json(&fixture, &runtime, 9_000));
        }
    }
    results
}
