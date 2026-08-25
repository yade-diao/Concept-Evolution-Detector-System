/**
 * Signing in, and what signing in is for.
 *
 * An account buys exactly one thing here: runs are kept. Everything else works
 * signed out, because the computation is local and the server has no part in
 * it - so these controls say what they give you rather than demanding a login
 * the way a page does when it has nothing to offer yet.
 *
 * Three states, and the middle one is the point. A **guest** session belongs to
 * this tab: it keeps runs while you are here and is gone when the tab closes,
 * because a guest has no address and no password, so the token in this tab is
 * the only thing that can ever reach those runs again. The control says that
 * plainly rather than implying a persistence nothing can deliver, and offers
 * the one way out of it - claiming the session, which keeps the runs already in
 * it.
 */

import { useState } from 'react'

import { useCurrentSession } from '../api/SessionContext'

type Form = 'none' | 'signin' | 'claim'

export function AccountBar() {
  const { session, busy, error, authenticate, continueAsGuest, claim, signOut } =
    useCurrentSession()
  const [form, setForm] = useState<Form>('none')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit(action: 'login' | 'register' | 'claim') {
    const done = action === 'claim'
      ? await claim(email.trim(), password)
      : await authenticate(action, email.trim(), password)
    if (done) {
      setForm('none')
      setPassword('')
    }
  }

  if (form !== 'none') {
    const claiming = form === 'claim'
    return (
      <form
        className="account signin"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(claiming ? 'claim' : 'login')
        }}
      >
        <input
          type="email" value={email} placeholder="email"
          autoComplete="username" required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password" value={password} placeholder="password"
          autoComplete={claiming ? 'new-password' : 'current-password'}
          minLength={12} required
          onChange={(e) => setPassword(e.target.value)}
        />

        {claiming ? (
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Keeping…' : 'Keep my runs'}
          </button>
        ) : (
          <>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" disabled={busy} onClick={() => void submit('register')}>
              Create account
            </button>
          </>
        )}

        <button type="button" className="ghost" onClick={() => setForm('none')}>Cancel</button>
        {error && <p className="error">{error}</p>}
        <p className="muted">
          {claiming
            ? 'The runs in this tab move to the account. Nothing else changes.'
            : 'A new account needs a password of at least 12 characters. Nothing else is asked for, and the data you run on never leaves this browser.'}
        </p>
      </form>
    )
  }

  if (session?.kind === 'account') {
    return (
      <div className="account">
        <span className="who" title={session.email ?? ''}>{session.email}</span>
        <button type="button" className="ghost" onClick={signOut}>Sign out</button>
      </div>
    )
  }

  if (session?.kind === 'guest') {
    return (
      <div className="account">
        <span className="who">guest · this tab only</span>
        <button type="button" onClick={() => setForm('claim')}>Keep my runs</button>
        <button type="button" className="ghost" onClick={signOut}>Leave</button>
      </div>
    )
  }

  return (
    <div className="account">
      <button type="button" className="ghost" disabled={busy}
              onClick={() => void continueAsGuest()}>
        Continue as guest
      </button>
      <button type="button" onClick={() => setForm('signin')}>Sign in</button>
    </div>
  )
}
