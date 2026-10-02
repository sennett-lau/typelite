//! Offline benchmarks of public production paths; run with `npm run bench:local`.
use std::hint::black_box;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use typelite_lib::app_detector::types::ContextProfile;
use typelite_lib::llm::{
    openai::OpenAiProvider, ChunkCallback, LlmConfig, LlmProvider, PolishRequest,
};
use typelite_lib::stt::chinese_script::{convert, ChineseScript};
use typelite_lib::voice_intent::{VoiceIntent, VoiceIntentKind, VoiceOutputPlacement};

const WARMUPS: usize = 5;
const SAMPLES: usize = 15;

#[path = "local_performance/dictionary.rs"]
mod dictionary;
#[path = "local_performance/voice_activity.rs"]
mod voice_activity;

fn conversion(id: &str, input: &str, expected: &str, iterations: usize) -> Value {
    assert_eq!(convert(input, ChineseScript::HongKong), expected);
    let mut samples = Vec::new();
    for sample in 0..WARMUPS + SAMPLES {
        let start = Instant::now();
        for _ in 0..iterations {
            black_box(convert(black_box(input), ChineseScript::HongKong));
        }
        if sample >= WARMUPS {
            samples.push(start.elapsed().as_secs_f64() * 1e6 / iterations as f64);
        }
    }
    json!({
        "id": id, "unit": "us/op", "samples_us": samples,
        "workload": { "input_bytes": input.len(), "iterations_per_sample": iterations,
                      "warmups": WARMUPS, "samples": SAMPLES }
    })
}

struct FixtureServer {
    address: std::net::SocketAddr,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl FixtureServer {
    fn start(body: Vec<u8>, write_size: usize) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let thread = std::thread::spawn(move || {
            for connection in listener.incoming() {
                if stopped.load(Ordering::Relaxed) {
                    break;
                }
                let connection = connection.unwrap();
                connection.set_nodelay(true).unwrap();
                connection
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                connection
                    .set_write_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(connection);
                while !stopped.load(Ordering::Relaxed) {
                    let mut line = String::new();
                    match reader.read_line(&mut line) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                    let mut length = 0;
                    loop {
                        line.clear();
                        if reader.read_line(&mut line).unwrap() == 0 {
                            return;
                        }
                        if line == "\r\n" {
                            break;
                        }
                        if let Some((name, value)) = line.split_once(':') {
                            if name.eq_ignore_ascii_case("content-length") {
                                length = value.trim().parse::<usize>().unwrap();
                            }
                        }
                    }
                    assert!(length < 1024 * 1024);
                    let mut request = vec![0; length];
                    reader.read_exact(&mut request).unwrap();
                    let stream = reader.get_mut();
                    if write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\n\r\n", body.len()).is_err() {
                        break;
                    }
                    // These are server write sizes, not guaranteed client read boundaries.
                    for chunk in body.chunks(write_size) {
                        if stream.write_all(chunk).is_err() {
                            return;
                        }
                    }
                }
            }
        });
        Self {
            address,
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for FixtureServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = TcpStream::connect(self.address); // Wake accept when there is no connection.
        self.thread.take().unwrap().join().unwrap();
    }
}

fn dictation_request() -> PolishRequest {
    PolishRequest {
        raw_text: "A synthetic benchmark dictation".into(),
        context: ContextProfile::general_native().summary(),
        dictionary: vec![],
        correction_rules: vec![],
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
        .unwrap(),
    }
}

fn streaming(id: &str, events: usize, write_size: usize) -> Value {
    let line = b"data: {\"choices\":[{\"delta\":{\"content\":\"word \"}}]}\n\n";
    let mut body = line.repeat(events);
    body.extend_from_slice(
        b"data: {\"choices\":[{\"delta\":{\"content\":\"end.\"}}]}\n\ndata: [DONE]\n\n",
    );
    let bytes = body.len();
    let server = FixtureServer::start(body, write_size);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let client = reqwest::Client::builder()
        .no_proxy()
        .tcp_nodelay(true)
        .build()
        .unwrap();
    let provider = OpenAiProvider::with_client(client);
    let config = LlmConfig {
        api_key: String::new(),
        model: "fixture".into(),
        base_url: format!("http://{}/v1", server.address),
        extra_request_fields: Default::default(),
        max_tokens: 4096,
        temperature: 0.0,
    };
    let request = dictation_request();
    let shown = Arc::new(Mutex::new(String::new()));
    let callback_text = shown.clone();
    let callback: ChunkCallback =
        Box::new(move |text| callback_text.lock().unwrap().push_str(text));
    let expected = format!("{}end", "word ".repeat(events));
    let iterations = 10;
    let mut samples = Vec::new();
    for sample in 0..WARMUPS + SAMPLES {
        let mut elapsed = Duration::ZERO;
        for _ in 0..iterations {
            shown.lock().unwrap().clear();
            let start = Instant::now();
            let response = runtime
                .block_on(provider.polish(&config, &request, Some(&callback)))
                .unwrap();
            elapsed += start.elapsed();
            // Check both emitted text and final result, outside timing.
            assert_eq!(response.polished_text, expected);
            assert_eq!(*shown.lock().unwrap(), expected);
        }
        if sample >= WARMUPS {
            samples.push(elapsed.as_secs_f64() * 1e6 / iterations as f64);
        }
    }
    drop(provider);
    json!({
        "id": id, "unit": "us/op", "samples_us": samples,
        "workload": { "events": events + 1, "response_bytes": bytes, "server_write_bytes": write_size,
                      "iterations_per_sample": iterations, "warmups": WARMUPS, "samples": SAMPLES }
    })
}

fn main() {
    let input = "呢个系统同佢哋嘅关系系咁嘅，佢系我同事，等阵再复你个email。";
    let expected = "呢個系統同佢哋嘅關係係咁嘅，佢係我同事，等陣再覆你個email。";
    let mut results = vec![
        conversion("chinese/short", input, expected, 100),
        conversion("chinese/long", &input.repeat(64), &expected.repeat(64), 10),
        conversion(
            "chinese/no-han",
            "An English dictation with API identifiers.",
            "An English dictation with API identifiers.",
            1000,
        ),
        streaming("stream/short-small-writes", 128, 128),
        streaming("stream/long-batched", 1024, 64 * 1024),
        streaming("stream/stress-batched", 4096, 256 * 1024),
    ];
    results.extend(voice_activity::benchmarks());
    results.extend(dictionary::run());
    println!("{}", serde_json::to_string(&results).unwrap());
}
