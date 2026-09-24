/**
 * The one-colour Typelite mark (`src-tauri/icons/source/typelite-mark.svg`). It draws in
 * `currentColor`, so the parent's text colour (the accent in the sidebar) sets its colour.
 */
export function BrandMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      <g fill="currentColor">
        <rect x="13" y="10" width="20" height="6.5" rx="3.25" />
        <rect x="19.7" y="10" width="6.6" height="44" rx="1.5" />
        <rect x="13" y="47.5" width="20" height="6.5" rx="3.25" />
        <rect x="35.5" y="10" width="15.5" height="44" rx="3.5" opacity="0.55" />
      </g>
    </svg>
  )
}
