/**
 * The way in, and what each way in gets you.
 *
 * Three doors, and the page says what is behind each rather than making the
 * visitor find out by hitting a wall. An account gets a personal space: your
 * own datasets, kept across machines, and every run recorded. A guest gets the
 * example benchmarks and runs that live in this tab. Both compute in the
 * browser either way - the difference is what is kept, not what is possible.
 */

import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useCurrentSession } from '../api/SessionContext'

export function SignInView() {
  const { session, busy, error, authenticate, confirm, continueAsGuest } = useCurrentSession()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string; because?: string } }
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Set once the server says it mailed a code instead of creating an account.
  const [awaitingCode, setAwaitingCode] = useState(false)
  const [code, setCode] = useState('')

  if (session) return <Navigate to={location.state?.from ?? '/'} replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const outcome = await authenticate(mode, email.trim(), password)
    if (outcome === 'signed-in') navigate(location.state?.from ?? '/', { replace: true })
    if (outcome === 'awaiting-code') setAwaitingCode(true)
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault()
    if (await confirm(email.trim(), code.trim())) {
      navigate(location.state?.from ?? '/', { replace: true })
    }
  }

  if (awaitingCode) {
    return (
      <div className="signin-page">
        <div className="signin-card">
          <h2>Check your email</h2>
          <p>
            A six-digit code is on its way to <strong>{email}</strong>. It is
            good for fifteen minutes, and nothing has been created yet — the
            account exists once the code is in.
          </p>
          <form onSubmit={submitCode}>
            <label>
              <span>Code</span>
              <input value={code} required inputMode="numeric" pattern="[0-9]{6}"
                     maxLength={6} autoComplete="one-time-code"
                     onChange={(e) => setCode(e.target.value)} />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Checking…' : 'Create my account'}
            </button>
          </form>
          <p className="what-you-get">
            Nothing arrived? Five wrong codes end the attempt, so start again
            rather than guessing — <button type="button" className="ghost"
            onClick={() => { setAwaitingCode(false); setCode('') }}>go back</button>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="signin-page">
      <div className="signin-card">
        {location.state?.because && (
          <p className="notice">{location.state.because}</p>
        )}

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'on' : ''}
                  onClick={() => setMode('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'}
                  className={mode === 'register' ? 'on' : ''}
                  onClick={() => setMode('register')}>Create account</button>
        </div>

        <form onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" value={email} required autoComplete="username"
                   onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} required minLength={12}
                   autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                   onChange={(e) => setPassword(e.target.value)} />
          </label>

          {mode === 'register' && (
            <p className="muted">
              At least 12 characters, and no rule about symbols — length is what
              buys anything. Nothing else is asked for.
            </p>
          )}
          {error && <p className="error">{error}</p>}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="what-you-get">
          An account gets a personal space: your own datasets, kept on the server
          and available from another machine, and every run you start recorded
          with the parameters that produced it.
        </p>
      </div>

      <div className="signin-card guest">
        <h2>Or look around first</h2>
        <p>
          A guest session runs the example benchmarks — the same detector, the
          same charts, the same readings. Runs are kept for this tab only, and
          uploading your own data needs an account.
        </p>
        <button type="button" disabled={busy}
                onClick={async () => { if (await continueAsGuest()) navigate('/') }}>
          Continue as guest
        </button>
      </div>
    </div>
  )
}
