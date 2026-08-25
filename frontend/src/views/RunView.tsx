/**
 * Pick a benchmark, set the parameters, watch it run.
 *
 * The run happens here, in this browser: the detector is TypeScript and the
 * server is not asked to compute anything. That is why a benchmark is
 * downloaded whole and why the sample count is shown next to each one - the
 * work is an eigendecomposition per window and the machine doing it is yours.
 */

import { useEffect, useState } from 'react'

import { DatasetPicker } from '../components/DatasetPicker'
import { WindowStrip } from '../components/WindowStrip'
import { DEFAULTS, ParameterForm } from '../components/ParameterForm'
import { Results } from '../components/Results'
import type { CedFsParameters } from '../cedfs/cedFs'
import { fetchDataset, type FetchProgress } from '../datasets/catalog'
import type { Dataset, DatasetInfo } from '../datasets/load'
import { useRun } from '../hooks/useRun'
import { useRunRecord } from '../hooks/useRunRecord'
import { useCurrentSession } from '../api/SessionContext'
import { windowCount } from '../cedfs/cedFs'

export function RunView() {
  const [info, setInfo] = useState<DatasetInfo | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState<FetchProgress | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [parameters, setParameters] = useState<CedFsParameters>(DEFAULTS)
  const { state, start, cancel } = useRun()
  const { session } = useCurrentSession()
  const record = useRunRecord(session?.token ?? null)

  const busy = state.status === 'running' || loading !== null

  async function select(next: DatasetInfo) {
    setInfo(next)
    setDataset(null)
    setLoadError(null)
    setLoading({ file: next.dataFile, loaded: 0, total: next.sizeBytes ?? 0 })
    try {
      setDataset(await fetchDataset(next, setLoading))
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(null)
    }
  }

  // The server is told that a run started, roughly how far it has got, and how
  // it ended - never the data, which stays in this browser. None of it can
  // interrupt the run: a failure to save is reported next to the result.
  useEffect(() => {
    if (state.status === 'running') record.progress(state.progress.done)
    else if (state.status === 'done') {
      void record.finish({
        bestRandIndex: state.result.bestRandIndex,
        clusterCounts: state.result.clusterCounts,
        events: state.result.events,
      })
    } else if (state.status === 'error') {
      void record.finish({ error: state.message })
    }
  }, [state, record])

  // Known before the run starts: the window count comes from the feature count,
  // because the stream runs along the feature axis.
  const features = dataset?.featureCount ?? info?.features ?? 0
  const windows = features ? windowCount(features, parameters.windowSize) : 0
  const counts = state.status === 'running' ? state.progress.clusterCounts
    : state.status === 'done' ? state.result.clusterCounts
    : []

  return (
    <>
      <WindowStrip
        total={windows}
        counts={counts}
        running={state.status === 'running'}
        note={info
          ? `${info.name} · ${parameters.windowSize} columns per window`
          : 'pick a benchmark to see the shape of the run'}
      />

      <section>
        <h2><span className="step">01</span> A benchmark</h2>
        <DatasetPicker selected={info} onSelect={select} disabled={busy} />
        {loading && (
          <p className="muted">
            Fetching {loading.file}
            {loading.total > 0 && ` — ${Math.round((loading.loaded / loading.total) * 100)}%`}
            . It is cached after the first time.
          </p>
        )}
        {loadError && <p className="error">{loadError}</p>}
        {dataset && !loading && (
          <p className="muted">
            {dataset.samples.toLocaleString()} samples ×{' '}
            {dataset.featureCount.toLocaleString()} features, scaled into [0, 1].
          </p>
        )}
      </section>

      <section>
        <h2><span className="step">02</span> Parameters</h2>
        <ParameterForm
          value={parameters}
          onChange={setParameters}
          features={dataset?.featureCount ?? info?.features ?? null}
          disabled={busy}
        />
      </section>

      <section>
        <h2><span className="step">03</span> Run</h2>
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!dataset || busy}
            onClick={() => {
              if (!dataset) return
              void record.start(dataset, parameters)
              start(dataset, parameters)
            }}
          >
            {state.status === 'running' ? 'Running…' : 'Run the detector'}
          </button>
          {state.status === 'running' && (
            <button type="button" onClick={cancel}>Stop</button>
          )}
        </div>

        {state.status === 'error' && <p className="error">The run failed: {state.message}</p>}
        {record.problem && <p className="muted">{record.problem}</p>}
        {record.run && state.status === 'done' && (
          <p className="muted">Saved to your runs.</p>
        )}
        {state.status === 'done' && (
          <Results
            result={state.result}
            elapsedMs={state.elapsedMs}
            randIndices={state.progress.randIndices}
            classes={info?.classes}
          />
        )}
      </section>
    </>
  )
}
