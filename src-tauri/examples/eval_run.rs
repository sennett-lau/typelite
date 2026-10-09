//! Plan `language-evals`: runs dataset cases through the app's real polish and speech code and
//! writes the raw answers. Scoring, summaries and baselines are in `scripts/evals/` (Node), which
//! starts this program; run it through `npm run eval`, not directly.
//!
//! ```sh
//! cargo run --release --example eval_run -- polish --in cases.jsonl --out answers.jsonl
//! cargo run --release --example eval_run -- speech --in clips.jsonl --out answers.jsonl
//! ```
//!
//! Polish input lines: `{"id", "input", "sample"}`. It builds the same request as a plain
//! dictation with the default settings (General app, "clean" style, Chinese script "preserve"),
//! routes the transcript to a language the way the pipeline does (`TYPELITE_EVAL_LANGUAGES`, a
//! comma list, stands in for the user's languages; default: the app's default list), calls
//! `LlmProvider::polish` (which applies the app's clean-up of the answer) and then the dictation
//! language guard (`llm::output_guard`).
//!
//! Speech input lines: `{"id", "audio"}` with a 16 kHz mono 16-bit WAV path. The audio is
//! streamed in 100 ms chunks through the provider the app uses (voice check, recognition and
//! hallucination filters included).
//!
//! Environment:
//! - AI: `TYPELITE_EVAL_LLAMA_MODEL` (a GGUF file: start the built-in llama-server, which needs
//!   `src-tauri/binaries/llama-server-<triple>`), or `TYPELITE_EVAL_AI_URL`,
//!   `TYPELITE_EVAL_AI_MODEL`, `TYPELITE_EVAL_AI_KEY` for any OpenAI-compatible server.
//! - Speech: `TYPELITE_EVAL_WHISPER_MODEL` (a ggml model file: built-in whisper.cpp), or
//!   `TYPELITE_EVAL_SPEECH_URL`, `TYPELITE_EVAL_SPEECH_MODEL` for an OpenAI-compatible server.
//!
//! Nothing is sent anywhere except the configured server.
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde_json::{json, Value};
use typelite_lib::app_detector::types::ContextProfile;
use typelite_lib::llm::{self, LlmConfig, PolishLanguageNotes, PolishRequest};
use typelite_lib::storage::{AiPreset, AppConfig, SpeechPreset};
use typelite_lib::stt::chinese_script::{convert, ChineseScript};
use typelite_lib::stt::{self, config::build_whisper_config, SttConfig};
use typelite_lib::voice_intent::{VoiceIntent, VoiceIntentKind, VoiceOutputPlacement};

const SAMPLE_RATE: u32 = 16_000;
/// Same chunk size the recorder sends (100 ms of 16-bit mono audio).
const CHUNK_BYTES: usize = (SAMPLE_RATE as usize / 10) * 2;

type BoxError = Box<dyn std::error::Error>;

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn arg(args: &[String], name: &str) -> Result<PathBuf, BoxError> {
    let at = args
        .iter()
        .position(|a| a == name)
        .ok_or(format!("missing {name}"))?;
    Ok(PathBuf::from(
        args.get(at + 1).ok_or(format!("{name} needs a value"))?,
    ))
}

fn read_lines(path: &Path) -> Result<Vec<Value>, BoxError> {
    let file = std::fs::File::open(path)?;
    let mut out = Vec::new();
    for line in BufReader::new(file).lines() {
        let line = line?;
        if !line.trim().is_empty() {
            out.push(serde_json::from_str(&line)?);
        }
    }
    Ok(out)
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<(), BoxError> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mode = args.first().cloned().unwrap_or_default();
    let input = read_lines(&arg(&args, "--in")?)?;
    let mut out = std::fs::File::create(arg(&args, "--out")?)?;
    match mode.as_str() {
        "polish" => run_polish(&input, &mut out).await,
        "speech" => run_speech(&input, &mut out).await,
        _ => Err("usage: eval_run polish|speech --in <jsonl> --out <jsonl>".into()),
    }
}

/// The AI settings, starting the built-in llama-server when a GGUF file is given.
async fn ai_config() -> Result<(LlmConfig, bool), BoxError> {
    if let Some(model) = env("TYPELITE_EVAL_LLAMA_MODEL") {
        use typelite_lib::llm::builtin;
        let model = PathBuf::from(model);
        let pid_file =
            std::env::temp_dir().join(format!("typelite-eval-{}.pid", std::process::id()));
        builtin::server().set_paths(model.parent().ok_or("model path")?.to_path_buf(), pid_file);
        if !builtin::server().binary_available() {
            return Err("build llama-server first: bash scripts/build-llama-server.sh".into());
        }
        let file = model
            .file_name()
            .and_then(|f| f.to_str())
            .ok_or("model file")?;
        let preset = AiPreset::builtin_llama("eval", file);
        let started = Instant::now();
        let config = builtin::llm_config(&preset, String::new()).await?;
        eprintln!(
            "eval: built-in llama-server ready in {:?}",
            started.elapsed()
        );
        return Ok((config, true));
    }
    let preset = AiPreset {
        id: "eval-ai".into(),
        name: "Eval AI".into(),
        base_url: env("TYPELITE_EVAL_AI_URL")
            .ok_or("set TYPELITE_EVAL_LLAMA_MODEL (built-in) or TYPELITE_EVAL_AI_URL (a server)")?,
        model: env("TYPELITE_EVAL_AI_MODEL").unwrap_or_default(),
        ..Default::default()
    };
    Ok((
        LlmConfig::from_preset(&preset, env("TYPELITE_EVAL_AI_KEY").unwrap_or_default()),
        false,
    ))
}

/// The user's language list: `TYPELITE_EVAL_LANGUAGES` or the app's default.
fn app_config() -> AppConfig {
    let mut config = AppConfig::default();
    if let Some(list) = env("TYPELITE_EVAL_LANGUAGES") {
        config.translation.targets = list
            .split(',')
            .map(|code| code.trim().to_string())
            .filter(|code| !code.is_empty())
            .collect();
    }
    config
}

/// A plain dictation with default settings, as `pipeline.rs` builds it.
fn dictation_request(config: &AppConfig, raw_text: &str) -> (PolishRequest, Option<String>) {
    use typelite_lib::llm::language_router::{language_profiles, route};
    let mut profiles = language_profiles(config, None);
    let routed = route(&profiles, raw_text, None)
        .index()
        .map(|index| profiles.swap_remove(index));
    let route_code = routed.as_ref().map(|p| p.code.clone());
    let req = PolishRequest {
        raw_text: raw_text.into(),
        context: ContextProfile::general_native().summary(),
        dictionary: Vec::new(),
        correction_rules: Vec::new(),
        polish_style: config.polish_style.clone(),
        mapped_scene_prompt: String::new(),
        active_scene_prompt: String::new(),
        polish_custom_prompt: config.polish_custom_prompt.clone(),
        polish_chinese_script: config.polish_chinese_script.clone(),
        translate_enabled: false,
        target_lang: "en".into(),
        translation_instructions: String::new(),
        polish_language_notes: routed.map(|profile| PolishLanguageNotes {
            code: profile.code,
            text: profile.instructions,
        }),
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
    };
    (req, route_code)
}

async fn run_polish(cases: &[Value], out: &mut std::fs::File) -> Result<(), BoxError> {
    let (llm_config, builtin) = ai_config().await?;
    let config = app_config();
    let provider = llm::create_provider(None);
    let mut result = Ok(());
    for (done, case) in cases.iter().enumerate() {
        let id = case["id"].as_str().unwrap_or_default();
        let raw = case["input"].as_str().unwrap_or_default();
        let (req, route) = dictation_request(&config, raw);
        let started = Instant::now();
        let line = match provider.polish(&llm_config, &req, None).await {
            Ok(response) => {
                let mut text = response.polished_text;
                let guarded = llm::output_guard::changed_language(raw, &text);
                if guarded {
                    text = llm::output_guard::transcript_as_output(raw);
                }
                json!({"id": id, "sample": case["sample"], "output": text, "guarded": guarded,
                       "route": route, "ms": started.elapsed().as_millis() as u64})
            }
            Err(error) => json!({"id": id, "sample": case["sample"], "error": error.to_string(),
                                 "ms": started.elapsed().as_millis() as u64}),
        };
        if let Err(error) = writeln!(out, "{line}") {
            result = Err(error.into());
            break;
        }
        eprint!("\reval: polish {}/{}", done + 1, cases.len());
    }
    eprintln!();
    if builtin {
        typelite_lib::llm::builtin::server().stop();
    }
    result
}

/// Return the PCM bytes of a 16 kHz mono 16-bit WAV file.
fn pcm_from_wav(wav: &[u8]) -> Result<Vec<u8>, BoxError> {
    if wav.len() < 12 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" {
        return Err("not a WAV file".into());
    }
    let mut i = 12;
    let mut format_ok = false;
    while i + 8 <= wav.len() {
        let id = &wav[i..i + 4];
        let size = u32::from_le_bytes(wav[i + 4..i + 8].try_into()?) as usize;
        let body = &wav[i + 8..(i + 8 + size).min(wav.len())];
        if id == b"fmt " && body.len() >= 16 {
            let channels = u16::from_le_bytes([body[2], body[3]]);
            let rate = u32::from_le_bytes(body[4..8].try_into()?);
            let bits = u16::from_le_bytes([body[14], body[15]]);
            format_ok = channels == 1 && rate == SAMPLE_RATE && bits == 16;
        }
        if id == b"data" {
            if !format_ok {
                return Err("WAV must be 16 kHz mono 16-bit".into());
            }
            return Ok(body.to_vec());
        }
        i += 8 + size + (size & 1);
    }
    Err("no data chunk in WAV".into())
}

async fn run_speech(clips: &[Value], out: &mut std::fs::File) -> Result<(), BoxError> {
    let builtin_model = env("TYPELITE_EVAL_WHISPER_MODEL").map(PathBuf::from);
    let preset = match &builtin_model {
        Some(model) => {
            stt::builtin::engine()
                .set_models_dir(model.parent().ok_or("model path")?.to_path_buf());
            let file = model
                .file_name()
                .and_then(|f| f.to_str())
                .ok_or("model file")?;
            SpeechPreset::builtin_whisper("eval", file)
        }
        None => SpeechPreset {
            id: "eval-speech".into(),
            name: "Eval speech".into(),
            base_url: env("TYPELITE_EVAL_SPEECH_URL").ok_or(
                "set TYPELITE_EVAL_WHISPER_MODEL (built-in) or TYPELITE_EVAL_SPEECH_URL (a server)",
            )?,
            model: env("TYPELITE_EVAL_SPEECH_MODEL").unwrap_or_else(|| "whisper-1".into()),
            language: "auto".into(),
            ..Default::default()
        },
    };
    let stt_config = SttConfig {
        api_key: String::new(),
        language: None,
        sample_rate: SAMPLE_RATE,
    };
    for (done, clip) in clips.iter().enumerate() {
        let id = clip["id"].as_str().unwrap_or_default();
        let audio = clip["audio"].as_str().unwrap_or_default();
        let pcm =
            pcm_from_wav(&std::fs::read(audio)?).map_err(|error| format!("{audio}: {error}"))?;
        let mut provider = if builtin_model.is_some() {
            stt::provider_for_preset(&preset, None).map_err(|e| e.to_string())?
        } else {
            stt::create_provider(
                build_whisper_config(&preset).map_err(|e| e.to_string())?,
                None,
            )
        };
        provider.connect(&stt_config).await?;
        for chunk in pcm.chunks(CHUNK_BYTES) {
            provider.send_audio(chunk).await?;
        }
        let started = Instant::now();
        let line = match provider.disconnect().await {
            Ok(text) => {
                let text = text.unwrap_or_default();
                // Script-converted copies, so a scorer can separate wrong characters from
                // the wrong script (the app leaves Whisper's script to polish).
                json!({"id": id, "output": text,
                       "as_simplified": convert(&text, ChineseScript::Simplified),
                       "as_hong_kong": convert(&text, ChineseScript::HongKong),
                       "as_taiwan": convert(&text, ChineseScript::Taiwan),
                       "ms": started.elapsed().as_millis() as u64})
            }
            Err(error) => json!({"id": id, "error": error.to_string()}),
        };
        writeln!(out, "{line}")?;
        eprint!("\reval: speech {}/{}", done + 1, clips.len());
    }
    eprintln!();
    if builtin_model.is_some() {
        // GGML's Metal backend aborts at exit if a model is still loaded.
        stt::builtin::engine().unload();
    }
    Ok(())
}
