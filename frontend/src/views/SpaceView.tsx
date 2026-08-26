/**
 * The personal space: your data, and what you have done with it.
 *
 * Two halves, in the order they happen. Datasets first - the ones in this
 * browser, and the ones the server is keeping for you - then the runs.
 *
 * The distinction between local and uploaded is shown rather than hidden,
 * because it is the one that matters: a dataset in this browser works offline
 * and never leaves the machine; a dataset on the server is there from your
 * other machine and counts against 25 MB. Files start local, and uploading is
 * something you choose.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { api, ApiError, type RunSummary, type StoredDataset, type StorageUsage }
  from '../api/client'
import { useCurrentSession } from '../api/SessionContext'
import {
  deleteLocal, download, listLocal, readUserFile, saveLocal, upload, type LocalDataset,
} from '../datasets/mine'

function megabytes(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const STATE_LABEL: Record<string, string> = {
  RUNNING: 'stopped before it finished',
  SUCCEEDED: 'finished',
  FAILED: 'failed',
}

export function SpaceView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null

  const [local, setLocal] = useState<LocalDataset[]>([])
  const [remote, setRemote] = useState<StoredDataset[]>([])
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLocal(await listLocal())
    if (!token) return
    try {
      const [stored, used, history] = await Promise.all([
        api.listDatasets(token), api.storageUsage(token), api.listRuns(token),
      ])
      setRemote(stored)
      setUsage(used)
      setRuns(history)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'the server could not be reached')
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  async function addFile(file: File) {
    setBusy('reading')
    setProblem(null)
    try {
      const dataset = await readUserFile(file)
      await saveLocal(dataset)
      await refresh()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'that file could not be read')
    } finally {
      setBusy(null)
    }
  }

  async function push(dataset: LocalDataset) {
    if (!token) return
    setBusy(dataset.id)
    setProblem(null)
    try {
      await upload(token, dataset)
      await refresh()
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'the upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function pull(stored: StoredDataset) {
    if (!token) return
    setBusy(stored.id)
    try {
      await download(token, stored.id)
      await refresh()
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'the download failed')
    } finally {
      setBusy(null)
    }
  }

  const used = usage ? usage.usedBytes / usage.quotaBytes : 0
  const uploaded = new Set(local.map((d) => d.remoteId).filter(Boolean))

  return (
    <>
      <section>
        <h2><span className="step">01</span> Your datasets</h2>

        <div className="upload-row">
          <input ref={fileInput} type="file" accept=".mat,.csv,.tsv,.txt" hidden
                 onChange={(e) => {
                   const file = e.target.files?.[0]
                   if (file) void addFile(file)
                   e.target.value = ''
                 }} />
          <button type="button" className="primary" disabled={busy === 'reading'}
                  onClick={() => fileInput.current?.click()}>
            {busy === 'reading' ? 'Reading…' : 'Add a file'}
          </button>
          <p className="muted">
            A <code>.mat</code> with a matrix and a label vector, or a CSV whose
            last column is the class label. It is read here, in this browser —
            nothing is sent anywhere until you upload it.
          </p>
        </div>

        {problem && <p className="error">{problem}</p>}

        {usage && (
          <div className="quota">
            <div className="quota-bar">
              <div style={{ width: `${Math.min(100, used * 100)}%` }} />
            </div>
            <span className="muted">
              {megabytes(usage.usedBytes)} of {megabytes(usage.quotaBytes)} used
              {usage.datasets > 0 && ` · ${usage.datasets} uploaded`}
            </span>
          </div>
        )}

        {local.length === 0 && remote.length === 0 && (
          <p className="muted">
            Nothing here yet. Add a file above, or run one of the examples in the
            experiment space.
          </p>
        )}

        {local.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>in this browser</th><th>samples</th><th>features</th>
                  <th>classes</th><th>size</th><th>server</th><th />
                </tr>
              </thead>
              <tbody>
                {local.map((dataset) => (
                  <tr key={dataset.id}>
                    <td>{dataset.name}</td>
                    <td>{dataset.samples.toLocaleString()}</td>
                    <td>{dataset.featureCount.toLocaleString()}</td>
                    <td>{dataset.classes}</td>
                    <td>{megabytes(dataset.features.byteLength + dataset.labels.byteLength)}</td>
                    <td>
                      {dataset.remoteId
                        ? <span className="muted">uploaded</span>
                        : (
                          <button type="button" className="ghost" disabled={busy === dataset.id}
                                  onClick={() => void push(dataset)}>
                            {busy === dataset.id ? 'Uploading…' : 'Upload'}
                          </button>
                        )}
                    </td>
                    <td>
                      <button type="button" className="ghost"
                              onClick={() => void deleteLocal(dataset.id).then(refresh)}>
                        Remove here
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {remote.filter((r) => !uploaded.has(r.id)).length > 0 && (
          <>
            <h3 className="sub">On the server, not in this browser</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>name</th><th>samples</th><th>features</th><th>size</th><th /><th /></tr>
                </thead>
                <tbody>
                  {remote.filter((r) => !uploaded.has(r.id)).map((stored) => (
                    <tr key={stored.id}>
                      <td>{stored.name}</td>
                      <td>{stored.samples.toLocaleString()}</td>
                      <td>{stored.features.toLocaleString()}</td>
                      <td>{megabytes(stored.sizeBytes)}</td>
                      <td>
                        <button type="button" className="ghost" disabled={busy === stored.id}
                                onClick={() => void pull(stored)}>
                          {busy === stored.id ? 'Fetching…' : 'Bring here'}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="ghost"
                                onClick={() => token && void api.deleteDataset(token, stored.id)
                                  .then(refresh)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2><span className="step">02</span> Your runs</h2>
        {!runs && <p className="muted">Reading…</p>}
        {runs && runs.length === 0 && (
          <p className="muted">No runs yet. Every run you start while signed in is kept here.</p>
        )}
        {runs && runs.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>benchmark</th><th>windows</th><th>best RI</th>
                  <th>state</th><th>started</th><th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.datasetName}</td>
                    <td>{run.state === 'SUCCEEDED'
                      ? run.windowsTotal
                      : `${run.windowsDone} / ${run.windowsTotal}`}</td>
                    <td>{run.bestRandIndex !== undefined
                      ? run.bestRandIndex.toFixed(4) : '—'}</td>
                    <td>{STATE_LABEL[run.state] ?? run.state}</td>
                    <td>{when(run.createdAt)}</td>
                    <td>
                      <button type="button" className="ghost"
                              onClick={() => {
                                setRuns((rows) => rows?.filter((r) => r.id !== run.id) ?? null)
                                if (token) void api.deleteRun(token, run.id).catch(refresh)
                              }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
