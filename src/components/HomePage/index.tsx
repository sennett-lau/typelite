import { ChevronRight, Globe, Mic, MessageSquare, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  displayBinding,
  findActivePreset,
  useAppStore,
  type ShortcutBinding,
} from '../../stores/appStore'
import { settingsPaneHash } from '../../lib/router'
import { TARGET_LANGUAGES } from '../../lib/constants'
import { WHATS_NEW } from '../../lib/whatsNew'
import { PageFrame } from '../PageFrame'
import { Group } from '../ui/Group'
import { startShortcutTour, useShortcutTourAvailable } from '../../lib/shortcutTour'
import { FinishSetup } from './FinishSetup'
import { SpeedBoard } from './SpeedBoard'

type SettingsPane = 'general' | 'stt' | 'llm'

function openSettings(pane: SettingsPane) {
  window.location.hash = settingsPaneHash(pane)
}

/** A binding drawn as key caps: one `<kbd>` per key, in display order. */
function KeyCaps({ binding }: { binding: ShortcutBinding | null }) {
  const { t } = useTranslation()
  if (!binding) {
    return <span className="text-[12px] text-text-tertiary">{t('home.notSet')}</span>
  }
  const keys = displayBinding(binding).split(' + ')
  return (
    <span className="flex flex-none flex-wrap items-center gap-1">
      {keys.map((key, index) => (
        <kbd key={`${key}-${index}`} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  )
}

interface ShortcutItem {
  id: string
  name: string
  description: string
  binding: ShortcutBinding | null
}

/** Tile icon and its per-feature colour token (icon only; the tile itself stays neutral). */
const TILE_LOOK: Record<string, { icon: LucideIcon; color: string }> = {
  dictate: { icon: Mic, color: 'var(--color-feature-dictate)' },
  translate: { icon: Globe, color: 'var(--color-feature-translate)' },
  ask: { icon: MessageSquare, color: 'var(--color-feature-ask)' },
}

function ShortcutTiles() {
  const { t } = useTranslation()
  const hotkeys = useAppStore((s) => s.config.hotkeys)
  const activeTarget = useAppStore(
    (s) => s.config.translation?.active_target ?? s.config.target_lang,
  )
  const targetName =
    TARGET_LANGUAGES.find((language) => language.value === activeTarget)?.label ?? activeTarget

  const tiles: ShortcutItem[] = [
    {
      id: 'dictate',
      name: t('home.shortcuts.dictate'),
      description: t('home.shortcuts.dictateDesc'),
      binding: hotkeys.dictationBindings?.[0] ?? hotkeys.dictation ?? null,
    },
    {
      id: 'translate',
      name: t('home.shortcuts.translate'),
      description: t('home.shortcuts.translateDesc', { language: targetName }),
      binding: hotkeys.translateBindings?.[0] ?? hotkeys.translate ?? null,
    },
    {
      id: 'ask',
      name: t('home.shortcuts.ask'),
      description: t('home.shortcuts.askDesc'),
      binding: hotkeys.askBindings?.[0] ?? hotkeys.ask ?? null,
    },
  ]

  // Secondary features appear only when the user has bound them.
  const extras: ShortcutItem[] = []
  if (hotkeys.editSelection) {
    extras.push({
      id: 'editSelection',
      name: t('home.shortcuts.editSelection'),
      description: t('home.shortcuts.editSelectionDesc'),
      binding: hotkeys.editSelection,
    })
  }
  if (hotkeys.switchScene) {
    extras.push({
      id: 'switchScene',
      name: t('home.shortcuts.switchScene'),
      description: t('home.shortcuts.switchSceneDesc'),
      binding: hotkeys.switchScene,
    })
  }
  if (hotkeys.openApp) {
    extras.push({
      id: 'openApp',
      name: t('home.shortcuts.openApp'),
      description: t('home.shortcuts.openAppDesc'),
      binding: hotkeys.openApp,
    })
  }

  return (
    <section aria-label={t('home.shortcuts.title')}>
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((tile) => {
          const look = TILE_LOOK[tile.id]
          const Icon = look.icon
          return (
            <button
              key={tile.id}
              type="button"
              data-testid={`shortcut-row-${tile.id}`}
              onClick={() => openSettings('general')}
              className="tile"
              style={{ '--tile-color': look.color } as React.CSSProperties}
            >
              <span className="tile-icon" aria-hidden="true">
                <Icon size={15} strokeWidth={2} />
              </span>
              <span className="text-[13.5px] font-semibold">{tile.name}</span>
              <span className="text-[12px] leading-snug text-text-secondary">
                {tile.description}
              </span>
              <span className="mt-auto pt-0.5">
                <KeyCaps binding={tile.binding} />
              </span>
            </button>
          )
        })}
      </div>

      {extras.length > 0 && (
        <div className="row-group mt-2.5">
          {extras.map((row) => (
            <button
              key={row.id}
              type="button"
              data-testid={`shortcut-row-${row.id}`}
              onClick={() => openSettings('general')}
              className="row w-full cursor-pointer border-none bg-transparent text-left"
            >
              <span className="row-label">
                <span>{row.name}</span>
                <span className="row-help truncate">{row.description}</span>
              </span>
              <KeyCaps binding={row.binding} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SetupGroup() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const speechPreset = findActivePreset(config.speech_presets ?? [], config.active_speech_preset_id)
  const aiPreset = findActivePreset(config.ai_presets ?? [], config.active_ai_preset_id)
  const describePreset = (preset?: { name: string; model: string }) =>
    preset ? `${preset.name} · ${preset.model}` : '—'

  const rows: { id: string; label: string; value: string; pane: SettingsPane }[] = [
    {
      id: 'microphone',
      label: t('home.microphone'),
      value: config.input_device || t('mic.systemDefault'),
      pane: 'general',
    },
    {
      id: 'speech',
      label: t('home.sttProvider'),
      value: describePreset(speechPreset),
      pane: 'stt',
    },
    { id: 'ai', label: t('home.llmProvider'), value: describePreset(aiPreset), pane: 'llm' },
    {
      id: 'polish',
      label: t('home.aiPolish'),
      value: config.polish_enabled ? t('home.enabled') : t('home.disabled'),
      pane: 'llm',
    },
    {
      id: 'output',
      label: t('home.outputMode'),
      value:
        config.output_mode === 'clipboard'
          ? t('settings.clipboardPaste')
          : t('settings.keyboardSimulation'),
      pane: 'general',
    },
  ]

  return (
    <Group label={t('home.currentConfig')} flush className="min-w-0">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          data-testid={`config-row-${row.id}`}
          onClick={() => openSettings(row.pane)}
          title={row.value}
          className="row w-full cursor-pointer flex-nowrap border-none bg-transparent text-left"
        >
          <span className="flex-none text-[13px] text-text-primary">{row.label}</span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <span className="mono-value min-w-0 truncate text-right">{row.value}</span>
            <ChevronRight size={12} className="flex-none text-text-tertiary" />
          </span>
        </button>
      ))}
    </Group>
  )
}

function WhatsNew() {
  const { t } = useTranslation()
  return (
    <Group label={t('home.whatsNew')} flush className="min-w-0">
      {WHATS_NEW.map((entry) => (
        <article key={entry.version} aria-label={`v${entry.version}`} className="px-3.5 py-2.5">
          <h4 className="m-0 text-[12.5px] font-semibold text-text-primary">{entry.version}</h4>
          <ul className="mt-1.5 mb-0 list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-text-secondary">
            {entry.changeKeys.map((key) => (
              <li key={key}>{t(`whatsNew.${key}`)}</li>
            ))}
          </ul>
        </article>
      ))}
    </Group>
  )
}

/** A quiet link to the shortcut tour, shown until the tour is done (once both services work). */
function TourLink() {
  const { t } = useTranslation()
  const available = useShortcutTourAvailable()
  if (!available) return null
  return (
    <div className="mt-2 text-right">
      <button
        type="button"
        onClick={startShortcutTour}
        className="cursor-pointer border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
      >
        {t('home.takeTour')}
      </button>
    </div>
  )
}

export function HomePage() {
  const { t } = useTranslation()

  return (
    <PageFrame title={t('home.welcome')} subtitle={t('home.subtitle')}>
      <FinishSetup />
      <ShortcutTiles />
      <TourLink />
      <div className="mt-[22px]">
        <SpeedBoard />
      </div>
      <div className="mt-[22px] grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-3">
        <SetupGroup />
        <WhatsNew />
      </div>
    </PageFrame>
  )
}
