/**
 * Accounts, and the ability to remove one.
 *
 * Deliberately not a control panel. An administrator here can see who has an
 * account, how much they have run, and delete an account with everything it
 * owns - and nothing else. There is no way to read somebody's runs or their
 * data, because there is no operational reason to and the absence of the
 * endpoint is the only guarantee worth having.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError, type AccountRow } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function AdminView() {
  const { session } = useCurrentSession()
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      setAccounts(await api.listAccounts(session.token))
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'the accounts could not be read')
    }
  }, [session])

  useEffect(() => { void load() }, [load])

  async function remove(row: AccountRow) {
    if (!session) return
    setProblem(null)
    try {
      await api.deleteAccount(session.token, row.id)
      await load()
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'that account could not be deleted')
    }
  }

  const guests = accounts?.filter((a) => a.role === 'GUEST').length ?? 0

  return (
    <section>
      <h2>Accounts</h2>
      {problem && <p className="error">{problem}</p>}
      {!accounts && !problem && <p className="muted">Reading…</p>}

      {accounts && (
        <>
          <p className="muted">
            {accounts.length} accounts, {guests} of them guest sessions. A guest is
            deleted with its runs a day after it starts.
          </p>
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
                      <button type="button" className="ghost"
                              onClick={() => void remove(row)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
