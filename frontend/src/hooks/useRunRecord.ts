/**
 * Keeping a record of a run on the server, while the browser does the run.
 *
 * The server is told three things: that a run started and on what, roughly how
 * far it has got, and how it ended. It is never told the data.
 *
 * Recording must not be able to break the run. A signed-out visitor, an expired
 * token, a server that is down - none of those should stop a clustering that is
 * happening locally and would have succeeded. So every call here is best-effort
 * and its failure is reported beside the result rather than thrown into it.
 *
 * Progress is reported at most every few seconds. A window can finish in 20 ms
 * on a small benchmark; a PATCH per window would be a hundred requests a second
 * for a number nobody is watching that closely.
 */

import { useCallback, useRef, useState } from 'react'

import { api, ApiError, type RunView } from '../api/client'
import type { CedFsParameters } from '../cedfs/cedFs'
import type { Dataset } from '../datasets/load'

const PROGRESS_INTERVAL_MS = 3000

export interface RecordState {
  /** The saved run, once the server has one. */
  run: RunView | null
  /** Why the run could not be saved, if it could not. */
  problem: string | null
}

export function useRunRecord(token: string | null) {
  const [state, setState] = useState<RecordState>({ run: null, problem: null })
  const id = useRef<string | null>(null)
  const lastReport = useRef(0)

  const start = useCallback(async (dataset: Dataset, parameters: CedFsParameters) => {
    id.current = null
    lastReport.current = 0
    setState({ run: null, problem: null })
    if (!token) return

    try {
      const run = await api.createRun(token, {
        datasetName: dataset.slug,
        samples: dataset.samples,
        features: dataset.featureCount,
        parameters: {
          kernelType: parameters.kernelType,
          sigma: parameters.sigma,
          neighbourFraction: parameters.p,
          similarityThreshold: parameters.similarityThreshold,
          windowSize: parameters.windowSize,
        },
      })
      id.current = run.id
      setState({ run, problem: null })
    } catch (cause) {
      setState({ run: null, problem: explain(cause) })
    }
  }, [token])

  const progress = useCallback((windowsDone: number) => {
    if (!token || !id.current) return
    const now = Date.now()
    if (now - lastReport.current < PROGRESS_INTERVAL_MS) return
    lastReport.current = now
    void api.reportProgress(token, id.current, windowsDone).catch(() => {
      // A dropped progress report costs nothing: the next one carries the
      // current number, and the result carries the truth.
    })
  }, [token])

  const finish = useCallback(async (result: {
    bestRandIndex?: number
    clusterCounts?: number[]
    events?: Record<string, number[]>
    error?: string
  }) => {
    // Taken and cleared in one step, so a re-render that lands on the same
    // finished state cannot submit the result twice.
    const runId = id.current
    if (!token || !runId) return
    id.current = null
    try {
      const run = await api.submitResult(token, runId, result)
      setState({ run, problem: null })
    } catch (cause) {
      setState((previous) => ({ ...previous, problem: explain(cause) }))
    }
  }, [token])

  return { ...state, start, progress, finish }
}

function explain(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.isUnauthorised) return 'not saved — your session expired; sign in again'
    if (cause.status === 0) return 'not saved — the server could not be reached'
    return `not saved — ${cause.message}`
  }
  return 'not saved'
}
