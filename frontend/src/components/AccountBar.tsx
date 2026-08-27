/**
 * Who this tab belongs to, at the foot of the rail.
 *
 * Only ever shown to someone who has a session, because the gate is where
 * sessions start now - so there is no signed-out state here and no sign-in
 * form. Two states remain, and the second one is the point.
 *
 * A **guest** session belongs to this tab: it keeps runs while you are here
 * and is gone when the tab closes, because a guest has no address and no
 * password, so the token in this tab is the only thing that can ever reach
 * those runs again. It says that plainly rather than implying a persistence
 * nothing can deliver, and offers the one way out - claiming the session,
 * which keeps the runs already in it.
 */

import { useState } from 'react'

import { useCurrentSession } from '../api/SessionContext'

export function AccountBar() {
  const { session, busy, error, claim, signOut } = useCurrentSession()
  const [claiming, setClaiming] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (claiming) {
    return (
      <form
        className="account claiming"
        onSubmit={async (event) => {
          event.preventDefault()
          if (await claim(email.trim(), password)) {
            setClaiming(false)
            setPassword('')
          }
        }}
      >
        <input type="email" value={email} placeholder="email" required
               autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
        <input type="password" value={password} placeholder="password, 12+" required
               minLength={12} autoComplete="new-password"
               onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Keeping…' : 'Keep my runs'}
        </button>
        <button type="button" className="ghost" onClick={() => setClaiming(false)}>Cancel</button>
        {error && <p className="error">{error}</p>}
        <p className="muted">The runs in this tab move to the account. Nothing else changes.</p>
      </form>
    )
  }

  if (session?.kind === 'guest') {
    return (
      <div className="account">
        <span className="who">guest · this tab only</span>
        <button type="button" onClick={() => setClaiming(true)}>Keep my runs</button>
        <button type="button" className="ghost" onClick={signOut}>Leave</button>
      </div>
    )
  }

  return (
    <div className="account">
      <span className="who" title={session?.email ?? ''}>{session?.email}</span>
      <button type="button" className="ghost" onClick={signOut}>Sign out</button>
    </div>
  )
}
