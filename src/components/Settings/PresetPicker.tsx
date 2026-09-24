import { useTranslation } from 'react-i18next'
import { Copy, Trash2 } from 'lucide-react'
import { Row } from '../ui/Group'

/** The fields every preset type shares. SpeechPreset and AiPreset both have them. */
export interface BasePreset {
  id: string
  name: string
  builtin: boolean
}

interface Props<T extends BasePreset> {
  presets: T[]
  activeId: string
  /**
   * Called with the new list and the new active id after every change. The parent
   * writes both into the config with `updateConfig`, so the DirtyBar save flow persists them.
   */
  onChange: (presets: T[], activeId: string) => void
  /** Called after "Save as new preset", for example to copy the API key to the new id. */
  onCreated?: (source: T, created: T) => void
}

/**
 * Picks the active preset and manages the list: rename the selected preset, save a copy
 * as a new preset, or delete it. The preset shown in the select is always the active one.
 * Renders two rows for a grouped list.
 */
export function PresetPicker<T extends BasePreset>({
  presets,
  activeId,
  onChange,
  onCreated,
}: Props<T>) {
  const { t } = useTranslation()
  const active = presets.find((preset) => preset.id === activeId) ?? presets[0]
  if (!active) return null

  const handleSelect = (id: string) => {
    onChange(presets, id)
  }

  const handleRename = (name: string) => {
    onChange(
      presets.map((preset) => (preset.id === active.id ? { ...preset, name } : preset)),
      active.id,
    )
  }

  const handleSaveAsNew = () => {
    const created: T = {
      ...active,
      id: crypto.randomUUID(),
      name: t('presets.copyName', { name: active.name }),
      builtin: false,
    }
    onChange([...presets, created], created.id)
    onCreated?.(active, created)
  }

  const handleDelete = () => {
    if (presets.length <= 1) return
    const remaining = presets.filter((preset) => preset.id !== active.id)
    onChange(remaining, remaining[0].id)
  }

  return (
    <>
      <Row label={t('presets.preset')}>
        <select
          aria-label={t('presets.preset')}
          value={active.id}
          onChange={(event) => handleSelect(event.target.value)}
          className="popup w-[260px]"
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name || t('presets.unnamed')}
            </option>
          ))}
        </select>
      </Row>

      <Row
        label={t('presets.name')}
        help={active.builtin ? t('presets.builtinHint') : undefined}
        layout="wide"
      >
        <input
          aria-label={t('presets.name')}
          value={active.name}
          onChange={(event) => handleRename(event.target.value)}
          className="field min-w-0 flex-1"
        />
        <button type="button" onClick={handleSaveAsNew} className="btn-secondary">
          <Copy size={13} />
          {t('presets.saveAsNew')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={presets.length <= 1}
          title={presets.length <= 1 ? t('presets.deleteLastDisabled') : undefined}
          className="btn-secondary"
        >
          <Trash2 size={13} />
          {t('presets.delete')}
        </button>
      </Row>
    </>
  )
}
