#!/usr/bin/env node
// Benchmarks (docs/guides/benchmarks/): times Typelite's own requests against your server with the
// published data in docs/guides/benchmarks/data/, so every row in the Results tables is measured
// the same way.
//
//   node scripts/benchmark.mjs polish --address http://127.0.0.1:8080/v1 --model <model> [--key <key>]
//   node scripts/benchmark.mjs speech --address http://127.0.0.1:8178/v1 --model <model> [--key <key>] [--wav <file>]
//
// polish: for the short and the long English transcript, one warm-up, then 5 timed requests with
// the prompt cached; then 3 with the prompt cache missed (a different first line each time).
// speech: one warm-up, then 5 timed requests with the short clip. Prints medians in seconds.
//
// Plain Node (18 or later), no packages. On macOS the speech clip is made with `say` when --wav is
// not given.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs/guides/benchmarks/data')
const read = (file) => readFileSync(join(DATA, file), 'utf8').trim()

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? process.argv[index + 1] : undefined
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function timed(send) {
  const start = performance.now()
  await send()
  return (performance.now() - start) / 1000
}

async function check(response) {
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.json()
}

async function polish(address, model, headers) {
  const prompt = read('polish-system-prompt.txt')
  const send = (system, transcript) =>
    fetch(`${address}/chat/completions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: transcript },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 512,
      }),
    }).then(check)
  const results = {}
  for (const [name, file] of [
    ['short English', 'polish-short-en.txt'],
    ['long English', 'polish-long-en.txt'],
  ]) {
    const transcript = read(file)
    await send(prompt, transcript)
    const times = []
    for (let i = 0; i < 5; i++) times.push(await timed(() => send(prompt, transcript)))
    results[name] = median(times)
  }
  const transcript = read('polish-short-en.txt')
  const misses = []
  for (let i = 0; i < 3; i++) {
    const system = `Benchmark run ${Date.now()}-${i}.\n${prompt}`
    misses.push(await timed(() => send(system, transcript)))
  }
  results['cache miss, short English'] = median(misses)
  return results
}

async function speech(address, model, headers) {
  let wav = option('wav')
  if (!wav) {
    wav = join(tmpdir(), 'typelite-benchmark-speech.wav')
    const aiff = join(tmpdir(), 'typelite-benchmark-speech.aiff')
    execFileSync('say', ['-v', 'Samantha', '-o', aiff, read('speech-short-en.txt')])
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav])
  }
  if (!existsSync(wav)) throw new Error(`no such file: ${wav}`)
  const audio = readFileSync(wav)
  const send = () => {
    const form = new FormData()
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'recording.wav')
    form.append('model', model)
    return fetch(`${address}/audio/transcriptions`, { method: 'POST', headers, body: form }).then(
      check,
    )
  }
  await send()
  const times = []
  for (let i = 0; i < 5; i++) times.push(await timed(send))
  return { 'short clip': median(times) }
}

async function main() {
  const test = process.argv[2]
  const address = option('address')?.replace(/\/+$/, '')
  const model = option('model')
  if (!['polish', 'speech'].includes(test) || !address || !model) {
    console.error(
      'usage: node scripts/benchmark.mjs polish|speech --address <url> --model <model> [--key <key>]',
    )
    process.exit(2)
  }
  const key = option('key')
  const headers = key ? { Authorization: `Bearer ${key}` } : {}
  const results =
    test === 'polish'
      ? await polish(address, model, headers)
      : await speech(address, model, headers)
  for (const [name, seconds] of Object.entries(results))
    console.log(`${name}: ${seconds.toFixed(2)} s`)
}

main().catch((error) => {
  console.error(`error: ${error.message}`)
  process.exit(1)
})
