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
//! - `TYPELITE_E2E_BUILTIN_MODEL` [`~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin`]: model
//!   file for the in-process (built-in) speech test; the test is skipped when it is missing.
//! - `TYPELITE_E2E_LLAMA_MODEL`: a Qwen3 GGUF file for the built-in AI test (plan 0017); it also
//!   needs `src-tauri/binaries/llama-server-<triple>` from `scripts/build-llama-server.sh`.
//! - `TYPELITE_E2E_DOWNLOAD=1`: also run the Quick setup download test (190 MB from Hugging Face).
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

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_keeps_one_topic_in_one_paragraph() {
    // Whisper segments arrive as separate lines; the result must not keep those breaks.
    let req = dictation_request(
        "I also see how it looks quite weird when it tries to paste the text\nbecause it puts its own new line in the middle of some random places\nit should only do new lines on sections or content that should be separated",
    );
    let (text, took) = polish(&req).await;
    println!("polish (one paragraph): {took:?} -> {text:?}");
    assert!(!text.contains('\n'), "unexpected line break: {text:?}");
}

// ─── Plan 0011: selection translate and live questions ───

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn ai_classifies_live_and_timeless_questions() {
    use typelite_lib::llm::live_question::{classify, classify_with_timeout, LiveCheckSource};

    let client = reqwest::Client::new();
    let config = ai_config();
    // Warm the model so the 2 s budget measures the classification, not a cold load.
    let _ = classify_with_timeout(&client, &config, "hello", Duration::from_secs(60)).await;

    for (question, expected) in [
        ("what's the AI news today", true),
        ("what is the capital of France", false),
    ] {
        let started = Instant::now();
        let check = classify(&client, &config, question).await;
        println!(
            "live check: {:?} for {question:?} -> live={} reason={} source={}",
            started.elapsed(),
            check.live,
            check.reason,
            check.source.as_str()
        );
        assert_eq!(
            check.source,
            LiveCheckSource::Ai,
            "the AI should decide within the time budget"
        );
        assert_eq!(check.live, expected, "{question:?}");
    }
}

/// Source text for the regional Chinese checks: it names software, a laptop and a network,
/// which Hong Kong and Taiwan write differently (軟件/軟體, 手提電腦/筆電, 網絡/網路).
const REGIONAL_SOURCE: &str = "The meeting has moved to next Tuesday. Please bring your laptop and the software update notes, and check that the office network is working.";

/// Selected text + Translate with no speech: the built-in instruction, and the active language
/// as the target.
async fn translate_selection_into(active_target: &str) -> String {
    use typelite_lib::voice_intent::language::{
        resolve_selection_translation_target, SELECTION_TRANSLATE_INSTRUCTION,
    };

    let (target, _) = resolve_selection_translation_target("", active_target, &[]);
    let mut req = dictation_request(SELECTION_TRANSLATE_INSTRUCTION);
    req.selected_text = Some(REGIONAL_SOURCE.into());
    req.translate_enabled = true;
    req.target_lang = target;
    req.voice_intent = VoiceIntent::from_parts(
        VoiceIntentKind::TranslateSelection,
        VoiceOutputPlacement::ReplaceSelection,
        1.0,
        None,
        None,
        None,
        None,
    )
    .expect("valid selection translation intent");

    let (text, took) = polish(&req).await;
    println!("selection translate ({active_target}): {took:?} -> {text:?}");
    text
}

/// Traditional characters only (no Simplified forms), and actually translated.
fn assert_traditional_translation(text: &str) {
    // Characters whose Simplified and Traditional forms differ.
    let traditional = [
        '會', '議', '請', '帶', '腦', '軟', '體', '們', '筆', '記', '這', '將', '網', '絡',
    ];
    let simplified = [
        '会', '议', '请', '带', '脑', '软', '体', '们', '笔', '记', '这', '将', '网', '络',
    ];
    assert!(
        text.chars().any(|c| traditional.contains(&c)),
        "no Traditional characters in {text:?}"
    );
    assert!(
        !text.chars().any(|c| simplified.contains(&c)),
        "Simplified characters in {text:?}"
    );
    assert!(
        !text.to_lowercase().contains("meeting"),
        "not translated: {text:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn selection_translation_into_hong_kong_chinese_uses_traditional_characters() {
    let text = translate_selection_into("zh-Hant-HK").await;
    assert_traditional_translation(&text);
    // Hong Kong vocabulary, not Taiwan's.
    for taiwan in ["軟體", "筆電", "網路"] {
        assert!(!text.contains(taiwan), "Taiwan term {taiwan} in {text:?}");
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn selection_translation_into_taiwan_chinese_uses_taiwan_vocabulary() {
    let text = translate_selection_into("zh-Hant-TW").await;
    assert_traditional_translation(&text);
    assert!(
        text.contains("軟體") || text.contains("筆電"),
        "no Taiwan term (軟體 or 筆電) in {text:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn ask_edit_on_a_selection_returns_a_shorter_replacement() {
    // Plan 0011: Ask + "make this shorter" on a selection is routed as an edit that replaces
    // the selection, so the AI must return only the shorter text.
    let selected = "Hey, just checking whether you had a chance to look at the draft I sent over last week, no rush at all.";
    let instruction = "Make this shorter.";
    let intent = typelite_lib::commands::ask::route_ask_intent(
        instruction,
        true,
        Some("en"),
        Default::default(),
    );
    assert_eq!(intent.kind, VoiceIntentKind::RewriteSelection);

    let mut req = dictation_request(instruction);
    req.selected_text = Some(selected.into());
    req.voice_intent = intent;
    let (text, took) = polish(&req).await;
    println!("ask edit (make this shorter): {took:?} -> {text:?}");
    assert!(!text.trim().is_empty());
    assert!(text.trim().len() < selected.len(), "not shorter: {text:?}");
    assert!(
        !text.to_lowercase().contains("here is"),
        "not a bare replacement: {text:?}"
    );
}

/// Plan 0012: the model file for the in-process test. Defaults to the developer's copy used by
/// the local whisper.cpp server.
fn builtin_model_path() -> Option<PathBuf> {
    let path = std::env::var("TYPELITE_E2E_BUILTIN_MODEL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| {
                PathBuf::from(home).join(".local/share/whisper/ggml-large-v3-turbo-q5_0.bin")
            })
        })?;
    path.is_file().then_some(path)
}

/// Runs a recording through the built-in (in-process whisper.cpp) provider, the way the
/// pipeline does: connect (which starts loading the model), stream chunks, disconnect.
async fn transcribe_builtin(model: &std::path::Path, pcm: &[u8]) -> (Option<String>, Duration) {
    stt::builtin::engine().set_models_dir(model.parent().unwrap().to_path_buf());
    let preset = SpeechPreset::builtin_whisper(
        "large-v3-turbo",
        model.file_name().unwrap().to_str().unwrap(),
    );
    let mut provider = stt::provider_for_preset(&preset, None).expect("built-in provider");
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
    let text = provider
        .disconnect()
        .await
        .expect("in-process transcription");
    (text, started.elapsed())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a Whisper model file: TYPELITE_E2E_BUILTIN_MODEL, default ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin"]
async fn builtin_speech_transcribes_an_english_sentence_in_process() {
    let Some(model) = builtin_model_path() else {
        println!("builtin speech: no model file found, skipping");
        return;
    };
    let pcm = synthesise(
        "Please send the design review notes to the team by Friday.",
        None,
    );
    let audio_secs = pcm.len() as f64 / 32_000.0;

    // Load first so the load time is measured on its own.
    let load_started = Instant::now();
    stt::builtin::engine()
        .preload(&model)
        .expect("model should load");
    let load = load_started.elapsed();
    let (text, first) = transcribe_builtin(&model, &pcm).await;
    let text = text.expect("transcript should not be empty");
    // Again with the model in memory, the normal case while dictating.
    let (_, warm) = transcribe_builtin(&model, &pcm).await;
    println!(
        "builtin speech: load {load:?}, first {first:?}, warm {warm:?} for {audio_secs:.1}s of audio -> {text:?}"
    );
    let words = normalised(&text);
    for expected in ["design", "review", "notes", "friday"] {
        assert!(words.contains(expected), "missing {expected:?} in {text:?}");
    }

    // Silence is skipped before whisper.cpp runs, as with the server provider.
    let (silent, _) = transcribe_builtin(&model, &vec![0u8; SAMPLE_RATE as usize * 2]).await;
    assert_eq!(silent, None);

    // Free the model before the process exits (GGML's Metal cleanup aborts otherwise).
    stt::builtin::engine().unload();
}

/// Plan 0012: Quick setup's download against the real Hugging Face file (190 MB): stop part
/// way, resume with a Range request through the CDN redirect, then check the SHA-256.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "downloads 190 MB from Hugging Face"]
async fn quick_setup_downloads_and_resumes_the_small_model() {
    use stt::models::{self, DownloadError, DownloadRequest};

    if std::env::var("TYPELITE_E2E_DOWNLOAD").ok().as_deref() != Some("1") {
        println!("quick setup: set TYPELITE_E2E_DOWNLOAD=1 to run the 190 MB download");
        return;
    }
    let model = *models::known_model("small").unwrap();
    let dir = std::env::temp_dir().join(format!("typelite-e2e-models-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let client = reqwest::Client::new();
    let url = format!("{}/{}", models::MODEL_BASE_URL, model.file_name);

    // First try: cancel once 20 MB have arrived.
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let started = Instant::now();
    let first = models::download_model(
        DownloadRequest {
            client: &client,
            url: url.clone(),
            dir: &dir,
            model,
            cancel: cancel_rx,
            available_space: &models::disk_available_space,
        },
        |progress| {
            if progress.downloaded_bytes > 20_000_000 {
                let _ = cancel_tx.send(true);
            }
        },
    )
    .await;
    assert_eq!(first.unwrap_err(), DownloadError::Cancelled);
    let part = std::fs::metadata(dir.join(format!("{}.part", model.file_name)))
        .unwrap()
        .len();
    println!("quick setup: cancelled after {part} bytes");

    // Second try resumes from the part file.
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let mut first_progress = None;
    let mut last_speed = 0;
    let path = models::download_model(
        DownloadRequest {
            client: &client,
            url,
            dir: &dir,
            model,
            cancel: rx,
            available_space: &models::disk_available_space,
        },
        |progress| {
            first_progress.get_or_insert(progress.downloaded_bytes);
            last_speed = progress.bytes_per_second;
        },
    )
    .await
    .expect("resumed download");
    let took = started.elapsed();
    println!(
        "quick setup: done in {took:?}, resumed at {:?} bytes, last speed {:.1} MB/s",
        first_progress,
        last_speed as f64 / 1e6
    );
    assert!(
        first_progress.unwrap() >= part,
        "the download did not resume"
    );
    assert_eq!(std::fs::metadata(&path).unwrap().len(), model.size_bytes);
    let _ = std::fs::remove_dir_all(&dir);
}

/// Plan 0017: the model file for the built-in AI test (a Qwen3 Q4_K_M GGUF).
fn llama_model_path() -> Option<PathBuf> {
    let path = std::env::var("TYPELITE_E2E_LLAMA_MODEL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)?;
    path.is_file().then_some(path)
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs src-tauri/binaries/llama-server-<triple> (scripts/build-llama-server.sh) and TYPELITE_E2E_LLAMA_MODEL"]
async fn builtin_ai_server_starts_and_polishes_a_sentence() {
    use typelite_lib::llm::builtin;
    let Some(model) = llama_model_path() else {
        println!("builtin AI: TYPELITE_E2E_LLAMA_MODEL is not set to a model file, skipping");
        return;
    };
    let pid_file = std::env::temp_dir().join(format!("typelite-e2e-{}.pid", std::process::id()));
    builtin::server().set_paths(model.parent().unwrap().to_path_buf(), pid_file);
    assert!(
        builtin::server().binary_available(),
        "build llama-server first: bash scripts/build-llama-server.sh"
    );
    let preset = AiPreset::builtin_llama("qwen3-4b", model.file_name().unwrap().to_str().unwrap());

    let started = Instant::now();
    let config = builtin::llm_config(&preset, String::new())
        .await
        .expect("the built-in server should start");
    let startup = started.elapsed();
    assert!(config.base_url.starts_with("http://127.0.0.1:"));

    let req = dictation_request(
        "um so I was thinking we could uh meet on Monday no wait Tuesday at like 3pm to go over the the design review",
    );
    let provider = llm::create_provider(None);
    let mut timings = Vec::new();
    let mut text = String::new();
    for _ in 0..3 {
        let request_started = Instant::now();
        text = provider
            .polish(&config, &req, None)
            .await
            .expect("polish request")
            .polished_text;
        timings.push(request_started.elapsed());
    }
    builtin::server().stop();
    println!("builtin AI: start {startup:?}, polish {timings:?} -> {text:?}");
    let words = normalised(&text);
    assert!(words.contains("tuesday"), "self-correction lost: {text:?}");
    assert!(!text.contains("<think>"), "thinking was not off: {text:?}");
}
