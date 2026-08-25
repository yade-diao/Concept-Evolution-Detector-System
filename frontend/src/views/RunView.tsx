/**
 * Pick a benchmark, set the parameters, watch it run.
 *
 * The run happens here, in this browser: the detector is TypeScript and the
 * server is not asked to compute anything. That is why a benchmark is
 * downloaded whole and why the sample count is shown next to each one - the
 * work is an eigendecomposition per window and the machine doing it is yours.
 */

import { useState } from 'react'

import { DatasetPicker } from '../components/DatasetPicker'
import { DEFAULTS, ParameterForm } from '../components/ParameterForm'
import { Results } from '../components/Results'
import type { CedFsParameters } from '../cedfs/cedFs'
import { fetchDataset, type FetchProgress } from '../datasets/catalog'
import type { Dataset, DatasetInfo } from '../datasets/load'
import { useRun } from '../hooks/useRun'

export function RunView() {
  const [info, setInfo] = useState<DatasetInfo | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState<FetchProgress | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [parameters, setParameters] = useState<CedFsParameters>(DEFAULTS)
  const { state, start, cancel } = useRun()

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

  return (
    <>
      <section>
        <h2>1 · A benchmark</h2>
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
        <h2>2 · Parameters</h2>
        <ParameterForm
          value={parameters}
          onChange={setParameters}
          features={dataset?.featureCount ?? info?.features ?? null}
          disabled={busy}
        />
      </section>

      <section>
        <h2>3 · Run</h2>
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!dataset || busy}
            onClick={() => dataset && start(dataset, parameters)}
          >
            {state.status === 'running' ? 'Running…' : 'Run the detector'}
          </button>
          {state.status === 'running' && (
            <button type="button" onClick={cancel}>Stop</button>
          )}
        </div>

        {state.status === 'running' && (
          <div className="progress">
            <div
              className="bar"
              style={{
                width: state.progress.total
                  ? `${(state.progress.done / state.progress.total) * 100}%`
                  : '0%',
              }}
            />
            <span>
              window {state.progress.done}
              {state.progress.total ? ` of ${state.progress.total}` : ''}
              {state.progress.clusterCounts.length > 0 &&
                ` · ${state.progress.clusterCounts.at(-1)} clusters`}
            </span>
          </div>
        )}

        {state.status === 'error' && <p className="error">The run failed: {state.message}</p>}
        {state.status === 'done' && (
          <Results result={state.result} elapsedMs={state.elapsedMs} />
        )}
      </section>
    </>
  )
}
