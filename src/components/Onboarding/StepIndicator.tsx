interface Props {
  total: number
  current: number
}

export function StepIndicator({ total, current }: Props) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-[width,background-color] duration-200 ${
            i === current
              ? 'w-4 bg-accent'
              : i < current
                ? 'w-2 bg-accent/40'
                : 'w-2 bg-bg-tertiary'
          }`}
        />
      ))}
    </div>
  )
}
