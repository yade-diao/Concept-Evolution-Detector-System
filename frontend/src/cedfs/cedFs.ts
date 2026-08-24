/**
 * CED-FS: the sliding window over the feature axis, and the events between
 * consecutive windows.
 *
 * Ported from `cedfs/algorithm/ced_fs.py`. The premise is the least obvious
 * thing about the method and is repeated here rather than left to be inferred:
 * **the stream runs along the feature axis**. In a feature stream the sample
 * space is fixed and the features arrive over time - a sensor network gaining
 * sensors, a production line gaining measurement stages. A window is a
 * contiguous block of columns, every window covers every sample, and what
 * evolves between windows is how those same samples cluster as new features
 * arrive.
 */

import { krDpc, type ClusteringParameters } from './krDpc'
import { diceSimilarity, randIndex } from './metrics'
import { roundQuotientHalfToEven } from './rounding'

export const EVENT_NAMES = ['stable', 'emerging', 'drift', 'forgetting'] as const
export type EventName = (typeof EVENT_NAMES)[number]

export interface CedFsParameters extends ClusteringParameters {
  windowSize: number
  /** Below it a cluster has no match; above it the match is a drift. */
  similarityThreshold: number
}

export interface WindowResult {
  index: number
  clusterCount: number
  randIndex: number
  cluster: Int32Array
  rho: Float64Array
  delta: Float64Array
  /** The Dice matrix against the previous window; null for the first. */
  similarity: number[][] | null
  events: Record<EventName, number> | null
}

export interface CedFsResult {
  windowsTotal: number
  clusterCounts: number[]
  bestRandIndex: number
  events: Record<EventName, number[]>
  windows: WindowResult[]
}

/**
 * How many windows a stream of `features` columns yields.
 *
 * Round-half-to-even, matching Python's `round` - and matched in turn by
 * `Run.windowCount` on the Java side. All three have to agree: ced-api rejects a
 * result whose cluster counts do not number exactly `windowsTotal`, so a
 * disagreement throws away work that was correct. See ./rounding.
 */
export function windowCount(features: number, windowSize: number): number {
  return Math.max(1, roundQuotientHalfToEven(features, windowSize))
}

/** The column range of each window, including the last window's absorb rule. */
export function windowBounds(features: number, windowSize: number): Array<[number, number]> {
  const total = windowCount(features, windowSize)
  const bounds: Array<[number, number]> = []
  for (let i = 1; i <= total; i++) {
    const start = (i - 1) * windowSize
    // The last window absorbs the trailing columns when `round` already counted
    // them as a window of their own.
    const end = i === total && features % windowSize >= windowSize / 2
      ? features
      : Math.min(i * windowSize, features)
    bounds.push([start, end])
  }
  return bounds
}

export interface CedFsInput {
  /** Row-major (samples x features), already normalised. */
  features: Float64Array
  samples: number
  featureCount: number
  labels: ArrayLike<number>
}

/**
 * Classify one boundary from its similarity matrix.
 *
 * Rows are past clusters, columns are current ones. A row whose best match
 * reaches 1 is stable, one that reaches the threshold has drifted, one that
 * reaches neither is forgotten; a column that reaches nothing above the
 * threshold is emerging.
 *
 * `stable` testing an exact 1 is the published rule and is kept, but it is worth
 * knowing what it means in practice: on real data two consecutive windows almost
 * never partition the samples identically, so `stable` is nearly always zero and
 * near-identical windows are reported as drift.
 */
export function classifyBoundary(
  similarity: number[][],
  threshold: number,
): Record<EventName, number> {
  const events: Record<EventName, number> = { stable: 0, emerging: 0, drift: 0, forgetting: 0 }
  if (similarity.length === 0) return events

  for (const row of similarity) {
    const best = row.length ? Math.max(...row) : 0
    if (best === 1) events.stable++
    else if (best >= threshold) events.drift++
    else events.forgetting++
  }

  const columns = similarity[0].length
  for (let j = 0; j < columns; j++) {
    let best = 0
    for (const row of similarity) best = Math.max(best, row[j])
    if (best < threshold) events.emerging++
  }
  return events
}

export function cedFs(
  input: CedFsInput,
  parameters: CedFsParameters,
  onWindow?: (done: number, total: number, window: WindowResult) => void,
): CedFsResult {
  const { features, samples, featureCount, labels } = input
  const bounds = windowBounds(featureCount, parameters.windowSize)

  const windows: WindowResult[] = []
  const clusterCounts: number[] = []
  const events: Record<EventName, number[]> = {
    stable: [], emerging: [], drift: [], forgetting: [],
  }
  let bestRandIndex = 0

  let previous: { cluster: Int32Array; count: number } | null = null

  bounds.forEach(([start, end], i) => {
    const width = end - start
    const block = new Float64Array(samples * width)
    for (let row = 0; row < samples; row++) {
      const source = row * featureCount + start
      block.set(features.subarray(source, source + width), row * width)
    }

    const { cluster, clusterCount, rho, delta } = krDpc(block, samples, width, parameters)
    clusterCounts.push(clusterCount)

    let similarity: number[][] | null = null
    let boundaryEvents: Record<EventName, number> | null = null
    if (previous) {
      similarity = diceSimilarity(previous.cluster, previous.count, cluster, clusterCount)
      boundaryEvents = classifyBoundary(similarity, parameters.similarityThreshold)
      for (const name of EVENT_NAMES) events[name].push(boundaryEvents[name])
    }

    // Against every label, because every window clusters every sample - only the
    // features each window sees differ.
    const ri = randIndex(cluster, labels)
    bestRandIndex = Math.max(bestRandIndex, ri)

    const result: WindowResult = {
      index: i, clusterCount, randIndex: ri, cluster, rho, delta,
      similarity, events: boundaryEvents,
    }
    windows.push(result)
    previous = { cluster, count: clusterCount }
    onWindow?.(i + 1, bounds.length, result)
  })

  return { windowsTotal: bounds.length, clusterCounts, bestRandIndex, events, windows }
}
