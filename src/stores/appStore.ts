import { create } from 'zustand'
import { TARGET_LANGUAGES } from '../lib/constants'

export type PipelineState =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'transcribing'
  | 'polishing'
  | 'outputting'
  | 'ask_recording'
  | 'ask_thinking'

export type VoiceMode = 'dictate' | 'ask' | 'translate'

/**
 * A named speech-to-text endpoint. Every preset talks to an OpenAI-compatible
 * `POST {base_url}/audio/transcriptions` server (for example whisper.cpp).
 * The API key is not stored here; it lives in the macOS Keychain under ('stt', id).
 */
export interface SpeechPreset {
  id: string
  name: string
  base_url: string
  model: string
  /** 'auto' or an ISO language code such as 'en'. */
  language: string
  /** True for the presets the app ships with. Informational only; they stay editable. */
  builtin: boolean
}

/**
 * A named AI (chat) endpoint. Every preset talks to an OpenAI-compatible
 * `POST {base_url}/chat/completions` server (for example Ollama).
 * The API key lives in the macOS Keychain under ('llm', id).
 */
export interface AiPreset {
  id: string
  name: string
  base_url: string
  model: string
  /** Extra JSON fields merged into every chat request, e.g. { reasoning_effort: 'none' }. */
  extra_request_fields: Record<string, unknown>
  builtin: boolean
}

export const BUILTIN_SPEECH_PRESET: SpeechPreset = {
  id: 'builtin-whisper-local',
  name: 'Local whisper.cpp (Mac)',
  base_url: 'http://127.0.0.1:8178/v1',
  model: 'large-v3-turbo',
  language: 'auto',
  builtin: true,
}

export const BUILTIN_AI_PRESET: AiPreset = {
  id: 'builtin-ollama-pc',
  name: 'PC Ollama — Qwen3 4B Instruct',
  base_url: 'http://100.90.208.26:11434/v1',
  model: 'qwen3:4b-instruct-2507-q4_K_M',
  extra_request_fields: {},
  builtin: true,
}

/** Returns the preset whose id is `activeId`, or the first one if that id is missing. */
export function findActivePreset<T extends { id: string }>(
  presets: T[],
  activeId: string,
): T | undefined {
  return presets.find((preset) => preset.id === activeId) ?? presets[0]
}

export type OutputMode = 'keyboard' | 'clipboard'
export type PasteShortcut = 'ctrlV' | 'ctrlShiftV' | 'shiftInsert'
export type WindowsSendInputNewlineMode = 'enter' | 'shiftEnter' | 'crlf'
export type InsertionStrategy =
  | 'auto'
  | 'keyboard'
  | 'clipboardPaste'
  | 'clipboardCopyOnly'
  | 'windowsSendInput'
export type InsertStatus = 'inserted' | 'copiedFallback' | 'failed' | 'partiallyInserted'
export type HotkeyMode = 'hold' | 'toggle'
export type Theme = 'light' | 'dark' | 'system'
export type PolishChineseScript = 'preserve' | 'simplified' | 'traditional'
export type PolishStyle = 'minimal' | 'clean' | 'structured' | 'professional'
export type SceneSource = 'custom' | 'builtin'
export type ContextFamily =
  | 'email'
  | 'work_chat'
  | 'personal_chat'
  | 'document'
  | 'project_management'
  | 'developer_collaboration'
  | 'prompt_or_code'
  | 'support'
  | 'social'
  | 'general'
export type BrowserAccessStatus = 'available' | 'needs_permission' | 'not_applicable' | 'unknown'
export type BrowserTarget = 'safari' | 'chrome' | 'edge' | 'brave' | 'arc'

export interface ShortcutBinding {
  primary: string
  modifiers: string[]
}

export interface HotkeyConfig {
  dictation: ShortcutBinding
  ask: ShortcutBinding | null
  translate: ShortcutBinding | null
  dictationBindings: ShortcutBinding[]
  askBindings: ShortcutBinding[]
  translateBindings: ShortcutBinding[]
  editSelection: ShortcutBinding | null
  switchScene: ShortcutBinding | null
  openApp: ShortcutBinding | null
  dictationMode: HotkeyMode
}

export interface PlatformCapabilities {
  os: 'macos' | 'windows' | 'linux' | 'unknown'
  sessionType: 'wayland' | 'x11' | 'unknown'
  globalHotkeyReliable: boolean
  keyboardOutputReliable: boolean
  clipboardAutoPasteReliable: boolean
}

export interface ContextProfileSummary {
  profileId: string
  family: ContextFamily
  appLabel: string
  iconKey: string
  overrideId: string | null
  browserAccessStatus?: BrowserAccessStatus
  browserTarget?: BrowserTarget | null
}

export interface InsertResult {
  status: InsertStatus
  strategyUsed: InsertionStrategy
  charsInserted: number
  charsCopied: number
  warningCode: string | null
  message: string | null
}

export interface DictionaryEntry {
  id: number
  word: string
  pronunciation: string | null
}

export interface CorrectionRule {
  id: number
  pattern: string
  replacement: string
  enabled: boolean
}

export interface CustomScene {
  id: string
  name: string
  description: string
  prompt_template: string
  created_at: string
  updated_at: string
}

export interface SystemSceneOverride {
  id: string
  prompt_template: string
}

export interface ActiveScene {
  id: string
  source: SceneSource
  name: string
  prompt_template: string
}

export interface FamilySceneAssignment {
  family: ContextFamily
  scene_id: string
}

export interface VoiceRoutingFlags {
  draft_insert: boolean
  rewrite_selection: boolean
  translate_selection: boolean
  search: boolean
}

export interface TranslationConfig {
  targets: string[]
  active_target: string
}

export interface AppConfig {
  speech_presets: SpeechPreset[]
  active_speech_preset_id: string
  ai_presets: AiPreset[]
  active_ai_preset_id: string
  polish_enabled: boolean
  context_adaptation_enabled: boolean
  voice_routing_flags: VoiceRoutingFlags
  polish_style: PolishStyle
  polish_custom_prompt: string
  polish_chinese_script: PolishChineseScript
  custom_scenes: CustomScene[]
  system_scene_overrides: SystemSceneOverride[]
  active_scene: ActiveScene | null
  family_scene_assignments: FamilySceneAssignment[]
  translate_enabled: boolean
  target_lang: string
  translation: TranslationConfig
  hotkey: string
  ask_hotkey: string
  hotkey_mode: HotkeyMode
  hotkeys: HotkeyConfig
  output_mode: OutputMode
  insertion_strategy: InsertionStrategy
  restore_clipboard_after_paste: boolean
  paste_shortcut: PasteShortcut
  windows_sendinput_newline_mode: WindowsSendInputNewlineMode
  streaming_insert_enabled: boolean
  selected_text_enabled: boolean
  theme: Theme
  auto_start: boolean
  close_to_tray: boolean
  start_minimized: boolean
  recording_limit_mode: 'auto' | 'custom'
  custom_recording_limit_seconds: number
  max_recording_seconds: number
  ui_language: string
  /** Microphone name chosen in Settings → General; '' means "System default". */
  input_device: string
  /** macOS: show the Dock icon (Settings → System). */
  show_in_dock: boolean
  /** Mute the default output device while recording (Settings → General → Audio). */
  mute_output_while_recording: boolean
}

export type TestStatus = 'idle' | 'testing' | 'success' | 'error'

/**
 * Last known result for one endpoint (speech or AI), shown as the sidebar status dot. Set by
 * the Test buttons and by pipeline success/error events; never by polling. `presetId` ties the
 * result to the preset it was measured with, so switching presets shows "not checked yet".
 */
export interface EndpointHealth {
  presetId: string
  ok: boolean
}

export interface RecordingDeadlineSnapshot {
  sessionId: number
  recordingKind: 'dictation' | 'ask'
  startedAtUnixMs: number
  deadlineAtUnixMs: number
  effectiveMaxSeconds: number
}

interface AppState {
  // Pipeline
  pipelineState: PipelineState
  setPipelineState: (state: PipelineState) => void
  activeVoiceMode: VoiceMode | null
  setActiveVoiceMode: (mode: VoiceMode | null) => void

  // Recording
  audioVolume: number
  setAudioVolume: (v: number) => void
  partialTranscript: string
  setPartialTranscript: (t: string) => void
  finalTranscript: string
  setFinalTranscript: (t: string) => void
  polishedText: string
  setPolishedText: (t: string) => void
  appendPolishedChunk: (chunk: string) => void
  recordingDuration: number
  setRecordingDuration: (d: number) => void
  recordingDeadline: RecordingDeadlineSnapshot | null
  setRecordingDeadline: (deadline: RecordingDeadlineSnapshot | null) => void
  targetApp: string
  setTargetApp: (app: string) => void
  lastInsertResult: InsertResult | null
  setLastInsertResult: (result: InsertResult | null) => void
  lastContext: ContextProfileSummary | null
  setLastContext: (context: ContextProfileSummary | null) => void

  // Config
  config: AppConfig
  setConfig: (config: AppConfig) => void
  updateConfig: (partial: Partial<AppConfig>) => void
  applyPersistedConfigPatch: (patch: Partial<AppConfig>) => void

  // Dictionary
  dictionary: DictionaryEntry[]
  setDictionary: (d: DictionaryEntry[]) => void
  correctionRules: CorrectionRule[]
  setCorrectionRules: (rules: CorrectionRule[]) => void

  // Onboarding
  onboardingCompleted: boolean
  setOnboardingCompleted: (done: boolean) => void
  onboardingStep: number
  setOnboardingStep: (step: number) => void

  // Capsule
  capsuleExpanded: boolean
  setCapsuleExpanded: (expanded: boolean) => void

  // Connection test status
  sttTestStatus: TestStatus
  setSttTestStatus: (s: TestStatus) => void
  llmTestStatus: TestStatus
  setLlmTestStatus: (s: TestStatus) => void

  // Latency benchmark results (ms), null = not yet measured
  sttLatencyMs: number | null
  setSttLatencyMs: (ms: number | null) => void
  llmLatencyMs: number | null
  setLlmLatencyMs: (ms: number | null) => void

  // Last known endpoint health (sidebar status), null = not checked yet
  speechHealth: EndpointHealth | null
  setSpeechHealth: (health: EndpointHealth | null) => void
  aiHealth: EndpointHealth | null
  setAiHealth: (health: EndpointHealth | null) => void

  // LLM model list cache (persists across tab switches)
  llmModels: string[]
  setLlmModels: (models: string[]) => void

  // Pipeline error
  pipelineError: string | null
  setPipelineError: (error: string | null) => void

  // macOS Accessibility permission
  accessibilityTrusted: boolean
  setAccessibilityTrusted: (trusted: boolean) => void
  platformCapabilities: PlatformCapabilities | null
  setPlatformCapabilities: (capabilities: PlatformCapabilities | null) => void
  hotkeyRegistrationError: string | null
  setHotkeyRegistrationError: (error: string | null) => void

  // Context menu
  contextMenuOpen: boolean
  setContextMenuOpen: (open: boolean) => void
  contextMenuReady: boolean
  setContextMenuReady: (ready: boolean) => void

  // Reset recording state
  resetRecording: () => void

  // Config snapshot for dirty detection
  savedConfig: AppConfig | null
  setSavedConfig: (config: AppConfig) => void
  resetConfig: () => void
}

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

export const isWindowsPlatform = () =>
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('WIN') >= 0

function defaultDictationHotkey(): string {
  if (isMacPlatform()) return 'Fn'
  return 'Ctrl+/'
}

function defaultDictationHotkeyMode(): HotkeyMode {
  return isMacPlatform() ? 'toggle' : 'hold'
}

function defaultAskHotkey(): string {
  if (isMacPlatform()) return 'Fn+Space'
  return 'Ctrl+.'
}

function defaultTranslateHotkey(): string | null {
  if (isMacPlatform()) return 'Fn+LeftShift'
  return 'Ctrl+Shift+/'
}

// Keep in sync with `hotkey_modifier_rank` in src-tauri/src/storage/mod.rs: Fn, End,
// Home/Page keys, F13+, then Command, Control, Option, Shift (generic, left, right).
const modifierOrder = [
  'Fn',
  'RightAlt',
  'End',
  'Home',
  'PageUp',
  'PageDown',
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
  'F20',
  'Command',
  'Super',
  'LeftCommand',
  'RightCommand',
  'Ctrl',
  'LeftControl',
  'RightControl',
  'Option',
  'Alt',
  'LeftOption',
  'RightOption',
  'Shift',
  'LeftShift',
  'RightShift',
]

/** Keys only the native macOS listener can tell apart; valid as modifier and as primary. */
const nativeKeyNames: Record<string, string> = {
  leftshift: 'LeftShift',
  left_shift: 'LeftShift',
  'left-shift': 'LeftShift',
  shiftleft: 'LeftShift',
  shift_left: 'LeftShift',
  'shift-left': 'LeftShift',
  rightshift: 'RightShift',
  right_shift: 'RightShift',
  'right-shift': 'RightShift',
  shiftright: 'RightShift',
  leftcontrol: 'LeftControl',
  left_control: 'LeftControl',
  leftctrl: 'LeftControl',
  controlleft: 'LeftControl',
  rightcontrol: 'RightControl',
  right_control: 'RightControl',
  rightctrl: 'RightControl',
  controlright: 'RightControl',
  leftoption: 'LeftOption',
  left_option: 'LeftOption',
  optionleft: 'LeftOption',
  rightoption: 'RightOption',
  right_option: 'RightOption',
  optionright: 'RightOption',
  leftcommand: 'LeftCommand',
  left_command: 'LeftCommand',
  leftcmd: 'LeftCommand',
  commandleft: 'LeftCommand',
  metaleft: 'LeftCommand',
  rightcommand: 'RightCommand',
  right_command: 'RightCommand',
  rightcmd: 'RightCommand',
  commandright: 'RightCommand',
  metaright: 'RightCommand',
  home: 'Home',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  f13: 'F13',
  f14: 'F14',
  f15: 'F15',
  f16: 'F16',
  f17: 'F17',
  f18: 'F18',
  f19: 'F19',
  f20: 'F20',
}

function normalizeModifier(value: string): string | null {
  const lower = value.trim().toLowerCase()
  if (nativeKeyNames[lower]) return nativeKeyNames[lower]
  switch (lower) {
    case 'fn':
    case 'function':
      return 'Fn'
    case 'rightalt':
    case 'right_alt':
    case 'right-alt':
    case 'altright':
    case 'alt_right':
    case 'alt-right':
      return 'RightAlt'
    case 'end':
      return 'End'
    case 'cmd':
    case 'command':
      return 'Command'
    case 'meta':
    case 'super':
    case 'win':
      return 'Super'
    case 'ctrl':
    case 'control':
      return 'Ctrl'
    case 'option':
      return 'Option'
    case 'alt':
      return 'Alt'
    case 'shift':
      return 'Shift'
    default:
      return null
  }
}

function normalizePrimary(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  const named: Record<string, string> = {
    space: 'Space',
    tab: 'Tab',
    enter: 'Enter',
    return: 'Enter',
    escape: 'Escape',
    esc: 'Escape',
    backspace: 'Backspace',
    delete: 'Delete',
    insert: 'Insert',
    up: 'Up',
    arrowup: 'Up',
    down: 'Down',
    arrowdown: 'Down',
    left: 'Left',
    arrowleft: 'Left',
    right: 'Right',
    arrowright: 'Right',
    slash: '/',
    '/': '/',
    backslash: '\\',
    '\\': '\\',
    period: '.',
    '.': '.',
    '。': '.',
    comma: ',',
    ',': ',',
    semicolon: ';',
    ';': ';',
    quote: "'",
    "'": "'",
    backquote: '`',
    '`': '`',
    minus: '-',
    '-': '-',
    equal: '=',
    '=': '=',
    bracketleft: '[',
    '[': '[',
    bracketright: ']',
    ']': ']',
  }
  const nativePrimary: Record<string, string> = {
    fn: 'Fn',
    function: 'Fn',
    rightalt: 'RightAlt',
    right_alt: 'RightAlt',
    'right-alt': 'RightAlt',
    altright: 'RightAlt',
    alt_right: 'RightAlt',
    'alt-right': 'RightAlt',
    end: 'End',
  }
  if (nativeKeyNames[lower]) return nativeKeyNames[lower]
  if (nativePrimary[lower]) return nativePrimary[lower]
  if (named[lower]) return named[lower]
  if (/^f([1-9]|1[0-2])$/.test(lower)) return lower.toUpperCase()
  if (/^[a-z0-9]$/.test(lower)) return lower.toUpperCase()
  return null
}

/** Keys macOS reports through flagsChanged (the native listener never swallows them). */
const NATIVE_MODIFIER_KEYS = new Set([
  'Fn',
  'LeftShift',
  'RightShift',
  'LeftControl',
  'RightControl',
  'LeftOption',
  'RightOption',
  'LeftCommand',
  'RightCommand',
])

/**
 * Keys that type or edit text. Bound on their own they would break typing, so a captured
 * shortcut made of just one of them needs a modifier (mirrors `standalone: false` in
 * src-tauri/src/native_keys.rs).
 */
export function isTypingKeyName(name: string): boolean {
  return (
    /^[A-Z0-9]$/.test(name) ||
    [
      'Space',
      'Enter',
      'Tab',
      'Backspace',
      'Delete',
      'Escape',
      'Up',
      'Down',
      'Left',
      'Right',
    ].includes(name) ||
    /^[/\\.,;'`\-=[\]]$/.test(name)
  )
}

/** A captured key set that is a single typing key (for example just `A`). */
export function capturedKeysNeedModifier(keys: string[]): boolean {
  return keys.length === 1 && isTypingKeyName(keys[0])
}

/**
 * Turn the keys from a native capture (names, press order) into a hotkey string.
 * The primary is the one non-modifier key; with several, the first that is not also a valid
 * modifier name (a typing key), else the last pressed; with none, the first key pressed.
 * The rest become modifiers. Key order does not matter for matching or conflicts.
 */
export function hotkeyFromCapturedKeys(keys: string[]): string | null {
  if (keys.length === 0) return null
  const nonModifiers = keys.filter((key) => !NATIVE_MODIFIER_KEYS.has(key))
  let primary: string
  if (nonModifiers.length === 0) primary = keys[0]
  else if (nonModifiers.length === 1) primary = nonModifiers[0]
  else
    primary =
      nonModifiers.find((key) => normalizeModifier(key) === null) ??
      nonModifiers[nonModifiers.length - 1]
  const rest = keys.filter((key) => key !== primary)
  const binding = bindingFromHotkey([...rest, primary].join('+'))
  return binding ? hotkeyFromBinding(binding) : null
}

const keyLabels: Record<string, string> = {
  Ctrl: 'Control',
  Super: 'Command',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
}

function keyLabel(name: string): string {
  if (keyLabels[name]) return keyLabels[name]
  // Insert a space before each capital that follows a lower-case letter: RightShift -> Right Shift.
  return name.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/**
 * Human-readable shortcut: `displayHotkey('End+RightShift')` → `End + Right Shift`.
 * Accepts a hotkey string or a list of key names and keeps their order.
 */
export function displayHotkey(value: string | string[]): string {
  const keys = Array.isArray(value)
    ? value
    : value
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean)
  // A bare "+" key would be split away; hotkeys never use it, so no special case.
  return keys.map(keyLabel).join(' + ')
}

/**
 * Display a stored binding with all keys in rank order (special keys and modifiers first,
 * the typing key last), so `{modifiers: ["End"], primary: "RightShift"}` and
 * `{modifiers: ["RightShift"], primary: "End"}` both read `End + Right Shift`.
 */
export function displayBinding(binding: ShortcutBinding): string {
  const rank = (key: string) => {
    const index = modifierOrder.indexOf(key)
    return index === -1 ? modifierOrder.length : index
  }
  const keys = [...binding.modifiers, binding.primary].sort((a, b) => rank(a) - rank(b))
  return displayHotkey(keys)
}

export function bindingFromHotkey(value: string): ShortcutBinding | null {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const primary = normalizePrimary(parts[parts.length - 1])
  if (!primary) return null

  const modifiers: string[] = []
  const seen = new Set<string>()
  for (const part of parts.slice(0, -1)) {
    const modifier = normalizeModifier(part)
    if (!modifier) return null
    const semantic = modifier === 'Option' || modifier === 'Alt' ? 'Alt' : modifier
    if (seen.has(semantic) || modifier === primary) return null
    seen.add(semantic)
    modifiers.push(modifier)
  }

  modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b))
  return { primary, modifiers }
}

export function hotkeyFromBinding(binding: ShortcutBinding): string {
  return [...binding.modifiers, binding.primary].join('+')
}

const MAX_HOTKEY_BINDINGS_PER_ROLE = 3

function normalizeBinding(binding: ShortcutBinding | null | undefined): ShortcutBinding | null {
  if (!binding) return null
  return bindingFromHotkey(hotkeyFromBinding(binding))
}

/**
 * Identity for duplicate and conflict checks: the unordered set of keys, with Option/Alt and
 * Command/Super treated as one key. Matches `shortcut_binding_identity` in Rust.
 */
export function hotkeyBindingIdentity(binding: ShortcutBinding): string {
  const modifiers = binding.modifiers.map((modifier) => {
    if (modifier === 'Option') return 'Alt'
    if (modifier === 'Command') return 'Super'
    return modifier
  })
  return [...modifiers, binding.primary].sort().join('+')
}

function normalizeBindingList(bindings: ShortcutBinding[] | null | undefined): ShortcutBinding[] {
  const normalized: ShortcutBinding[] = []
  const seen = new Set<string>()
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    const next = normalizeBinding(binding)
    if (!next) continue
    const identity = hotkeyBindingIdentity(next)
    if (seen.has(identity)) continue
    seen.add(identity)
    normalized.push(next)
    if (normalized.length === MAX_HOTKEY_BINDINGS_PER_ROLE) break
  }
  return normalized
}

function normalizeHotkeyConfig(config: AppConfig, hotkeysValue: HotkeyConfig): HotkeyConfig {
  const hotkeys = hotkeysValue as HotkeyConfig & {
    dictationBindings?: ShortcutBinding[]
    askBindings?: ShortcutBinding[]
    translateBindings?: ShortcutBinding[]
  }
  const scalarDictation = normalizeBinding(hotkeys.dictation)
  const dictationBindings = normalizeBindingList(
    hotkeys.dictationBindings?.length
      ? hotkeys.dictationBindings
      : scalarDictation
        ? [scalarDictation]
        : [],
  )
  if (dictationBindings.length === 0) {
    dictationBindings.push(bindingFromHotkey(defaultDictationHotkey())!)
  }

  const hasAskList = Array.isArray(hotkeys.askBindings)
  const askBindings = normalizeBindingList(
    hasAskList ? hotkeys.askBindings : hotkeys.ask ? [hotkeys.ask] : [],
  )
  const hasTranslateList = Array.isArray(hotkeys.translateBindings)
  const translateBindings = normalizeBindingList(
    hasTranslateList ? hotkeys.translateBindings : hotkeys.translate ? [hotkeys.translate] : [],
  )

  return {
    dictation: dictationBindings[0],
    ask: askBindings[0] ?? null,
    translate: translateBindings[0] ?? null,
    dictationBindings,
    askBindings,
    translateBindings,
    editSelection: normalizeBinding(hotkeys.editSelection),
    switchScene: normalizeBinding(hotkeys.switchScene),
    openApp: normalizeBinding(hotkeys.openApp),
    dictationMode:
      hotkeys.dictationMode === 'toggle'
        ? 'toggle'
        : hotkeys.dictationMode === 'hold'
          ? 'hold'
          : config.hotkey_mode === 'toggle'
            ? 'toggle'
            : defaultDictationHotkeyMode(),
  }
}

function hotkeyConfigFromLegacy(config: AppConfig): HotkeyConfig {
  const dictation = bindingFromHotkey(config.hotkey) ?? bindingFromHotkey(defaultDictationHotkey())!
  const ask = config.ask_hotkey.trim()
    ? (bindingFromHotkey(config.ask_hotkey) ?? bindingFromHotkey(defaultAskHotkey()))
    : null
  const existingTranslate =
    config.hotkeys?.translate ??
    (defaultTranslateHotkey() ? bindingFromHotkey(defaultTranslateHotkey()!) : null)
  const translateBindings = normalizeBindingList(
    config.hotkeys?.translateBindings?.length
      ? config.hotkeys.translateBindings
      : existingTranslate
        ? [existingTranslate]
        : [],
  )
  return normalizeHotkeyConfig(config, {
    dictation,
    ask,
    translate: translateBindings[0] ?? null,
    dictationBindings: [dictation],
    askBindings: ask ? [ask] : [],
    translateBindings,
    editSelection: config.hotkeys?.editSelection ?? null,
    switchScene: config.hotkeys?.switchScene ?? null,
    openApp: config.hotkeys?.openApp ?? null,
    dictationMode:
      config.hotkey_mode === 'toggle'
        ? 'toggle'
        : config.hotkey_mode === 'hold'
          ? 'hold'
          : defaultDictationHotkeyMode(),
  })
}

function syncLegacyHotkeysToTyped(config: AppConfig): AppConfig {
  return { ...config, hotkeys: hotkeyConfigFromLegacy(config) }
}

function syncTypedHotkeysToLegacy(config: AppConfig): AppConfig {
  const hotkeys = config.hotkeys
    ? normalizeHotkeyConfig(config, config.hotkeys)
    : hotkeyConfigFromLegacy(config)
  return {
    ...config,
    hotkey: hotkeyFromBinding(hotkeys.dictation),
    ask_hotkey: hotkeys.ask ? hotkeyFromBinding(hotkeys.ask) : '',
    hotkey_mode: hotkeys.dictationMode,
    hotkeys,
  }
}

const supportedTranslationCodes = new Set(TARGET_LANGUAGES.map((language) => language.value))

function normalizeTranslationTargets(targets: string[]): string[] {
  const normalized: string[] = []
  for (const value of targets) {
    const code = value.trim().toLowerCase()
    if (!supportedTranslationCodes.has(code) || normalized.includes(code)) continue
    normalized.push(code)
    if (normalized.length === 5) break
  }
  return normalized
}

function syncTranslationConfig(previous: AppConfig, partial: Partial<AppConfig>): AppConfig {
  const merged = { ...previous, ...partial }
  if (partial.translation) {
    const targets = normalizeTranslationTargets(partial.translation.targets)
    const requestedActive = partial.translation.active_target.trim().toLowerCase()
    if (targets.length === 0) {
      targets.push(supportedTranslationCodes.has(requestedActive) ? requestedActive : 'en')
    }
    const activeTarget = targets.includes(requestedActive) ? requestedActive : targets[0]
    return {
      ...merged,
      target_lang: activeTarget,
      translation: { targets, active_target: activeTarget },
    }
  }

  if ('target_lang' in partial) {
    const requested = partial.target_lang?.trim().toLowerCase() ?? ''
    const activeTarget = supportedTranslationCodes.has(requested)
      ? requested
      : previous.translation?.active_target || 'en'
    const targets = normalizeTranslationTargets(previous.translation?.targets ?? [activeTarget])
    if (!targets.includes(activeTarget)) {
      if (targets.length === 5) targets[targets.length - 1] = activeTarget
      else targets.push(activeTarget)
    }
    return {
      ...merged,
      target_lang: activeTarget,
      translation: { targets, active_target: activeTarget },
    }
  }

  const current = merged.translation
  if (!current) {
    const activeTarget = supportedTranslationCodes.has(merged.target_lang)
      ? merged.target_lang
      : 'en'
    return {
      ...merged,
      target_lang: activeTarget,
      translation: { targets: [activeTarget], active_target: activeTarget },
    }
  }
  return merged
}

function syncHotkeyConfig(previous: AppConfig, partial: Partial<AppConfig>): AppConfig {
  const merged = syncTranslationConfig(previous, partial)
  if (partial.hotkeys) {
    const hotkeys = { ...partial.hotkeys }
    const listsChanged =
      JSON.stringify(hotkeys.dictationBindings) !==
        JSON.stringify(previous.hotkeys.dictationBindings) ||
      JSON.stringify(hotkeys.askBindings) !== JSON.stringify(previous.hotkeys.askBindings) ||
      JSON.stringify(hotkeys.translateBindings) !==
        JSON.stringify(previous.hotkeys.translateBindings)
    if (!listsChanged) {
      if (JSON.stringify(hotkeys.dictation) !== JSON.stringify(previous.hotkeys.dictation)) {
        hotkeys.dictationBindings = [
          hotkeys.dictation,
          ...(hotkeys.dictationBindings ?? []).slice(1),
        ]
      }
      if (JSON.stringify(hotkeys.ask) !== JSON.stringify(previous.hotkeys.ask)) {
        hotkeys.askBindings = hotkeys.ask
          ? [hotkeys.ask, ...(hotkeys.askBindings ?? []).slice(1)]
          : []
      }
      if (JSON.stringify(hotkeys.translate) !== JSON.stringify(previous.hotkeys.translate)) {
        hotkeys.translateBindings = hotkeys.translate
          ? [hotkeys.translate, ...(hotkeys.translateBindings ?? []).slice(1)]
          : []
      }
    }
    return syncTypedHotkeysToLegacy({ ...merged, hotkeys })
  }
  if ('hotkey' in partial || 'ask_hotkey' in partial || 'hotkey_mode' in partial) {
    return syncLegacyHotkeysToTyped(merged)
  }
  return merged.hotkeys ? merged : syncLegacyHotkeysToTyped(merged)
}

const defaultConfig: AppConfig = {
  speech_presets: [{ ...BUILTIN_SPEECH_PRESET }],
  active_speech_preset_id: BUILTIN_SPEECH_PRESET.id,
  ai_presets: [{ ...BUILTIN_AI_PRESET, extra_request_fields: {} }],
  active_ai_preset_id: BUILTIN_AI_PRESET.id,
  polish_enabled: true,
  context_adaptation_enabled: true,
  voice_routing_flags: {
    draft_insert: true,
    rewrite_selection: true,
    translate_selection: true,
    search: true,
  },
  polish_style: 'clean',
  polish_custom_prompt: '',
  polish_chinese_script: 'preserve',
  custom_scenes: [],
  system_scene_overrides: [],
  active_scene: null,
  family_scene_assignments: [],
  translate_enabled: false,
  target_lang: 'en',
  translation: { targets: ['en', 'zh', 'ja'], active_target: 'en' },
  hotkey: defaultDictationHotkey(),
  ask_hotkey: defaultAskHotkey(),
  hotkey_mode: defaultDictationHotkeyMode(),
  hotkeys: {
    dictation: bindingFromHotkey(defaultDictationHotkey())!,
    ask: bindingFromHotkey(defaultAskHotkey()),
    translate: defaultTranslateHotkey() ? bindingFromHotkey(defaultTranslateHotkey()!) : null,
    dictationBindings: [bindingFromHotkey(defaultDictationHotkey())!],
    askBindings: [bindingFromHotkey(defaultAskHotkey())!],
    translateBindings: defaultTranslateHotkey()
      ? [bindingFromHotkey(defaultTranslateHotkey()!)!]
      : [],
    editSelection: null,
    switchScene: null,
    openApp: null,
    dictationMode: defaultDictationHotkeyMode(),
  },
  output_mode: 'keyboard',
  insertion_strategy: 'auto',
  restore_clipboard_after_paste: true,
  paste_shortcut: 'ctrlV',
  windows_sendinput_newline_mode: 'enter',
  streaming_insert_enabled: false,
  selected_text_enabled: false,
  theme: 'system',
  auto_start: true,
  close_to_tray: true,
  start_minimized: false,
  recording_limit_mode: 'auto',
  custom_recording_limit_seconds: 600,
  max_recording_seconds: 30,
  ui_language: 'en',
  input_device: '',
  show_in_dock: true,
  mute_output_while_recording: false,
}

export const useAppStore = create<AppState>((set) => ({
  pipelineState: 'idle',
  setPipelineState: (pipelineState) => set({ pipelineState }),
  activeVoiceMode: null,
  setActiveVoiceMode: (activeVoiceMode) => set({ activeVoiceMode }),

  audioVolume: 0,
  setAudioVolume: (audioVolume) => set({ audioVolume }),
  partialTranscript: '',
  setPartialTranscript: (partialTranscript) => set({ partialTranscript }),
  finalTranscript: '',
  setFinalTranscript: (finalTranscript) => set({ finalTranscript }),
  polishedText: '',
  setPolishedText: (polishedText) => set({ polishedText }),
  appendPolishedChunk: (chunk) => set((s) => ({ polishedText: s.polishedText + chunk })),
  recordingDuration: 0,
  setRecordingDuration: (recordingDuration) => set({ recordingDuration }),
  recordingDeadline: null,
  setRecordingDeadline: (recordingDeadline) => set({ recordingDeadline }),
  targetApp: '',
  setTargetApp: (targetApp) => set({ targetApp }),
  lastInsertResult: null,
  setLastInsertResult: (lastInsertResult) => set({ lastInsertResult }),
  lastContext: null,
  setLastContext: (lastContext) => set({ lastContext }),

  config: defaultConfig,
  setConfig: (config) => set((s) => ({ config: syncHotkeyConfig(s.config, config) })),
  updateConfig: (partial) => set((s) => ({ config: syncHotkeyConfig(s.config, partial) })),
  applyPersistedConfigPatch: (patch) =>
    set((s) => ({
      config: syncHotkeyConfig(s.config, patch),
      savedConfig: s.savedConfig ? syncHotkeyConfig(s.savedConfig, patch) : s.savedConfig,
    })),

  dictionary: [],
  setDictionary: (dictionary) => set({ dictionary }),
  correctionRules: [],
  setCorrectionRules: (correctionRules) => set({ correctionRules }),

  onboardingCompleted: false,
  setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
  onboardingStep: 0,
  setOnboardingStep: (onboardingStep) => set({ onboardingStep }),

  capsuleExpanded: false,
  setCapsuleExpanded: (capsuleExpanded) => set({ capsuleExpanded }),

  sttTestStatus: 'idle',
  setSttTestStatus: (sttTestStatus) => set({ sttTestStatus }),
  llmTestStatus: 'idle',
  setLlmTestStatus: (llmTestStatus) => set({ llmTestStatus }),

  sttLatencyMs: null,
  setSttLatencyMs: (sttLatencyMs) => set({ sttLatencyMs }),
  llmLatencyMs: null,
  setLlmLatencyMs: (llmLatencyMs) => set({ llmLatencyMs }),

  speechHealth: null,
  setSpeechHealth: (speechHealth) => set({ speechHealth }),
  aiHealth: null,
  setAiHealth: (aiHealth) => set({ aiHealth }),

  llmModels: [],
  setLlmModels: (llmModels) => set({ llmModels }),

  pipelineError: null,
  setPipelineError: (pipelineError) => set({ pipelineError }),

  accessibilityTrusted: true,
  setAccessibilityTrusted: (accessibilityTrusted) => set({ accessibilityTrusted }),
  platformCapabilities: null,
  setPlatformCapabilities: (platformCapabilities) => set({ platformCapabilities }),
  hotkeyRegistrationError: null,
  setHotkeyRegistrationError: (hotkeyRegistrationError) => set({ hotkeyRegistrationError }),

  contextMenuOpen: false,
  setContextMenuOpen: (contextMenuOpen) => set({ contextMenuOpen }),
  contextMenuReady: false,
  setContextMenuReady: (contextMenuReady) => set({ contextMenuReady }),

  resetRecording: () =>
    set({
      audioVolume: 0,
      partialTranscript: '',
      finalTranscript: '',
      polishedText: '',
      recordingDuration: 0,
      recordingDeadline: null,
    }),

  savedConfig: null,
  setSavedConfig: (savedConfig) => set({ savedConfig }),
  resetConfig: () => set((s) => (s.savedConfig ? { config: { ...s.savedConfig } } : {})),
}))
