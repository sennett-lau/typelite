# Request and routing

What happens after the wake phrase. Part of [hands-free-mode](index.md).

## The request

On a match, the listener starts Ask exactly as the Ask shortcut does
(`hotkey::start_ask_hands_free`). The only difference is a `hands_free` flag on the Ask state.
The pill shows the normal recording state. The onboarding shortcut gate applies, so nothing
starts before onboarding is finished.

While Ask records, the listener feeds the same microphone audio to `AutoStop`
(`hands_free/segment.rs`). It uses the same voice gate with a 900 ms hangover:

- **end of speech:** 900 ms quiet after speech → stop;
- **no speech:** nothing said within 5 s → stop. The usual voice check then ends the run with
  the calm no-speech fade (plan `quiet-no-speech`), and no audio is sent;
- **max length:** the recording limit from Settings (5–120 s) → stop.

Stopping calls the same `stop_ask_shortcut` as the Ask key, so Escape, errors, the answer panel
and run timings all behave as for a shortcut run.

## Routing by meaning ("option A")

In `stop_ask_dictation`, after transcription and language routing, a hands-free run first goes
through `hands_free::routing::route`:

| Request starts with | Route |
| --- | --- |
| "type", "type out", "type in", "dictate", "write down", "write out", "note down" | **Dictate** the rest |
| "write" + not a draft object (a, an, the, me, back, to …) | **Dictate** the rest |
| 打 (Cantonese "type"; not 打开 / 打电话 / 打算 …), 幫我打, 打字, 输入 / 輸入, 写下 / 寫下, 寫低, 记低, 听写 | **Dictate** the rest |
| bare 写 / 寫 (not 写一封 / 写个 / 帮我写 …) | **Dictate** the rest |
| "open", "switch to", "launch", "go to", "bring up", 打开 / 打開, 切换到 / 切換到, 转去 | **Voice command** hook |
| anything else | **Ask**, unchanged |

- **Dictate** runs `PipelineHandle::run_hands_free_dictation`: the same polish, dictionary,
  language rules and paste as the Dictate shortcut. The target is the app that had focus when
  the request started. With AI polish off, the text is pasted as heard.
- **Ask** keeps Ask's own intent detection, so questions, live questions, web search, drafts
  ("write an email to …"), edits of selected text and translations ("translate … into French")
  work as they do with the Ask shortcut.
- **Voice command:** `run_voice_command` is a hook that returns "not handled" until the
  `feature/voice-commands` work is on main. The request then goes to Ask.

Every route after the wake phrase uses the user's own speech and AI settings, as a shortcut run
does.
