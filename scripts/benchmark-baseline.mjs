#!/usr/bin/env node
// Propose the rolling baseline from an archived report, or check generated files in CI.
import assert from 'node:assert/strict'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docs = join(root, 'docs/benchmarks')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * fraction)]
}
const finiteNonnegative = (value) => Number.isFinite(value) && value >= 0
const nonnegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0

function validateOptionalMetrics(run) {
  if (run.trajectory_sha256 !== undefined) {
    assert.match(run.trajectory_sha256, /^[a-f0-9]{64}$/, `Invalid trajectory: ${run.id}`)
  }
  if (run.rows_sha256 !== undefined) {
    assert.match(run.rows_sha256, /^[a-f0-9]{64}$/, `Invalid row snapshot: ${run.id}`)
  }
  if (run.final_input_values !== undefined) {
    assert(Array.isArray(run.final_input_values), `Invalid input values: ${run.id}`)
    assert(run.final_input_values.every((value) => typeof value === 'string'))
    assert(nonnegativeInteger(run.workload.fields) && run.workload.fields > 0)
    assert.equal(
      run.final_input_values.length,
      run.workload.fields,
      `Incomplete input values: ${run.id}`,
    )
  }
  if (run.row_label_calls_per_batch !== undefined || run.row_evaluations_per_batch !== undefined) {
    const callsPerRow = run.workload.label_calls_per_row
    assert(
      nonnegativeInteger(callsPerRow) && callsPerRow > 0,
      `Invalid label calls per row: ${run.id}`,
    )
    for (const key of ['row_label_calls_per_batch', 'row_evaluations_per_batch']) {
      assert(Array.isArray(run[key]), `Missing ${key}: ${run.id}`)
      assert.equal(run[key].length, run.samples_us.length, `Incomplete ${key}: ${run.id}`)
      assert(run[key].every(nonnegativeInteger), `Invalid ${key}: ${run.id}`)
    }
    assert(
      run.row_label_calls_per_batch.every(
        (calls, index) => calls === run.row_evaluations_per_batch[index] * callsPerRow,
      ),
      `Row evaluations do not match label calls: ${run.id}`,
    )
  }
  if (run.voice_activity !== undefined) {
    const activity = run.voice_activity
    assert(
      activity &&
        nonnegativeInteger(activity.duration_ms) &&
        nonnegativeInteger(activity.voiced_ms),
    )
    assert(Number.isFinite(activity.peak_db) && Number.isFinite(activity.noise_floor_db))
    assert.equal(typeof activity.has_speech, 'boolean')
  }
  if (run.style_writes_per_batch !== undefined) {
    assert(Array.isArray(run.style_writes_per_batch), `Invalid style writes: ${run.id}`)
    assert.equal(run.style_writes_per_batch.length, run.samples_us.length)
    assert(
      run.style_writes_per_batch.every(
        (counts) =>
          counts && nonnegativeInteger(counts.transform) && nonnegativeInteger(counts.opacity),
      ),
      `Invalid style-write counts: ${run.id}`,
    )
  }
  if (run.allocations_per_operation !== undefined) {
    for (const key of [
      'calls_including_realloc',
      'requested_bytes_including_realloc',
      'peak_live_requested_bytes',
    ]) {
      assert(
        nonnegativeInteger(run.allocations_per_operation?.[key]),
        `Invalid allocation ${key}: ${run.id}`,
      )
    }
  }
}

function assertSameOutput(actual, expected) {
  for (const key of ['trajectory_sha256', 'voice_activity', 'rows_sha256', 'final_input_values']) {
    assert.deepEqual(actual[key], expected[key], `Deterministic ${key} changed: ${actual.id}`)
  }
  for (const key of [
    'style_writes_per_batch',
    'allocations_per_operation',
    'row_label_calls_per_batch',
    'row_evaluations_per_batch',
  ]) {
    assert.equal(
      actual[key] !== undefined,
      expected[key] !== undefined,
      `Metric ${key} missing: ${actual.id}`,
    )
  }
}

function validateSnapshot(snapshot) {
  assert.equal(snapshot.schema, 1, 'Unsupported benchmark schema')
  assert(Number.isFinite(Date.parse(snapshot.timestamp)), 'Missing or invalid measurement time')
  assert.match(snapshot.revision, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'Invalid Git revision')
  assert.equal(typeof snapshot.git_status, 'string', 'Working-tree status is required')
  for (const key of ['os', 'arch', 'cpu', 'node', 'rustc', 'rust_profile']) {
    assert(
      typeof snapshot.environment?.[key] === 'string' && snapshot.environment[key].length > 0,
      `Missing environment ${key}`,
    )
  }
  for (const key of ['logical_cpus', 'memory_bytes']) {
    assert(
      Number.isInteger(snapshot.environment[key]) && snapshot.environment[key] > 0,
      `Invalid environment ${key}`,
    )
  }
  assert(
    Number.isInteger(snapshot.process_runs) && snapshot.process_runs >= 3,
    'A baseline needs at least three process runs',
  )
  for (const key of [
    'source_sha256',
    'harness_sha256',
    'dependencies_sha256',
    'build_config_sha256',
  ]) {
    assert.match(snapshot[key], /^[a-f0-9]{64}$/, `Missing or invalid ${key}`)
  }
  assert(Array.isArray(snapshot.benchmarks) && snapshot.benchmarks.length > 0, 'No workloads')
  const ids = new Set()
  for (const row of snapshot.benchmarks) {
    assert(typeof row.id === 'string' && !ids.has(row.id), 'Missing or duplicate workload ID')
    ids.add(row.id)
    assert(['us/batch', 'us/op'].includes(row.unit), `Unsupported unit: ${row.unit}`)
    assert(
      Number.isInteger(row.workload.samples) && row.workload.samples >= 15,
      'A baseline needs at least 15 samples per process',
    )
    assert(Number.isInteger(row.workload.warmups) && row.workload.warmups > 0, 'Warmup is required')
    assert.equal(row.runs.length, snapshot.process_runs, `Incomplete runs: ${row.id}`)
    const processes = new Set()
    for (const run of row.runs) {
      assert(
        Number.isInteger(run.process_run) &&
          run.process_run >= 1 &&
          run.process_run <= snapshot.process_runs &&
          !processes.has(run.process_run),
        'Invalid or repeated process run',
      )
      processes.add(run.process_run)
      assert.equal(run.id, row.id)
      assert.equal(run.unit, row.unit)
      assert.deepEqual(run.workload, row.workload)
      assert.equal(run.samples_us.length, row.workload.samples, `Incomplete samples: ${row.id}`)
      assert(run.samples_us.every(finiteNonnegative), `Invalid samples: ${row.id}`)
      if (run.renders_per_batch !== undefined) {
        assert.equal(run.renders_per_batch.length, run.samples_us.length)
        assert(run.renders_per_batch.every((value) => Number.isInteger(value) && value >= 0))
      }
      validateOptionalMetrics(run)
      assertSameOutput(run, row.runs[0])
    }
    const samples = row.runs.flatMap((run) => run.samples_us)
    assert.equal(
      row.median_us,
      percentile(
        row.runs.map((run) => percentile(run.samples_us, 0.5)),
        0.5,
      ),
      `Stale median: ${row.id}`,
    )
    assert.equal(row.p10_us, percentile(samples, 0.1), `Stale p10: ${row.id}`)
    assert.equal(row.p90_us, percentile(samples, 0.9), `Stale p90: ${row.id}`)
  }
}

function loadReport(path) {
  const archive = realpathSync(path)
  const slug = relative(realpathSync(join(docs, 'reports')), archive)
  assert.match(
    slug,
    /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use a dated report directory directly under docs/benchmarks/reports',
  )
  assert(readFileSync(join(archive, 'README.md'), 'utf8').trim(), 'Report README is required')
  const before = readJson(join(archive, 'before.json'))
  const after = readJson(join(archive, 'after.json'))
  validateSnapshot(before)
  validateSnapshot(after)
  for (const key of [
    'schema',
    'harness_sha256',
    'dependencies_sha256',
    'build_config_sha256',
    'environment',
    'process_runs',
  ]) {
    assert.deepEqual(
      after[key],
      before[key],
      `Before/after ${key} differ; measure both versions under the same setup`,
    )
  }
  assert.deepEqual(
    after.benchmarks.map((row) => row.id).sort(),
    before.benchmarks.map((row) => row.id).sort(),
    'Before/after workload sets differ',
  )
  for (const row of after.benchmarks) {
    const previous = before.benchmarks.find((entry) => entry.id === row.id)
    assert(previous, `Workload added without a before measurement: ${row.id}`)
    assert.equal(row.unit, previous.unit)
    assert.deepEqual(row.workload, previous.workload, `Workload changed: ${row.id}`)
    assertSameOutput(row.runs[0], previous.runs[0])
  }
  return { ...after, baseline_report: `reports/${slug}` }
}

function countRange(values) {
  if (values.length === 0) return '—'
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  return minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
}

function renderAdditionalMetrics(snapshot) {
  const sections = []
  const dictionary = snapshot.benchmarks.filter(
    (row) => row.runs[0].row_evaluations_per_batch !== undefined,
  )
  if (dictionary.length > 0) {
    const rows = dictionary.map((row) => {
      const calls = row.runs.flatMap((run) => run.row_label_calls_per_batch)
      const evaluations = row.runs.flatMap((run) => run.row_evaluations_per_batch)
      const digest = row.runs[0].rows_sha256
      const values = row.runs[0].final_input_values
      const inputs = values === undefined ? '—' : JSON.stringify(values).replaceAll('|', '\\|')
      return `| \`${row.id}\` | ${countRange(calls)} | ${countRange(evaluations)} | ${digest ? `\`${digest}\`` : '—'} | ${inputs} |`
    })
    sections.push(`## Dictionary typing work and output

Row evaluations are inferred from row-label translation calls using each workload's
validated calls-per-row ratio. Counts exclude mounting, input resets and section switches;
ranges span measured batches. Row snapshot hashes and final input values must match across
process runs and before/after versions.

| Workload | Row-label calls/batch | Inferred row evaluations/batch | Rows SHA-256 | Final input values |
|---|---:|---:|---|---|
${rows.join('\n')}`)
  }
  const waveform = snapshot.benchmarks.filter(
    (row) =>
      row.runs[0].trajectory_sha256 !== undefined ||
      row.runs[0].style_writes_per_batch !== undefined,
  )
  if (waveform.length > 0) {
    const rows = waveform.map((row) => {
      const counts = row.runs.flatMap((run) => run.style_writes_per_batch ?? [])
      const trajectory = row.runs[0].trajectory_sha256
      return `| \`${row.id}\` | ${countRange(counts.map((count) => count.transform))} | ${countRange(counts.map((count) => count.opacity))} | ${trajectory ? `\`${trajectory}\`` : '—'} |`
    })
    sections.push(`## Animation work and output

Setter counts exclude mounting and initial-frame setup; ranges span measured batches.
Trajectory hashes cover every observed frame in an untimed pass and must match across
process runs and before/after versions.

| Workload | Transform writes/batch | Opacity writes/batch | Trajectory SHA-256 |
|---|---:|---:|---|
${rows.join('\n')}`)
  }
  const voices = snapshot.benchmarks.filter((row) => row.runs[0].voice_activity !== undefined)
  if (voices.length > 0) {
    const rows = voices.map((row) => {
      const activity = row.runs[0].voice_activity
      return `| \`${row.id}\` | ${activity.duration_ms} | ${activity.peak_db.toFixed(3)} | ${activity.noise_floor_db.toFixed(3)} | ${activity.voiced_ms} | ${activity.has_speech ? 'yes' : 'no'} |`
    })
    sections.push(`## Voice-check output

All measured fields must match exactly across process runs and before/after versions.
Levels are rounded here for readability; the raw data retains their full precision.

| Workload | Duration (ms) | Peak (dBFS) | Noise floor (dBFS) | Voiced (ms) | Speech |
|---|---:|---:|---:|---:|---|
${rows.join('\n')}`)
  }
  const allocations = snapshot.benchmarks.filter(
    (row) => row.runs[0].allocations_per_operation !== undefined,
  )
  if (allocations.length > 0) {
    const rows = allocations.map((row) => {
      const measured = row.runs.map((run) => run.allocations_per_operation)
      return `| \`${row.id}\` | ${countRange(measured.map((value) => value.calls_including_realloc))} | ${countRange(measured.map((value) => value.requested_bytes_including_realloc))} | ${countRange(measured.map((value) => value.peak_live_requested_bytes))} |`
    })
    sections.push(`## Requested allocations

An untimed operation per process counts allocation/reallocation calls and requested bytes;
ranges span processes. These are allocator requests, not process RSS or physical memory.
Allocation metrics may change between versions while measured outputs remain identical.

| Workload | Calls/op (including realloc) | Requested bytes/op (including realloc) | Peak live requested bytes/op |
|---|---:|---:|---:|
${rows.join('\n')}`)
  }
  return sections.length > 0 ? `\n\n${sections.join('\n\n')}` : ''
}

function renderBaseline(snapshot) {
  const report = snapshot.baseline_report
  const environment = snapshot.environment
  const rows = snapshot.benchmarks.map((row) => {
    const scale = row.median_us >= 1000 ? 1000 : 1
    const unit = row.unit.replace('us', scale === 1000 ? 'ms' : 'µs')
    const format = (value) => (value / scale).toFixed(3)
    const counts = row.runs.flatMap((run) => run.renders_per_batch ?? [])
    const renders =
      counts.length === 0
        ? '—'
        : Math.min(...counts) === Math.max(...counts)
          ? String(counts[0])
          : `${Math.min(...counts)}–${Math.max(...counts)}`
    return `| \`${row.id}\` | ${format(row.median_us)} | ${format(row.p10_us)}–${format(row.p90_us)} | ${unit} | ${renders} |`
  })
  return `# Current code-performance baseline

<!-- Generated by scripts/benchmark-baseline.mjs. Promote a new archived report to update. -->

This reference comes from [${report.split('/').at(-1)}](${report}/README.md).
The shared baseline advances when its PR merges; a branch's proposed update is reviewable here.
The [archived after snapshot](${report}/after.json) remains unchanged when later baselines advance.

## Provenance

- Recorded at: ${snapshot.timestamp} (UTC).
- Git HEAD: \`${snapshot.revision}\`; working-tree status is preserved in the raw data.
- Source SHA-256: \`${snapshot.source_sha256}\`.
- Harness SHA-256: \`${snapshot.harness_sha256}\`.
- Machine: ${environment.cpu}, ${environment.arch}, ${environment.logical_cpus} logical CPUs,
  ${environment.memory_bytes / 1024 ** 3} GiB RAM; ${environment.os}.
- Toolchain: Node ${environment.node}; ${environment.rustc}.
- Rust profile: ${environment.rust_profile}.
- Runs: ${snapshot.process_runs} fresh processes per workload. Raw data records each workload's
  warmups and sample count, dependency/build hashes and build environment.

Git HEAD alone does not identify a measured working tree; use the source hash above.
[baseline.json](baseline.json) contains the full snapshot plus a report backlink. It can be passed
to \`npm run bench:local -- --compare docs/benchmarks/baseline.json\` when the environment and
harness still match. Future PRs should also capture a fresh before run on their PR base.

## Metrics

Timings are medians of process medians; p10/p90 span the individual samples. Lower is better.
Units vary by row (1 ms = 1,000 µs). Render counts exclude mounting and resetting the probes.

| Workload | Median | p10–p90 | Unit | Renders/batch |
|---|---:|---:|---|---:|
${rows.join('\n')}${renderAdditionalMetrics(snapshot)}

UI timings use React development mode in jsdom. Stream timings include local HTTP and provider
processing; conversion uses warm OpenCC. See [methodology](methodology.md) and the
[report's limitations](${report}/README.md) before drawing conclusions about real application latency.

To propose the next baseline, follow the [performance PR workflow](README.md#performance-pr-workflow).
Do not edit this generated table or replace the archived measurements.
`
}

function main() {
  const args = process.argv.slice(2)
  assert.equal(
    args.length,
    1,
    'Usage: node scripts/benchmark-baseline.mjs <report-directory> | --check',
  )
  const checking = args[0] === '--check'
  const baselinePath = join(docs, 'baseline.json')
  const reportPath = checking
    ? resolve(docs, readJson(baselinePath).baseline_report)
    : resolve(root, args[0])
  const snapshot = loadReport(reportPath)
  const json = `${JSON.stringify(snapshot, null, 2)}\n`
  const markdown = renderBaseline(snapshot)
  if (checking) {
    assert.equal(
      readFileSync(baselinePath, 'utf8'),
      json,
      'baseline.json differs from its archived after snapshot',
    )
    assert.equal(
      readFileSync(join(docs, 'BASELINE.md'), 'utf8'),
      markdown,
      'BASELINE.md is stale; regenerate it',
    )
    console.log(
      `Baseline is consistent with ${snapshot.baseline_report}; ${snapshot.benchmarks.length} workloads validated.`,
    )
  } else {
    writeFileSync(baselinePath, json)
    writeFileSync(join(docs, 'BASELINE.md'), markdown)
    console.log(
      `Proposed baseline from ${snapshot.baseline_report}. Review and merge with the performance PR.`,
    )
  }
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
