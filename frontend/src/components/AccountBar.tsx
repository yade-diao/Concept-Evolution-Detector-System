/**
 * Signing in, and what signing in is for.
 *
 * An account here buys exactly one thing: runs are kept. Everything else works
 * signed out, because the computation is local and the server has no part in
 * it - so the control says what it gives you rather than demanding a login the
 * way a page does when it has nothing to offer yet.
 */

import { useState } from 'react'

import { useCurrentSession } from '../api/SessionContext'

export function AccountBar() {
  const { session, busy, error, authenticate, signOut } = useCurrentSession()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (session) {
    return (
      <div className="account">
        <span className="who" title={session.email}>{session.email}</span>
        <button type="button" className="ghost" onClick={signOut}>Sign out</button>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="account">
        <span className="muted">Runs are kept when you sign in</span>
        <button type="button" onClick={() => setOpen(true)}>Sign in</button>
      </div>
    )
  }

  async function submit(kind: 'login' | 'register') {
    if (await authenticate(kind, email.trim(), password)) {
      setOpen(false)
      setPassword('')
    }
  }

  return (
    <form className="account signin" onSubmit={(e) => { e.preventDefault(); void submit('login') }}>
      <input
        type="email" value={email} placeholder="email" autoComplete="username"
        onChange={(e) => setEmail(e.target.value)} required
      />
      <input
        type="password" value={password} placeholder="password"
        autoComplete="current-password" minLength={12}
        onChange={(e) => setPassword(e.target.value)} required
      />
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <button type="button" disabled={busy} onClick={() => void submit('register')}>
        Create account
      </button>
      <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        A new account needs a password of at least 12 characters. Nothing else is
        asked for, and the data you run on never leaves this browser.
      </p>
    </form>
  )
}
