import { describe, expect, it } from 'vitest'
import {
  FALL_TAU_MS,
  LevelHistory,
  RISE_TAU_MS,
  WAVEFORM_BARS,
  envelope,
  rmsToLevel,
} from '../waveform'

describe('rmsToLevel', () => {
  it('maps -50 dB and below to 0', () => {
    expect(rmsToLevel(10 ** (-50 / 20))).toBeCloseTo(0, 6)
    expect(rmsToLevel(0.0001)).toBe(0)
    expect(rmsToLevel(0)).toBe(0)
  })

  it('maps -10 dB and above to 1', () => {
    expect(rmsToLevel(10 ** (-10 / 20))).toBeCloseTo(1, 6)
    expect(rmsToLevel(1)).toBe(1)
  })

  it('is linear in decibels between the floor and the ceiling', () => {
    expect(rmsToLevel(10 ** (-30 / 20))).toBeCloseTo(0.5, 6)
    expect(rmsToLevel(0.01)).toBeCloseTo(0.25, 6) // -40 dB
  })

  it('treats negative and non-finite input as silence', () => {
    expect(rmsToLevel(-1)).toBe(0)
    expect(rmsToLevel(Number.NaN)).toBe(0)
  })
})

describe('envelope', () => {
  it('does not move when no time passed', () => {
    expect(envelope(0.3, 1, 0)).toBe(0.3)
  })

  it('reaches 1 - 1/e of a rise after one rise time constant', () => {
    expect(envelope(0, 1, RISE_TAU_MS)).toBeCloseTo(1 - Math.exp(-1), 6)
  })

  it('reaches 1/e of a fall after one fall time constant', () => {
    expect(envelope(1, 0, FALL_TAU_MS)).toBeCloseTo(Math.exp(-1), 6)
  })

  it('rises faster than it falls', () => {
    const up = envelope(0, 1, 16)
    const down = 1 - envelope(1, 0, 16)
    expect(up).toBeGreaterThan(down)
  })

  it('is frame-rate independent', () => {
    let a = 0
    for (let i = 0; i < 4; i++) a = envelope(a, 1, 8)
    const b = envelope(0, 1, 32)
    expect(a).toBeCloseTo(b, 6)
  })

  it('falls to near zero within three fall time constants', () => {
    let level = 1
    for (let t = 0; t < 450; t += 16) level = envelope(level, 0, 16)
    expect(level).toBeLessThan(0.06)
  })
})

describe('LevelHistory', () => {
  it('defaults to one slot per bar, all zero', () => {
    const h = new LevelHistory()
    expect(h.size).toBe(WAVEFORM_BARS)
    for (let i = 0; i < h.size; i++) expect(h.at(i)).toBe(0)
  })

  it('puts the newest sample last and scrolls older ones left', () => {
    const h = new LevelHistory(4)
    h.push(0.1)
    h.push(0.2)
    expect(h.at(3)).toBeCloseTo(0.2)
    expect(h.at(2)).toBeCloseTo(0.1)
    expect(h.at(0)).toBe(0)
    h.push(0.3)
    h.push(0.4)
    h.push(0.5)
    expect([0, 1, 2, 3].map((i) => h.at(i))).toEqual(
      [0.2, 0.3, 0.4, 0.5].map((v) => Math.fround(v)),
    )
  })

  it('clamps pushed values to 0..1', () => {
    const h = new LevelHistory(2)
    h.push(2)
    h.push(-1)
    expect(h.at(0)).toBe(1)
    expect(h.at(1)).toBe(0)
  })

  it('interpolates each bar towards its right neighbour', () => {
    const h = new LevelHistory(3)
    h.push(0)
    h.push(1)
    h.push(0.5)
    expect(h.sample(0, 0)).toBe(0)
    expect(h.sample(0, 0.5)).toBeCloseTo(0.5)
    expect(h.sample(0, 1)).toBeCloseTo(1)
    expect(h.sample(1, 0.5)).toBeCloseTo(0.75)
  })

  it('blends the newest bar towards the live level', () => {
    const h = new LevelHistory(3)
    h.push(0.2)
    expect(h.sample(2, 0.5)).toBeCloseTo(0.2)
    expect(h.sample(2, 0.5, 1)).toBeCloseTo(0.6)
  })

  it('clear resets to silence', () => {
    const h = new LevelHistory(2)
    h.push(1)
    h.clear()
    expect(h.at(0)).toBe(0)
    expect(h.at(1)).toBe(0)
  })
})
