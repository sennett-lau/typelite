// Plan `language-evals`: aggregates scored cases, compares with a baseline and writes Markdown.

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
const pct = (value) => (value === undefined || value === null ? '–' : `${Math.round(value * 100)}%`)
const signed = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}`

/** Per-language and per-tag pass rates and errors, plus failed-check counts. */
export function summarise(cases) {
  const byLang = {}
  const byTag = {}
  const checks = {}
  for (const c of cases) {
    const lang = (byLang[c.lang] ??= { cases: 0, pass: [], error: [] })
    lang.cases += 1
    lang.pass.push(c.pass_rate)
    lang.error.push(c.mean_error)
    for (const tag of c.tags) {
      const entry = ((byTag[tag] ??= {})[c.lang] ??= { cases: 0, pass: [] })
      entry.cases += 1
      entry.pass.push(c.pass_rate)
    }
    for (const sample of c.samples) {
      for (const [name] of sample.failed ?? []) {
        const entry = ((checks[name] ??= {})[c.lang] ??= 0)
        checks[name][c.lang] = entry + 1
      }
    }
  }
  const finish = (entry) => ({
    cases: entry.cases,
    pass_rate: mean(entry.pass),
    ...(entry.error ? { mean_error: mean(entry.error) } : {}),
  })
  return {
    overall: { cases: cases.length, pass_rate: mean(cases.map((c) => c.pass_rate)) },
    languages: Object.fromEntries(Object.entries(byLang).map(([k, v]) => [k, finish(v)])),
    tags: Object.fromEntries(
      Object.entries(byTag).map(([tag, langs]) => [
        tag,
        Object.fromEntries(Object.entries(langs).map(([k, v]) => [k, finish(v)])),
      ]),
    ),
    failed_checks: checks,
  }
}

/** Differences from a baseline: per case and per language. A drop of 25 points is a regression. */
export function compare(results, baseline, threshold = 0.25) {
  if (!baseline) return null
  const regressions = []
  const improvements = []
  for (const c of results.cases) {
    const before = baseline.cases?.[c.id]
    if (!before) continue
    const delta = c.pass_rate - before.pass_rate
    const row = { id: c.id, lang: c.lang, before: before.pass_rate, after: c.pass_rate, delta }
    if (delta <= -threshold) regressions.push(row)
    else if (delta >= threshold) improvements.push(row)
  }
  const languages = {}
  for (const [lang, now] of Object.entries(results.summary.languages)) {
    const ids = results.cases.filter((c) => c.lang === lang && baseline.cases?.[c.id])
    if (!ids.length) continue
    const before = mean(ids.map((c) => baseline.cases[c.id].pass_rate))
    const after = mean(ids.map((c) => c.pass_rate))
    languages[lang] = {
      compared: ids.length,
      before,
      after,
      delta: after - before,
      now: now.pass_rate,
    }
  }
  return { baseline: baseline.model, regressions, improvements, languages }
}

/** The compact form saved in evals/baselines/: rates and the first answer per case. */
export function toBaseline(results, previous) {
  const cases = { ...(previous?.cases ?? {}) }
  for (const c of results.cases) {
    cases[c.id] = {
      pass_rate: Number(c.pass_rate.toFixed(3)),
      error: Number(c.mean_error.toFixed(3)),
      output: c.samples[0]?.output ?? null,
    }
  }
  return {
    kind: results.kind,
    model: results.model,
    updated: results.created.slice(0, 10),
    git_rev: results.git_rev,
    prompt_sha256: results.prompt_sha256,
    samples: results.settings.n,
    settings: results.settings,
    cases: Object.fromEntries(Object.entries(cases).sort(([a], [b]) => a.localeCompare(b))),
  }
}

const cell = (text) =>
  String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '⏎')

/** The Markdown summary an agent reads first. */
export function markdown(results, comparison) {
  const s = results.summary
  const langs = Object.keys(s.languages).sort()
  const lines = []
  lines.push(`# ${results.kind === 'polish' ? 'Polish' : 'Speech'} evaluation`, '')
  lines.push(
    `Model \`${results.model}\`, split \`${results.settings.split}\`, ${results.settings.n} sample(s) per case, ` +
      `git \`${results.git_rev}\`, ${results.created}.`,
    '',
  )
  lines.push(
    `Overall pass rate: **${pct(s.overall.pass_rate)}** over ${s.overall.cases} cases.`,
    '',
  )
  lines.push('| Language | Cases | Pass rate | Mean error |', '|---|---|---|---|')
  for (const lang of langs) {
    const l = s.languages[lang]
    lines.push(`| ${lang} | ${l.cases} | ${pct(l.pass_rate)} | ${pct(l.mean_error)} |`)
  }
  lines.push(
    '',
    '## By tag',
    '',
    `| Tag | ${langs.join(' | ')} |`,
    `|---|${langs.map(() => '---').join('|')}|`,
  )
  for (const tag of Object.keys(s.tags).sort()) {
    const row = langs.map((lang) => {
      const t = s.tags[tag][lang]
      return t ? `${pct(t.pass_rate)} (${t.cases})` : ''
    })
    lines.push(`| ${tag} | ${row.join(' | ')} |`)
  }
  lines.push(
    '',
    '## Failed checks (samples)',
    '',
    `| Check | ${langs.join(' | ')} |`,
    `|---|${langs.map(() => '---').join('|')}|`,
  )
  for (const name of Object.keys(s.failed_checks).sort()) {
    lines.push(
      `| ${name} | ${langs.map((lang) => s.failed_checks[name][lang] ?? '').join(' | ')} |`,
    )
  }
  if (comparison) {
    lines.push('', `## Against baseline \`${comparison.baseline}\``, '')
    lines.push('| Language | Compared | Before | After | Change |', '|---|---|---|---|---|')
    for (const [lang, l] of Object.entries(comparison.languages)) {
      lines.push(
        `| ${lang} | ${l.compared} | ${pct(l.before)} | ${pct(l.after)} | ${signed(l.delta)} |`,
      )
    }
    const list = (title, rows) => {
      lines.push('', `### ${title} (${rows.length})`, '')
      for (const r of rows) lines.push(`- \`${r.id}\` ${pct(r.before)} → ${pct(r.after)}`)
    }
    list('Regressions', comparison.regressions)
    list('Improvements', comparison.improvements)
  }
  const failing = results.cases.filter((c) => c.pass_rate < 1)
  lines.push('', `## Cases that failed at least once (${failing.length})`, '')
  for (const c of failing) {
    const sample = c.samples.find((x) => !x.pass) ?? c.samples[0]
    const why =
      (sample.failed ?? []).map(([n, d]) => `${n}: ${d}`).join('; ') || sample.error_message
    lines.push(`### \`${c.id}\` ${pct(c.pass_rate)} [${c.tags.join(', ')}]`, '')
    lines.push(`- input: \`${cell(c.input)}\``)
    lines.push(`- expected: \`${cell(c.expected)}\``)
    lines.push(`- got: \`${cell(sample.output)}\``)
    lines.push(`- why: ${cell(why)}`, '')
  }
  return lines.join('\n') + '\n'
}
