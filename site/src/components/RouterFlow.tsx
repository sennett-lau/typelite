import { useEffect, useRef, useState } from 'react'

interface Geometry {
  w: number
  h: number
  from: { x: number; y: number }
  to: { x: number; y: number }[]
}

/**
 * The prompt router's flow line: a curve from the transcript to the preset it picked, drawn
 * in, with a few light particles travelling along it. The geometry is measured only on resize
 * and when the route changes; each frame just evaluates the curve. Two-column layout only
 * (hidden by CSS when the cards stack). Decorative.
 */
export function RouterFlow({
  route,
  target,
  u,
  end,
}: {
  /** Index of the current example (re-measure when it changes). */
  route: number
  /** 0, 1 or 2: English, Cantonese, or "no match". */
  target: number
  /** Seconds into the current example. */
  u: number
  /** Length of one example in seconds. */
  end: number
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [geo, setGeo] = useState<Geometry | null>(null)

  useEffect(() => {
    const svg = ref.current
    const root = svg?.parentElement
    if (!svg || !root) return
    const measure = () => {
      const r = root.getBoundingClientRect()
      const from = root.querySelector('.transcript')?.getBoundingClientRect()
      const targets = [0, 1, 2].map((i) =>
        root.querySelector(`[data-route-target="${i}"]`)?.getBoundingClientRect(),
      )
      if (!from || targets.some((t) => !t) || r.width === 0) return
      setGeo({
        w: r.width,
        h: r.height,
        from: { x: from.right - r.left - 6, y: from.top - r.top + from.height / 2 },
        to: targets.map((t) => ({ x: t!.left - r.left + 2, y: t!.top - r.top + t!.height / 2 })),
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [route])

  const draw = Math.min(1, Math.max(0, (u - 1.3) / 0.6))
  const fade = Math.min(1, Math.max(0, (end - 0.25 - u) / 0.35))
  const on = geo && draw > 0 && fade > 0
  const a = geo?.from
  const b = geo?.to[target]
  let path = ''
  const dots: { x: number; y: number; o: number }[] = []
  if (on && a && b) {
    const dx = Math.max(40, (b.x - a.x) * 0.55)
    const c1 = { x: a.x + dx, y: a.y }
    const c2 = { x: b.x - dx, y: b.y }
    path = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`
    const at = (s: number) => {
      const m = 1 - s
      return {
        x: m * m * m * a.x + 3 * m * m * s * c1.x + 3 * m * s * s * c2.x + s * s * s * b.x,
        y: m * m * m * a.y + 3 * m * m * s * c1.y + 3 * m * s * s * c2.y + s * s * s * b.y,
      }
    }
    for (let k = 0; k < 5; k++) {
      const s = ((u - 1.3) * 0.75 + k / 5) % 1
      if (s < 0 || s > draw) continue
      const edge = Math.min(1, s / 0.12, (1 - s) / 0.12)
      dots.push({ ...at(s), o: edge * fade })
    }
  }

  return (
    <svg
      ref={ref}
      className="router-flow"
      aria-hidden="true"
      focusable="false"
      width={geo?.w ?? 0}
      height={geo?.h ?? 0}
      style={{ opacity: on ? fade : 0 }}
    >
      <defs>
        <linearGradient id="router-flow-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--aurora-a)" />
          <stop offset="1" stopColor="var(--aurora-b)" />
        </linearGradient>
      </defs>
      {path && (
        <>
          <path
            d={path}
            className="router-flow-line"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={(1 - draw).toFixed(4)}
          />
          {dots.map((d, k) => (
            <circle key={k} cx={d.x} cy={d.y} r={3.2} opacity={d.o} className="router-flow-dot" />
          ))}
          {draw >= 1 && <circle cx={b!.x} cy={b!.y} r={4} className="router-flow-end" />}
        </>
      )}
    </svg>
  )
}
