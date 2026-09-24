interface Props {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  /** Accessible name of the whole control. */
  ariaLabel?: string
  /** `tabs` exposes the control as a tab list (page sections); `buttons` as toggle buttons. */
  variant?: 'buttons' | 'tabs'
  className?: string
}

/** macOS-style segmented control: a tinted track with the selected item raised. */
export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'buttons',
  className = '',
}: Props) {
  const tabs = variant === 'tabs'
  return (
    <div
      role={tabs ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={`segmented ${className}`}
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role={tabs ? 'tab' : undefined}
            aria-selected={tabs ? selected : undefined}
            aria-pressed={tabs ? undefined : selected}
            onClick={() => onChange(opt.value)}
            className="segmented-item"
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
