#!/usr/bin/env node
// Offline local overhead; scripts/benchmark.mjs remains the real-model latency benchmark.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index < 0 ? fallback : args[index + 1]
}
const runs = Number(option('runs', '3'))
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer')
const out = resolve(root, option('out', 'output/benchmarks/local.json'))
const compare = option('compare')
if (compare && resolve(root, compare) === out) {
  throw new Error('--out must differ from --compare to preserve the baseline')
}
const baseline = compare ? JSON.parse(readFileSync(resolve(root, compare), 'utf8')) : null
const run = (file, argv, extra = {}) =>
  execFileSync(file, argv, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...extra })
const hashFiles = (files) => {
  const hash = createHash('sha256')
  for (const file of [...files].sort())
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(join(root, file)))
  return hash.digest('hex')
}
const harnessFiles = [
  'scripts/benchmark-local.mjs',
  'benchmarks/vitest.config.ts',
  'benchmarks/recording.test.tsx',
  'src-tauri/benches/local_performance.rs',
]
const sourceFiles = run('git', [
  'ls-files',
  '--cached',
  '--others',
  '--exclude-standard',
  '-z',
  '--',
  'src',
  'src-tauri/src',
])
  .split('\0')
  .filter(Boolean)
  .filter((file) => existsSync(join(root, file)))
const metadata = {
  schema: 1,
  timestamp: new Date().toISOString(),
  revision: run('git', ['rev-parse', 'HEAD']).trim(),
  git_status: run('git', ['status', '--short']),
  source_sha256: hashFiles(sourceFiles),
  harness_sha256: hashFiles(harnessFiles),
  dependencies_sha256: hashFiles(['package-lock.json', 'src-tauri/Cargo.lock']),
  build_config_sha256: hashFiles([
    'package.json',
    'src-tauri/Cargo.toml',
    'src-tauri/build.rs',
    'rust-toolchain.toml',
    ...run('git', [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '.cargo',
      'src-tauri/.cargo',
    ])
      .split('\0')
      .filter(Boolean)
      .filter((file) => existsSync(join(root, file))),
  ]),
  environment: {
    os: `${platform()} ${release()}`,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    logical_cpus: cpus().length,
    memory_bytes: totalmem(),
    node: process.version,
    rustc: run('rustc', ['--version']).trim(),
    rust_profile: 'release (opt-level=s, thin LTO, 1 codegen unit)',
    build_env: Object.fromEntries(
      Object.entries(process.env)
        .filter(
          ([key]) =>
            [
              'RUSTFLAGS',
              'CARGO_ENCODED_RUSTFLAGS',
              'CARGO_BUILD_TARGET',
              'MACOSX_DEPLOYMENT_TARGET',
            ].includes(key) || key.startsWith('CARGO_PROFILE_'),
        )
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  },
  process_runs: runs,
}
if (baseline) {
  for (const key of ['schema', 'harness_sha256', 'dependencies_sha256', 'build_config_sha256']) {
    if (baseline[key] !== metadata[key]) throw new Error(`Cannot compare: ${key} changed`)
  }
  if (JSON.stringify(baseline.environment) !== JSON.stringify(metadata.environment)) {
    throw new Error('Cannot compare results from different machine/toolchain environments')
  }
}

if (!existsSync(join(root, 'dist/index.html'))) run('npm', ['run', 'build'], { stdio: 'inherit' })
console.log('Building the Rust benchmark with the app release profile (outside timing)…')
const build = run('cargo', [
  'build',
  '--release',
  '--bench',
  'local_performance',
  '--message-format=json',
  '--manifest-path',
  'src-tauri/Cargo.toml',
])
const artifact = build
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .find(
    (entry) =>
      entry.reason === 'compiler-artifact' &&
      entry.target.name === 'local_performance' &&
      entry.executable,
  )
if (!artifact) throw new Error('Rust benchmark executable was not produced')
const executableHash = createHash('sha256').update(readFileSync(artifact.executable)).digest('hex')
const savedExecutable = join(root, 'output/benchmarks/bin', executableHash)
mkdirSync(dirname(savedExecutable), { recursive: true })
copyFileSync(artifact.executable, savedExecutable)
metadata.rust_executable = savedExecutable
metadata.rust_executable_sha256 = executableHash

const scratch = mkdtempSync(join(tmpdir(), 'typelite-bench-'))
const groups = new Map()
try {
  for (let processRun = 0; processRun < runs; processRun++) {
    console.log(`Process run ${processRun + 1}/${runs}: frontend, then Rust (sequential).`)
    const frontendOutput = join(scratch, `frontend-${processRun}.json`)
    run(
      join(root, 'node_modules/.bin/vitest'),
      ['run', '--config', 'benchmarks/vitest.config.ts'],
      {
        env: { ...process.env, TYPELITE_BENCH_OUTPUT: frontendOutput },
      },
    )
    const frontend = JSON.parse(readFileSync(frontendOutput, 'utf8'))
    const rust = JSON.parse(run(savedExecutable, []))
    for (const row of [...frontend, ...rust]) {
      if (!groups.has(row.id))
        groups.set(row.id, { id: row.id, unit: row.unit, workload: row.workload, runs: [] })
      groups.get(row.id).runs.push({ process_run: processRun + 1, ...row })
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * fraction)]
}
const benchmarks = [...groups.values()].map((row) => {
  const samples = row.runs.flatMap((entry) => entry.samples_us)
  return {
    ...row,
    median_us: percentile(
      row.runs.map((entry) => percentile(entry.samples_us, 0.5)),
      0.5,
    ),
    p10_us: percentile(samples, 0.1),
    p90_us: percentile(samples, 0.9),
  }
})
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify({ ...metadata, benchmarks }, null, 2)}\n`)
console.log('\nWorkload | median µs | p10–p90 µs | renders/batch | change')
for (const row of benchmarks) {
  const previous = baseline?.benchmarks.find((entry) => entry.id === row.id)
  if (
    previous &&
    (previous.unit !== row.unit ||
      JSON.stringify(previous.workload) !== JSON.stringify(row.workload))
  ) {
    throw new Error(`Workload changed: ${row.id}`)
  }
  const change = previous ? `${((row.median_us / previous.median_us - 1) * 100).toFixed(1)}%` : '—'
  const renders = row.runs[0].renders_per_batch?.[0] ?? '—'
  console.log(
    `${row.id} | ${row.median_us.toFixed(2)} | ${row.p10_us.toFixed(2)}–${row.p90_us.toFixed(2)} | ${renders} | ${change}`,
  )
}
console.log(`\nRaw samples and environment: ${out}`)
