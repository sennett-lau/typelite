interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name. Shown next to the switch unless `hideLabel` is set (row layouts). */
  label?: string
  hideLabel?: boolean
  disabled?: boolean
}

/** macOS-style switch, 32 × 19 pt, accent when on. */
export function Toggle({ checked, onChange, label, hideLabel = false, disabled = false }: Props) {
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`switch ${disabled ? 'opacity-50' : ''}`}
    />
  )
  if (!label || hideLabel) return button
  return (
    <label
      className={`flex items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      {button}
      <span className="text-[13px] text-text-primary">{label}</span>
    </label>
  )
}
