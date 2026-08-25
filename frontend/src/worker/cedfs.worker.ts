/**
 * The detector, off the main thread.
 *
 * A window of a 200-sample stream is a second of arithmetic and there are
 * hundreds of windows, so running this where the page's event loop lives would
 * freeze the tab for minutes - no progress, no cancel, and a browser offering
 * to kill the page. Here it reports each window as it finishes and the tab
 * stays responsive.
 *
 * Cancellation is the same idea from the other side: the page terminates the
 * worker. There is no cooperative check inside the loop, because there is no
 * safe point in the middle of an eigendecomposition to check at.
 */

import { cedFs, type CedFsParameters, type CedFsResult, type WindowResult } from '../cedfs/cedFs'

export interface RunRequest {
  /** Row-major (samples x features), normalised. Transferred, not copied. */
  features: ArrayBuffer
  samples: number
  featureCount: number
  labels: Int32Array
  parameters: CedFsParameters
}

/** What the page needs per window; the heavy arrays stay in the worker. */
export interface WindowProgress {
  type: 'window'
  done: number
  total: number
  index: number
  clusterCount: number
  randIndex: number
}

export interface RunDone {
  type: 'done'
  windowsTotal: number
  clusterCounts: number[]
  bestRandIndex: number
  events: CedFsResult['events']
  /** The decision graph of the last window, for the page to draw. */
  lastDecisionGraph: { rho: number[]; delta: number[]; centres: number[] } | null
}

export interface RunFailed {
  type: 'error'
  message: string
}

export type RunMessage = WindowProgress | RunDone | RunFailed

self.onmessage = (event: MessageEvent<RunRequest>) => {
  const { features, samples, featureCount, labels, parameters } = event.data

  try {
    let last: WindowResult | null = null

    const result = cedFs(
      { features: new Float64Array(features), samples, featureCount, labels },
      parameters,
      (done, total, window) => {
        last = window
        const progress: WindowProgress = {
          type: 'window',
          done,
          total,
          index: window.index,
          clusterCount: window.clusterCount,
          randIndex: window.randIndex,
        }
        self.postMessage(progress)
      },
    )

    const finished = last as WindowResult | null
    const done: RunDone = {
      type: 'done',
      windowsTotal: result.windowsTotal,
      clusterCounts: result.clusterCounts,
      bestRandIndex: result.bestRandIndex,
      events: result.events,
      lastDecisionGraph: finished
        ? {
            rho: Array.from(finished.rho),
            delta: Array.from(finished.delta),
            centres: finished.centres,
          }
        : null,
    }
    self.postMessage(done)
  } catch (error) {
    const failed: RunFailed = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(failed)
  }
}
