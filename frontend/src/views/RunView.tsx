/**
 * Pick a benchmark, set the parameters, watch it run.
 *
 * The run happens here, in this browser: the detector is TypeScript and the
 * server is not asked to compute anything. That is why a benchmark is
 * downloaded whole and why the sample count is shown next to each one - the
 * work is an eigendecomposition per window and the machine doing it is yours.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { DatasetPicker } from '../components/DatasetPicker'
import { WindowStrip } from '../components/WindowStrip'
import { DEFAULTS, ParameterForm } from '../components/ParameterForm'
import { Results } from '../components/Results'
import type { CedFsParameters } from '../cedfs/cedFs'
import { fetchDataset, type FetchProgress } from '../datasets/catalog'
import type { Dataset, DatasetInfo } from '../datasets/load'
import { useRun } from '../hooks/useRun'
import { useRunRecord } from '../hooks/useRunRecord'
import { datasetNote, windowSpan } from '../findings'
import { listLocal, toDataset, toInfo, type LocalDataset } from '../datasets/mine'
import { useCurrentSession } from '../api/SessionContext'
import { windowCount } from '../cedfs/cedFs'

export function RunView() {
  const [info, setInfo] = useState<DatasetInfo | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState<FetchProgress | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [parameters, setParameters] = useState<CedFsParameters>(DEFAULTS)
  const [mine, setMine] = useState<LocalDataset[]>([])
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
  // The datasets in this browser, which a guest has none of - they cannot add
  // one - and an account may have several.
  useEffect(() => { void listLocal().then(setMine) }, [session])

  function selectLocal(local: LocalDataset) {
    setLoadError(null)
    setLoading(null)
    setInfo(toInfo(local))
    setDataset(toDataset(local))
  }

  const note = datasetNote(info)
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
          ? `${info.name} · one window is ${windowSpan(info, parameters.windowSize)}`
          : 'pick a benchmark to see the shape of the run'}
      />

      <section>
        <div className="section-head">
          <span className="step">01</span>
          <h2>A benchmark</h2>
        </div>
        <DatasetPicker selected={info} onSelect={select} disabled={busy} />
        {loading && (
          <p className="muted">
            Fetching {loading.file}
            {loading.total > 0 && ` — ${Math.round((loading.loaded / loading.total) * 100)}%`}
            . It is cached after the first time.
          </p>
        )}
        {loadError && <p className="error">{loadError}</p>}

        {session?.kind === 'account' ? (
          <div className="mine">
            <h3 className="sub">Your datasets</h3>
            {mine.length === 0 ? (
              <p className="muted">
                None in this browser yet. <Link to="/datasets">Add a file</Link> — it is
                read here and never uploaded unless you ask.
              </p>
            ) : (
              <ul className="datasets">
                {mine.map((local) => (
                  <li key={local.id}>
                    <button type="button" disabled={busy}
                            className={info?.slug === `mine:${local.id}` ? 'dataset selected' : 'dataset'}
                            onClick={() => selectLocal(local)}>
                      <span className="name">{local.name}</span>
                      <span className="shape">
                        {local.samples.toLocaleString()} samples ×{' '}
                        {local.featureCount.toLocaleString()} features · {local.classes} classes
                      </span>
                      <span className="meta">
                        <span className="tag accent">yours</span>
                        <span className="size">
                          {local.remoteId ? 'uploaded' : 'this browser'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          // A guest is told what the wall is and where the door is, rather than
          // being shown a control that does nothing.
          <p className="locked">
            Running your own data needs an account. Everything else here — the
            detector, the charts, the readings — works exactly the same as a
            guest. <Link to="/signin">Create one</Link> and your files stay in
            your browser until you choose to upload them.
          </p>
        )}
        {note && (
          <div className="dataset-note">
            <p>{note.what}</p>
            <p className="why">{note.why}</p>
            {dataset && !loading && (
              <p className="muted">
                {dataset.samples.toLocaleString()} samples ×{' '}
                {dataset.featureCount.toLocaleString()} features, scaled into [0, 1]
                {info?.source ? ` · ${info.source}` : ''}
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <span className="step">02</span>
          <h2>Parameters</h2>
        </div>
        <ParameterForm
          value={parameters}
          onChange={setParameters}
          features={dataset?.featureCount ?? info?.features ?? null}
          disabled={busy}
        />
      </section>

      <section>
        <div className="section-head">
          <span className="step">03</span>
          <h2>Run</h2>
        </div>
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
            info={info}
            windowSize={parameters.windowSize}
          />
        )}
      </section>
    </>
  )
}
