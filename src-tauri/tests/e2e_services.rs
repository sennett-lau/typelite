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
//! - `TYPELITE_E2E_SPEECH_URL` [`http://127.0.0.1:8178/v1`], `TYPELITE_E2E_SPEECH_MODEL`
//! [`large-v3-turbo`]
//! - `TYPELITE_E2E_AI_URL` [`http://127.0.0.1:11434/v1`], `TYPELITE_E2E_AI_MODEL`
//! [`qwen3:4b-instruct-2507-q4_K_M`], `TYPELITE_E2E_AI_KEY` [empty: no `Authorization` header]
//!
//! - `TYPELITE_E2E_BUILTIN_MODEL` [`~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin`]: model
//!   file for the in-process (built-in) speech test; the test is skipped when it is missing.
//! - `TYPELITE_E2E_LLAMA_MODEL`: a Qwen3 GGUF file for the built-in AI test (plan
//! `ai-polish-setup`); it also   needs `src-tauri/binaries/llama-server-<triple>` from
//! `scripts/build-llama-server.sh`.
//! - `TYPELITE_E2E_DOWNLOAD=1`: also run the Quick setup download test (190 MB from Hugging Face).
//! - `TYPELITE_E2E_QWEN_KEY`: a Qwen Cloud Token Plan key for the Qwen Cloud speech tests
//!   (plan `qwen-cloud-speech`); they are skipped without it. `TYPELITE_E2E_QWEN_URL` overrides
//!   the address.
//! - `TYPELITE_E2E_ELEVENLABS_KEY`: an ElevenLabs API key with the Speech to Text permission for
//!   the ElevenLabs Scribe tests (plan `elevenlabs-speech`); they are skipped without it.
//!   `TYPELITE_E2E_ELEVENLABS_URL` and `TYPELITE_E2E_ELEVENLABS_MODEL` override the address and
//!   model.
//! - `TYPELITE_E2E_SEARXNG_URL`: a SearXNG address with JSON output on, for the Ask web search
//!   test (plan `ask-web-search`); it is skipped without it.
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
    LlmConfig::from_preset(&preset, env_or("TYPELITE_E2E_AI_KEY", ""))
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
        polish_chinese_script: "preserve".into(),
        translate_enabled: false,
        target_lang: "en".into(),
        translation_instructions: String::new(),
        polish_language_notes: None,
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

// ─── Plan `ask-translate-and-live-questions`: selection translate and live questions ───

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
    // Plan `ask-translate-and-live-questions`: Ask + "make this shorter" on a selection is routed
    // as an edit that replaces the selection, so the AI must return only the shorter text.
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

/// Plan `quick-speech-setup`: the model file for the in-process test. Defaults to the developer's
/// copy used by the local whisper.cpp server.
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

/// 16-bit PCM scaled by `db` (negative is quieter).
fn scaled_pcm(pcm: &[u8], db: f64) -> Vec<u8> {
    let gain = 10f64.powf(db / 20.0);
    pcm.chunks_exact(2)
        .flat_map(|b| {
            let s = f64::from(i16::from_le_bytes([b[0], b[1]])) * gain;
            (s.round().clamp(-32768.0, 32767.0) as i16).to_le_bytes()
        })
        .collect()
}

/// `seconds` of quiet room noise (about -60 dBFS) with a loud key click at each `clicks_ms`,
/// like a recording started and stopped with the shortcut without speaking.
fn clicks_in_a_quiet_room(seconds: f64, clicks_ms: &[u32]) -> Vec<u8> {
    let len = (seconds * f64::from(SAMPLE_RATE)) as usize;
    let mut seed: u32 = 7;
    let mut noise = || {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        f64::from(seed >> 8) / f64::from(1u32 << 24) * 2.0 - 1.0
    };
    let mut samples: Vec<f64> = (0..len).map(|_| noise() * 0.0017).collect();
    for &at in clicks_ms {
        let start = (at * SAMPLE_RATE / 1000) as usize;
        for i in 0..480 {
            let decay = (-(i as f64) / 64.0).exp();
            let click = noise() * 0.7 * decay;
            if let Some(s) = samples.get_mut(start + i) {
                *s += click;
            }
        }
    }
    samples
        .iter()
        .flat_map(|s| ((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())
        .collect()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a Whisper model file: TYPELITE_E2E_BUILTIN_MODEL, default ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin"]
async fn builtin_speech_ignores_clicks_and_keeps_quiet_speech() {
    let Some(model) = builtin_model_path() else {
        println!("builtin speech: no model file found, skipping");
        return;
    };
    // The reported bug: 0.7 s with the shortcut's clicks and nothing said gave "Thank you.".
    for (name, pcm) in [
        ("key clicks", clicks_in_a_quiet_room(0.7, &[20, 650])),
        ("click mid-way", clicks_in_a_quiet_room(0.7, &[300])),
        ("two clicks", clicks_in_a_quiet_room(1.5, &[300, 1000])),
    ] {
        let (text, _) = transcribe_builtin(&model, &pcm).await;
        println!("builtin speech ({name}) -> {text:?}");
        assert_eq!(text, None, "{name} must not produce a transcript");
    }

    // Speech 20 dB quieter than `say` makes it still gets through.
    let quiet = scaled_pcm(&synthesise("Let's meet on Tuesday at three.", None), -20.0);
    let (text, took) = transcribe_builtin(&model, &quiet).await;
    println!("builtin speech (quiet): {took:?} -> {text:?}");
    let words = normalised(&text.expect("quiet speech should be transcribed"));
    assert!(words.contains("tuesday"), "unexpected transcript {words:?}");

    stt::builtin::engine().unload();
}

/// Plan `quick-speech-setup`: Quick setup's download against the real Hugging Face file (190 MB):
/// stop part way, resume with a Range request through the CDN redirect, then check the SHA-256.
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

/// Plan `ai-polish-setup`: the model file for the built-in AI test (a Qwen3 Q4_K_M GGUF).
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
    let endpoint = builtin::endpoint_for(&preset, String::new())
        .await
        .expect("the built-in server should start");
    let startup = started.elapsed();
    // The automatic test that setup runs ("tested on this Mac in …").
    let setup_test_ms = builtin::test_request(&endpoint, &preset.model)
        .await
        .expect("the setup test request should pass");
    let config = builtin::llm_config(&preset, String::new())
        .await
        .expect("the running server is reused");
    assert_eq!(config.base_url, endpoint.base_url);
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
    println!(
        "builtin AI: start {startup:?}, setup test {setup_test_ms} ms, polish {timings:?} -> {text:?}"
    );
    let words = normalised(&text);
    assert!(words.contains("tuesday"), "self-correction lost: {text:?}");
    assert!(!text.contains("<think>"), "thinking was not off: {text:?}");
}

/// Plan `qwen-cloud-speech`: a Qwen Cloud speech preset, or `None` when no key is set.
fn qwen_preset_and_key() -> Option<(SpeechPreset, String)> {
    let key = std::env::var("TYPELITE_E2E_QWEN_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())?;
    let preset = SpeechPreset::qwen_cloud(
        "e2e-qwen-cloud",
        "Qwen Cloud",
        &env_or("TYPELITE_E2E_QWEN_URL", stt::qwen_cloud::DEFAULT_BASE_URL),
        stt::qwen_cloud::DEFAULT_MODEL,
    );
    Some((preset, key))
}

/// Runs a recording through the Qwen Cloud provider the way the pipeline does.
async fn transcribe_qwen(
    preset: &SpeechPreset,
    key: &str,
    pcm: &[u8],
) -> (Option<String>, Duration) {
    let mut provider = stt::provider_for_preset(preset, None).expect("Qwen Cloud provider");
    let stt_config = SttConfig {
        api_key: key.to_string(),
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
        .expect("Qwen Cloud transcription");
    (text, started.elapsed())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs TYPELITE_E2E_QWEN_KEY (Qwen Cloud Token Plan)"]
async fn qwen_cloud_transcribes_english_and_cantonese() {
    let Some((preset, key)) = qwen_preset_and_key() else {
        println!("qwen cloud: TYPELITE_E2E_QWEN_KEY not set, skipping");
        return;
    };

    let pcm = synthesise(
        "Please send the design review notes to the team by Friday.",
        None,
    );
    let (text, took) = transcribe_qwen(&preset, &key, &pcm).await;
    let text = text.expect("English transcript should not be empty");
    println!(
        "qwen cloud (en): {took:?} for {:.1}s of audio -> {text:?}",
        pcm.len() as f64 / 32_000.0
    );
    let words = normalised(&text);
    for expected in ["design", "review", "notes", "friday"] {
        assert!(words.contains(expected), "missing {expected:?} in {text:?}");
    }

    let pcm = synthesise("聽日下晝三點開會得唔得", Some("Sinji"));
    let (text, took) = transcribe_qwen(&preset, &key, &pcm).await;
    let text = text.expect("Cantonese transcript should not be empty");
    println!("qwen cloud (yue): {took:?} -> {text:?}");
    assert!(
        text.contains("得唔得") && (text.contains('3') || text.contains('三')),
        "unexpected transcript {text:?}"
    );

    // Silence is skipped before any request, as with the other providers.
    let (silent, _) = transcribe_qwen(&preset, &key, &vec![0u8; SAMPLE_RATE as usize * 2]).await;
    assert_eq!(silent, None);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs TYPELITE_E2E_QWEN_KEY (Qwen Cloud Token Plan)"]
async fn qwen_cloud_connection_test_passes_and_rejects_a_wrong_key() {
    let Some((preset, key)) = qwen_preset_and_key() else {
        println!("qwen cloud: TYPELITE_E2E_QWEN_KEY not set, skipping");
        return;
    };
    let config = stt::config::build_qwen_cloud_config(&preset).expect("valid preset");
    let client = reqwest::Client::new();

    let ms = stt::qwen_cloud::check_connection(&client, &config, &key)
        .await
        .expect("Test with the real key should pass");
    println!("qwen cloud test: {ms} ms");

    let error = stt::qwen_cloud::check_connection(&client, &config, "sk-wrong")
        .await
        .expect_err("a wrong key must fail");
    assert!(error.contains("401"), "unexpected error {error:?}");
}

// ─── Polish fidelity corpus: code words, requests in dictation, repeated-structure corrections ───
//
// These failures are occasional, so every case runs `TYPELITE_E2E_REPEAT` times (default 5)
// and the test prints a pass rate per case before it fails on any miss.

/// One corpus case: the raw transcript and a check that says why an output is wrong.
type FidelityCase = (&'static str, fn(&str) -> Result<(), String>);

fn has_cjk(text: &str) -> bool {
    text.chars().any(|c| {
        matches!(c, '\u{3040}'..='\u{30ff}' | '\u{3400}'..='\u{9fff}' | '\u{ac00}'..='\u{d7af}')
    })
}

fn expect_contains(text: &str, needles: &[&str]) -> Result<(), String> {
    let lower = text.to_lowercase();
    match needles.iter().find(|n| !lower.contains(&n.to_lowercase())) {
        Some(n) => Err(format!("missing {n:?}")),
        None => Ok(()),
    }
}

fn expect_absent(text: &str, needles: &[&str]) -> Result<(), String> {
    let lower = text.to_lowercase();
    match needles.iter().find(|n| lower.contains(&n.to_lowercase())) {
        Some(n) => Err(format!("unexpected {n:?}")),
        None => Ok(()),
    }
}

async fn run_fidelity_corpus(name: &str, cases: &[FidelityCase]) {
    let repeat: usize = env_or("TYPELITE_E2E_REPEAT", "5").parse().unwrap_or(5);
    let mut failures = Vec::new();
    for (raw, check) in cases {
        let mut passed = 0;
        for _ in 0..repeat {
            let (text, took) = polish(&dictation_request(raw)).await;
            match check(&text) {
                Ok(()) => passed += 1,
                Err(why) => {
                    println!("  miss ({took:?}) {raw:?} -> {text:?}: {why}");
                    failures.push(format!("{raw:?} -> {text:?}: {why}"));
                }
            }
        }
        println!("{name}: {passed}/{repeat} {raw:?}");
    }
    assert!(failures.is_empty(), "{name}: {failures:#?}");
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_writes_spoken_numbers_and_dots() {
    let cases = [
        ("five point five", "5.5"),
        ("use version two point one", "Use version 2.1"),
        ("use version one dot two dot zero", "Use version 1.2.0"),
        (
            "set the limit to zero point zero five",
            "Set the limit to 0.05",
        ),
        (
            "open dot gitignore and notes dot tmp",
            "Open .gitignore and notes.tmp",
        ),
        (
            "the point of the story is that one day a dot on the page will matter",
            "The point of the story is that one day a dot on the page will matter",
        ),
    ];
    let repeat: usize = env_or("TYPELITE_E2E_REPEAT", "5").parse().unwrap_or(5);
    for (index, (raw, expected)) in cases.iter().enumerate() {
        for _ in 0..repeat {
            let (text, _) = polish(&dictation_request(raw)).await;
            assert!(
                text.trim().eq_ignore_ascii_case(expected),
                "number/dot case {index}: expected {expected:?}, got {text:?}"
            );
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_keeps_file_names_and_code_words_whole() {
    let cases: &[FidelityCase] = &[
        (
            "add the build folder to dot gitignore and update dot prettierrc",
            |t| {
                expect_contains(t, &[".gitignore", ".prettierrc"])?;
                expect_absent(t, &[". gitignore", ". prettierrc", "dot gitignore"])
            },
        ),
        (
            "the temp files end in .tmp so put .tmp in the .gitignore",
            |t| {
                expect_contains(t, &[".tmp", ".gitignore"])?;
                expect_absent(t, &[". tmp", ". gitignore"])
            },
        ),
        (
            "can you check the xlp setting in the .prettierrc file",
            |t| {
                expect_contains(t, &["xlp", ".prettierrc"])?;
                expect_absent(t, &["x l p", "x-l-p", ". prettierrc"])
            },
        ),
        ("run npm run lint and then open the xlp config", |t| {
            expect_contains(t, &["npm run lint", "xlp"])?;
            expect_absent(t, &["x l p", "x-l-p"])
        }),
    ];
    run_fidelity_corpus("code words", cases).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_transcribes_requests_instead_of_doing_them() {
    let cases: &[FidelityCase] = &[
        ("create a post in Cantonese about our new app", |t| {
            if has_cjk(t) {
                return Err("wrote CJK content".into());
            }
            expect_contains(t, &["post", "cantonese", "new app"])
        }),
        (
            "write an email in Japanese to the client about the delay",
            |t| {
                if has_cjk(t) {
                    return Err("wrote CJK content".into());
                }
                expect_contains(t, &["email", "japanese", "client", "delay"])
            },
        ),
        ("generate a short poem in Spanish about the sea", |t| {
            expect_contains(t, &["poem", "spanish", "sea"])?;
            expect_absent(t, &[" mar ", " el "])
        }),
        (
            "translate the welcome message into French for the landing page",
            |t| {
                expect_contains(
                    t,
                    &["translate", "welcome message", "french", "landing page"],
                )?;
                expect_absent(t, &["bienvenue"])
            },
        ),
    ];
    run_fidelity_corpus("requests", cases).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_keeps_only_the_corrected_version_of_a_repeated_phrase() {
    let cases: &[FidelityCase] = &[
        // The onboarding "Change your mind" line, as speech servers punctuate it.
        ("Let's have lunch at one. Oh no! Let's do it at two.", |t| {
            expect_contains(t, &["lunch", "two"])?;
            expect_absent(t, &["one", "oh no", "oh, no"])
        }),
        (
            "Let's have lunch at one. Oh, no! Let's do it at two.",
            |t| {
                expect_contains(t, &["lunch", "two"])?;
                expect_absent(t, &["one", "oh no", "oh, no"])
            },
        ),
        ("let's have lunch at 1 oh no let's do it at 2", |t| {
            expect_contains(t, &["lunch", "2"])?;
            expect_absent(t, &["at 1", "oh no"])
        }),
        (
            "The first thing, um, sorry, the third thing, it's the budget",
            |t| {
                expect_contains(t, &["third thing", "budget"])?;
                expect_absent(t, &["first thing", "sorry"])
            },
        ),
        (
            "the first thing um sorry the third thing is the budget",
            |t| {
                expect_contains(t, &["third thing", "budget"])?;
                expect_absent(t, &["first thing", "sorry"])
            },
        ),
        (
            "we need two servers I mean three servers for the launch",
            |t| {
                expect_contains(t, &["three servers", "launch"])?;
                expect_absent(t, &["two servers", "i mean"])
            },
        ),
        (
            "send it to the design team no wait the marketing team by Friday",
            |t| {
                expect_contains(t, &["marketing team", "friday"])?;
                expect_absent(t, &["design team", "no wait"])
            },
        ),
        (
            "第一樣嘢，呃，sorry，第三樣嘢係個budget",
            |t| {
                expect_contains(t, &["第三", "budget"])?;
                expect_absent(t, &["第一", "sorry"])
            },
        ),
        ("我哋星期一 no wait 星期二開會", |t| {
            expect_contains(t, &["星期二"])?;
            expect_absent(t, &["星期一", "no wait"])
        }),
    ];
    run_fidelity_corpus("corrections", cases).await;
}

/// True when the output still has three or more single letters in a row ("M-A-Y", "P R I").
fn has_spelled_letters(text: &str) -> bool {
    let mut run = 0;
    for token in
        text.split(|c: char| matches!(c, '-' | '\u{2011}' | ',' | '(' | ')') || c.is_whitespace())
    {
        if token.chars().count() == 1 && token.chars().all(|c| c.is_ascii_alphabetic()) {
            run += 1;
            if run >= 3 {
                return true;
            }
        } else if !token.is_empty() {
            run = 0;
        }
    }
    false
}

fn expect_spelled_name(text: &str, name: &str, gone: &[&str]) -> Result<(), String> {
    if !text.contains(name) {
        return Err(format!("missing {name:?}"));
    }
    if has_spelled_letters(text) {
        return Err("kept spelled letters".into());
    }
    expect_absent(text, gone)
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a running AI server; see scripts/e2e.sh"]
async fn polish_writes_a_spelled_name_once() {
    let cases: &[FidelityCase] = &[
        ("please add Maya Chen M-A-Y-A-C-H-E-N to the invite", |t| {
            expect_spelled_name(t, "Maya Chen", &["MAYACHEN", "Mayachen"])
        }),
        (
            "Jaxon Wu, J-A-C-K-S-O-N W-O-O, will join the call on Monday",
            |t| expect_spelled_name(t, "Jackson Woo", &["Jaxon", " Wu"]),
        ),
        (
            "the new hire is Priya P R I Y A from the London office",
            |t| expect_spelled_name(t, "Priya", &[]),
        ),
        (
            "please email Niamh, spelled N-I-A-M-H, about the contract",
            |t| expect_spelled_name(t, "Niamh", &["spelled"]),
        ),
        ("我聽日約咗Maya M-A-Y-A食飯", |t| {
            expect_spelled_name(t, "Maya", &[])
        }),
    ];
    run_fidelity_corpus("spelled names", cases).await;
}

/// Plan `elevenlabs-speech`: an ElevenLabs speech preset, or `None` when no key is set.
fn elevenlabs_preset_and_key() -> Option<(SpeechPreset, String)> {
    let key = std::env::var("TYPELITE_E2E_ELEVENLABS_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())?;
    let preset = SpeechPreset::elevenlabs(
        "e2e-elevenlabs",
        "ElevenLabs",
        &env_or(
            "TYPELITE_E2E_ELEVENLABS_URL",
            stt::elevenlabs::DEFAULT_BASE_URL,
        ),
        &env_or(
            "TYPELITE_E2E_ELEVENLABS_MODEL",
            stt::elevenlabs::DEFAULT_MODEL,
        ),
    );
    Some((preset, key))
}

/// Runs a recording through the ElevenLabs provider the way the pipeline does. Returns the
/// text, the detected language and the time the upload took.
async fn transcribe_elevenlabs(
    preset: &SpeechPreset,
    key: &str,
    pcm: &[u8],
) -> (Option<String>, Option<String>, Duration) {
    let mut provider = stt::provider_for_preset(preset, None).expect("ElevenLabs provider");
    let stt_config = SttConfig {
        api_key: key.to_string(),
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
        .expect("ElevenLabs transcription");
    (text, provider.detected_language(), started.elapsed())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs TYPELITE_E2E_ELEVENLABS_KEY (ElevenLabs API key)"]
async fn elevenlabs_transcribes_english_and_cantonese() {
    let Some((preset, key)) = elevenlabs_preset_and_key() else {
        println!("elevenlabs: TYPELITE_E2E_ELEVENLABS_KEY not set, skipping");
        return;
    };

    let pcm = synthesise(
        "Please send the design review notes to the team by Friday.",
        None,
    );
    let (text, language, took) = transcribe_elevenlabs(&preset, &key, &pcm).await;
    let text = text.expect("English transcript should not be empty");
    println!("elevenlabs (en): {took:?}, language {language:?} -> {text:?}");
    let words = normalised(&text);
    for expected in ["design", "review", "notes", "friday"] {
        assert!(words.contains(expected), "missing {expected:?} in {text:?}");
    }
    assert_eq!(language.as_deref(), Some("en"));

    let pcm = synthesise("聽日下晝三點開會得唔得", Some("Sinji"));
    let (text, language, took) = transcribe_elevenlabs(&preset, &key, &pcm).await;
    let text = text.expect("Cantonese transcript should not be empty");
    println!("elevenlabs (yue): {took:?}, language {language:?} -> {text:?}");
    assert!(
        matches!(language.as_deref(), Some("yue" | "zh")),
        "unexpected language {language:?}"
    );

    // Silence is skipped before any request, as with the other providers.
    let (silent, _, _) =
        transcribe_elevenlabs(&preset, &key, &vec![0u8; SAMPLE_RATE as usize * 2]).await;
    assert_eq!(silent, None);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs TYPELITE_E2E_ELEVENLABS_KEY (ElevenLabs API key)"]
async fn elevenlabs_connection_test_passes_and_rejects_a_wrong_key() {
    let Some((preset, key)) = elevenlabs_preset_and_key() else {
        println!("elevenlabs: TYPELITE_E2E_ELEVENLABS_KEY not set, skipping");
        return;
    };
    let config = stt::config::build_elevenlabs_config(&preset).expect("valid preset");
    let client = reqwest::Client::new();

    let ms = stt::elevenlabs::check_connection(&client, &config, &key)
        .await
        .expect("Test with the real key should pass");
    println!("elevenlabs test: {ms} ms");

    let error = stt::elevenlabs::check_connection(&client, &config, "sk-wrong")
        .await
        .expect_err("a wrong key must fail");
    assert!(error.contains("401"), "unexpected error {error:?}");
}

/// Plan `ask-web-search`: a live question searched with a real SearXNG
/// (`TYPELITE_E2E_SEARXNG_URL`, JSON format on), then answered from the results by the AI
/// server. Skipped when the variable is not set.
#[tokio::test]
#[ignore = "needs a running SearXNG and AI server; see scripts/e2e.sh"]
async fn ask_answers_a_live_question_from_searxng_results() {
    use typelite_lib::web_search::{self, SearchProviderKind, WebSearchConfig};

    let Ok(base_url) = std::env::var("TYPELITE_E2E_SEARXNG_URL") else {
        println!("TYPELITE_E2E_SEARXNG_URL is not set; skipping");
        return;
    };
    let search_config = WebSearchConfig {
        provider: SearchProviderKind::Searxng,
        base_url,
    };
    let client = reqwest::Client::new();
    let question = "where is the next F1 Grand Prix";
    let outcome = web_search::search(
        &client,
        &search_config,
        "",
        question,
        web_search::SearchFocus::General,
    )
    .await
    .expect("SearXNG search");
    println!(
        "search: {} results in {:?}",
        outcome.results.len(),
        outcome.elapsed
    );
    for result in &outcome.results {
        println!("  - {} | {}", result.title, result.url);
    }
    assert!(!outcome.results.is_empty(), "SearXNG gave no results");
    assert!(outcome.results.len() <= web_search::MAX_RESULTS);

    let config = ai_config();
    let today = chrono::Local::now().format("%A, %Y-%m-%d").to_string();
    let body = llm::protocol::build_chat_body(
        &config.model,
        web_search::answer_messages(question, &outcome.results, &today),
        220,
        0.2,
        false,
        &config.extra_request_fields,
    );
    let started = Instant::now();
    let request = client
        .post(llm::protocol::chat_endpoint(&config.base_url).unwrap())
        .json(&body)
        .timeout(Duration::from_secs(60));
    let response: serde_json::Value = llm::protocol::apply_auth_headers(request, &config.api_key)
        .send()
        .await
        .expect("AI request")
        .json()
        .await
        .expect("AI JSON");
    let answer = llm::protocol::response_text(&response);
    let sources = web_search::answer_sources(&answer, &outcome.results);
    println!("answer in {:?}: {answer}", started.elapsed());
    println!(
        "sources: {:?}",
        sources.iter().map(|s| s.number).collect::<Vec<_>>()
    );
    assert!(!answer.trim().is_empty());
    assert!(
        !web_search::cited_numbers(&answer, outcome.results.len()).is_empty(),
        "the answer should cite a result"
    );
}

async fn schedule_answer(
    config: &LlmConfig,
    question: &str,
    results: &[typelite_lib::web_search::SearchResult],
    today: chrono::NaiveDate,
) -> Option<String> {
    use typelite_lib::web_search::schedule;
    let client = reqwest::Client::new();
    let body = llm::protocol::build_chat_body(
        &config.model,
        schedule::messages(question, results),
        640,
        0.0,
        false,
        &config.extra_request_fields,
    );
    let request = client
        .post(llm::protocol::chat_endpoint(&config.base_url).unwrap())
        .json(&body)
        .timeout(Duration::from_secs(60));
    let response: serde_json::Value = llm::protocol::apply_auth_headers(request, &config.api_key)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    schedule::answer(&llm::protocol::response_text(&response), results, today)
}

/// Regression for the reported F1 answer: old dates and undated calendars cannot become a
/// next race, even when the model invents facts. These are synthetic fixtures, not a calendar.
#[tokio::test]
#[ignore = "needs the configured AI server"]
async fn ask_upcoming_schedule_requires_supported_future_date() {
    use typelite_lib::web_search::SearchResult;
    let config = ai_config();
    let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 1).unwrap();
    let mut result = SearchResult {
        title: "F1 Schedule 2026".into(),
        url: "https://example.com/calendar".into(),
        snippet: "Oct 1, 2004 · Belgian Grand Prix 2026 calendar available.".into(),
        published_date: Some("2026-10-01".into()),
    };
    assert_eq!(
        schedule_answer(&config, "幾時下場F1?", &[result.clone()], today).await,
        None
    );
    result.snippet =
        "意大利站 2026年9月19日。新加坡站 2026年10月11日。馬來西亞站 2026年10月2日至4日。".into();
    assert_eq!(
        schedule_answer(&config, "幾時下場F1?", &[result], today)
            .await
            .as_deref(),
        Some("馬來西亞站 — 2026年10月2日至4日 [1]")
    );
}

#[tokio::test]
#[ignore = "needs a running SearXNG and AI server"]
async fn ask_upcoming_schedule_from_live_search() {
    use typelite_lib::web_search::{self, SearchProviderKind, WebSearchConfig};
    let Ok(base_url) = std::env::var("TYPELITE_E2E_SEARXNG_URL") else {
        println!("TYPELITE_E2E_SEARXNG_URL is not set; skipping");
        return;
    };
    let search_config = WebSearchConfig {
        provider: SearchProviderKind::Searxng,
        base_url,
    };
    let config = ai_config();
    let client = reqwest::Client::new();
    let today = chrono::Local::now().date_naive();
    for question in ["幾時下場F1?", "When is the next F1 race?"] {
        let check = llm::live_question::classify(&client, &config, question).await;
        assert!(check.live);
        assert_eq!(check.reason, "schedule");
        let query = check.query.expect("classifier supplies search keywords");
        println!("query: {query}");
        let outcome = web_search::search(
            &client,
            &search_config,
            "",
            &query,
            web_search::SearchFocus::Upcoming(today),
        )
        .await
        .unwrap();
        let answer = schedule_answer(&config, question, &outcome.results, today)
            .await
            .expect("search supplied a supported upcoming event");
        println!("{question}: {answer}");
    }
}
