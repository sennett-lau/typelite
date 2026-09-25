//! End-to-end checks against real speech and AI servers.
//!
//! These are ignored by default so `cargo test` stays offline. Run them with
//! `scripts/e2e.sh`, or directly:
//!
//! ```sh
//! cargo test --test e2e_services -- --ignored --nocapture
//! ```
//!
//! Servers are chosen with environment variables (defaults in brackets):
//! - `TYPELITE_E2E_SPEECH_URL` [`http://127.0.0.1:8178/v1`], `TYPELITE_E2E_SPEECH_MODEL` [`large-v3-turbo`]
//! - `TYPELITE_E2E_AI_URL` [`http://127.0.0.1:11434/v1`], `TYPELITE_E2E_AI_MODEL` [`qwen3:4b-instruct-2507-q4_K_M`]
//!
//! Speech tests synthesise their audio with macOS `say`, so they need macOS.

use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

use typelite_lib::app_detector::types::ContextProfile;
use typelite_lib::llm::{self, LlmConfig, PolishRequest};
use typelite_lib::storage::{AiPreset, SpeechPreset};
use typelite_lib::stt::{self, config::build_whisper_config, SttConfig};
use typelite_lib::voice_intent::{VoiceIntent, VoiceIntentKind, VoiceOutputPlacement};

const SAMPLE_RATE: u32 = 16_000;
/// Same chunk size the recorder sends (100 ms of 16-bit mono audio).
const CHUNK_BYTES: usize = (SAMPLE_RATE as usize / 10) * 2;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn speech_preset() -> SpeechPreset {
    SpeechPreset {
        id: "e2e-speech".into(),
        name: "E2E speech".into(),
        base_url: env_or("TYPELITE_E2E_SPEECH_URL", "http://127.0.0.1:8178/v1"),
        model: env_or("TYPELITE_E2E_SPEECH_MODEL", "large-v3-turbo"),
        language: "auto".into(),
        ..Default::default()
    }
}

fn ai_config() -> LlmConfig {
    let preset = AiPreset {
        id: "e2e-ai".into(),
        name: "E2E AI".into(),
        base_url: env_or("TYPELITE_E2E_AI_URL", "http://127.0.0.1:11434/v1"),
        model: env_or("TYPELITE_E2E_AI_MODEL", "qwen3:4b-instruct-2507-q4_K_M"),
        ..Default::default()
    };
    LlmConfig::from_preset(&preset, String::new())
}

/// Speak `text` with macOS `say` into a 16 kHz mono WAV and return its PCM samples as bytes.
fn synthesise(text: &str, voice: Option<&str>) -> Vec<u8> {
    let path: PathBuf = std::env::temp_dir().join(format!(
        "typelite-e2e-{}-{}.wav",
        std::process::id(),
        text.len()
    ));
    let mut cmd = Command::new("/usr/bin/say");
    if let Some(voice) = voice {
        cmd.args(["-v", voice]);
    }
    let status = cmd
        .args(["-o"])
        .arg(&path)
        .args(["--data-format=LEI16@16000", text])
        .status()
        .expect("`say` must be available (macOS)");
    assert!(status.success(), "`say` failed");
    let wav = std::fs::read(&path).expect("read synthesised wav");
    let _ = std::fs::remove_file(&path);
    pcm_from_wav(&wav)
}

/// Return the bytes of the `data` chunk of a PCM WAV file.
fn pcm_from_wav(wav: &[u8]) -> Vec<u8> {
    let mut i = 12;
    while i + 8 <= wav.len() {
        let id = &wav[i..i + 4];
        let size = u32::from_le_bytes(wav[i + 4..i + 8].try_into().unwrap()) as usize;
        if id == b"data" {
            return wav[i + 8..(i + 8 + size).min(wav.len())].to_vec();
        }
        i += 8 + size + (size & 1);
    }
    panic!("no data chunk in wav");
}

/// Send audio the way a recording does: connect, stream 100 ms chunks, then disconnect,
/// which uploads the buffered audio and returns the transcript.
async fn transcribe(pcm: &[u8]) -> (Option<String>, Duration) {
    let config = build_whisper_config(&speech_preset()).expect("valid speech preset");
    let mut provider = stt::create_provider(config, None);
    let stt_config = SttConfig {
        api_key: String::new(),
        language: None,
        sample_rate: SAMPLE_RATE,
    };
    provider.connect(&stt_config).await.expect("connect");
    for chunk in pcm.chunks(CHUNK_BYTES) {
        provider.send_audio(chunk).await.expect("send audio");
    }
    let started = Instant::now();
    let text = provider.disconnect().await.expect("transcription request");
    (text, started.elapsed())
}

fn dictation_request(raw_text: &str) -> PolishRequest {
    PolishRequest {
        raw_text: raw_text.into(),
        context: ContextProfile::general_native().summary(),
        dictionary: Vec::new(),
        correction_rules: Vec::new(),
        polish_style: "clean".into(),
        mapped_scene_prompt: String::new(),
        active_scene_prompt: String::new(),
        polish_custom_prompt: String::new(),
        translate_enabled: false,
        target_lang: "en".into(),
        selected_text: None,
        voice_intent: VoiceIntent::from_parts(
            VoiceIntentKind::DictateInsert,
            VoiceOutputPlacement::InsertAtCursor,
            1.0,
            None,
            None,
            None,
            None,
        )
        .expect("valid dictation intent"),
    }
}

async fn polish(req: &PolishRequest) -> (String, Duration) {
    let provider = llm::create_provider(None);
    let started = Instant::now();
    let response = provider
        .polish(&ai_config(), req, None)
        .await
        .expect("polish request");
    (response.polished_text, started.elapsed())
}

fn normalised(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running speech server; see scripts/e2e.sh"]
async fn speech_transcribes_an_english_sentence() {
    let pcm = synthesise(
        "Please send the design review notes to the team by Friday.",
        None,
    );
    let (text, took) = transcribe(&pcm).await;
    let text = text.expect("transcript should not be empty");
    println!(
        "speech: {took:?} for {:.1}s of audio -> {text:?}",
        pcm.len() as f64 / 32_000.0
    );
    let words = normalised(&text);
    for expected in ["design", "review", "notes", "friday"] {
        assert!(words.contains(expected), "missing {expected:?} in {text:?}");
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running speech server; see scripts/e2e.sh"]
async fn speech_detects_mandarin_without_a_language_hint() {
    let pcm = synthesise("我们明天下午三点开会", Some("Tingting"));
    let (text, took) = transcribe(&pcm).await;
    let text = text.expect("transcript should not be empty");
    println!("speech (zh): {took:?} -> {text:?}");
    assert!(
        text.contains("明天")
            && (text.contains("三点") || text.contains("3点") || text.contains("三點")),
        "unexpected transcript {text:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running speech server; see scripts/e2e.sh"]
async fn speech_returns_nothing_for_silence() {
    // Whisper invents text such as "Thank you." for silent audio, so Typelite must not send it.
    let silence = vec![0u8; SAMPLE_RATE as usize * 2];
    let (text, took) = transcribe(&silence).await;
    println!("speech (silence): {took:?} -> {text:?}");
    assert_eq!(text, None, "silence must not produce a transcript");
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_removes_fillers_and_applies_self_corrections() {
    let req = dictation_request(
        "um so I was thinking we could uh meet on Monday no wait Tuesday at like 3pm to go over the the design review",
    );
    let (text, took) = polish(&req).await;
    println!("polish: {took:?} -> {text:?}");
    let words = normalised(&text);
    assert!(words.contains("tuesday"), "self-correction lost: {text:?}");
    assert!(
        !words.contains("monday"),
        "kept the corrected word: {text:?}"
    );
    for filler in [" um ", " uh ", "the the"] {
        assert!(
            !format!(" {words} ").contains(filler),
            "kept filler {filler:?}: {text:?}"
        );
    }
    assert!(words.contains("design review"), "lost content: {text:?}");
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_keeps_the_language_of_the_dictation() {
    let req = dictation_request("嗯 我们明天 呃 下午三点开会 然后讨论一下设计");
    let (text, took) = polish(&req).await;
    println!("polish (zh): {took:?} -> {text:?}");
    assert!(text.contains("明天"), "content lost: {text:?}");
    assert!(
        !text.chars().any(|c| c.is_ascii_alphabetic()),
        "switched language: {text:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs both servers; see scripts/e2e.sh"]
async fn dictation_round_trip_from_audio_to_polished_text() {
    let pcm = synthesise(
        "Um, so let's meet on Monday, no wait, Tuesday at three p.m. to go over the design review.",
        None,
    );
    let (raw, speech_took) = transcribe(&pcm).await;
    let raw = raw.expect("transcript should not be empty");
    let (polished, ai_took) = polish(&dictation_request(&raw)).await;
    println!("round trip: speech {speech_took:?}, AI {ai_took:?}\n  raw: {raw:?}\n  polished: {polished:?}");
    let words = normalised(&polished);
    assert!(words.contains("tuesday"), "{polished:?}");
    assert!(!words.contains("monday"), "{polished:?}");
}
