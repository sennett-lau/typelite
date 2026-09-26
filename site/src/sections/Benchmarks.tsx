import { useState } from 'react'
import { IconArrowRight } from '../components/Icons'
import { links } from '../links'

/**
 * Median total time per AI polish request with the prompt cached, from
 * docs/guides/benchmarks.md (Qwen3-4B-Instruct-2507 Q4_K_M, ~1,350-token system prompt).
 */
const ROWS = [
  { input: 'Short English', gpu: 0.11, mac: 0.43 },
  { input: 'Long English', gpu: 0.82, mac: 8.9 },
  { input: 'Cantonese', gpu: 0.27, mac: 2.1 },
  { input: 'Mixed', gpu: 0.18, mac: 1.4 },
  { input: 'Mandarin', gpu: 0.16, mac: 1.3 },
]
const SERIES = [
  { key: 'gpu', label: 'RTX 3080 Ti (Ollama, over the local network)', color: 'var(--f-dictate)' },
  { key: 'mac', label: 'M1 Pro (llama-server, same computer)', color: 'var(--f-ask)' },
] as const
const MAX = 10
const TICKS = [0, 2, 4, 6, 8, 10]

export function Benchmarks() {
  const [tip, setTip] = useState<string | null>(null)
  return (
    <section className="section" id="benchmarks" aria-labelledby="bench-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Benchmarks</span>
          <h2 className="section-title" id="bench-title">
            What to expect on real hardware.
          </h2>
          <p className="section-lead">
            Reference numbers for AI polish on two common machines running the same model, Qwen3 4B
            Instruct (Q4_K_M), with Typelite’s real polish prompt. Measurements, not a
            recommendation.
          </p>
        </div>
        <div className="card bench" data-reveal>
          <figure style={{ margin: 0 }}>
            <figcaption className="caption-label" style={{ marginBottom: 12 }}>
              Median total time per request, prompt cached (seconds)
            </figcaption>
            <ul className="bench-legend">
              {SERIES.map((s) => (
                <li key={s.key}>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
            <div className="bench-chart" aria-hidden="true">
              {ROWS.map((r) => (
                <div className="bench-row" key={r.input}>
                  <span>{r.input}</span>
                  <div className="bench-bars">
                    {SERIES.map((s) => {
                      const v = r[s.key]
                      const id = `${r.input}-${s.key}`
                      return (
                        <div
                          className="bench-bar"
                          key={s.key}
                          onMouseEnter={() => setTip(id)}
                          onMouseLeave={() => setTip(null)}
                        >
                          <i
                            style={{
                              width: `calc((100% - 52px) * ${v / MAX})`,
                              background: s.color,
                            }}
                          />
                          <b>{v} s</b>
                          {tip === id && (
                            <span className="bench-tip">
                              {r.input} · {s.label.split(' (')[0]}: <b>{v} s</b>
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="bench-axis">
                <i />
                <div>
                  {TICKS.map((tick) => (
                    <span key={tick} style={{ left: `calc((100% - 52px) * ${tick / MAX})` }}>
                      {tick}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <details className="bench-table" style={{ marginTop: 18 }}>
              <summary>Show the numbers as a table</summary>
              <div className="table-wrap">
                <table className="small-table">
                  <thead>
                    <tr>
                      <th scope="col">Input</th>
                      <th scope="col">RTX 3080 Ti</th>
                      <th scope="col">M1 Pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r) => (
                      <tr key={r.input}>
                        <th scope="row">{r.input}</th>
                        <td>{r.gpu} s</td>
                        <td>{r.mac} s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </figure>
          <div className="bench-side">
            <dl>
              <div>
                <dt>First token in 0.04–0.08 s</dt>
                <dd>With streaming, on both machines.</dd>
              </div>
              <div>
                <dt>Output length dominates</dt>
                <dd>
                  The long English answer is about 150 tokens; short sentences are well under a
                  second.
                </dd>
              </div>
              <div>
                <dt>Worth knowing</dt>
                <dd>
                  The Apple machine had other apps using its GPU, so its numbers are pessimistic.
                  GPU-machine times include the local network round trip.
                </dd>
              </div>
            </dl>
            <a className="inline-link" href={links.benchmarks}>
              Method, cache misses and cold starts <IconArrowRight size={15} />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
