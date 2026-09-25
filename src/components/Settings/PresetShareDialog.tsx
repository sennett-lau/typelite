import { useEffect, type ReactNode } from 'react'

interface PresetShareDialogProps {
  title: string
  subtitle?: string
  busy: boolean
  onCancel: () => void
  children: ReactNode
  footer: ReactNode
}

/** The modal frame of the preset Export and Import dialogs (plan 0019). Escape cancels. */
export function PresetShareDialog({
  title,
  subtitle,
  busy,
  onCancel,
  children,
  footer,
}: PresetShareDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
      <div className="fixed inset-0" onClick={busy ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-[440px] dialog"
      >
        <div className="border-b border-hairline px-4 py-3">
          <h3 className="text-[14px] font-medium text-text-primary">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{subtitle}</p>}
        </div>
        <div className="px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 px-4 pb-3">{footer}</div>
      </div>
    </div>
  )
}

interface ChecklistItem {
  key: string
  name: string
  detail: string
  tag?: string
}

interface PresetChecklistProps {
  label: string
  items: ChecklistItem[]
  checked: Set<string>
  disabled?: boolean
  onToggle: (key: string) => void
}

/** A list of presets (name, host) with one checkbox each. */
export function PresetChecklist({
  label,
  items,
  checked,
  disabled,
  onToggle,
}: PresetChecklistProps) {
  return (
    <ul
      aria-label={label}
      className="m-0 max-h-56 list-none overflow-y-auto border-y border-hairline p-0 py-1"
    >
      {items.map((item) => (
        <li key={item.key}>
          <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[12.5px]">
            <input
              type="checkbox"
              checked={checked.has(item.key)}
              disabled={disabled}
              onChange={() => onToggle(item.key)}
              className="accent-[var(--color-accent)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-text-primary">{item.name}</span>
              <span className="block truncate font-mono text-[11px] text-text-tertiary">
                {item.detail}
              </span>
            </span>
            {item.tag && <span className="tag">{item.tag}</span>}
          </label>
        </li>
      ))}
    </ul>
  )
}
