interface Props {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  /** Accessible name of the whole control. */
  ariaLabel?: string
  className?: string
}

/**
 * macOS-style segmented control: a tinted track with the selected item raised. Exposed as a
 * group of toggle buttons. (Settings sections use toolbar tabs instead, plan `two-tab-speech`.)
 */
export function SegmentedControl({ options, value, onChange, ariaLabel, className = '' }: Props) {
  return (
    <div role="group" aria-label={ariaLabel} className={`segmented ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="segmented-item"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
