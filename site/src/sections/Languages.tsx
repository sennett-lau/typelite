import { easeOut, progress } from '../lib/clock'
import { Stage } from '../components/Stage'
import { IconArrowRight, IconLanguages } from '../components/Icons'
import { links } from '../links'
// The community library itself, so the cards always match the repository.
import library from '../../../presets/languages/index.json'

interface Route {
  lang: string
  /** Transcript split into parts; `hint: true` marks a preset's hint word. */
  parts: { text: string; hint?: boolean }[]
  detected: string
  hints: number
  step: 1 | 2 | 3
  target: 'english' | 'cantonese' | null
  why: string
}

const ROUTES: Route[] = [
  {
    lang: 'en',
    parts: [{ text: 'Can you send me the final numbers by Friday?' }],
    detected: 'en',
    hints: 0,
    step: 2,
    target: 'english',
    why: 'No hint words, and speech recognition heard English: the English preset is added.',
  },
  {
    lang: 'yue',
    parts: [
      { text: '我哋' },
      { text: '聽日', hint: true },
      { text: '開會之前，你可' },
      { text: '唔', hint: true },
      { text: '可以check下個deck？' },
    ],
    detected: 'zh',
    hints: 2,
    step: 1,
    target: 'cantonese',
    why: 'Two Cantonese hint words (聽日, 唔): the Cantonese preset is added.',
  },
  {
    lang: 'zh-Hans',
    parts: [{ text: '我们明天开会之前，你能不能检查一下这个文件？' }],
    detected: 'zh',
    hints: 0,
    step: 3,
    target: null,
    why: '“zh” is Mandarin too, and the Cantonese preset needs a hint word, so nothing is added.',
  },
]
const EACH = 5.5

const STEPS = [
  'Hint words a preset carries (嘅, 咗, 唔, 聽日…) pick the language with the most hits.',
  'Otherwise the language speech recognition heard counts, unless the preset needs a hint.',
  'Otherwise nothing is added, and polish works as before.',
]

export function Languages() {
  const presets = library.presets
  return (
    <section className="section" id="languages" aria-labelledby="languages-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Languages</span>
          <h2 className="section-title" id="languages-title">
            Every language writes differently.
          </h2>
          <p className="section-lead">
            Cantonese speakers mix English into almost every sentence; British English spells things
            its own way. Each of your languages can carry its own instructions, a{' '}
            <b>language preset</b>, and a small <b>prompt router</b> adds only the one for the
            language you just spoke.
          </p>
        </div>

        <Stage
          duration={EACH * ROUTES.length}
          restAt={EACH + 3}
          className="router hero-stage"
          label="Animation: three transcripts are routed. English goes to the English preset, Cantonese with hint words goes to the Cantonese preset, and plain Mandarin gets no preset."
        >
          {({ t }) => {
            const i = Math.floor(t / EACH) % ROUTES.length
            const u = t - i * EACH
            const r = ROUTES[i]
            const shown = easeOut(progress(u, 0, 0.5))
            const signals = u >= 0.9
            const decided = u >= 1.9
            return (
              <>
                <div className="card router-input" data-reveal>
                  <h3 className="caption-label">You dictate</h3>
                  <p
                    className="transcript"
                    lang={r.lang}
                    style={{ opacity: shown, transform: `translateY(${(1 - shown) * 6}px)` }}
                  >
                    {r.parts.map((p, k) =>
                      p.hint ? (
                        <mark
                          key={k}
                          className={u >= 1.4 ? 'hint' : undefined}
                          style={{
                            background: u >= 1.4 ? undefined : 'transparent',
                            color: 'inherit',
                          }}
                        >
                          {p.text}
                        </mark>
                      ) : (
                        <span key={k}>{p.text}</span>
                      ),
                    )}
                  </p>
                  <div
                    className="signal-row"
                    style={{ opacity: signals ? 1 : 0.35, transition: 'opacity .3s' }}
                  >
                    <span className="signal">
                      Speech recognition heard <b>{r.detected}</b>
                    </span>
                    <span className="signal">
                      Hint words <b>{u >= 1.4 ? r.hints : '…'}</b>
                    </span>
                  </div>
                  <ol className="router-steps" aria-label="How the router decides">
                    {STEPS.map((s, k) => (
                      <li key={k} className={decided && r.step === k + 1 ? 'on' : undefined}>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="card router-out" data-reveal>
                  <h3>Your languages</h3>
                  <PresetRow
                    name="English"
                    meta={presetMeta('english')}
                    sum="Clear, natural English that keeps your tone, with spelling per region."
                    state={!decided ? 'idle' : r.target === 'english' ? 'chosen' : 'dim'}
                  />
                  <PresetRow
                    name="Chinese (Traditional, Hong Kong)"
                    meta={`${presetMeta('cantonese-hong-kong')} · needs a hint`}
                    sum="Colloquial written Cantonese, with Hong Kong code-mixing kept."
                    state={!decided ? 'idle' : r.target === 'cantonese' ? 'chosen' : 'dim'}
                  />
                  <div className={`no-preset ${decided && r.target === null ? 'chosen' : ''}`}>
                    No match: no language instructions are added.
                  </div>
                  <p
                    className="setup-note"
                    style={{
                      minHeight: '3em',
                      opacity: decided ? 1 : 0,
                      transition: 'opacity .3s',
                    }}
                  >
                    {r.why}
                  </p>
                </div>
              </>
            )
          }}
        </Stage>

        <div style={{ marginTop: 56 }} data-reveal>
          <h3 className="eyebrow" style={{ marginBottom: 6 }}>
            <IconLanguages size={16} /> The community library
          </h3>
          <p className="section-lead" style={{ marginTop: 0, maxWidth: 720 }}>
            Presets are small Markdown files in the repository, written and reviewed by people who
            speak the language. Preview one, use it, edit it: your edits are kept, and updates are
            offered, never forced.
          </p>
        </div>
        <div className="lib-grid">
          {presets.map((p) => (
            <article className="card lib-card" key={p.id} data-reveal>
              <h4>{p.name}</h4>
              <p>{p.summary}</p>
            </article>
          ))}
          <a className="card lib-card contribute" href={links.contributePresets} data-reveal>
            <h4>Your language?</h4>
            <p>If you speak a language well, you can make Typelite write it better.</p>
            <span className="inline-link">
              Contribute a preset <IconArrowRight size={15} />
            </span>
          </a>
        </div>
        <p className="setup-note" style={{ marginTop: 16 }} data-reveal>
          Browse the <a href={links.presetCatalogue}>preset catalogue</a> or read how{' '}
          <a href={links.languages}>languages work</a>.
        </p>
      </div>
    </section>
  )
}

/** "Preset “English” v2 · Official", from the library index. */
function presetMeta(id: string): string {
  const p = library.presets.find((x) => x.id === id)
  if (!p) return ''
  return `Preset “${p.name}” v${p.version} · ${p.tier === 'official' ? 'Official' : 'Community'}`
}

function PresetRow({
  name,
  meta,
  sum,
  state,
}: {
  name: string
  meta: string
  sum: string
  state: 'idle' | 'chosen' | 'dim'
}) {
  return (
    <div className={`preset ${state === 'idle' ? '' : state}`}>
      <div className="preset-top">
        {name}
        {state === 'chosen' && <span className="used-badge">Added</span>}
      </div>
      <span className="preset-meta">{meta}</span>
      <span className="preset-sum">{sum}</span>
    </div>
  )
}
