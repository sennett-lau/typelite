#!/usr/bin/env node
// Plan `language-evals`: the evaluation runner. See evals/README.md and evals/AGENTS.md.
//
//   npm run eval -- check                        validate the dataset (offline; part of docs:check)
//   npm run eval -- polish [options]             run polish cases through the app's polish code
//   npm run eval -- speech [options]             run speech clips through the app's recognition
//   npm run eval -- synth  [--lang yue]          make the synthetic (macOS `say`) clips
//
// Options: --lang en,yue  --split dev|holdout|all  --tag numbers  --id en-011  --n 3
//   --llama-model <gguf>  (built-in AI)    --ai-url <url> --ai-model <name>  (any OpenAI-compatible)
//   --whisper-model <ggml .bin> (built-in speech)  --speech-url <url> --speech-model <name>
//   --languages en,zh-Hant-HK  (the user's language list for polish routing; default: the app's)
//   --baseline <file>|none  --save-baseline  --out <dir>
// TYPELITE_EVAL_* environment variables work as well (see src-tauri/examples/eval_run.rs).
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

import {
  EVALS,
  REPO,
  loadLanguages,
  loadPolish,
  loadSpeech,
  readJsonl,
  validate,
} from './dataset.mjs'
import { compare, markdown, summarise, toBaseline } from './report.mjs'
import { scorePolish, scoreSpeech } from './score.mjs'

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i]
    if (!key.startsWith('--')) throw new Error(`unexpected argument ${key}`)
    const name = key.slice(2)
    if (name === 'save-baseline' || name === 'force') options[name] = true
    else options[name] = rest[++i]
  }
  return { command, options }
}

const list = (value) =>
  value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : undefined
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/\.(gguf|bin)$/, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '')

function git(args) {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

function check() {
  const errors = validate()
  if (errors.length) {
    console.error(`evals: ${errors.length} problem(s) in the dataset:\n- ${errors.join('\n- ')}`)
    process.exit(1)
  }
  const polish = loadPolish({ split: 'all' }).length
  const speech = loadSpeech({ split: 'all' }).length
  console.log(`evals: dataset OK (${polish} polish cases, ${speech} speech clips)`)
}

function synth(options) {
  const clips = loadSpeech({ langs: list(options.lang), split: 'all' }).filter(
    (c) => c.source === 'synthetic-say',
  )
  let made = 0
  for (const clip of clips) {
    if (existsSync(clip.audio_path) && !options.force) continue
    mkdirSync(dirname(clip.audio_path), { recursive: true })
    const result = spawnSync('/usr/bin/say', [
      '-v',
      clip.say_voice,
      '-o',
      clip.audio_path,
      '--file-format=WAVE',
      '--data-format=LEI16@16000',
      clip.say_text ?? clip.text,
    ])
    if (result.status !== 0)
      throw new Error(`say failed for ${clip.id} (voice ${clip.say_voice}; macOS only)`)
    made += 1
  }
  console.log(`evals: ${made} synthetic clip(s) made, ${clips.length - made} already there`)
}

/** Runs the Rust driver (the app's real code) on `rows`; returns its answers. */
function runDriver(mode, rows, env, outDir) {
  const input = join(outDir, `${mode}-input.jsonl`)
  const output = join(outDir, `${mode}-answers.jsonl`)
  writeFileSync(input, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const result = spawnSync(
    'cargo',
    [
      'run',
      '--quiet',
      '--release',
      '--example',
      'eval_run',
      '--',
      mode,
      '--in',
      input,
      '--out',
      output,
    ],
    {
      cwd: join(REPO, 'src-tauri'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
  if (result.status !== 0) throw new Error(`eval_run ${mode} failed (exit ${result.status})`)
  return readJsonl(output).rows
}

function filterCases(rows, options) {
  const tags = list(options.tag)
  const ids = list(options.id)
  return rows.filter(
    (r) => (!tags || r.tags.some((t) => tags.includes(t))) && (!ids || ids.includes(r.id)),
  )
}

function finish(kind, model, cases, settings, options, outDir) {
  const results = {
    kind,
    model,
    created: new Date().toISOString(),
    git_rev: `${git(['rev-parse', '--short', 'HEAD'])}${git(['status', '--porcelain']) ? '+dirty' : ''}`,
    prompt_sha256: createHash('sha256')
      .update(readFileSync(join(REPO, 'src-tauri/src/llm/prompt.rs')))
      .digest('hex'),
    settings,
    cases,
  }
  results.summary = summarise(cases)
  const baselinePath =
    options.baseline && options.baseline !== 'none'
      ? options.baseline
      : join(EVALS, 'baselines', `${kind}-${slug(model)}.json`)
  const baseline =
    options.baseline !== 'none' && existsSync(baselinePath)
      ? JSON.parse(readFileSync(baselinePath, 'utf8'))
      : null
  const comparison = compare(results, baseline)
  results.comparison = comparison
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  const md = markdown(results, comparison)
  writeFileSync(join(outDir, 'summary.md'), md)
  if (options['save-baseline']) {
    writeFileSync(baselinePath, JSON.stringify(toBaseline(results, baseline), null, 2) + '\n')
    console.log(`evals: baseline saved to ${relative(REPO, baselinePath)}`)
  }
  const s = results.summary
  console.log(`\n${kind}: ${Math.round(s.overall.pass_rate * 100)}% over ${s.overall.cases} cases`)
  for (const [lang, l] of Object.entries(s.languages)) {
    console.log(
      `  ${lang}: ${Math.round(l.pass_rate * 100)}% (${l.cases} cases, mean error ${Math.round(l.mean_error * 100)}%)`,
    )
  }
  if (comparison) {
    console.log(
      `  against ${relative(REPO, baselinePath)}: ${comparison.regressions.length} regression(s), ${comparison.improvements.length} improvement(s)`,
    )
  }
  console.log(`evals: wrote ${relative(REPO, join(outDir, 'summary.md'))} and results.json`)
}

function outputDir(kind, options) {
  const dir = options.out
    ? resolve(options.out)
    : join(REPO, 'output', 'evals', `${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function polish(options) {
  const languages = loadLanguages()
  const n = Number(options.n ?? 3)
  const split = options.split ?? 'dev'
  const cases = filterCases(loadPolish({ langs: list(options.lang), split }), options)
  if (!cases.length) throw new Error('no cases match')
  const env = {}
  const llama = options['llama-model'] ?? process.env.TYPELITE_EVAL_LLAMA_MODEL
  if (llama) env.TYPELITE_EVAL_LLAMA_MODEL = resolve(llama)
  // A release build of the driver finds llama-server only next to itself or through this variable.
  const binaries = join(REPO, 'src-tauri', 'binaries')
  const server =
    existsSync(binaries) && readdirSync(binaries).find((f) => f.startsWith('llama-server-'))
  if (llama && server && !process.env.TYPELITE_LLAMA_SERVER)
    env.TYPELITE_LLAMA_SERVER = join(binaries, server)
  if (options['ai-url']) env.TYPELITE_EVAL_AI_URL = options['ai-url']
  if (options['ai-model']) env.TYPELITE_EVAL_AI_MODEL = options['ai-model']
  if (options.languages) env.TYPELITE_EVAL_LANGUAGES = options.languages
  const model = llama
    ? basename(llama)
    : (options['ai-model'] ?? process.env.TYPELITE_EVAL_AI_MODEL ?? 'server')
  const outDir = outputDir('polish', options)
  const rows = cases.flatMap((c) =>
    Array.from({ length: n }, (_, sample) => ({ id: c.id, input: c.input, sample })),
  )
  console.log(`evals: ${cases.length} polish case(s) × ${n} sample(s) with ${model}`)
  const answers = runDriver('polish', rows, env, outDir)
  const scored = cases.map((c) => {
    const samples = answers
      .filter((a) => a.id === c.id)
      .map((a) => {
        if (a.error)
          return { output: '', pass: false, error: 1, failed: [['request', a.error]], ms: a.ms }
        const score = scorePolish(c, a.output, languages[c.lang])
        return { output: a.output, ...score, ms: a.ms, guarded: a.guarded, route: a.route }
      })
    return {
      id: c.id,
      lang: c.lang,
      split: c.split,
      tags: c.tags,
      input: c.input,
      expected: c.expected,
      pass_rate: samples.filter((s) => s.pass).length / Math.max(1, samples.length),
      mean_error: samples.reduce((a, s) => a + s.error, 0) / Math.max(1, samples.length),
      samples,
    }
  })
  const settings = {
    split,
    n,
    langs: list(options.lang) ?? 'all',
    tag: options.tag ?? null,
    languages: options.languages ?? 'app default',
  }
  finish('polish', model, scored, settings, options, outDir)
}

function speech(options) {
  const languages = loadLanguages()
  const split = options.split ?? 'dev'
  const clips = filterCases(loadSpeech({ langs: list(options.lang), split }), options)
  if (!clips.length) throw new Error('no clips match')
  if (clips.some((c) => c.source === 'synthetic-say' && !existsSync(c.audio_path)))
    synth({ lang: options.lang })
  const env = {}
  const whisper = options['whisper-model'] ?? process.env.TYPELITE_EVAL_WHISPER_MODEL
  if (whisper) env.TYPELITE_EVAL_WHISPER_MODEL = resolve(whisper)
  if (options['speech-url']) env.TYPELITE_EVAL_SPEECH_URL = options['speech-url']
  if (options['speech-model']) env.TYPELITE_EVAL_SPEECH_MODEL = options['speech-model']
  const model = whisper
    ? basename(whisper)
    : (options['speech-model'] ?? process.env.TYPELITE_EVAL_SPEECH_MODEL ?? 'server')
  const outDir = outputDir('speech', options)
  console.log(`evals: ${clips.length} speech clip(s) with ${model}`)
  const answers = runDriver(
    'speech',
    clips.map((c) => ({ id: c.id, audio: c.audio_path })),
    env,
    outDir,
  )
  const scored = clips.map((c) => {
    const a = answers.find((x) => x.id === c.id) ?? { error: 'no answer' }
    const sample = a.error
      ? { output: '', pass: false, error: 1, failed: [['request', a.error]] }
      : { output: a.output, ...scoreSpeech(c, a, languages[c.lang]), ms: a.ms }
    return {
      id: c.id,
      lang: c.lang,
      split: c.split,
      tags: c.tags,
      input: c.audio,
      expected: c.text,
      pass_rate: sample.pass ? 1 : 0,
      mean_error: sample.error,
      samples: [sample],
    }
  })
  finish(
    'speech',
    model,
    scored,
    { split, n: 1, langs: list(options.lang) ?? 'all' },
    options,
    outDir,
  )
}

try {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (command === 'check') check()
  else if (command === 'synth') synth(options)
  else if (command === 'polish') {
    check()
    polish(options)
  } else if (command === 'speech') {
    check()
    speech(options)
  } else {
    console.error(
      'usage: npm run eval -- check | polish | speech | synth [options] (see evals/README.md)',
    )
    process.exit(2)
  }
} catch (error) {
  console.error(`evals: ${error.message}`)
  process.exit(1)
}
