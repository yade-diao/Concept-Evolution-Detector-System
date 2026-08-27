/**
 * What the server tried to send, and whether it went.
 *
 * The only place that can answer "why did my code not arrive": whether it was
 * generated, which address it went to, and what the relay said. The body is
 * never stored, so this is not a way to read anybody's code.
 */

import { useEffect, useState } from 'react'

import { api, ApiError, type MailOverview } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function MailView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null
  const [mail, setMail] = useState<MailOverview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    api.mailOverview(token).then(setMail).catch((cause: unknown) =>
      setProblem(cause instanceof ApiError ? cause.message : 'that could not be read'))
  }, [token])

  if (problem) return <p className="error">{problem}</p>
  if (!mail) return <p className="muted">Reading…</p>

  return (
    <>
      <p className={mail.relayConfigured ? 'section-note' : 'locked'}>
        {mail.relayConfigured
          ? 'A relay is configured, so registration asks for a code and this is what went out.'
          : 'No relay is configured, and that is the current decision rather than an oversight'
            + ' — sending mail from here needs a domain and a provider. So registration is one'
            + ' step with an unverified address, and anything the server would have mailed goes'
            + ' to the inbox instead. Set ced.mail.* on the server to turn sending on.'}
      </p>

      {mail.sent.length === 0 ? (
        <div className="empty">
          <strong>Nothing sent.</strong>
          <span>With no relay configured there is nothing to send it with.</span>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>to</th><th>subject</th><th>delivered</th><th>detail</th><th>when</th></tr>
              </thead>
              <tbody>
                {mail.sent.map((row) => (
                  <tr key={row.id}>
                    <td>{row.recipient}</td>
                    <td>{row.subject}</td>
                    <td>{row.delivered ? 'yes' : 'no'}</td>
                    <td>{row.detail ?? '—'}</td>
                    <td>{when(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
