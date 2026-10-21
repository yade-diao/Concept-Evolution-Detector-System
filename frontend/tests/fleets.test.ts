/**
 * The fleet monitors, on the bundled fleets, against the Python reference.
 *
 * Inputs are the same `datasets/bundled/fleets/*.i16` files the reference read;
 * `reference/fleet_answers.json` holds only its answers. Regenerate with
 * `python -m tests.generate_fleet_answers` when the method changes, never to
 * make a failing test pass.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { accumulate, deviation, monitorFleet, ownChange } from '../src/cedfs/fleet'
import { decodeFleet, type FleetInfo } from '../src/datasets/fleets'

const ROOT = new URL('../../datasets/bundled/fleets/', import.meta.url)
const manifest: FleetInfo[] = JSON.parse(readFileSync(new URL('manifest.json', ROOT), 'utf8'))
interface FleetAnswer {
  slug: string
  window: number
  alpha: number
  baseline: number
  m: number
  level: number
  clusterCounts: number[]
  flagged: number[][]
  variables: number[][]
  events: unknown[]
  transitions: unknown[]
  mergedClusterCounts: number[]
  mergedFlagged: number[][]
  pCounts: number[][]
  alarms: number[][]
  ownChangeCounts: number[][]
  ownShapeCounts: number[][]
}

const answers: FleetAnswer[] = JSON.parse(
  readFileSync(new URL('reference/fleet_answers.json', import.meta.url), 'utf8'))

describe.each(answers)('$slug', (answer: FleetAnswer) => {
  const info = manifest.find((m) => m.slug === answer.slug)!
  const bytes = readFileSync(new URL(info.file, ROOT))
  const fleet = decodeFleet(info, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const params = { kernelType: 1 as const, sigma: 6, p: 0.05 }

  it('the clustering monitor makes the same calls, window by window', () => {
    const windows = monitorFleet(fleet, answer.window, params, answer.alpha)
    expect(windows.map((w) => w.clusterCount)).toEqual(answer.clusterCounts)
    expect(windows.map((w) => w.variables)).toEqual(answer.variables)
    expect(windows.map((w) => w.flagged.flatMap((f, u) => (f ? [u] : [])))).toEqual(answer.flagged)
    expect(windows.slice(1).map((w) => w.events)).toEqual(answer.events)
    expect(windows.slice(1).map((w) => w.transitions)).toEqual(answer.transitions)
  }, 60_000)

  it('with merging, the same groups are merged', () => {
    const windows = monitorFleet(fleet, answer.window, params, answer.alpha, 0.5, undefined, 0.001)
    expect(windows.map((w) => w.clusterCount)).toEqual(answer.mergedClusterCounts)
    expect(windows.map((w) => w.flagged.flatMap((f, u) => (f ? [u] : [])))).toEqual(answer.mergedFlagged)
  }, 60_000)

  it('the deviation monitor gives the same p-values and alarms', () => {
    const p = deviation(fleet, answer.window, answer.baseline)
    expect(p.map((row) => row.map((x) => Math.round(x * fleet.units)))).toEqual(answer.pCounts)
    const alarms = accumulate(p, answer.m, answer.level)
    const byWindow = alarms[0].map((_, w) => alarms.flatMap((row, u) => (row[w] ? [u] : [])))
    expect(byWindow).toEqual(answer.alarms)
  })

  it('the own-change monitor gives the same p-values', () => {
    const p = ownChange(fleet, answer.window, answer.baseline)
    expect(p.map((row) => row.map((x) => Math.round(x * fleet.units)))).toEqual(answer.ownChangeCounts)
    const shape = ownChange(fleet, answer.window, answer.baseline, 'shape')
    expect(shape.map((row) => row.map((x) => Math.round(x * fleet.units)))).toEqual(answer.ownShapeCounts)
  })
})
