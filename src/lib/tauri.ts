import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  AiPreset,
  SpeechPreset,
  DictionaryEntry,
  CorrectionRule,
  PlatformCapabilities,
  TranslationConfig,
  ContextFamily,
  FamilySceneAssignment,
  BrowserAccessStatus,
  BrowserTarget,
} from '../stores/appStore'
import type { RunTiming } from './speed'

// Pipeline commands
export async function startRecording(): Promise<void> {
  return invoke('start_recording')
}

export async function stopRecording(): Promise<void> {
  return invoke('stop_recording')
}

export async function abortRecording(): Promise<void> {
  return invoke('abort_recording')
}

/** Plan `copy-when-no-field`: the Copy pill's Copy button; puts the held result on the clipboard.
/** */
export async function copyOfferToClipboard(): Promise<void> {
  return invoke('copy_offer_to_clipboard')
}

/** Plan `copy-when-no-field`: the Copy pill closed; the backend drops the held result. */
export async function dismissCopyOffer(): Promise<void> {
  return invoke('dismiss_copy_offer')
}

/**
 * Plan `speed-board`: the last runs' step timings (memory only), oldest first, for the Speed board.
 */
export async function getRunTimings(): Promise<RunTiming[]> {
  return invoke('get_run_timings')
}

export async function setActiveTranslationTarget(code: string): Promise<TranslationConfig> {
  return invoke('set_active_translation_target', { code })
}

/**
 * Plan `translation-language-presets`: the built-in translation instructions of every language,
 * by code.
 */
export async function getTranslationLanguageDefaults(): Promise<Record<string, string>> {
  return invoke('get_translation_language_defaults')
}

export type AppMatcherType = 'native_bundle_id' | 'native_executable' | 'exact_web_host'

export interface MappingCandidateView {
  generation: number
  matcherType: AppMatcherType
  displayValue: string
  suggestedLabel: string
  currentFamily: ContextFamily
  iconKey: string
}

export interface CustomAppMappingView {
  id: string
  label: string
  matcherType: AppMatcherType
  displayValue: string
  family: ContextFamily
  sceneId: string | null
  enabled: boolean
  iconKey: string
}

export interface SaveCustomAppMappingInput {
  candidateGeneration: number
  label: string
  family: ContextFamily
  sceneId: string | null
}

export interface UpdateCustomAppMappingInput {
  id: string
  label: string
  family: ContextFamily
  sceneId: string | null
  enabled: boolean
}

export async function getLatestMappingCandidate(): Promise<MappingCandidateView | null> {
  return invoke('get_latest_mapping_candidate')
}

export async function listCustomAppMappings(): Promise<CustomAppMappingView[]> {
  return invoke('list_custom_app_mappings')
}

export async function saveCustomAppMapping(
  input: SaveCustomAppMappingInput,
): Promise<CustomAppMappingView> {
  return invoke('save_custom_app_mapping', { input })
}

export async function updateCustomAppMapping(
  input: UpdateCustomAppMappingInput,
): Promise<CustomAppMappingView> {
  return invoke('update_custom_app_mapping', { input })
}

export async function setCustomAppMappingEnabled(id: string, enabled: boolean): Promise<void> {
  return invoke('set_custom_app_mapping_enabled', { id, enabled })
}

export async function deleteCustomAppMapping(id: string): Promise<void> {
  return invoke('delete_custom_app_mapping', { id })
}

export async function resetCustomAppMappings(): Promise<void> {
  return invoke('reset_custom_app_mappings')
}

export async function setFamilySceneAssignment(
  family: ContextFamily,
  sceneId: string | null,
): Promise<FamilySceneAssignment[]> {
  return invoke('set_family_scene_assignment', { input: { family, sceneId } })
}

export async function requestBrowserAccess(target: BrowserTarget): Promise<BrowserAccessStatus> {
  return invoke('request_browser_access', { target })
}

// Config commands
export async function getConfig(): Promise<AppConfig> {
  return invoke('get_config')
}

export async function updateConfig(config: AppConfig): Promise<void> {
  return invoke('update_config', { config })
}

export type RecordingLimitMode = 'auto' | 'custom'
export type SttTransport = 'fileUpload' | 'streaming' | 'localBuffered'
export type RecordingLimitSource = 'provider' | 'clientBuffer' | 'productSafety' | 'unknownUpstream'

export interface SttRecordingCapability {
  registryVersion: number
  providerId: string
  transport: SttTransport
  recommendedMaxSeconds: number
  hardMaxSeconds: number
  maxUploadBytes: number | null
  source: RecordingLimitSource
  explanationKey: string
}

export interface ResolvedSttRecordingLimit {
  capability: SttRecordingCapability
  mode: RecordingLimitMode
  requestedSeconds: number
  effectiveMaxSeconds: number
}

/**
 * Resolves the recording limit. There is one speech provider type (file upload to an
 * OpenAI-compatible server), so the limit depends only on the chosen mode and seconds.
 */
export async function getSttRecordingCapability(
  mode: RecordingLimitMode,
  customSeconds: number,
): Promise<ResolvedSttRecordingLimit> {
  return invoke('get_stt_recording_capability', { mode, customSeconds })
}

export interface CredentialStatus {
  namespace: string
  provider: string
  hasSecret: boolean
  updatedAt: string | null
  storage: 'unavailable' | 'os-vault' | 'session-only' | 'legacy-warning'
}

export async function getCredentialStatus(
  namespace: 'stt' | 'llm',
  provider: string,
): Promise<CredentialStatus> {
  return invoke('get_credential_status', { namespace, provider })
}

export async function readCredential(
  namespace: 'stt' | 'llm',
  provider: string,
): Promise<string | null> {
  return invoke('read_credential', { namespace, provider })
}

export async function setCredential(
  namespace: 'stt' | 'llm',
  provider: string,
  value: string,
): Promise<void> {
  return invoke('set_credential', { namespace, provider, value })
}

export async function clearCredential(namespace: 'stt' | 'llm', provider: string): Promise<void> {
  return invoke('clear_credential', { namespace, provider })
}

export async function getPlatformCapabilities(): Promise<PlatformCapabilities> {
  return invoke('get_platform_capabilities')
}

export async function getHotkeyRegistrationError(): Promise<string | null> {
  return invoke('get_hotkey_registration_error')
}

export interface HotkeyBindingStatus {
  value: string
  valid: boolean
}

export type HotkeyAdapter = 'tauriGlobalShortcut' | 'nativeHook' | 'unavailable'
export type HotkeyInstallState = 'starting' | 'installed' | 'failed' | 'disabled'
export type HotkeyRole =
  | 'dictation'
  | 'ask'
  | 'translate'
  | 'editSelection'
  | 'switchScene'
  | 'openApp'

export interface HotkeyStatusError {
  code: string
  message: string
}

export interface HotkeyRoleStatus {
  role: HotkeyRole | string
  index: number
  display: string
  backend: HotkeyAdapter
  valid: boolean
  conflictWith: { role: HotkeyRole | string; index: number } | null
  adapter: HotkeyAdapter
  state: HotkeyInstallState
  message: string | null
  lastError: HotkeyStatusError | null
}

export interface HotkeyCapability {
  platform: 'macos' | 'windows' | 'linux' | 'unknown' | string
  sessionType: 'wayland' | 'x11' | 'unknown' | string
  supportsGlobalHotkey: boolean
  supportsHoldMode: boolean
  supportsReleasedEdge: boolean
  supportsSideSpecificModifiers: boolean
  requiresAccessibilityPermission: boolean
  statusHint: string | null
}

export interface HotkeyStatus {
  dictation: HotkeyBindingStatus
  ask: HotkeyBindingStatus
  conflict: boolean
  registration_error: string | null
  roles: HotkeyRoleStatus[]
  capability: HotkeyCapability
}

export async function getHotkeyStatus(): Promise<HotkeyStatus> {
  return invoke('get_hotkey_status')
}

export type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'notApplicable' | 'checking'

export interface DiagnosticRow {
  id: 'microphone' | 'accessibility' | 'hotkey' | 'clipboard' | 'insertion' | 'platform' | string
  status: DiagnosticStatus
  message: string
  action: string | null
  lastCheckedAt: string
}

export interface SystemDiagnosticsReport {
  checkedAt: string
  rows: DiagnosticRow[]
}

export async function getSystemDiagnostics(): Promise<SystemDiagnosticsReport> {
  return invoke('get_system_diagnostics')
}

// Preset tests. Each sends one small real request and returns the round-trip time in
// milliseconds, or rejects with an error string. An empty apiKey makes the backend use the
// key saved in the Keychain for that preset id.
export async function testSpeechPreset(preset: SpeechPreset, apiKey: string): Promise<number> {
  return invoke('test_speech_preset', { preset, apiKey })
}

export async function testAiPreset(preset: AiPreset, apiKey: string): Promise<number> {
  return invoke('test_ai_preset', { preset, apiKey })
}

// ─── Plan `quick-speech-setup`: Quick speech setup (built-in whisper.cpp) ───

export type SpeechSetupPhase = 'idle' | 'downloading' | 'verifying' | 'testing' | 'ready' | 'error'

/** Why a Quick setup stopped. Mirrors `DownloadError` in `stt/models.rs`. */
export type SpeechSetupError =
  | { code: 'network'; reason: string }
  | { code: 'disk_space'; neededBytes: number; availableBytes: number }
  | { code: 'checksum' }
  | { code: 'cancelled' }
  | { code: 'io'; reason: string }
  | { code: 'load'; reason: string }
  /** Plan `ai-polish-setup`: this copy of Typelite has no llama-server, so Built-in AI cannot run.
  /** */
  | { code: 'server_missing' }

/** Payload of `speech-setup:status` and the result of `get_speech_setup_status`. */
export interface SpeechSetupStatus {
  modelId: string | null
  phase: SpeechSetupPhase
  downloadedBytes: number
  totalBytes: number
  bytesPerSecond: number
  error: SpeechSetupError | null
  /** How long the automatic test took once the model was ready (ms); null before that. */
  testMs?: number | null
}

export interface SpeechModelInfo {
  id: string
  fileName: string
  sizeBytes: number
  installed: boolean
}

export async function getSpeechSetupStatus(): Promise<SpeechSetupStatus> {
  return invoke('get_speech_setup_status')
}

/** Starts the download and setup in the backend; progress arrives as events. */
export async function startSpeechSetup(modelId?: string): Promise<void> {
  return invoke('start_speech_setup', { modelId: modelId ?? null })
}

export async function cancelSpeechSetup(): Promise<boolean> {
  return invoke('cancel_speech_setup')
}

export async function listSpeechModels(): Promise<SpeechModelInfo[]> {
  return invoke('list_speech_models')
}

export async function deleteSpeechModel(modelId: string): Promise<void> {
  return invoke('delete_speech_model', { modelId })
}

// ─── Plan `two-tab-speech`: which built-in models this Mac runs well ───

export type ChipKind = 'apple_silicon' | 'intel' | 'unknown'

/** Why the larger model is not offered. Mirrors `LeftOutReason` in `stt/hardware.rs`. */
export type ModelLeftOutReason = 'needs_apple_silicon' | 'needs_memory' | 'needs_disk_space'

export interface OfferedModel {
  id: string
  sizeBytes: number
  /** The first of two cards; selected by default. */
  recommended: boolean
}

/** Result of `get_speech_hardware` (and, with `serverAvailable`, of `get_ai_hardware`). */
export interface SpeechHardwareCheck {
  hardware: {
    chipKind: ChipKind
    chipName: string
    memoryBytes: number
    freeBytes: number
  }
  offer: {
    models: OfferedModel[]
    leftOut: ModelLeftOutReason | null
    /** Set when no model fits on the disk: the free space the smallest one needs. */
    neededBytes: number | null
  }
  /** AI only (plan `ai-polish-setup`): false when this copy of Typelite has no llama-server. */
  serverAvailable?: boolean
}

/** Reads the chip, memory and free disk space, and the models this Mac is offered. */
export async function getSpeechHardware(): Promise<SpeechHardwareCheck> {
  return invoke('get_speech_hardware')
}

// ─── Plan `ai-polish-setup`: Built-in AI setup (llama-server started by Typelite) ───
// Same shapes as the speech setup; progress arrives as `ai-setup:status` events.

export async function getAiSetupStatus(): Promise<SpeechSetupStatus> {
  return invoke('get_ai_setup_status')
}

export async function startAiSetup(modelId?: string): Promise<void> {
  return invoke('start_ai_setup', { modelId: modelId ?? null })
}

export async function cancelAiSetup(): Promise<boolean> {
  return invoke('cancel_ai_setup')
}

export async function listAiModels(): Promise<SpeechModelInfo[]> {
  return invoke('list_ai_models')
}

export async function deleteAiModel(modelId: string): Promise<void> {
  return invoke('delete_ai_model', { modelId })
}

export async function getAiHardware(): Promise<SpeechHardwareCheck> {
  return invoke('get_ai_hardware')
}

// Hotkey
export async function updateHotkey(hotkey: string): Promise<void> {
  return invoke('update_hotkey', { hotkey })
}

export async function updateAskHotkey(hotkey: string): Promise<void> {
  return invoke('update_ask_hotkey', { hotkey })
}

export async function pauseHotkey(): Promise<void> {
  return invoke('pause_hotkey')
}

export async function resumeHotkey(): Promise<void> {
  return invoke('resume_hotkey')
}

// Ask Anything
export async function askAnything(question: string): Promise<string> {
  return invoke('ask_anything', { question: question.trim() })
}

export async function showAskWindow(): Promise<void> {
  return invoke('show_ask_window')
}

export async function startAskFlow(): Promise<void> {
  return invoke('start_ask_flow')
}

export type VoiceIntentKind =
  | 'dictate_insert'
  | 'draft_insert'
  | 'rewrite_selection'
  | 'translate_insert'
  | 'translate_selection'
  | 'ask_selection'
  | 'open_question'
  | 'search'

export type VoiceOutputPlacement =
  | 'insert_at_cursor'
  | 'replace_selection'
  | 'popup_answer'
  | 'open_url'

export type VoiceExecutionFallbackReason =
  | 'feature_disabled'
  | 'empty_output'
  | 'target_changed'
  | 'selection_lost'
  | 'focus_restore_failed'
  | 'output_failed'

export type AskResultOutput =
  | 'popupAnswer'
  | 'openedSearch'
  | 'insertedText'
  | 'copiedFallback'
  // Plan `ask-translate-and-live-questions`: the question needs live information; the panel offers
  // Answer anyway.
  | 'needsLiveInfo'

export interface AskDictationResult {
  question: string
  answer: string
  intent: VoiceIntentKind
  output: AskResultOutput
  usedSelectedText: boolean
  selectedTextTruncated: boolean
  searchProvider: string | null
  requestedPlacement: VoiceOutputPlacement
  actualPlacement: VoiceOutputPlacement | null
  fallbackReason: VoiceExecutionFallbackReason | null
  /** Answered with "Answer anyway" for a live question: may be out of date. */
  mayBeOutOfDate: boolean
}

export interface AskDictationStartResult {
  usedSelectedText: boolean
  selectedTextTruncated: boolean
}

export type PendingAskMessage =
  | { kind: 'result'; payload: AskDictationResult }
  | { kind: 'recordingStarted'; payload: AskDictationStartResult }
  | { kind: 'error'; payload: string }

export async function startAskDictation(): Promise<AskDictationStartResult> {
  return invoke('start_ask_dictation')
}

/** `stopAskDictation` rejects with this when Escape cancelled Ask while it was thinking. */
export const ASK_CANCELLED_ERROR = 'ask_cancelled'

export async function stopAskDictation(): Promise<AskDictationResult> {
  return invoke('stop_ask_dictation')
}

export async function stopAskFlow(): Promise<void> {
  return invoke('stop_ask_flow')
}

export async function abortAskDictation(): Promise<void> {
  return invoke('abort_ask_dictation')
}

export async function takePendingAskMessage(): Promise<PendingAskMessage | null> {
  return invoke('take_pending_ask_message')
}

/**
 * Plan `ask-translate-and-live-questions`: answer a live question from the model's own knowledge.
 */
export async function answerAskAnyway(question: string): Promise<AskDictationResult> {
  return invoke('answer_ask_anyway', { question })
}

// Dictionary
export async function getDictionary(): Promise<DictionaryEntry[]> {
  return invoke('get_dictionary')
}

export async function addDictionaryEntry(
  word: string,
  pronunciation: string | null,
): Promise<void> {
  return invoke('add_dictionary_entry', { word, pronunciation })
}

export async function removeDictionaryEntry(id: number): Promise<void> {
  return invoke('remove_dictionary_entry', { id })
}

export async function updateDictionaryEntry(
  id: number,
  word: string,
  pronunciation: string | null,
): Promise<void> {
  return invoke('update_dictionary_entry', { id, word, pronunciation })
}

export async function getCorrectionRules(): Promise<CorrectionRule[]> {
  return invoke('get_correction_rules')
}

export async function addCorrectionRule(pattern: string, replacement: string): Promise<void> {
  return invoke('add_correction_rule', { pattern, replacement })
}

export async function removeCorrectionRule(id: number): Promise<void> {
  return invoke('remove_correction_rule', { id })
}

export async function setCorrectionRuleEnabled(id: number, enabled: boolean): Promise<void> {
  return invoke('set_correction_rule_enabled', { id, enabled })
}

export async function updateCorrectionRule(
  id: number,
  pattern: string,
  replacement: string,
  enabled: boolean,
): Promise<void> {
  return invoke('update_correction_rule', { id, pattern, replacement, enabled })
}

export type DictionaryImportFormat = 'txt' | 'csv' | 'json'

export interface DictionaryImportRowError {
  row: number
  code: string
}

export interface DictionaryImportReport {
  accepted: number
  skippedDuplicates: number
  skippedInvalid: number
  errors: DictionaryImportRowError[]
}

export async function previewDictionaryImport(
  bytes: number[],
  format: DictionaryImportFormat,
): Promise<DictionaryImportReport> {
  return invoke('preview_dictionary_import', { bytes, format })
}

export async function commitDictionaryImport(
  bytes: number[],
  format: DictionaryImportFormat,
): Promise<DictionaryImportReport> {
  return invoke('commit_dictionary_import', { bytes, format })
}

export async function exportDictionaryJson(): Promise<string> {
  return invoke('export_dictionary_json')
}

export async function exportDictionaryCsv(): Promise<string> {
  return invoke('export_dictionary_csv')
}

// Auto-start
export async function setAutoStart(enabled: boolean): Promise<void> {
  return invoke('set_auto_start', { enabled })
}

// macOS Accessibility permission
export async function checkAccessibilityPermission(): Promise<boolean> {
  return invoke('check_accessibility_permission')
}

export async function requestAccessibilityPermission(): Promise<boolean> {
  return invoke('request_accessibility_permission')
}

export async function waitForAccessibilityPermission({
  timeoutMs = 60_000,
  intervalMs = 1_000,
}: {
  timeoutMs?: number
  intervalMs?: number
} = {}): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (true) {
    const trusted = await checkAccessibilityPermission()
    if (trusted || Date.now() >= deadline) return trusted
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/** Status of a macOS privacy permission ("TCC"). Other platforms always report 'granted'. */
export type PermissionStatus = 'granted' | 'denied' | 'not_determined'

/** Microphone permission, without showing a prompt. */
export async function getMicrophonePermission(): Promise<PermissionStatus> {
  return invoke('get_microphone_permission')
}

/** Shows the macOS Microphone prompt (first time only) and resolves with the answer. */
export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  return invoke('request_microphone_permission')
}

/** Automation permission (Apple Events to System Events), without showing a prompt. */
export async function getAutomationPermission(): Promise<PermissionStatus> {
  return invoke('get_automation_permission')
}

/** Runs a harmless System Events AppleScript so macOS shows the Automation prompt. */
export async function requestAutomationPermission(): Promise<PermissionStatus> {
  return invoke('request_automation_permission')
}

export type PrivacyPane = 'microphone' | 'accessibility' | 'automation'

/** Opens System Settings → Privacy & Security on `pane` (needed after a "Don't Allow"). */
export async function openPrivacySettings(pane: PrivacyPane): Promise<void> {
  return invoke('open_privacy_settings', { pane })
}

/**
 * Saves the shortcut tour flags without touching anything else in the config (so unsaved
 * Settings edits are not saved with them). Leave a flag undefined to keep it.
 */
export async function setShortcutTourState(state: {
  completed?: boolean
  promptDismissed?: boolean
}): Promise<void> {
  return invoke('set_shortcut_tour_state', {
    completed: state.completed ?? null,
    promptDismissed: state.promptDismissed ?? null,
  })
}

/** Shows the main window on a Settings pane (the capsule's "Set up" button). */
export async function openSettingsPane(pane: 'stt' | 'llm'): Promise<void> {
  return invoke('open_settings_pane', { pane })
}

// Onboarding persistence via tauri-plugin-store
export async function loadOnboardingCompleted(): Promise<boolean> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json')
    const val = await store.get<boolean>('onboarding_completed')
    return val === true
  } catch {
    return false
  }
}

export async function saveOnboardingCompleted(): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json')
    await store.set('onboarding_completed', true)
  } catch (e) {
    console.error('Failed to persist onboarding state:', e)
  }
}

// Microphone selection (Settings → General)
export interface InputDeviceInfo {
  name: string
  is_default: boolean
}

export interface MicMonitorInfo {
  device_name: string
  requested_device_missing: boolean
}

export async function listInputDevices(): Promise<InputDeviceInfo[]> {
  return invoke('list_input_devices')
}

/** Opens `device` ('' = system default) and emits `mic:level` (0–1 RMS) about 30 times a second. */
export async function startMicLevelMonitor(device: string): Promise<MicMonitorInfo> {
  return invoke('start_mic_level_monitor', { device: device || null })
}

export async function stopMicLevelMonitor(): Promise<void> {
  return invoke('stop_mic_level_monitor')
}

// Shortcut capture through the native key listener (macOS, Settings → General)
/** Payload of the `hotkey:capture` event. `held` lists key names in press order. */
export interface ShortcutCaptureEvent {
  held: string[]
  finished: boolean
  cancelled: boolean
}

export const SHORTCUT_CAPTURE_EVENT = 'hotkey:capture'

/** Pauses normal shortcuts and starts reporting every key edge as `hotkey:capture`. */
export async function startShortcutCapture(): Promise<void> {
  return invoke('start_shortcut_capture')
}

/** Stops capturing and registers the configured shortcuts again. */
export async function stopShortcutCapture(): Promise<void> {
  return invoke('stop_shortcut_capture')
}
