/**
 * The inbox, which is this deployment's notification channel.
 *
 * Nothing can be mailed out of here without a relay somebody pays for and a
 * domain somebody owns, so the events that would have been emails - a
 * registration, a guest keeping their work - are written here beside the
 * feedback, and the rail carries the unread count. It is a weaker channel than
 * mail and the page says so rather than implying a notification arrived
 * somewhere it did not.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError, type FeedbackMessage } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'
import { refreshUnread, setUnread } from '../api/unread'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function InboxView() {
  const { session } = useCurrentSession()
  const token = session?.token ?? null
  const [messages, setMessages] = useState<FeedbackMessage[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setMessages(await api.listMessages(token))
      setProblem(null)
      void refreshUnread(token)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'that could not be read')
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  if (problem) return <p className="error">{problem}</p>
  if (!messages) return <p className="muted">Reading…</p>

  const unread = messages.filter((m) => !m.readAt).length

  if (messages.length === 0) {
    return (
      <div className="empty">
        <strong>Nothing yet.</strong>
        <span>Registrations and anything a visitor sends through the feedback form
          arrive here.</span>
      </div>
    )
  }

  return (
    <>
      {unread > 0 && (
        <div className="inbox-head">
          <p className="muted">{unread} unread of {messages.length}.</p>
          <button type="button" className="ghost"
                  onClick={() => token && void api.markAllMessagesRead(token)
                    .then(() => { setUnread(0); return refresh() })}>
            Mark all read
          </button>
        </div>
      )}

      {messages.map((message) => (
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
                        .then(refresh)}>Mark read</button>
            )}
            {token && (
              <button type="button" className="ghost danger"
                      onClick={() => void api.deleteMessage(token, message.id)
                        .then(refresh)}>Delete</button>
            )}
          </div>
        </article>
      ))}
    </>
  )
}
