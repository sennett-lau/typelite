import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { PageFrame } from '../PageFrame'
import { GeneralPane } from './GeneralPane'
import { SttPane } from './SttPane'
import { LlmPane } from './LlmPane'
import { ScenesPane } from './ScenesPane'
import { SystemPane } from './SystemPane'
import { SearchPane } from './SearchPane'
import { TranslatePane } from './TranslatePane'
import { AlignLeft, Globe, Languages, Mic, Monitor, Settings as Gear, Sparkles } from 'lucide-react'
import { DirtyBar } from './shared/DirtyBar'
import { useDirtyConfig } from './shared/useDirtyConfig'

/**
 * Settings sections, shown as toolbar tabs across the top of the page (plan `two-tab-speech`): icon
 * above label, as in macOS Settings windows.
 */
const PANES = [
  { id: 'general', labelKey: 'settings.general', Icon: Gear },
  // Plan `settings-order`: the next three follow the three shortcuts, Dictate (prompts),
  // Translate (translation languages) and Ask anything (web search, plan `ask-web-search`).
  // The services they share (speech, AI) come after them.
  { id: 'scenes', labelKey: 'settings.prompts', Icon: AlignLeft },
  { id: 'translate', labelKey: 'settings.translatePane', Icon: Languages },
  { id: 'search', labelKey: 'settings.search', Icon: Globe },
  { id: 'stt', labelKey: 'settings.speechRecognition', Icon: Mic },
  { id: 'llm', labelKey: 'settings.aiPolish', Icon: Sparkles },
  { id: 'system', labelKey: 'settings.system', Icon: Monitor },
] as const

export type PaneId = (typeof PANES)[number]['id']

function paneFromHash(): PaneId | null {
  const query = window.location.hash.split('?')[1]
  if (!query) return null
  const requested = new URLSearchParams(query).get('pane')
  return PANES.some((pane) => pane.id === requested) ? (requested as PaneId) : null
}

export function Settings() {
  const [activePane, setActivePane] = useState<PaneId>(() => paneFromHash() ?? 'general')
  const contentRef = useRef<HTMLDivElement | null>(null)
  const config = useAppStore((s) => s.config)
  const setSavedConfig = useAppStore((s) => s.setSavedConfig)
  const isDirty = useDirtyConfig()
  const { t } = useTranslation()

  // First-run onboarding may enter Settings before MainApp has established backend truth.
  useEffect(() => {
    if (useAppStore.getState().savedConfig === null) setSavedConfig(config)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const syncRequestedPane = () => {
      const requested = paneFromHash()
      if (requested) setActivePane(requested)
    }
    window.addEventListener('hashchange', syncRequestedPane)
    return () => window.removeEventListener('hashchange', syncRequestedPane)
  }, [])

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 })
  }, [activePane])

  return (
    <PageFrame
      ref={contentRef}
      title={t('settings.title')}
      toolbar={
        <div role="tablist" aria-label={t('settings.sections')} className="toolbar-tabs">
          {PANES.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activePane === id}
              onClick={() => setActivePane(id)}
              className="toolbar-tab"
            >
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              {t(labelKey)}
            </button>
          ))}
        </div>
      }
      footer={<AnimatePresence>{isDirty && <DirtyBar />}</AnimatePresence>}
    >
      <motion.div
        key={activePane}
        role="tabpanel"
        aria-label={t(PANES.find((pane) => pane.id === activePane)?.labelKey ?? '')}
        className="w-full"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
      >
        {activePane === 'general' && <GeneralPane />}
        {activePane === 'scenes' && <ScenesPane />}
        {activePane === 'translate' && <TranslatePane />}
        {activePane === 'search' && <SearchPane />}
        {activePane === 'stt' && <SttPane />}
        {activePane === 'llm' && <LlmPane />}
        {activePane === 'system' && <SystemPane />}
      </motion.div>
    </PageFrame>
  )
}
