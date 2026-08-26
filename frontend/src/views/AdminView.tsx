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

import { api, ApiError, type AccountRow, type FeedbackMessage, type MailOverview }
  from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type Tab = 'accounts' | 'messages' | 'mail'

export function AdminView() {
  const { session } = useCurrentSession()
  const [tab, setTab] = useState<Tab>('accounts')
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [messages, setMessages] = useState<FeedbackMessage[] | null>(null)
  const [mail, setMail] = useState<MailOverview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const [people, sent, log] = await Promise.all([
        api.listAccounts(session.token),
        api.listMessages(session.token),
        api.mailOverview(session.token),
      ])
      setAccounts(people)
      setMessages(sent)
      setMail(log)
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'that could not be read')
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
  const unread = messages?.filter((m) => !m.readAt).length ?? 0

  return (
    <section>
      <div className="tabs admin-tabs" role="tablist">
        <button type="button" role="tab" className={tab === 'accounts' ? 'on' : ''}
                aria-selected={tab === 'accounts'}
                onClick={() => setTab('accounts')}>Accounts</button>
        <button type="button" role="tab" className={tab === 'messages' ? 'on' : ''}
                aria-selected={tab === 'messages'}
                onClick={() => setTab('messages')}>
          Messages{unread > 0 ? ` (${unread})` : ''}
        </button>
        <button type="button" role="tab" className={tab === 'mail' ? 'on' : ''}
                aria-selected={tab === 'mail'}
                onClick={() => setTab('mail')}>Mail sent</button>
      </div>

      {problem && <p className="error">{problem}</p>}

      {tab === 'messages' && (
        <>
          <p className="muted">
            Feedback arrives here rather than by mail: this deployment cannot
            receive any — nothing can point an MX record at a cloudapp.azure.com
            name.
          </p>
          {messages?.length === 0 && <p className="muted">Nothing yet.</p>}
          {messages?.map((message) => (
            <article key={message.id} className={message.readAt ? 'message read' : 'message'}>
              <header>
                <strong>{message.subject}</strong>
                <span className="muted">
                  {message.from ?? 'not signed in'}
                  {message.replyTo && ` · ${message.replyTo}`} · {when(message.createdAt)}
                </span>
              </header>
              <p>{message.body}</p>
              <div className="actions">
                {!message.readAt && session && (
                  <button type="button" className="ghost"
                          onClick={() => void api.markMessageRead(session.token, message.id)
                            .then(load)}>Mark read</button>
                )}
                {session && (
                  <button type="button" className="ghost"
                          onClick={() => void api.deleteMessage(session.token, message.id)
                            .then(load)}>Delete</button>
                )}
              </div>
            </article>
          ))}
        </>
      )}

      {tab === 'mail' && mail && (
        <>
          <p className={mail.relayConfigured ? 'muted' : 'locked'}>
            {mail.relayConfigured
              ? 'A relay is configured, so verification codes are being sent.'
              : 'No relay is configured, so codes are recorded here instead of sent — and '
                + 'registration stays one step. Set ced.mail.* on the server to turn it on.'}
          </p>
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
          {mail.sent.length === 0 && <p className="muted">Nothing sent yet.</p>}
        </>
      )}

      {tab === 'accounts' && !accounts && !problem && <p className="muted">Reading…</p>}

      {tab === 'accounts' && accounts && (
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
