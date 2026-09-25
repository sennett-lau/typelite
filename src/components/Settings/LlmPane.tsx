import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import type { PolishStyle } from '../../stores/appStore'
import { getLatestMappingCandidate, listCustomAppMappings } from '../../lib/tauri'
import type { CustomAppMappingView, MappingCandidateView } from '../../lib/tauri'
import { Group, Row } from '../ui/Group'
import { Toggle } from './shared/Toggle'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { AiPresetEditor } from './AiPresetEditor'
import { PresetShareButtons } from './PresetShareButtons'
import { AppLogo } from '../AppLogo'
import { ContextAdaptationApps } from './ContextAdaptationApps'
import { TranslationTargets } from './TranslationTargets'
import { AppStyleMappingDialog } from './AppStyleMappingDialog'
import { ManageAppMappingsDialog } from './ManageAppMappingsDialog'

export function LlmPane() {
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const lastContext = useAppStore((s) => s.lastContext)
  const { t } = useTranslation()

  const polishPromptLength = config.polish_custom_prompt.length
  const hasCustomPolishConfig = config.polish_custom_prompt.trim().length > 0

  const [polishAdvancedOpen, setPolishAdvancedOpen] = useState(hasCustomPolishConfig)
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

  return (
    <div>
      <AiPresetEditor />
      {/* Plan `preset-sharing`: export and import AI presets. */}
      <PresetShareButtons service="ai" />

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
