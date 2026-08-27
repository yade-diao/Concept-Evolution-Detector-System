/**
 * The files someone brought, here and on the server.
 *
 * The distinction between local and uploaded is shown rather than hidden,
 * because it is the one that matters: a dataset in this browser works offline
 * and never leaves the machine; a dataset on the server is there from your
 * other machine and counts against 25 MB. Files start local, and uploading is
 * something you choose.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { api, ApiError, type StoredDataset, type StorageUsage } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'
import {
  deleteLocal, download, listLocal, readUserFile, saveLocal, upload, type LocalDataset,
} from '../datasets/mine'

function megabytes(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function DatasetsView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null

  const [local, setLocal] = useState<LocalDataset[]>([])
  const [remote, setRemote] = useState<StoredDataset[]>([])
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLocal(await listLocal())
    if (!token) return
    try {
      const [stored, used] = await Promise.all([
        api.listDatasets(token), api.storageUsage(token),
      ])
      setRemote(stored)
      setUsage(used)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'the server could not be reached')
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  async function addFile(file: File) {
    setBusy('reading')
    setProblem(null)
    try {
      await saveLocal(await readUserFile(file))
      await refresh()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'that file could not be read')
    } finally {
      setBusy(null)
    }
  }

  async function act(id: string, run: () => Promise<unknown>, failure: string) {
    setBusy(id)
    setProblem(null)
    try {
      await run()
      await refresh()
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : failure)
    } finally {
      setBusy(null)
    }
  }

  const used = usage ? usage.usedBytes / usage.quotaBytes : 0
  const uploaded = new Set(local.map((d) => d.remoteId).filter(Boolean))
  const onlyRemote = remote.filter((r) => !uploaded.has(r.id))

  return (
    <>
      <section>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Add a dataset</span>
            <div className="panel-actions">
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
            </div>
          </div>
          <div className="panel-body">
            <p className="muted">
              A <code>.mat</code> with a matrix and a label vector, or a CSV whose last
              column is the class label. It is read here, in this browser — nothing is
              sent anywhere until you upload it.
            </p>
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
            {problem && <p className="error">{problem}</p>}
          </div>
        </div>
      </section>

      <section>
        <div className="section-head"><h2>In this browser</h2></div>
        {local.length === 0 ? (
          <div className="empty">
            <strong>No files here yet.</strong>
            <span>Add one above and it is ready to run immediately — no upload, no account
              needed for the reading itself.</span>
          </div>
        ) : (
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>name</th><th>samples</th><th>features</th>
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
                                    onClick={() => token && void act(dataset.id,
                                      () => upload(token, dataset), 'the upload failed')}>
                              {busy === dataset.id ? 'Uploading…' : 'Upload'}
                            </button>
                          )}
                      </td>
                      <td>
                        <button type="button" className="ghost danger"
                                onClick={() => void deleteLocal(dataset.id).then(refresh)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {onlyRemote.length > 0 && (
        <section>
          <div className="section-head">
            <h2>On the server, not in this browser</h2>
          </div>
          <p className="section-note">
            Uploaded from another machine. Bring one here to run on it.
          </p>
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>name</th><th>samples</th><th>features</th><th>size</th><th /><th /></tr>
                </thead>
                <tbody>
                  {onlyRemote.map((stored) => (
                    <tr key={stored.id}>
                      <td>{stored.name}</td>
                      <td>{stored.samples.toLocaleString()}</td>
                      <td>{stored.features.toLocaleString()}</td>
                      <td>{megabytes(stored.sizeBytes)}</td>
                      <td>
                        <button type="button" className="ghost" disabled={busy === stored.id}
                                onClick={() => token && void act(stored.id,
                                  () => download(token, stored.id), 'the download failed')}>
                          {busy === stored.id ? 'Fetching…' : 'Bring here'}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="ghost danger"
                                onClick={() => token && void act(stored.id,
                                  () => api.deleteDataset(token, stored.id), 'that could not be deleted')}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
