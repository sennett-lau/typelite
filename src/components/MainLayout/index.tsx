import { Home, Settings, BookOpen, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useRoute, type Route } from '../../lib/router'
import { useAppStore } from '../../stores/appStore'
import {
  activeAiPreset,
  activeSpeechPreset,
  endpointState,
  type EndpointState,
} from '../../lib/connectionStatus'
import { BrandMark } from '../ui/BrandMark'
import { AccessibilityBanner } from './AccessibilityBanner'

interface NavItem {
  id: Route
  labelKey: string
  icon: typeof Home
}

const baseNavItems: NavItem[] = [
  { id: 'home', labelKey: 'nav.home', icon: Home },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
  { id: 'dictionary', labelKey: 'nav.dictionary', icon: BookOpen },
]

/** Pinned to the bottom of the sidebar, apart from the main tabs. */
const bottomNavItem: NavItem = { id: 'about', labelKey: 'nav.about', icon: Info }

interface Props {
  children: React.ReactNode
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: (id: Route) => void
}) {
  const { t } = useTranslation()
  const { id, labelKey, icon: Icon } = item
  const label = t(labelKey)
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="nav-item"
    >
      <Icon size={15} strokeWidth={2} />
      {label}
    </button>
  )
}

function StatusLine({ label, state }: { label: string; state: EndpointState }) {
  const { t } = useTranslation()
  const stateText = t(`status.${state}`)
  return (
    <div className="flex min-w-0 items-center gap-[7px]" title={`${label} — ${stateText}`}>
      <span className="status-dot" data-state={state} aria-hidden="true" />
      <span className="truncate">{label}</span>
      <span className="sr-only">{stateText}</span>
    </div>
  )
}

/**
 * Speech and AI status: the active preset names, with a green dot after a working Test or
 * dictation, a red dot after a failure, and a grey dot until either has happened.
 */
function ConnectionStatus() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const speechHealth = useAppStore((s) => s.speechHealth)
  const aiHealth = useAppStore((s) => s.aiHealth)
  const speech = activeSpeechPreset(config)
  const ai = activeAiPreset(config)

  return (
    <div
      role="group"
      aria-label={t('status.label')}
      data-testid="connection-status"
      className="mx-1 mt-2 mb-1.5 flex flex-col gap-1.5 border-t border-hairline px-1.5 pt-2.5 pb-1 text-[11.5px] text-text-secondary"
    >
      <StatusLine
        label={`${t('status.speech')} · ${speech.name || t('presets.unnamed')}`}
        state={endpointState(speechHealth, speech.id)}
      />
      <StatusLine
        label={`${t('status.ai')} · ${ai.name || t('presets.unnamed')}`}
        state={endpointState(aiHealth, ai.id)}
      />
    </div>
  )
}

export function MainLayout({ children }: Props) {
  const { route, navigate } = useRoute()
  const { t } = useTranslation()

  return (
    <div className="app-window flex h-full w-full">
      {/* No title bar (plan `glass-main-window`): this strip drags the window. macOS draws the
          window buttons over the sidebar's top padding. */}
      <div className="drag-strip" data-tauri-drag-region aria-hidden="true" />

      <aside className="sidebar flex w-[208px] shrink-0 flex-col px-2.5 pt-11 pb-3">
        <div className="flex items-center gap-[9px] px-2 pb-3.5 text-[15px] font-semibold tracking-[-0.01em]">
          <span className="text-accent">
            <BrandMark size={22} />
          </span>
          {t('app.name')}
        </div>

        <nav className="flex flex-col gap-0.5" aria-label={t('nav.mainNavigation')}>
          {baseNavItems.map((item) => (
            <NavButton key={item.id} item={item} active={route === item.id} onSelect={navigate} />
          ))}
        </nav>

        <div className="flex-1" />
        <ConnectionStatus />
        <NavButton item={bottomNavItem} active={route === bottomNavItem.id} onSelect={navigate} />
      </aside>

      <main className="content-surface flex min-w-0 flex-1 flex-col">
        {/* Keeps page content below the drag strip. */}
        <div className="h-7 flex-none" aria-hidden="true" />
        <AccessibilityBanner />
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  )
}
