#!/usr/bin/env node
// Confirm local Rust results using retained binaries; no compilation or frontend work.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, totalmem } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
assert.equal(
  args.length,
  3,
  'Usage: node scripts/benchmark-rust-confirm.mjs before.json after.json out.json',
)
const out = resolve(args[2])
assert(!existsSync(out), `Refusing to overwrite ${out}`)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const variants = ['before', 'after']
const snapshots = Object.fromEntries(
  variants.map((name, index) => {
    const path = realpathSync(resolve(args[index]))
    const bytes = readFileSync(path)
    const report = JSON.parse(bytes)
    assert.equal(report.schema, 1, 'Unsupported snapshot schema')
    for (const key of ['harness_sha256', 'dependencies_sha256', 'build_config_sha256']) {
      assert.match(report[key], /^[a-f0-9]{64}$/, `Invalid snapshot ${key}: ${name}`)
    }
    assert.match(report.rust_executable_sha256, /^[a-f0-9]{64}$/)
    const executable = realpathSync(report.rust_executable)
    assert.equal(
      sha256(readFileSync(executable)),
      report.rust_executable_sha256,
      `Executable hash mismatch: ${name}`,
    )
    // The primary suite reserves ui/ IDs for frontend workloads.
    const rows = report.benchmarks.filter((row) => !row.id.startsWith('ui/'))
    assert(
      rows.length > 0 && new Set(rows.map((row) => row.id)).size === rows.length,
      'Invalid Rust workload set',
    )
    for (const row of rows) {
      assert(row.runs.length > 0, `Missing snapshot runs: ${row.id}`)
      for (const run of row.runs) validateRow(run, row, row.runs[0])
    }
    return [name, { path, sha256: sha256(bytes), report, executable, rows }]
  }),
)
for (const key of ['environment', 'harness_sha256', 'dependencies_sha256', 'build_config_sha256']) {
  assert.deepEqual(
    snapshots.before.report[key],
    snapshots.after.report[key],
    `Snapshot ${key} differs`,
  )
}
const ids = (rows) => rows.map((row) => row.id).sort()
assert.deepEqual(ids(snapshots.before.rows), ids(snapshots.after.rows), 'Rust workload sets differ')
for (const row of snapshots.after.rows) {
  const previous = snapshots.before.rows.find((entry) => entry.id === row.id)
  assert.equal(row.unit, previous.unit)
  assert.deepEqual(row.workload, previous.workload, `Workload changed: ${row.id}`)
  assert.deepEqual(
    row.runs[0].voice_activity,
    previous.runs[0].voice_activity,
    `Voice output changed: ${row.id}`,
  )
}
const machine = {
  os: `${platform()} ${release()}`,
  arch: process.arch,
  cpu: cpus()[0]?.model,
  logical_cpus: cpus().length,
  memory_bytes: totalmem(),
  node: process.version,
}
for (const [key, value] of Object.entries(machine)) {
  assert.equal(value, snapshots.before.report.environment[key], `Current machine ${key} differs`)
}

function validateRow(row, expected, reference) {
  assert.equal(row.id, expected.id)
  assert.equal(row.unit, expected.unit)
  assert.deepEqual(row.workload, expected.workload, `Workload changed: ${row.id}`)
  assert(Number.isSafeInteger(row.workload.samples) && row.workload.samples > 0)
  assert(Array.isArray(row.samples_us), `Missing samples: ${row.id}`)
  assert.equal(row.samples_us.length, row.workload.samples, `Incomplete samples: ${row.id}`)
  assert(
    row.samples_us.every((value) => Number.isFinite(value) && value >= 0),
    `Invalid samples: ${row.id}`,
  )
  for (const key of ['voice_activity', 'allocations_per_operation']) {
    assert.deepEqual(row[key], reference[key], `${key} differs from snapshot: ${row.id}`)
  }
  if (row.voice_activity !== undefined) {
    const value = row.voice_activity
    assert(value && Number.isFinite(value.peak_db) && Number.isFinite(value.noise_floor_db))
    for (const key of ['duration_ms', 'voiced_ms'])
      assert(Number.isSafeInteger(value[key]) && value[key] >= 0)
    assert.equal(typeof value.has_speech, 'boolean')
  }
  if (row.allocations_per_operation !== undefined) {
    for (const key of [
      'calls_including_realloc',
      'requested_bytes_including_realloc',
      'peak_live_requested_bytes',
    ]) {
      const value = row.allocations_per_operation?.[key]
      assert(Number.isSafeInteger(value) && value >= 0, `Invalid allocation ${key}: ${row.id}`)
    }
  }
}

const order = ['before', 'after', 'after', 'before', 'before', 'after']
const runs = order.map((variant, index) => {
  console.log(`Confirmation ${index + 1}/${order.length}: ${variant}`)
  const snapshot = snapshots[variant]
  const rows = JSON.parse(
    execFileSync(snapshot.executable, [], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
  )
  assert(Array.isArray(rows), 'Executable did not return a workload array')
  assert.deepEqual(ids(rows), ids(snapshot.rows), `Executable workload set changed: ${variant}`)
  for (const row of rows) {
    const expected = snapshot.rows.find((entry) => entry.id === row.id)
    validateRow(row, expected, expected.runs[0])
  }
  return { position: index + 1, variant, rows }
})
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]
const benchmarks = snapshots.before.rows.map((row) => {
  const measurements = Object.fromEntries(
    variants.map((variant) => {
      const batches = runs
        .filter((run) => run.variant === variant)
        .map((run) => run.rows.find((entry) => entry.id === row.id).samples_us)
      const process_medians_us = batches.map((samples) => percentile(samples, 0.5))
      return [
        variant,
        {
          process_medians_us,
          median_us: percentile(process_medians_us, 0.5),
          p10_us: percentile(batches.flat(), 0.1),
          p90_us: percentile(batches.flat(), 0.9),
        },
      ]
    }),
  )
  return {
    id: row.id,
    unit: row.unit,
    workload: row.workload,
    ...measurements,
    change_percent:
      measurements.before.median_us === 0
        ? null
        : (measurements.after.median_us / measurements.before.median_us - 1) * 100,
  }
})
const provenance = Object.fromEntries(
  variants.map((name) => {
    const { path, sha256, report, executable } = snapshots[name]
    return [
      name,
      {
        path,
        snapshot_sha256: sha256,
        timestamp: report.timestamp,
        revision: report.revision,
        source_sha256: report.source_sha256,
        executable,
        executable_sha256: report.rust_executable_sha256,
      },
    ]
  }),
)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  `${JSON.stringify(
    {
      schema: 1,
      timestamp: new Date().toISOString(),
      script_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      snapshots: provenance,
      environment: snapshots.before.report.environment,
      execution_machine: machine,
      harness_sha256: snapshots.before.report.harness_sha256,
      dependencies_sha256: snapshots.before.report.dependencies_sha256,
      build_config_sha256: snapshots.before.report.build_config_sha256,
      order,
      runs,
      benchmarks,
    },
    null,
    2,
  )}\n`,
  { flag: 'wx' },
)
console.log('\nRust workload | before median [p10–p90] µs | after median [p10–p90] µs | change')
const format = (value) =>
  `${value.median_us.toFixed(2)} [${value.p10_us.toFixed(2)}–${value.p90_us.toFixed(2)}]`
for (const row of benchmarks)
  console.log(
    `${row.id} | ${format(row.before)} | ${format(row.after)} | ${row.change_percent === null ? 'n/a' : `${row.change_percent.toFixed(1)}%`}`,
  )
console.log(`\nAll raw Rust workloads and provenance: ${out}`)
