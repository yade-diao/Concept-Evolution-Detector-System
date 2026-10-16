/**
 * Runs a fleet monitor off the main thread. The fleet arrives decoded; what
 * goes back is small - per window the groups, who left, through what, and the
 * events - so nothing large crosses back.
 */

import { accumulate, deviation, monitorFleet, type Fleet } from '../cedfs/fleet'
import type { TransitionName } from '../cedfs/transitions'
import type { EventName } from '../cedfs/cedFs'

export interface FleetRequest {
  fleet: { data: ArrayBuffer; units: number; samples: number; variables: number }
  window: number
  alpha: number
  /** Set for the deviation monitor. */
  baseline?: number
  m?: number
  level?: number
}

export interface FleetWindowSummary {
  clusterCount: number
  groupSizes: number[]
  flagged: number[]
  /** Selected variables, most significant first. */
  variables: number[]
  events: Record<EventName, number> | null
  transitions: Record<TransitionName, number> | null
}

export interface FleetDone {
  type: 'done'
  windows: FleetWindowSummary[]
  /** (units x windows) deviation alarms, when a baseline was given. */
  alarms: boolean[][] | null
  elapsedMs: number
}

export interface FleetFailed {
  type: 'error'
  message: string
}

self.onmessage = (event: MessageEvent<FleetRequest>) => {
  const { fleet: raw, window, alpha, baseline, m, level } = event.data
  const started = performance.now()
  try {
    const fleet: Fleet = { ...raw, data: new Float64Array(raw.data) }
    const windows = monitorFleet(fleet, window, { kernelType: 1, sigma: 6, p: 0.05 }, alpha)
      .map((w) => {
        const sizes = new Array<number>(w.clusterCount + 1).fill(0)
        for (const g of w.cluster) sizes[g]++
        return {
          clusterCount: w.clusterCount,
          groupSizes: sizes.slice(1).sort((a, b) => b - a),
          flagged: w.flagged.flatMap((f, u) => (f ? [u] : [])),
          variables: w.ranked,
          events: w.events,
          transitions: w.transitions,
        }
      })
    const alarms = baseline !== undefined
      ? accumulate(deviation(fleet, window, baseline), m ?? 5, level ?? 0.01)
      : null
    const done: FleetDone = { type: 'done', windows, alarms, elapsedMs: performance.now() - started }
    self.postMessage(done)
  } catch (cause) {
    const failed: FleetFailed = { type: 'error', message: cause instanceof Error ? cause.message : String(cause) }
    self.postMessage(failed)
  }
}
