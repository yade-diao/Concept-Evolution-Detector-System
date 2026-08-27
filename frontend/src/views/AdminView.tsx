/**
 * Accounts, the inbox, and what the server tried to send.
 *
 * Deliberately not a control panel. An administrator here can see who has an
 * account, how much they have run, and delete an account with everything it
 * owns - and nothing else. There is no way to read somebody's runs or their
 * data, because there is no operational reason to and the absence of the
 * endpoint is the only guarantee worth having.
 *
 * The inbox is the second half, and it is the deployment's notification
 * channel rather than a convenience. Nothing can be mailed out of here without
 * a relay somebody pays for and a domain somebody owns, so the events that
 * would have been emails - a registration, a guest keeping their work - are
 * written here beside the feedback, and the header carries the unread count.
 * It is a weaker channel than mail and the page says so rather than implying a
 * notification arrived somewhere it did not.
 */

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api, ApiError, type AccountRow, type FeedbackMessage, type MailOverview }
  from '../api/client'
import { useCurrentSession } from '../api/SessionContext'
import { refreshUnread, setUnread } from '../api/unread'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type Tab = 'accounts' | 'messages' | 'mail'

const TABS: Tab[] = ['accounts', 'messages', 'mail']

export function AdminView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null
  // The tab lives in the URL so the header's badge can point at the inbox
  // rather than at the page and hope.
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab') as Tab | null
  const tab: Tab = asked && TABS.includes(asked) ? asked : 'accounts'

  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [messages, setMessages] = useState<FeedbackMessage[] | null>(null)
  const [mail, setMail] = useState<MailOverview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const [people, sent, log] = await Promise.all([
        api.listAccounts(token),
        api.listMessages(token),
        api.mailOverview(token),
      ])
      setAccounts(people)
      setMessages(sent)
      setMail(log)
      setProblem(null)
      void refreshUnread(token)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'that could not be read')
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  function show(next: Tab) {
    setParams(next === 'accounts' ? {} : { tab: next }, { replace: true })
  }

  async function remove(row: AccountRow) {
    if (!token) return
    setProblem(null)
    try {
      await api.deleteAccount(token, row.id)
      await load()
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'that account could not be deleted')
    }
  }

  async function readEverything() {
    if (!token) return
    await api.markAllMessagesRead(token)
    setUnread(0)
    await load()
  }

  const guests = accounts?.filter((a) => a.role === 'GUEST').length ?? 0
  const unread = messages?.filter((m) => !m.readAt).length ?? 0

  return (
    <section>
      <div className="tabs admin-tabs" role="tablist">
        <button type="button" role="tab" className={tab === 'accounts' ? 'on' : ''}
                aria-selected={tab === 'accounts'}
                onClick={() => show('accounts')}>Accounts</button>
        <button type="button" role="tab" className={tab === 'messages' ? 'on' : ''}
                aria-selected={tab === 'messages'}
                onClick={() => show('messages')}>
          Inbox{unread > 0 ? ` (${unread})` : ''}
        </button>
        <button type="button" role="tab" className={tab === 'mail' ? 'on' : ''}
                aria-selected={tab === 'mail'}
                onClick={() => show('mail')}>Mail out</button>
      </div>

      {problem && <p className="error">{problem}</p>}

      {tab === 'messages' && (
        <>
          <div className="inbox-head">
            <p className="muted">
              Both halves of what would have been email: what visitors wrote,
              and what the server has to report. Nothing is pushed anywhere —
              the count in the header is the notification.
            </p>
            {unread > 0 && (
              <button type="button" className="ghost" onClick={() => void readEverything()}>
                Mark all read
              </button>
            )}
          </div>
          {messages?.length === 0 && <p className="muted">Nothing yet.</p>}
          {messages?.map((message) => (
            <article key={message.id}
                     className={[
                       'message',
                       message.kind === 'NOTICE' ? 'notice' : '',
                       message.readAt ? 'read' : '',
                     ].filter(Boolean).join(' ')}>
              <header>
                <strong>
                  {message.kind === 'NOTICE' && <span className="tag">server</span>}
                  {message.subject}
                </strong>
                <span className="muted">
                  {message.kind === 'NOTICE'
                    ? when(message.createdAt)
                    : <>
                        {message.from ?? 'not signed in'}
                        {message.replyTo && ` · ${message.replyTo}`} · {when(message.createdAt)}
                      </>}
                </span>
              </header>
              <p>{message.body}</p>
              <div className="actions">
                {!message.readAt && token && (
                  <button type="button" className="ghost"
                          onClick={() => void api.markMessageRead(token, message.id)
                            .then(load)}>Mark read</button>
                )}
                {token && (
                  <button type="button" className="ghost"
                          onClick={() => void api.deleteMessage(token, message.id)
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
              ? 'A relay is configured, so registration asks for a code and this is what went out.'
              : 'No relay is configured, and that is the current decision rather than an oversight'
                + ' — sending mail from here needs a domain and a provider. So registration is one'
                + ' step with an unverified address, and anything the server would have mailed'
                + ' goes to the inbox instead. Set ced.mail.* on the server to turn sending on.'}
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
