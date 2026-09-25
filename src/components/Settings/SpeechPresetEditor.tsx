import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
  findActivePreset,
  isBuiltinSpeech,
  useAppStore,
  BUILTIN_SPEECH_PRESET,
  type SpeechPreset,
} from '../../stores/appStore'
import { LANGUAGES } from '../../lib/constants'
import { testSpeechPreset } from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { recordSpeechResult } from '../../lib/connectionStatus'
import { hasPlaceholder, isSpeechReady, recordTestPassed } from '../../lib/readiness'
import {
  LOCAL_TEMPLATE_ID,
  SERVICE_TEMPLATE_ID,
  SPEECH_SERVICES,
  SPEECH_TYPES,
  addressLabel,
  builtinWhisperPreset,
  formatTestTime,
  speechServiceOf,
  speechTemplate,
  speechTypeOf,
  withTemplate,
  type SpeechService,
  type SpeechType,
} from '../../lib/speechTypes'
import { formatMegabytes } from '../../lib/speechSetup'
import { isSetupRunning, useSpeechSetupStore } from '../../stores/speechSetupStore'
import { Group, Row } from '../ui/Group'
import { SegmentedControl } from './shared/SegmentedControl'
import { QuickSpeechSetup, SpeechSetupProgress } from './QuickSpeechSetup'
import { beginSpeechSetup, useSpeechSetupStatus } from '../../hooks/useSpeechSetup'
import { SetupGuide } from '../Onboarding/SetupGuide'

/** Text fields hold technical values (URLs, model names), so they use SF Mono. */
const inputClass = 'field w-full min-w-0 font-mono text-[12px]'

const ADD_NEW = '__add__'
const DELETE_ACTIVE = '__delete__'

/** The type and service on screen, for the preset with `id`. */
interface ViewState {
  id: string
  type: SpeechType
  service: SpeechService
}

function viewFor(preset: SpeechPreset): ViewState {
  return { id: preset.id, type: speechTypeOf(preset), service: speechServiceOf(preset) }
}

interface Props {
  /**
   * Plan 0014: onboarding hides the language (auto-detect) and the Test time explanation so
   * the step fits without scrolling; Settings → Speech shows them.
   */
  context: 'onboarding' | 'settings'
}

/**
 * The speech setup editor (plans 0012 and 0014), used by the onboarding speech step and by
 * Settings → Speech. The user first picks a type (Built-in, Local server, OpenAI-compatible),
 * then only that type's fields show. Built-in templates are chosen through the type and the
 * service; the user's own presets live in the "Saved presets" menu, and only they have a name.
 */
export function SpeechPresetEditor({ context }: Props) {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const sttTestStatus = useAppStore((s) => s.sttTestStatus)
  const setSttTestStatus = useAppStore((s) => s.setSttTestStatus)
  const sttLatencyMs = useAppStore((s) => s.sttLatencyMs)
  const setSttLatencyMs = useAppStore((s) => s.setSttLatencyMs)
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null)
  const setupStatus = useSpeechSetupStatus()
  const models = useSpeechSetupStore((s) => s.models)

  const presets = config.speech_presets?.length ? config.speech_presets : [BUILTIN_SPEECH_PRESET]
  const active = findActivePreset(presets, config.active_speech_preset_id) ?? presets[0]
  const builtin = builtinWhisperPreset(presets)

  // What is on screen: the type (and service) follow the active preset, but they are kept
  // while its fields are edited, so typing an address does not switch the type half-way.
  // "Built-in" can be on screen before a built-in preset exists (it then shows Quick setup);
  // a user who has not set anything up starts there, because it is the one-click way.
  const [view, setView] = useState<ViewState>(() => ({
    id: active.id,
    type:
      !isSpeechReady(config) && active.builtin && !isBuiltinSpeech(active)
        ? 'builtin'
        : speechTypeOf(active),
    service: speechServiceOf(active),
  }))
  if (view.id !== active.id) {
    // The active preset changed (here, by Quick setup, or in another window).
    setView(viewFor(active))
  }
  const viewType: SpeechType = view.id === active.id ? view.type : speechTypeOf(active)
  const service: SpeechService = view.id === active.id ? view.service : speechServiceOf(active)

  const { apiKey, setApiKey, saveNow, saveError } = usePresetApiKey('stt', active.id)
  const showKey = viewType === 'openai'
  const isCustomPreset = !active.builtin

  const resetTest = () => {
    setSttTestStatus('idle')
    setSttLatencyMs(null)
    setTestErrorMessage(null)
  }

  /** Makes `id` active, and shows it as `shown` (default: what its address says). */
  const select = (
    speech_presets: SpeechPreset[],
    id: string,
    shown?: Partial<Omit<ViewState, 'id'>>,
  ) => {
    const preset = speech_presets.find((p) => p.id === id)
    if (preset) setView({ ...viewFor(preset), ...shown })
    updateConfig({ speech_presets, active_speech_preset_id: id })
    resetTest()
  }

  const updateActive = (patch: Partial<SpeechPreset>) => {
    updateConfig({
      speech_presets: presets.map((preset) =>
        preset.id === active.id ? { ...preset, ...patch } : preset,
      ),
    })
    resetTest()
  }

  const selectTemplate = (id: string) => select(withTemplate(presets, id), id)

  const addNew = (type: Exclude<SpeechType, 'builtin'>) => {
    const local = speechTemplate(LOCAL_TEMPLATE_ID)
    const created: SpeechPreset = {
      id: crypto.randomUUID(),
      name: t('presets.newName'),
      kind: 'openai_compatible',
      base_url: type === 'local' ? (local?.base_url ?? '') : '',
      model: type === 'local' ? (local?.model ?? '') : '',
      model_file: '',
      language: active.language || 'auto',
      builtin: false,
      verified_at: null,
    }
    select(
      [...presets, created],
      created.id,
      type === 'openai' ? { type: 'openai', service: 'custom' } : { type: 'local' },
    )
  }

  const handleType = (value: string) => {
    const type = value as SpeechType
    if (type === viewType) return
    if (type === 'builtin') {
      if (builtin) {
        select(presets, builtin.id)
      } else {
        setView({ ...view, id: active.id, type: 'builtin' })
        resetTest()
      }
      return
    }
    if (speechTypeOf(active) === type && !(type === 'local' && isBuiltinSpeech(active))) {
      // The active preset already is of this type (for example after "Built-in" was only
      // being looked at): show it again.
      setView(viewFor(active))
      return
    }
    selectTemplate(type === 'local' ? LOCAL_TEMPLATE_ID : SERVICE_TEMPLATE_ID.openai)
  }

  const handleService = (value: string) => {
    const next = value as SpeechService
    if (next === service) return
    if (next === 'custom') addNew('openai')
    else selectTemplate(SERVICE_TEMPLATE_ID[next])
  }

  const handleSavedPreset = (value: string) => {
    if (value === ADD_NEW) {
      addNew(viewType === 'openai' ? 'openai' : 'local')
    } else if (value === DELETE_ACTIVE) {
      if (!isCustomPreset) return
      const fallback = viewType === 'local' ? LOCAL_TEMPLATE_ID : SERVICE_TEMPLATE_ID.openai
      const remaining = presets.filter((preset) => preset.id !== active.id)
      select(withTemplate(remaining, fallback), fallback)
    } else if (value) {
      select(presets, value)
    }
  }

  // Plan 0014: a changed address on the Local server template is offered as its own preset,
  // and the template keeps its default address.
  const localTemplate = speechTemplate(LOCAL_TEMPLATE_ID)
  const offerSaveAsPreset =
    active.id === LOCAL_TEMPLATE_ID &&
    localTemplate !== undefined &&
    active.base_url.trim() !== '' &&
    active.base_url !== localTemplate.base_url
  const handleSaveAsPreset = () => {
    if (!localTemplate) return
    const created: SpeechPreset = {
      ...active,
      id: crypto.randomUUID(),
      name: t('presets.localServerName', { address: addressLabel(active.base_url) }),
      builtin: false,
    }
    const restored = presets.map((preset) =>
      preset.id === LOCAL_TEMPLATE_ID
        ? { ...localTemplate, language: preset.language, verified_at: null }
        : preset,
    )
    select([...restored, created], created.id)
  }

  const canTest =
    viewType === 'builtin'
      ? isBuiltinSpeech(active) && Boolean(active.model_file)
      : Boolean(active.base_url.trim() && active.model.trim())

  const handleTest = async () => {
    setSttLatencyMs(null)
    setTestErrorMessage(null)
    if (hasPlaceholder(active.base_url)) {
      setTestErrorMessage(t('presets.placeholderUrl'))
      setSttTestStatus('error')
      return
    }
    setSttTestStatus('testing')
    const tested = active
    try {
      const ms = await testSpeechPreset(tested, showKey ? apiKey : '')
      setSttLatencyMs(ms)
      setSttTestStatus('success')
      recordTestPassed('speech', tested)
      recordSpeechResult(true)
    } catch (err) {
      console.error('[STT Test] Error:', err)
      setTestErrorMessage(err instanceof Error ? err.message : typeof err === 'string' ? err : null)
      setSttTestStatus('error')
      recordSpeechResult(false)
    }
  }

  const customPresets = presets.filter((preset) => !preset.builtin)
  const savedPresetsMenu = (
    <select
      aria-label={t('presets.savedPresets')}
      value={isCustomPreset ? active.id : ''}
      onChange={(event) => handleSavedPreset(event.target.value)}
      className="popup max-w-[180px] text-[11.5px] font-normal normal-case tracking-normal"
    >
      <option value="" disabled>
        {t('presets.savedPresets')}
      </option>
      {customPresets.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.name || t('presets.unnamed')}
        </option>
      ))}
      {viewType !== 'builtin' && <option value={ADD_NEW}>{t('presets.addNew')}</option>}
      {isCustomPreset && (
        <option value={DELETE_ACTIVE}>
          {t('presets.deleteNamed', { name: active.name || t('presets.unnamed') })}
        </option>
      )}
    </select>
  )

  const languageRow = context === 'settings' && (viewType !== 'builtin' || builtin) && (
    <Row label={t('settings.sttLanguage')}>
      <select
        aria-label={t('settings.sttLanguage')}
        value={active.language || 'auto'}
        onChange={(e) => updateActive({ language: e.target.value })}
        className="popup"
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.labelKey ? t(l.labelKey) : l.label}
          </option>
        ))}
      </select>
    </Row>
  )

  const nameRow = isCustomPreset && viewType !== 'builtin' && (
    <Row label={t('presets.name')} layout="wide">
      <input
        aria-label={t('presets.name')}
        value={active.name}
        onChange={(event) => updateActive({ name: event.target.value })}
        className="field min-w-0 flex-1"
      />
    </Row>
  )

  const testRow = (viewType !== 'builtin' || builtin) && (
    <Row>
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={!canTest || sttTestStatus === 'testing'}
          title={context === 'settings' ? t('presets.speechTestHelp') : undefined}
          className="btn-accent flex-none"
        >
          {sttTestStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
          {t('settings.test')}
        </button>
        {(sttTestStatus === 'success' || sttTestStatus === 'error') && (
          <TestFeedback
            inline
            status={sttTestStatus}
            latencyMs={sttLatencyMs}
            errorMessage={testErrorMessage}
          />
        )}
      </div>
    </Row>
  )

  const installedModels = (models ?? []).filter((model) => model.installed)
  const notInstalled = (models ?? []).filter((model) => !model.installed)
  const setupRunning = isSetupRunning(setupStatus)

  return (
    <>
      <Group label={t('presets.speechGroup')} actions={savedPresetsMenu}>
        <Row>
          <SegmentedControl
            ariaLabel={t('presets.type')}
            options={SPEECH_TYPES.map((type) => ({
              value: type,
              label: t(`presets.types.${type}`),
            }))}
            value={viewType}
            onChange={handleType}
            className="w-full flex-nowrap [&>button]:flex-1 [&>button]:px-2 [&>button]:whitespace-nowrap"
          />
        </Row>

        {viewType === 'builtin' && builtin && (
          <>
            <Row label={t('presets.builtinModel')}>
              <select
                aria-label={t('presets.builtinModel')}
                value={active.model_file ?? ''}
                onChange={(event) => {
                  const model = installedModels.find((m) => m.fileName === event.target.value)
                  if (model) updateActive({ model: model.id, model_file: model.fileName })
                }}
                className="popup"
              >
                {installedModels.length === 0 && (
                  <option value={active.model_file ?? ''}>{active.model}</option>
                )}
                {installedModels.map((model) => (
                  <option key={model.id} value={model.fileName}>
                    {t(`speechSetup.modelNames.${model.id}`)}
                  </option>
                ))}
              </select>
            </Row>
            {(setupRunning || setupStatus.phase === 'error') && (
              <Row>
                <div className="min-w-0 flex-1">
                  <SpeechSetupProgress />
                </div>
              </Row>
            )}
            {!setupRunning && notInstalled.length > 0 && context === 'settings' && (
              <Row>
                {notInstalled.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => beginSpeechSetup(model.id)}
                    className="cursor-pointer border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
                  >
                    {t('speechSetup.downloadOther', {
                      name: t(`speechSetup.modelNames.${model.id}`),
                      size: formatMegabytes(model.sizeBytes),
                    })}
                  </button>
                ))}
              </Row>
            )}
          </>
        )}

        {viewType === 'local' && (
          <>
            {nameRow}
            <Row label={t('presets.address')} layout="wide">
              <input
                aria-label={t('presets.address')}
                value={active.base_url}
                onChange={(e) => updateActive({ base_url: e.target.value })}
                placeholder={localTemplate?.base_url}
                className={inputClass}
              />
            </Row>
            {offerSaveAsPreset && (
              <Row help={t('presets.addressChanged')}>
                <button type="button" onClick={handleSaveAsPreset} className="btn-secondary">
                  {t('presets.saveAsPreset')}
                </button>
              </Row>
            )}
            <Row label={t('settings.model')} layout="wide">
              <input
                aria-label={t('settings.model')}
                value={active.model}
                onChange={(e) => updateActive({ model: e.target.value })}
                placeholder={localTemplate?.model}
                className={inputClass}
              />
            </Row>
          </>
        )}

        {viewType === 'openai' && (
          <>
            {nameRow}
            <Row label={t('presets.service')}>
              <SegmentedControl
                ariaLabel={t('presets.service')}
                options={SPEECH_SERVICES.map((value) => ({
                  value,
                  label: t(`presets.services.${value}`),
                }))}
                value={service}
                onChange={handleService}
              />
            </Row>
            {service === 'custom' && (
              <Row label={t('presets.address')} layout="wide">
                <input
                  aria-label={t('presets.address')}
                  value={active.base_url}
                  onChange={(e) => updateActive({ base_url: e.target.value })}
                  placeholder="https://example.com/v1"
                  className={inputClass}
                />
              </Row>
            )}
            <Row
              label={t('presets.apiKey')}
              help={
                saveError ? (
                  <span className="text-error">
                    {t('settings.credentialSaveFailed', { details: saveError })}
                  </span>
                ) : context === 'settings' ? (
                  t('settings.storedLocally')
                ) : undefined
              }
              layout="wide"
            >
              <input
                type="password"
                aria-label={t('presets.apiKey')}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  resetTest()
                }}
                onBlur={saveNow}
                placeholder={t('presets.apiKeyPlaceholder')}
                className={inputClass}
              />
            </Row>
            <Row label={t('settings.model')} layout="wide">
              <input
                aria-label={t('settings.model')}
                value={active.model}
                onChange={(e) => updateActive({ model: e.target.value })}
                className={inputClass}
              />
            </Row>
          </>
        )}

        {languageRow}
        {testRow}
      </Group>

      {viewType === 'builtin' && !builtin && (
        <div className="mt-3">
          <QuickSpeechSetup />
        </div>
      )}

      <div className="mt-2.5">
        <SetupGuide kind="speech" />
      </div>
    </>
  )
}

/** The result of a Test: the time after a pass, the reason after a failure. */
export function TestFeedback({
  status,
  latencyMs,
  errorMessage,
  inline = false,
}: {
  status: string
  latencyMs: number | null
  errorMessage: string | null
  /** Plan 0014 (speech): shown next to the button as "Works · 1.4 s". */
  inline?: boolean
}) {
  const { t } = useTranslation()
  if (status === 'success') {
    const time =
      latencyMs === null
        ? t('settings.connectionSuccess')
        : inline
          ? t('presets.works', { time: formatTestTime(latencyMs) })
          : t('presets.latency', { ms: latencyMs })
    return (
      <span className="flex min-w-0 items-center gap-1 text-[12px] text-success">
        <CheckCircle2 size={12} className="flex-none" /> {time}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex min-w-0 items-start gap-1 text-[12px] text-error">
        <XCircle size={12} className="mt-[2px] flex-shrink-0" />
        <span className="min-w-0 break-words">
          {errorMessage || t('settings.connectionFailed')}
        </span>
      </span>
    )
  }
  return null
}
