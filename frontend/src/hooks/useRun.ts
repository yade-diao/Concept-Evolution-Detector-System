/**
 * Driving one run: the worker's lifetime, its progress, and its result.
 *
 * The worker is created per run and terminated when the run ends or the user
 * cancels. That is deliberate rather than lazy - there is no safe point inside
 * an eigendecomposition to check a cancellation flag at, so stopping means
 * killing the thread, and a thread that is killed cannot be reused.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { CedFsParameters } from '../cedfs/cedFs'
import type { Dataset } from '../datasets/load'
import type { RunDone, RunMessage } from '../worker/cedfs.worker'

export interface RunProgress {
  done: number
  total: number
  /** Cluster counts as they arrive, so the chart fills in during the run. */
  clusterCounts: number[]
  randIndices: number[]
}

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; progress: RunProgress; startedAt: number }
  | { status: 'done'; result: RunDone; progress: RunProgress; elapsedMs: number }
  | { status: 'error'; message: string }

export function useRun() {
  const [state, setState] = useState<RunState>({ status: 'idle' })
  const worker = useRef<Worker | null>(null)

  const stop = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
  }, [])

  // A worker outlives the component that started it unless it is told not to.
  useEffect(() => stop, [stop])

  const start = useCallback((dataset: Dataset, parameters: CedFsParameters) => {
    stop()

    const startedAt = performance.now()
    const progress: RunProgress = { done: 0, total: 0, clusterCounts: [], randIndices: [] }
    setState({ status: 'running', progress, startedAt })

    const created = new Worker(new URL('../worker/cedfs.worker.ts', import.meta.url),
      { type: 'module' })
    worker.current = created

    created.onmessage = (event: MessageEvent<RunMessage>) => {
      const message = event.data
      if (message.type === 'window') {
        progress.done = message.done
        progress.total = message.total
        progress.clusterCounts = [...progress.clusterCounts, message.clusterCount]
        progress.randIndices = [...progress.randIndices, message.randIndex]
        setState({ status: 'running', progress: { ...progress }, startedAt })
      } else if (message.type === 'done') {
        setState({
          status: 'done',
          result: message,
          progress: { ...progress },
          elapsedMs: performance.now() - startedAt,
        })
        stop()
      } else {
        setState({ status: 'error', message: message.message })
        stop()
      }
    }

    created.onerror = (event) => {
      setState({ status: 'error', message: event.message || 'the worker failed' })
      stop()
    }

    // The feature matrix is transferred rather than copied: it is up to 80 MB
    // for the larger benchmarks, and structured cloning it would double that
    // for as long as the copy takes.
    const features = dataset.features.slice().buffer
    created.postMessage({
      features,
      samples: dataset.samples,
      featureCount: dataset.featureCount,
      labels: dataset.labels,
      parameters,
    }, [features])
  }, [stop])

  const cancel = useCallback(() => {
    stop()
    setState({ status: 'idle' })
  }, [stop])

  return { state, start, cancel }
}
