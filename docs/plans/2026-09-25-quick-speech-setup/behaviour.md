# Behaviour

Back to [index](index.md).

## Where the button appears

- Onboarding → Speech recognition: a **Quick setup (recommended)** card above the preset editor
  when speech is not ready: "Download a speech model (574 MB) and run it on this Mac. No other
  software needed." Buttons: **Set up** and a link **Smaller and faster model (190 MB)**.
- Home → Finish setup card for speech: the same **Set up** button.
- Settings → Speech: the same card when no built-in model is installed; otherwise a "Built-in
  models" group listing installed models with size and **Delete**.

## Download flow

1. Check free disk space (model size + 10 %); if short, say how much is needed.
2. Download to a `.part` file with a progress bar (percent, MB of MB, speed, time left) and a
   **Cancel** button. Resume a partial download on retry when the server supports it.
3. Verify SHA-256 against the known value for that model. On mismatch delete the file and say
   so.
4. Move into place, create and select the preset "Built-in (this Mac)", run a test transcription
   of a short synthetic clip, and mark it ready.
5. Show "Speech recognition is ready" and continue (in onboarding, Next becomes available).

Downloads continue if the user leaves the step; progress also shows on Home until done.

## Provider

- New provider type `builtin` alongside the OpenAI-compatible one. Preset fields: model file and
  language (auto or fixed). No URL or key.
- Transcribes the recorded 16 kHz mono audio in-process with whisper.cpp (GPU via Metal),
  greedy decoding, the same voice check as the server provider (`stt/silence.rs`).
- Loads the model on first use, keeps it for 10 minutes after the last use, then frees it.
- Timings (load, transcription) appear in the log and the Speed board.

## Errors

| Case | Message |
|---|---|
| No internet / download fails | "Could not download the model: <reason>. Check your connection and try again." |
| Not enough disk space | "Need <n> GB free to download the model; <m> GB available." |
| Checksum mismatch | "The downloaded file was damaged, so it was deleted. Try again." |
| Model fails to load (e.g. memory) | "Could not load the speech model: <reason>. Try the smaller model." |
