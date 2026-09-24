/**
 * macOS System Settings-style grouped rows: a small uppercase label above a rounded group, a
 * hairline between rows, the row label on the left and its control on the right.
 */

interface GroupProps {
  /** Group label, shown above the group and used as the region's accessible name. */
  label?: string
  /** Extra controls placed at the right end of the label line (for example Import / Export). */
  actions?: React.ReactNode
  children: React.ReactNode
  /** No top margin (for groups placed side by side). */
  flush?: boolean
  className?: string
}

export function Group({ label, actions, children, flush = false, className = '' }: GroupProps) {
  return (
    <section aria-label={label} className={`${flush ? '' : 'mt-[22px] first:mt-0'} ${className}`}>
      {(label || actions) && (
        <div className="group-label">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {actions && <span className="flex flex-none items-center gap-1.5">{actions}</span>}
        </div>
      )}
      <div className="row-group">{children}</div>
    </section>
  )
}

interface RowProps {
  /** Row label. Leave empty for a full-width row (lists, add forms). */
  label?: React.ReactNode
  /** Help text in small muted type under the label. */
  help?: React.ReactNode
  /** Connects the label to the control with `<label htmlFor>`. */
  htmlFor?: string
  /**
   * `inline` (default): label left, control right. `wide`: the control grows, for text fields.
   * `stacked`: label on top, control full width below (text areas, lists).
   */
  layout?: 'inline' | 'wide' | 'stacked'
  children?: React.ReactNode
  className?: string
  testId?: string
}

export function Row({
  label,
  help,
  htmlFor,
  layout = 'inline',
  children,
  className = '',
  testId,
}: RowProps) {
  const labelNode =
    label || help ? (
      <div className={`row-label ${layout === 'stacked' ? 'basis-full' : ''}`}>
        {label &&
          (htmlFor ? (
            <label htmlFor={htmlFor} className="cursor-default">
              {label}
            </label>
          ) : (
            <span>{label}</span>
          ))}
        {help && <span className="row-help">{help}</span>}
      </div>
    ) : null

  const controlClass =
    layout === 'inline'
      ? 'flex max-w-full min-w-0 flex-none items-center justify-end gap-2'
      : layout === 'wide'
        ? 'flex min-w-0 flex-[1_1_240px] items-center justify-end gap-2'
        : 'min-w-0 basis-full'

  return (
    <div className={`row ${className}`} data-testid={testId}>
      {labelNode}
      {children !== undefined && children !== null && children !== false && (
        <div className={labelNode ? controlClass : 'min-w-0 flex-1'}>{children}</div>
      )}
    </div>
  )
}
