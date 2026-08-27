/**
 * Who has an account, and the one thing that can be done about it.
 *
 * Deliberately not a control panel. An administrator can see who is here, how
 * much they have run, and delete an account with everything it owns - and
 * nothing else. There is no way to read somebody's runs or their data, because
 * there is no operational reason to and the absence of the endpoint is the
 * only guarantee worth having.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError, type AccountRow } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function AccountsView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setAccounts(await api.listAccounts(token))
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'that could not be read')
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  if (problem) return <p className="error">{problem}</p>
  if (!accounts) return <p className="muted">Reading…</p>

  const guests = accounts.filter((a) => a.role === 'GUEST').length

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{accounts.length} accounts</span>
        <span className="muted">
          {guests} of them guest sessions, deleted with their runs a day after they start
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>account</th><th>role</th><th>runs</th>
              <th>created</th><th>expires</th><th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.role.toLowerCase()}</td>
                <td>{row.runs}</td>
                <td>{when(row.createdAt)}</td>
                <td>{row.expiresAt ? when(row.expiresAt) : '—'}</td>
                <td>
                  <button type="button" className="ghost danger"
                          onClick={() => token && void api.deleteAccount(token, row.id)
                            .then(refresh)
                            .catch((cause: unknown) => setProblem(cause instanceof ApiError
                              ? cause.message : 'that account could not be deleted'))}>
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
