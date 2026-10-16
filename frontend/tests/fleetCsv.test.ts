/** The browser's CSV reader follows the rules of `python -m cedfs.monitor`'s. */

import { describe, expect, it } from 'vitest'

import { buildFleet, readTable } from '../src/datasets/fleetCsv'

function csv(units: number, steps: (u: number) => number, extra = ''): string {
  const lines = [`engine,cycle,s1,s2${extra ? ',note' : ''}`]
  for (let u = 1; u <= units; u++) {
    // Rows deliberately out of time order.
    for (let t = steps(u); t >= 1; t--) lines.push(`${u},${t},${u * 0.1 + t},${-t}${extra ? `,${extra}` : ''}`)
  }
  return lines.join('\n')
}

describe('fleet CSV', () => {
  it('guesses the unit and time columns', () => {
    const t = readTable(csv(12, () => 5))
    expect([t.guessUnit, t.guessTime]).toEqual(['engine', 'cycle'])
  })

  it('orders units like the CLI and sorts each unit by time', () => {
    const p = buildFleet(readTable(csv(12, () => 4)), 'engine', 'cycle')
    expect(p.unitIds.slice(0, 3)).toEqual(['1', '2', '3'])
    expect(p.unitIds[9]).toEqual('10')
    expect(p.times).toEqual([1, 2, 3, 4])
    // unit 1, step 1, variable s1
    expect(p.fleet.data[0]).toBeCloseTo(1.1)
  })

  it('cuts to the common prefix and leaves out non-numeric columns', () => {
    const p = buildFleet(readTable(csv(12, (u) => (u === 3 ? 3 : 6), 'ok')), 'engine', 'cycle')
    expect(p.fleet.samples).toBe(3)
    expect(p.variables).toEqual(['s1', 's2'])
    expect(p.skipped).toEqual(['note'])
    expect(p.trimmed).toBe(11 * 3)
  })

  it('refuses a fleet too small to compare', () => {
    expect(() => buildFleet(readTable(csv(5, () => 4)), 'engine', 'cycle')).toThrow(/at least ten/)
  })
})
