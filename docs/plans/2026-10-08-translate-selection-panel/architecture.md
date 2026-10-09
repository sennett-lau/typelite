# Architecture

How a panel translation runs through the code. Back to [index](index.md).

```
Ask stop ─ transcript ─> VoiceIntentRouter (Ask, highlight)
             is_selection_translation_request? ── yes ──> TranslateSelection / PopupAnswer
                                                              │
             PipelineHandle::run_ask_draft ── polish_text (translation prompt, preset, script)
                                                              │
             executor: PopupAnswer ── backend says "shown by caller" (no paste, no copy)
                                                              │
             AskDictationResult { output: translation, translationTarget } ──> Ask panel
```

## Routing

- `voice_intent::language::is_selection_translation_request` decides from the transcript.
- `VoiceIntentRouter::route` checks it first for Ask with a highlight (when
  `translate_selection` is on) and returns `TranslateSelection` with placement `PopupAnswer`.
  `VoiceIntent::from_parts` accepts that pair; every other kind keeps its single placement.
- Ask's old "translate this into X replaces the selection" branch is gone. Dictate with a
  highlight and the Translate shortcut still produce `TranslateSelection` with
  `ReplaceSelection`.

## Translation

- `request_translation` (pipeline) translates a `PopupAnswer` selection translation even though
  an Ask run never sets `translate_enabled`: into the named language, else the active one.
- The system prompt for `TranslateSelection` now also asks for the whole text, every sentence.
- Language routing, the AI preset and Chinese script conversion are the ones the Translate
  shortcut uses, because it is the same `polish_text` call.

## Output

- The pipeline's execution backend gets `answer_shown_by_caller` for an Ask run with a
  `PopupAnswer` placement. Its `popup_answer` then succeeds without doing anything, so the
  executor neither pastes nor copies.
- `AskDictationResultMetadata::from_draft_execution` maps that execution to the new output
  `translation`; `stop_ask_dictation` adds `translation_target` (same resolution as the
  pipeline) and counts the run as not pasting in Insights.
- The panel (`AskAnswerPanel`) shows the translation with Copy (`copy_ask_text`) and Replace the
  highlight (`insert_ask_text`).

## Privacy and logs

- The highlight and the translation live only in memory for the run and in the panel while it
  is open. Nothing is written to disk.
- Logs keep what they already logged: the target code and where it came from ("Selection
  translation target: en (from speech)"), timings and character counts. Never text.
