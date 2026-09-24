import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { BUILTIN_AI_PRESET, findActivePreset, useAppStore } from '../../stores/appStore'
import type { AiPreset, PolishStyle } from '../../stores/appStore'
import {
  fetchAiModels,
  getLatestMappingCandidate,
  listCustomAppMappings,
  setCredential,
  testAiPreset,
} from '../../lib/tauri'
import type { CustomAppMappingView, MappingCandidateView } from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { parseExtraFields } from '../../lib/extraFields'
import { Group, Row } from '../ui/Group'
import { PresetPicker } from './PresetPicker'
import { Toggle } from './shared/Toggle'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react'
import { AppLogo } from '../AppLogo'
import { ContextAdaptationApps } from './ContextAdaptationApps'
import { TranslationTargets } from './TranslationTargets'
import { AppStyleMappingDialog } from './AppStyleMappingDialog'
import { ManageAppMappingsDialog } from './ManageAppMappingsDialog'
import { recordAiResult } from '../../lib/connectionStatus'

/** Text fields hold technical values (URLs, model names, JSON), so they use SF Mono. */
const inputClass = 'field w-full min-w-0 font-mono text-[12px]'

/** Shows extra request fields as editable JSON; an empty object shows as an empty box. */
function formatExtraFields(fields: Record<string, unknown>): string {
  return Object.keys(fields).length === 0 ? '' : JSON.stringify(fields, null, 2)
}

export function LlmPane() {
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const llmTestStatus = useAppStore((s) => s.llmTestStatus)
  const setLlmTestStatus = useAppStore((s) => s.setLlmTestStatus)
  const llmLatencyMs = useAppStore((s) => s.llmLatencyMs)
  const setLlmLatencyMs = useAppStore((s) => s.setLlmLatencyMs)
  const lastContext = useAppStore((s) => s.lastContext)
  const { t } = useTranslation()

  const polishPromptLength = config.polish_custom_prompt.length
  const hasCustomPolishConfig = config.polish_custom_prompt.trim().length > 0

  const models = useAppStore((s) => s.llmModels)
  const setModels = useAppStore((s) => s.setLlmModels)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null)
  const [polishAdvancedOpen, setPolishAdvancedOpen] = useState(hasCustomPolishConfig)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const presets = config.ai_presets?.length ? config.ai_presets : [BUILTIN_AI_PRESET]
  const active = findActivePreset(presets, config.active_ai_preset_id) ?? presets[0]
  const {
    apiKey: llmApiKey,
    setApiKey: setLlmApiKey,
    saveNow: saveLlmApiKeyNow,
    saveError: credentialErrorMessage,
  } = usePresetApiKey('llm', active.id)
  const extraFieldsJson = JSON.stringify(active.extra_request_fields ?? {})
  const [extraFieldsDraft, setExtraFieldsDraft] = useState(() =>
    formatExtraFields(active.extra_request_fields ?? {}),
  )
  const [extraFieldsInvalid, setExtraFieldsInvalid] = useState(false)
  const [mappingCandidate, setMappingCandidate] = useState<MappingCandidateView | null>(null)
  const [appMappings, setAppMappings] = useState<CustomAppMappingView[]>([])
  const [appStyleMenuOpen, setAppStyleMenuOpen] = useState(false)
  const [appStyleDialogOpen, setAppStyleDialogOpen] = useState(false)
  const [manageMappingsOpen, setManageMappingsOpen] = useState(false)
  const [editingMapping, setEditingMapping] = useState<CustomAppMappingView | null>(null)
  const appStyleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const showBrowserAccessHint = Boolean(
    config.polish_enabled &&
    config.context_adaptation_enabled &&
    lastContext?.profileId === 'general.browser' &&
    lastContext.browserAccessStatus === 'needs_permission',
  )

  const refreshAppMappings = useCallback(async () => {
    const [candidate, mappings] = await Promise.all([
      getLatestMappingCandidate(),
      listCustomAppMappings(),
    ])
    setMappingCandidate(candidate)
    setAppMappings(mappings)
  }, [])

  useEffect(() => {
    if (!lastContext) {
      setMappingCandidate(null)
      setAppMappings([])
      return
    }
    let cancelled = false
    Promise.all([getLatestMappingCandidate(), listCustomAppMappings()])
      .then(([candidate, mappings]) => {
        if (cancelled) return
        setMappingCandidate(candidate)
        setAppMappings(mappings)
      })
      .catch(() => {
        if (cancelled) return
        setMappingCandidate(null)
        setAppMappings([])
      })
    return () => {
      cancelled = true
    }
  }, [lastContext])

  const closeAppStyleMenu = useCallback((restoreFocus = false) => {
    setAppStyleMenuOpen(false)
    if (restoreFocus) requestAnimationFrame(() => appStyleMenuButtonRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!appStyleMenuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAppStyleMenu(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [appStyleMenuOpen, closeAppStyleMenu])

  useEffect(() => {
    if (hasCustomPolishConfig) setPolishAdvancedOpen(true)
  }, [hasCustomPolishConfig])

  // Show the saved extra fields again when another preset is picked or the config is reset,
  // but keep the user's own formatting while it still means the same object.
  useEffect(() => {
    const saved = JSON.parse(extraFieldsJson) as Record<string, unknown>
    setExtraFieldsDraft((draft) => {
      const parsed = parseExtraFields(draft)
      if (parsed && JSON.stringify(parsed) === extraFieldsJson) return draft
      return formatExtraFields(saved)
    })
    setExtraFieldsInvalid(false)
  }, [active.id, extraFieldsJson])

  const resetTest = () => {
    setLlmTestStatus('idle')
    setLlmLatencyMs(null)
    setTestErrorMessage(null)
  }

  const updateActive = (patch: Partial<AiPreset>) => {
    updateConfig({
      ai_presets: presets.map((preset) =>
        preset.id === active.id ? { ...preset, ...patch } : preset,
      ),
    })
    resetTest()
  }

  const handleExtraFieldsChange = (text: string) => {
    setExtraFieldsDraft(text)
    const parsed = parseExtraFields(text)
    if (parsed === null) {
      // Keep the last valid value in the config; only show the error.
      setExtraFieldsInvalid(true)
      return
    }
    setExtraFieldsInvalid(false)
    updateActive({ extra_request_fields: parsed })
  }

  const doFetchModels = useCallback(
    async (baseUrl: string, apiKey: string) => {
      if (!baseUrl) return
      setFetchingModels(true)
      try {
        const list = await fetchAiModels(baseUrl, apiKey)
        setModels(list)
      } catch {
        // Do not clear existing cache on failure — avoids infinite retry loop
        // (clearing would re-trigger the useEffect that checks models.length > 0)
      } finally {
        setFetchingModels(false)
      }
    },
    [setModels],
  )

  // Auto-fetch when the base URL or API key changes (debounced); skips if models are cached
  useEffect(() => {
    if (!active.base_url) return
    if (models.length > 0) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doFetchModels(active.base_url, llmApiKey)
    }, 500)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [active.base_url, doFetchModels, llmApiKey, models.length])

  const handleTest = async () => {
    setLlmTestStatus('testing')
    setLlmLatencyMs(null)
    setTestErrorMessage(null)
    try {
      const ms = await testAiPreset(active, llmApiKey)
      setLlmLatencyMs(ms)
      setLlmTestStatus('success')
      recordAiResult(true)
    } catch (err) {
      console.error('[LLM Test] Error:', err)
      setTestErrorMessage(err instanceof Error ? err.message : typeof err === 'string' ? err : null)
      setLlmTestStatus('error')
      recordAiResult(false)
    }
  }

  const connectionFeedback =
    llmTestStatus === 'success' ? (
      <span className="flex items-center gap-1 text-success">
        <CheckCircle2 size={12} />{' '}
        {llmLatencyMs !== null
          ? t('presets.latency', { ms: llmLatencyMs })
          : t('settings.connectionSuccess')}
      </span>
    ) : llmTestStatus === 'error' ? (
      <span className="flex items-start gap-1 text-error">
        <XCircle size={12} className="mt-[2px] flex-shrink-0" />
        <span>{testErrorMessage || t('settings.connectionFailed')}</span>
      </span>
    ) : undefined

  return (
    <div>
      <Group label={t('settings.groupPreset')}>
        <PresetPicker
          presets={presets}
          activeId={active.id}
          onChange={(ai_presets, active_ai_preset_id) => {
            updateConfig({ ai_presets, active_ai_preset_id })
            resetTest()
            if (active_ai_preset_id !== active.id) setModels([])
          }}
          onCreated={(_source, created) => {
            // A copy starts with the same API key as the preset it came from.
            if (llmApiKey) {
              setCredential('llm', created.id, llmApiKey).catch((error) =>
                console.error('[credentials] failed to copy AI key', error),
              )
            }
          }}
        />
      </Group>

      <Group label={t('settings.groupServer')}>
        <Row label={t('settings.baseUrl')} layout="wide">
          <input
            aria-label={t('settings.baseUrl')}
            value={active.base_url}
            onChange={(e) => {
              updateActive({ base_url: e.target.value })
              setModels([])
            }}
            placeholder={BUILTIN_AI_PRESET.base_url}
            className={inputClass}
          />
        </Row>

        <Row
          label={t('settings.model')}
          help={
            models.length > 0 ? t('settings.modelsAvailable', { count: models.length }) : undefined
          }
          layout="wide"
        >
          <input
            aria-label={t('settings.model')}
            list="llm-model-list"
            value={active.model}
            onChange={(e) => updateActive({ model: e.target.value })}
            placeholder={BUILTIN_AI_PRESET.model}
            className={inputClass}
          />
          <datalist id="llm-model-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => doFetchModels(active.base_url, llmApiKey)}
            disabled={fetchingModels || !active.base_url}
            className="btn-icon"
            title={t('settings.fetchModels')}
            aria-label={t('settings.fetchModels')}
          >
            <RefreshCw size={13} className={fetchingModels ? 'animate-spin' : ''} />
          </button>
        </Row>

        <Row
          label={t('presets.extraFields')}
          help={
            extraFieldsInvalid ? (
              <span className="text-error">{t('presets.extraFieldsInvalid')}</span>
            ) : (
              t('presets.extraFieldsHint')
            )
          }
          layout="stacked"
        >
          <textarea
            aria-label={t('presets.extraFields')}
            value={extraFieldsDraft}
            onChange={(e) => handleExtraFieldsChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'{"reasoning_effort": "none"}'}
            className={`resize-y ${inputClass}`}
          />
        </Row>

        <Row
          label={t('presets.apiKeyOptional')}
          help={
            credentialErrorMessage ? (
              <span className="text-error">
                {t('settings.credentialSaveFailed', { details: credentialErrorMessage })}
              </span>
            ) : (
              t('settings.storedLocally')
            )
          }
          layout="wide"
        >
          <input
            type="password"
            aria-label={t('presets.apiKeyOptional')}
            value={llmApiKey}
            onChange={(e) => {
              setLlmApiKey(e.target.value)
              resetTest()
            }}
            onBlur={saveLlmApiKeyNow}
            placeholder={t('presets.apiKeyPlaceholder')}
            className={inputClass}
          />
        </Row>

        <Row label={t('settings.connection')} help={connectionFeedback}>
          <button
            type="button"
            onClick={handleTest}
            disabled={
              !active.base_url.trim() ||
              !active.model.trim() ||
              extraFieldsInvalid ||
              llmTestStatus === 'testing'
            }
            className="btn-accent"
          >
            {llmTestStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
            {t('settings.test')}
          </button>
        </Row>
      </Group>

      <Group label={t('settings.groupPolish')}>
        <Row label={t('settings.enableAiPolish')}>
          <Toggle
            checked={config.polish_enabled}
            onChange={(checked) => updateConfig({ polish_enabled: checked })}
            label={t('settings.enableAiPolish')}
            hideLabel
          />
        </Row>

        {config.polish_enabled && (
          <Row label={t('settings.polishStyle')}>
            <select
              aria-label={t('settings.polishStyle')}
              value={config.polish_style}
              onChange={(e) => updateConfig({ polish_style: e.target.value as PolishStyle })}
              className="popup"
            >
              <option value="minimal">{t('settings.polishStyleMinimal')}</option>
              <option value="clean">{t('settings.polishStyleClean')}</option>
              <option value="structured">{t('settings.polishStyleStructured')}</option>
              <option value="professional">{t('settings.polishStyleProfessional')}</option>
            </select>
          </Row>
        )}

        <Row
          label={t('settings.contextAdaptation')}
          help={
            <ContextAdaptationApps
              disabled={!config.polish_enabled || !config.context_adaptation_enabled}
            />
          }
        >
          <Toggle
            checked={config.context_adaptation_enabled}
            disabled={!config.polish_enabled}
            onChange={(checked) => updateConfig({ context_adaptation_enabled: checked })}
            label={t('settings.contextAdaptation')}
            hideLabel
          />
        </Row>

        {lastContext && (
          <Row
            label={t('settings.lastDictationContext')}
            help={
              showBrowserAccessHint ? (
                <span className="text-warning">{t('settings.browserAccessHint')}</span>
              ) : undefined
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">
              <AppLogo iconKey={lastContext.iconKey} family={lastContext.family} />
              <span className="min-w-0 truncate">{lastContext.appLabel}</span>
            </span>
            {(mappingCandidate || appMappings.length > 0) && (
              <div className="relative flex-none">
                <button
                  ref={appStyleMenuButtonRef}
                  type="button"
                  aria-label={t('settings.appStyleMenu')}
                  title={t('settings.appStyleMenu')}
                  aria-expanded={appStyleMenuOpen}
                  onClick={() => setAppStyleMenuOpen((open) => !open)}
                  className="btn-icon"
                >
                  <MoreHorizontal size={15} />
                </button>
                {appStyleMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => closeAppStyleMenu(true)} />
                    <div className="menu absolute right-0 top-8 z-40 min-w-[210px] py-1">
                      {mappingCandidate && (
                        <button
                          type="button"
                          onClick={() => {
                            closeAppStyleMenu()
                            setEditingMapping(null)
                            setAppStyleDialogOpen(true)
                          }}
                          className="menu-item"
                        >
                          {t('settings.useDifferentWritingStyle')}
                        </button>
                      )}
                      {appMappings.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            closeAppStyleMenu()
                            setManageMappingsOpen(true)
                          }}
                          className="menu-item"
                        >
                          {t('settings.manageAppMappings')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Row>
        )}
      </Group>

      <Group label={t('settings.groupTranslation')}>
        <Row label={t('settings.translationMode')}>
          <Toggle
            checked={config.translate_enabled}
            onChange={(checked) => updateConfig({ translate_enabled: checked })}
            label={t('settings.translationMode')}
            hideLabel
          />
        </Row>
        {/* The languages are used by the Translate shortcut too, so they always show,
            not only when "Always translate output" is on. */}
        <Row>
          <TranslationTargets
            value={config.translation}
            onChange={(translation) => updateConfig({ translation })}
          />
        </Row>
      </Group>

      <Group label={t('settings.groupAdvanced')}>
        <button
          type="button"
          aria-expanded={polishAdvancedOpen}
          onClick={() => setPolishAdvancedOpen((open) => !open)}
          className="row w-full cursor-pointer border-none bg-transparent text-left"
        >
          <span className="row-label">{t('settings.advancedPolishSettings')}</span>
          <ChevronDown
            size={14}
            className={`flex-none text-text-tertiary transition-transform ${
              polishAdvancedOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {polishAdvancedOpen && (
          <>
            <Row
              label={t('settings.selectedTextContext')}
              help={t('settings.selectedTextContextDesc')}
            >
              <Toggle
                checked={config.selected_text_enabled}
                onChange={(checked) => updateConfig({ selected_text_enabled: checked })}
                label={t('settings.selectedTextContext')}
                hideLabel
              />
            </Row>

            {config.polish_enabled && (
              <Row
                label={t('settings.customPolishInstructions')}
                help={t('settings.customPolishInstructionsCount', { count: polishPromptLength })}
                layout="stacked"
              >
                <textarea
                  aria-label={t('settings.customPolishInstructions')}
                  value={config.polish_custom_prompt}
                  onChange={(e) => updateConfig({ polish_custom_prompt: e.target.value })}
                  maxLength={2000}
                  rows={4}
                  placeholder={t('settings.customPolishInstructionsPlaceholder')}
                  className="field w-full resize-y"
                />
              </Row>
            )}
          </>
        )}
      </Group>

      {appStyleDialogOpen && lastContext && (
        <AppStyleMappingDialog
          candidate={editingMapping ? null : mappingCandidate}
          mapping={editingMapping}
          context={lastContext}
          config={config}
          onCancel={() => {
            setAppStyleDialogOpen(false)
            setEditingMapping(null)
          }}
          onSaved={async () => {
            await refreshAppMappings()
            setAppStyleDialogOpen(false)
            setEditingMapping(null)
          }}
        />
      )}

      {manageMappingsOpen && (
        <ManageAppMappingsDialog
          mappings={appMappings}
          onCancel={() => setManageMappingsOpen(false)}
          onChanged={refreshAppMappings}
          onEdit={(mapping) => {
            setManageMappingsOpen(false)
            setEditingMapping(mapping)
            setAppStyleDialogOpen(true)
          }}
        />
      )}
    </div>
  )
}
