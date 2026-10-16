/**
 * CED-FS as a fleet monitor, and the graded deviation monitor.
 *
 * Ported from `cedfs/fleet.py`; docs/INDUSTRIAL.md says what each is for. A
 * fleet is (units, samples, variables), unit-major: value (u, t, v) at
 * `(u * samples + t) * variables + v`.
 */

import { classifyBoundary, type EventName } from './cedFs'
import { krDpc, type ClusteringParameters } from './krDpc'
import { diceSimilarity } from './metrics'
import { normalQuantile, screenSummaries, testable, type Window } from './screening'
import { transitions, type TransitionName } from './transitions'

export interface Fleet {
  data: Float64Array
  units: number
  samples: number
  variables: number
}

export interface FleetWindow {
  index: number
  /** 1-based group per unit; all ones when the window is one group. */
  cluster: Int32Array
  clusterCount: number
  /** Units outside the largest group. */
  flagged: boolean[]
  /** Variables the screening selected, ascending. */
  variables: number[]
  /** The same, most significant first. */
  ranked: number[]
  events: Record<EventName, number> | null
  transitions: Record<TransitionName, number> | null
}

function windowOf({ data, units, samples, variables }: Fleet, start: number, length: number): Window {
  const out = new Float64Array(units * length * variables)
  for (let u = 0; u < units; u++) {
    out.set(data.subarray((u * samples + start) * variables, (u * samples + start + length) * variables),
      u * length * variables)
  }
  return { data: out, objects: units, samples: length, variables }
}

/** `fleet.monitor(units, window, params, screen_alpha, represent="summaries")`. */
export function monitorFleet(
  fleet: Fleet,
  windowLength: number,
  parameters: ClusteringParameters,
  alpha: number,
  threshold = 0.5,
  onWindow?: (done: number, total: number) => void,
): FleetWindow[] {
  const total = Math.floor(fleet.samples / windowLength)
  const out: FleetWindow[] = []
  let past: FleetWindow | null = null
  for (let w = 0; w < total; w++) {
    const screened = screenSummaries(windowOf(fleet, w * windowLength, windowLength), alpha)
    let cluster: Int32Array
    let clusterCount: number
    if (screened.selected.length === 0) {
      cluster = new Int32Array(fleet.units).fill(1)
      clusterCount = 1
    } else {
      const c = krDpc(screened.summary, fleet.units, screened.width, parameters)
      cluster = c.cluster
      clusterCount = c.clusterCount
    }
    const sizes = new Array<number>(clusterCount + 1).fill(0)
    for (const g of cluster) sizes[g]++
    const largest = sizes.indexOf(Math.max(...sizes))
    const current: FleetWindow = {
      index: w,
      cluster,
      clusterCount,
      flagged: Array.from(cluster, (g) => g !== largest),
      variables: screened.selected,
      ranked: screened.ranked,
      events: null,
      transitions: null,
    }
    if (past) {
      const pastK = Math.max(...past.cluster)
      const curK = Math.max(...cluster)
      current.events = classifyBoundary(diceSimilarity(past.cluster, pastK, cluster, curK), threshold)
      current.transitions = transitions(past.cluster, cluster)
    }
    out.push(current)
    past = current
    onWindow?.(w + 1, total)
  }
  return out
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b)
  const h = v.length >> 1
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2
}

/** `fleet.deviation(units, window, baseline)`: (units x windows) conformal p-values. */
export function deviation(fleet: Fleet, windowLength: number, baseline: number): number[][] {
  const { units: n, samples: T, variables: V, data } = fleet
  const base = new Float64Array(n * V)
  if (baseline > 0) {
    for (let u = 0; u < n; u++)
      for (let v = 0; v < V; v++) {
        let s = 0
        for (let t = 0; t < baseline; t++) s += data[(u * T + t) * V + v]
        base[u * V + v] = s / baseline
      }
  }
  const total = Math.floor(T / windowLength)
  const p: number[][] = Array.from({ length: n }, () => [])
  for (let w = 0; w < total; w++) {
    const m = new Float64Array(n * V)
    for (let u = 0; u < n; u++)
      for (let v = 0; v < V; v++) {
        let s = 0
        for (let t = w * windowLength; t < (w + 1) * windowLength; t++) s += data[(u * T + t) * V + v] - base[u * V + v]
        m[u * V + v] = s / windowLength
      }
    const ok = testable(m, n, V)
    const med: number[] = []
    const mad: number[] = []
    for (let v = 0; v < V; v++) {
      const col = Array.from({ length: n }, (_, u) => m[u * V + v])
      med.push(median(col))
      mad.push(1.4826 * median(col.map((x) => Math.abs(x - med[v]))))
    }
    const use = ok.map((o, v) => o && mad[v] > 0)
    const strangeness = Array.from({ length: n }, (_, u) => {
      let s = 0
      for (let v = 0; v < V; v++) if (use[v]) s += ((m[u * V + v] - med[v]) / mad[v]) ** 2
      return s
    })
    for (let u = 0; u < n; u++) {
      if (!use.some(Boolean)) {
        p[u].push(1)
        continue
      }
      let atLeast = 0
      for (let j = 0; j < n; j++) if (strangeness[j] >= strangeness[u]) atLeast++
      p[u].push(atLeast / n)
    }
  }
  return p
}

/** `fleet.accumulate(p, m, level)`: alarms from the mean of the last m p-values. */
export function accumulate(p: number[][], m = 5, level = 0.01): boolean[][] {
  const cut = normalQuantile(level)
  return p.map((row) =>
    row.map((_, w) => {
      if (w < m - 1) return false
      let mean = 0
      for (let k = w - m + 1; k <= w; k++) mean += row[k]
      mean /= m
      return (mean - 0.5) / Math.sqrt(1 / (12 * m)) < cut
    }))
}
