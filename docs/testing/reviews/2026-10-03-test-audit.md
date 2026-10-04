# Test audit — 2026-10-03

Base: `d9f86b2`, on top of [performance PR #53](https://github.com/sennett-lau/typelite/pull/53).
The review covered the inventory and assertions across all 70 frontend test files, 88 Rust source
modules containing tests, the real-service integration suite, and the opt-in benchmark fixtures.
Changes are limited to tests and documentation.

## Decisions

| Area | Change | Coverage retained or strengthened |
|---|---|---|
| What's New | Remove pinned first/last release versions and release-note phrases | Synthetic releases verify version labels, order, every change and grouping |
| Build version | Replace a raw TypeScript source substring assertion | Import the module with two synthetic build versions and assert the exported value |
| Localization | Consolidate error and General-pane translation lists into the central suite; remove exact wording checks | Key parity, nonempty strings, interpolation variables; translation-language tests check key selection and unknown-code fallback |
| Home, settings and sidebar | Remove headline/branding/icon counts, old-copy absence checks, CSS block assertions and repeated child keycap tests | Configuration values, navigation, accessibility state, service readiness, progress, and settings actions |
| Settings navigation | Consolidate repeated initial render, tab switching and mock-animation tests | Visit all six sections and return to General; assert selected tab, correctly named panel, content and previous-pane removal |
| Settings drafts | Consolidate repeated DirtyBar presence tests | Reset restores saved values without persisting; Save establishes the next reset point; existing rollback and unsaved-field preservation tests stay |
| Store | Remove direct setter checks already exercised through hooks/components; compact the copied defaults object | Valid unverified active presets, secret exclusion, normalization, migrations, connection invalidation, reset and merge behavior |
| Onboarding layout | Replace spacing/class checks | Real Back/Next button gating, callbacks, optional Skip, custom Close, and default process exit |
| Capsule menu | Replace a labels-only assertion | Show/focus/navigate, missing-window handling, exit command and menu closing |
| Tutorial exercises | Remove frozen English scripts and generic Han-copy checks | Exercise validation, diffing, insertion counts, language selection, Chinese edit result against localized prefill |
| Documentation tests | Remove the duplicate repository scan and copied folder constants | Parser/validator/renderer unit cases remain; required `docs:check` owns actual document consistency |
| Rust prompt tests | Remove 16 phrase/example checks duplicating the complete published-prompt comparison | Reproducible benchmark prompt, dynamic composition, input sanitization, language/style selection, precedence and selected-text contracts |
| Rust fixture tests | Remove context/thought fixture counts and duplicate voice-corpus schema/count checks | Existing router tests execute every voice corpus case; nonempty corpus/input and unique-ID guards live alongside that execution |
| Rust errors | Compact repeated per-variant tests into policy/mapping tables | Every error variant, HTTP authentication, 499/500 retry boundary, retry counts, first-line details, empty bodies and Unicode truncation |
| Voice intent values | Replace a confidence test's redundant serialization checks | Lower/upper bounds, finite values, NaN/infinities, trimmed payload; dedicated wire-format and metadata privacy tests remain |

No corpus cases, production prompts, model data, application logic or benchmark workloads were
changed. Similar tests were retained where they exercise different boundaries: the native window
and rendered capsule, each provider's HTTP integration, frontend and backend normalization, and
command wrappers versus their callers.

## Coverage ownership inventory

Names below identify the reviewed files at the base, including the deleted `errors` suite.
Frontend names omit `__tests__/` and `.test.ts`/`.test.tsx`.

| Frontend area | Suites | Contracts that remain |
|---|---|---|
| AskPanel | AskAnswerPanel, AskPanel | Result/event delivery, pending messages, local/global recording ownership, selection fallback, source actions, errors and localization |
| Capsule | CapsuleAskSearch, CapsuleAskSelection, CapsuleCancelButtons, CapsuleContextMenu, CapsuleCopy, CapsuleFlow, CapsuleNudge, CapsuleQuietFade, CapsuleSetupError, TranslatePillLanguage | Run transitions, click propagation, native actions, countdown/replacement, language sizing, error recovery and reduced motion |
| HomePage | HomePage, SpeedBoard, SpeedCompare, UpdateBar | Setup actions, live configuration, release rendering, timing aggregation/event cleanup and update lifecycle |
| MainLayout | AccessibilityBanner, MainLayout | Permission recovery, browser-specific access, route selection and connection status |
| Onboarding | ExercisePage, LlmSetupStep, MicrophoneStep, Onboarding, OnboardingLayout, ShortcutSetupPage, SttSetupStep, WelcomeStep, exercises | Setup/download/retry, permission races, input monitoring, progress persistence, shortcut gating, exercise completion and layout callbacks |
| Settings | AppStyleMappingDialog, DictionaryPane, GeneralPane, LanguageRows, LanguageSheet, LlmPane, MicrophonePicker, PresetBrowser, PresetShare, Settings, ShortcutBindingList, SttPane, SwitchLanguageShortcut, SystemPane | Editing/validation, persistence and rollback, secret handling, import/export, language libraries, model setup, key capture and system actions |
| WebSearch | WebSearchForm, WebSearchSetup | Address/key validation and persistence, test results, local install progress, retry, updates and removal |
| Shared components | ShortcutTourPrompt, KeyCap | Tour choices and persistence; key glyph/full-name accessibility in the component that owns it |
| Hooks | useCapsuleResize, useCountdown, useRecording, useTauriEvents | Monitor geometry/focus, timers, subscriptions, render isolation and backend-event state updates |
| i18n | errors, localeParity | Central locale schema/value/interpolation checks replace duplicated content lists |
| Library | capsuleError, connectionStatus, docsCards, keyLabels, readiness, releaseVersion, router, speechSetup, speechTypes, speed, tauri-ask, tauri, textWidth, translationLanguages, waveform | Error classification, readiness, parsers, routing, unit conversion, aggregation, typed IPC, measurement cleanup and signal bounds |
| Scenes | sceneImportExport | JSON validation, identity collision handling and import/export boundaries |
| Stores | appStore, appStorePlatformDefaults, hotkeyNames | Normalization/merge/reset, platform shortcut defaults and key serialization |

Rust names below are relative to `src-tauri/src/`. Tests for platform-specific modules remain in
place even when the local macOS build cannot execute them.

| Rust area | Modules | Contracts that remain |
|---|---|---|
| App detection | `app_detector/{cache,mod,registry,types,user_mappings}.rs`, `app_detector/platform/macos.rs` | Freshness/concurrency, matcher boundaries, precedence, safe metadata and permission classification |
| Audio | `audio/{capture,mod,output_mute}.rs` | Startup/failure races, buffering, device selection, deadlines and mute restoration |
| Commands | `commands/{ai_setup,app_mappings,ask,audio,config,credentials,dictionary,language_presets,llm,misc,model_setup,permissions,preset_share,stt,translation,web_search}.rs` | Validation and command wiring, lifecycle/cancellation, config rollback, permission/status serialization and secret boundaries |
| AI | `llm/{builtin,context_policy,language_router,live_question,mod,models,prompt,protocol}.rs` | Server lifecycle, policy/routing, hardware selection, prompt assembly and Unicode/SSE parsing |
| Language library | `llm/language_library/{fetch,mod,store}.rs` | Independent parser, repository/index compatibility, download verification/cache, persistence and matching |
| Output | `output/{clipboard,focus,keyboard,mod,windows_modifier_guard,windows_sendinput}.rs` | Target/focus trust, clipboard restoration, platform fallback, partial insertion and modifier release |
| Storage | `storage/{mod,preset_share}.rs` | Historical migrations, normalization, persisted round trips, redaction and import/export |
| Speech | `stt/{builtin,capabilities,chinese_script,config,elevenlabs,hallucination,hardware,mod,models,qwen_cloud,silence,transcript,whisper_compat}.rs` | Provider selection and requests, audio filtering, Unicode conversion, model download/resume/checksum/cancel and transcript parsing |
| Voice routing | `voice_intent/{executor,guards,language,mod,normalize,search,types}.rs` | Corpus-backed routing, nondestructive fallbacks, exact placement, safe URLs, Unicode boundaries and metadata privacy |
| Windows/UI shell | `ask_panel.rs`, `copy_pill.rs`, `lib.rs`, `linux_x11.rs`, `overlay_window.rs`, `platform.rs`, `tray.rs`, `updates.rs` | Geometry/focus, native lifecycle, launch/config packaging, platform capabilities, menu localization and update scheduling |
| Shortcuts | `hotkey.rs`, `native_hotkey.rs`, `native_keys.rs`, `shortcut_gate.rs` | Chord identity/order, conflict/capture, dispatch/release, retries, cancellation and tutorial gates |
| Pipeline | `pipeline.rs`, `readiness.rs`, `recording_deadline.rs`, `selection.rs` | Session freshness, graceful stop, provider/output selection, translated selection and clipboard sentinels |
| Data and errors | `credentials.rs`, `dictionary_io.rs`, `error.rs`, `speed_stats.rs`, `timing.rs` | Vault fallback, transactional import, retries/errors, aggregation and text-free persisted metrics |
| Search | `search_server.rs`, `web_search.rs`, `web_search/schedule.rs` | Local install lifecycle, request/response handling, source/citation trust and future-date validation |

The 26 tests in `src-tauri/tests/e2e_services.rs` remain optional integration checks. They call
real services or install/run models, so similar unit cases do not make them redundant. The
frontend fixture in `benchmarks/recording.test.tsx` and Rust fixture in
`src-tauri/benches/local_performance.rs` are unchanged to preserve benchmark comparability.

## Validation

- Frontend: **694 passed in 69 files**, compared with 731 in 70 files at the base.
- Rust library on macOS: **928 passed, 1 ignored**, compared with 962 passed, 1 ignored.
- Compiled the real-service integration test target without running its external operations.
- Type checking, ESLint, Prettier, Rust formatting, docs, language presets and benchmark baseline
  consistency checks passed.
- Targeted mutation checks confirmed the revised tests fail if the build version ignores its
  environment, Next ignores its disabled flag, or What's New drops a supplied change. Temporary
  mutations were restored before final validation.

Counts decreased through consolidation and removal of redundant assertions; this is not an
application performance claim. The local benchmark baseline is unchanged. No live-model quality
claim or Windows/Linux execution result is inferred from the offline macOS run.
