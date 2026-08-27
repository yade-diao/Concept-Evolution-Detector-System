/**
 * What you have run, and how it went.
 *
 * A run is recorded when it starts, not when it finishes, which is why a state
 * column exists at all: a run stopped halfway is a fact about the afternoon,
 * and hiding it would make the list a record of successes rather than of what
 * happened.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, ApiError, type RunSummary } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

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

export function RunsView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setRuns(await api.listRuns(token))
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'the server could not be reached')
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  if (problem) return <p className="error">{problem}</p>
  if (!runs) return <p className="muted">Reading…</p>

  if (runs.length === 0) {
    return (
      <div className="empty">
        <strong>No runs yet.</strong>
        <span>Every run you start while signed in is recorded here with the parameters
          that produced it.</span>
        <Link className="btn" to="/">Go to the experiment</Link>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{runs.length} runs</span>
      </div>
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
                  <button type="button" className="ghost danger"
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
    </div>
  )
}
