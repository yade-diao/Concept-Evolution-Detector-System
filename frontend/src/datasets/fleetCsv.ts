/**
 * A fleet from a long-format CSV, read in this browser.
 *
 * The same format `python -m cedfs.monitor` reads: one row per unit per time
 * step, a column naming the unit, a column ordering time, and one column per
 * variable. Units are ordered as the CLI orders them (shorter names first, then
 * by name, so "engine 2" comes before "engine 10"); each unit's rows are sorted
 * by time; and the fleet is cut to the longest prefix every unit has, because a
 * feature stream needs every object in every window. A column that is not
 * numeric in every row cannot be a variable and is left out, by name.
 */

import type { Fleet } from '../cedfs/fleet'

export interface FleetTable {
  header: string[]
  rows: string[][]
  /** Columns that look like the unit and time columns, for the form's defaults. */
  guessUnit: string
  guessTime: string
}

export interface ParsedFleet {
  fleet: Fleet
  unitIds: string[]
  times: number[]
  variables: string[]
  /** Columns left out because some row was not a number. */
  skipped: string[]
  /** Rows dropped because a unit had more time steps than the shortest. */
  trimmed: number
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) { out.push(cell.trim()); cell = '' }
    else cell += c
  }
  out.push(cell.trim())
  return out
}

export function readTable(text: string): FleetTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) throw new Error('the file needs a header row and at least one data row')
  const first = lines[0]
  const delimiter = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const header = splitLine(first, delimiter)
  const rows = lines.slice(1).map((l) => splitLine(l, delimiter))
  const lower = header.map((h) => h.toLowerCase())
  const pick = (words: string[], fallback: number) => {
    const i = lower.findIndex((h) => words.some((w) => h.includes(w)))
    return header[i >= 0 ? i : fallback]
  }
  const guessUnit = pick(['unit', 'engine', 'machine', 'cell', 'run', 'id', 'asset'], 0)
  const guessTime = pick(['time', 'cycle', 'step', 'sample', 'date'], Math.min(1, header.length - 1))
  return { header, rows, guessUnit, guessTime }
}

function unitOrder(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
}

export function buildFleet(table: FleetTable, unit: string, time: string): ParsedFleet {
  const u = table.header.indexOf(unit)
  const t = table.header.indexOf(time)
  if (u < 0 || t < 0) throw new Error(`no column named ${u < 0 ? unit : time}`)
  if (u === t) throw new Error('the unit and time columns must differ')
  const candidates = table.header.map((_, i) => i).filter((i) => i !== u && i !== t)
  const numeric = candidates.filter((i) => table.rows.every((r) => r[i] !== undefined && r[i] !== ''
    && Number.isFinite(Number(r[i]))))
  const skipped = candidates.filter((i) => !numeric.includes(i)).map((i) => table.header[i])
  if (numeric.length === 0) throw new Error('no numeric variable columns')

  const byUnit = new Map<string, Array<{ time: number; values: number[] }>>()
  for (const r of table.rows) {
    const tv = Number(r[t])
    if (!Number.isFinite(tv)) throw new Error(`time "${r[t]}" is not a number`)
    const list = byUnit.get(r[u]) ?? []
    list.push({ time: tv, values: numeric.map((i) => Number(r[i])) })
    byUnit.set(r[u], list)
  }
  const unitIds = [...byUnit.keys()].sort(unitOrder)
  if (unitIds.length < 10) throw new Error(`${unitIds.length} units; a fleet needs at least ten to compare`)
  for (const id of unitIds) byUnit.get(id)!.sort((a, b) => a.time - b.time)
  const horizon = Math.min(...unitIds.map((id) => byUnit.get(id)!.length))
  const V = numeric.length
  const data = new Float64Array(unitIds.length * horizon * V)
  unitIds.forEach((id, k) => {
    byUnit.get(id)!.slice(0, horizon).forEach((row, s) => data.set(row.values, (k * horizon + s) * V))
  })
  const trimmed = table.rows.length - unitIds.length * horizon
  return {
    fleet: { data, units: unitIds.length, samples: horizon, variables: V },
    unitIds,
    times: byUnit.get(unitIds[0])!.slice(0, horizon).map((r) => r.time),
    variables: numeric.map((i) => table.header[i]),
    skipped,
    trimmed,
  }
}
