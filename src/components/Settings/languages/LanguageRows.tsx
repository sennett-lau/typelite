import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import {
  MAX_TRANSLATION_TARGETS,
  TARGET_LANGUAGES,
  targetLanguageLabel,
} from '../../../lib/constants'
import type { LibraryStatus } from '../../../lib/tauri'
import {
  languageSettings,
  useAppStore,
  type AppConfig,
  type TranslationConfig,
} from '../../../stores/appStore'
import { Toggle } from '../shared/Toggle'
import { saveTranslationLanguage } from '../translationLanguages'
import { needsUpdateDecision, usePresetDetail } from './languageLibrary'

interface LanguageRowsProps {
  config: AppConfig
  status: LibraryStatus
  /** Changes the language list (order, add, remove): an unsaved Settings edit. */
  onChange: (translation: TranslationConfig) => void
  /** Opens a language's sheet. */
  onEdit: (code: string) => void
}

/**
 * Plan `language-prompt-library`: Settings → AI → Translation as one row per language, in the
 * saved order (the order the Switch language key and the pill follow). Each row: a drag handle,
 * its number, the name with an "Update" tag when a decision is needed, a line saying where its
 * instructions come from, an on/off switch (saved at once, like the sheet), Edit and remove.
 * "+ Add language" is the last row while fewer than three are chosen.
 */
export function LanguageRows({ config, status, onChange, onEdit }: LanguageRowsProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const translation = config.translation
  const targets = translation.targets
  const canRemove = targets.length > 1
  const canAdd = targets.length < MAX_TRANSLATION_TARGETS
  const available = TARGET_LANGUAGES.filter((language) => !targets.includes(language.value))

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= targets.length) return
    const next = [...targets]
    const [code] = next.splice(from, 1)
    next.splice(to, 0, code)
    onChange({ ...translation, targets: next })
  }

  const remove = (code: string) => {
    if (!canRemove) return
    const index = targets.indexOf(code)
    const next = targets.filter((target) => target !== code)
    const activeTarget =
      code === translation.active_target
        ? next[Math.min(index, next.length - 1)]
        : translation.active_target
    onChange({ ...translation, targets: next, active_target: activeTarget })
  }

  const add = (code: string) => {
    setAdding(false)
    if (!code || targets.includes(code) || !canAdd) return
    onChange({ ...translation, targets: [...targets, code] })
    onEdit(code)
  }

  return (
    <div className="language-rows" role="list" aria-label={t('translate.targetsLabel')}>
      {targets.map((code, index) => (
        <LanguageRow
          key={code}
          code={code}
          index={index}
          config={config}
          status={status}
          canRemove={canRemove}
          dragging={dragIndex === index}
          onEdit={() => onEdit(code)}
          onRemove={() => remove(code)}
          onMove={(to) => move(index, to)}
          onDragStart={() => setDragIndex(index)}
          onDragEnd={() => setDragIndex(null)}
          onDrop={() => {
            if (dragIndex !== null) move(dragIndex, index)
            setDragIndex(null)
          }}
        />
      ))}
      {canAdd &&
        (adding ? (
          <div className="language-add-row">
            <select
              autoFocus
              defaultValue=""
              aria-label={t('translate.addLanguage')}
              onChange={(event) => add(event.target.value)}
              onBlur={() => setAdding(false)}
              className="popup"
            >
              <option value="" disabled>
                {t('translate.chooseLanguage')}
              </option>
              {available.map((language) => (
                <option key={language.value} value={language.value}>
                  {targetLanguageLabel(language.value, t)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="language-add-row">
            <Plus size={13} aria-hidden="true" />
            {t('translate.addLanguage')}
            <span className="language-add-limit">
              {t('translate.language.upTo', { count: MAX_TRANSLATION_TARGETS })}
            </span>
          </button>
        ))}
    </div>
  )
}

interface LanguageRowProps {
  code: string
  index: number
  config: AppConfig
  status: LibraryStatus
  canRemove: boolean
  dragging: boolean
  onEdit: () => void
  onRemove: () => void
  onMove: (to: number) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
}

function LanguageRow({
  code,
  index,
  config,
  status,
  canRemove,
  dragging,
  onEdit,
  onRemove,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
}: LanguageRowProps) {
  const { t } = useTranslation()
  const settings = languageSettings(config, code)
  const name = targetLanguageLabel(code, t)
  const { detail, missing } = usePresetDetail(code, settings.library_preset)
  const presetName = detail?.name ?? settings.library_preset?.id ?? ''
  const needsDecision = needsUpdateDecision(settings, status)
  const [saving, setSaving] = useState(false)

  const source = (() => {
    if (!settings.enabled) return t('translate.language.sourceOff')
    const preset = settings.library_preset
    if (preset && settings.instructions !== null)
      return t('translate.language.sourceEdited', { name: presetName })
    if (settings.instructions !== null) return t('translate.language.sourceBuiltinEdited')
    if (preset && missing)
      return t('translate.language.sourceMissing', { name: presetName, version: preset.version })
    if (preset)
      return t(
        settings.auto_update
          ? 'translate.language.sourcePresetAuto'
          : 'translate.language.sourcePreset',
        { name: presetName, version: preset.version },
      )
    return t('translate.language.sourceBuiltin')
  })()

  const toggle = async (enabled: boolean) => {
    if (saving) return
    setSaving(true)
    try {
      const stored = useAppStore.getState().savedConfig ?? useAppStore.getState().config
      await saveTranslationLanguage(code, { ...languageSettings(stored, code), enabled })
    } catch (error) {
      console.error('[settings] failed to save the language switch', error)
    } finally {
      setSaving(false)
    }
  }

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onMove(index - 1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      onMove(index + 1)
    }
  }

  return (
    <div
      role="listitem"
      data-testid={`language-row-${code}`}
      className={`language-row ${settings.enabled ? '' : 'language-row-off'} ${dragging ? 'language-row-dragging' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
    >
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer?.setData('text/plain', code)
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        onKeyDown={onHandleKey}
        aria-label={t('translate.language.moveLabel', { language: name })}
        title={t('translate.language.dragHint')}
        className="language-grip"
      >
        ⋮⋮
      </button>
      <span className="language-number" aria-hidden="true">
        {index + 1}
      </span>
      <div className="language-info">
        <span className="language-name">
          <span className="truncate">{name}</span>
          {needsDecision && <span className="tag">{t('translate.language.updateTag')}</span>}
        </span>
        <span className="language-source">{source}</span>
      </div>
      <div className="language-actions">
        <Toggle
          checked={settings.enabled}
          disabled={saving}
          onChange={toggle}
          label={t('translate.language.switchLabel', { language: name })}
          hideLabel
        />
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('translate.language.editLabel', { language: name })}
          className="btn-secondary px-2.5 py-1 text-[12px]"
        >
          {t('translate.language.edit')}
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${t('translate.remove')} ${name}`}
            title={t('translate.remove')}
            className="btn-icon"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
