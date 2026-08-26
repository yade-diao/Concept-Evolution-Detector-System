/**
 * Telling whoever runs this that something is wrong.
 *
 * Open to anyone, signed in or not, because requiring an account first is how
 * you stop hearing about the thing that is broken. It goes into the
 * application, not into a mailbox: this deployment cannot receive mail - its
 * name is a *.cloudapp.azure.com subdomain and nothing can point an MX record
 * at it - so a mailto: link here would be a promise nobody could keep.
 *
 * The reply address is optional and says so. Asking for one and then not
 * replying is worse than not asking.
 */

import { useState } from 'react'

import { api, ApiError } from '../api/client'
import { useCurrentSession } from '../api/SessionContext'

export function Feedback() {
  const { session } = useCurrentSession()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        Something wrong? Tell me
      </button>
    )
  }

  if (state === 'sent') {
    return <p className="muted">Sent. Thank you — it is read.</p>
  }

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setState('sending')
    setError(null)
    try {
      await api.sendFeedback(session?.token ?? null, {
        subject: subject.trim(),
        body: body.trim(),
        replyTo: replyTo.trim() || undefined,
      })
      setState('sent')
    } catch (cause) {
      setState('idle')
      setError(cause instanceof ApiError ? cause.message : 'that could not be sent')
    }
  }

  return (
    <form className="feedback" onSubmit={send}>
      <input value={subject} placeholder="what it is about" required maxLength={200}
             onChange={(e) => setSubject(e.target.value)} />
      <textarea value={body} placeholder="what happened" required rows={4} maxLength={5000}
                onChange={(e) => setBody(e.target.value)} />
      <input type="email" value={replyTo} maxLength={320}
             placeholder="your email, only if you want an answer"
             onChange={(e) => setReplyTo(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send'}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}
