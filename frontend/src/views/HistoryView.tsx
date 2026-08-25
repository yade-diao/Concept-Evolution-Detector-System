/**
 * The runs this account has kept.
 *
 * What a run is worth keeping for is comparison: the same benchmark at two
 * window sizes, or the same window size across benchmarks. So the list leads
 * with the things you would compare - what it ran on, how it was cut, what it
 * scored - and the identifier is not shown at all, because nobody compares
 * runs by UUID.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError, type RunSummary } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

function when(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const STATE_LABEL: Record<string, string> = {
  RUNNING: 'stopped before it finished',
  SUCCEEDED: 'finished',
  FAILED: 'failed',
}

export function HistoryView() {
  const { session } = useCurrentSession()
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      setRuns(await api.listRuns(session.token))
      setError(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'the runs could not be read')
    }
  }, [session])

  useEffect(() => { void load() }, [load])

  if (!session) {
    return (
      <section>
        <h2>Saved runs</h2>
        <p className="muted">
          Sign in above and every run you start is kept here: the benchmark, the
          parameters, and what it found.
        </p>
      </section>
    )
  }

  async function remove(id: string) {
    if (!session) return
    setRuns((current) => current?.filter((run) => run.id !== id) ?? null)
    try {
      await api.deleteRun(session.token, id)
    } catch {
      void load()   // put it back if the server disagreed
    }
  }

  return (
    <section>
      <h2>Saved runs</h2>

      {error && <p className="error">{error}</p>}
      {!runs && !error && <p className="muted">Reading…</p>}
      {runs && runs.length === 0 && (
        <p className="muted">
          Nothing yet. Runs you start while signed in are kept here.
        </p>
      )}

      {runs && runs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>benchmark</th>
                <th>windows</th>
                <th>best RI</th>
                <th>state</th>
                <th>started</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.datasetName}</td>
                  <td>
                    {run.state === 'SUCCEEDED'
                      ? run.windowsTotal
                      : `${run.windowsDone} / ${run.windowsTotal}`}
                  </td>
                  <td>{run.bestRandIndex !== undefined
                    ? run.bestRandIndex.toFixed(4) : '—'}</td>
                  <td>{STATE_LABEL[run.state] ?? run.state}</td>
                  <td>{when(run.createdAt)}</td>
                  <td>
                    <button type="button" className="ghost"
                            onClick={() => void remove(run.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
