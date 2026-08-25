/**
 * Who is signed in, for as long as the token lasts.
 *
 * The token is kept with the instant it expires, so the page can sign someone
 * out before a request fails rather than after: a 401 in the middle of
 * submitting a finished run loses the run, and the run took minutes.
 *
 * **Where** it is kept says what the session is. An account goes to
 * localStorage and survives the browser being closed, because there is a
 * password to sign back in with either way. A guest goes to sessionStorage and
 * dies with the tab - deliberately, because that matches what a guest is: no
 * address, no password, and a token that is the only handle on the runs behind
 * it. Keeping that token where it outlives the visit would promise a
 * persistence nothing can deliver, since a cleared browser leaves those runs
 * unreachable by anyone, forever.
 *
 * Nothing here is a security boundary - the server is. This only decides which
 * buttons are worth showing.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError } from './client'

const KEY = 'ced-session'

export interface Session {
  /** An account has an address; a guest has nothing to be called. */
  email: string | null
  token: string
  kind: 'account' | 'guest'
  /** Epoch milliseconds. */
  expiresAt: number
}

function store(kind: Session['kind']): Storage {
  return kind === 'guest' ? sessionStorage : localStorage
}

function read(): Session | null {
  for (const kind of ['account', 'guest'] as const) {
    try {
      const raw = store(kind).getItem(KEY)
      if (!raw) continue
      const session = JSON.parse(raw) as Session
      // A token with under a minute left is treated as already gone; the
      // alternative is starting a request that cannot finish.
      if (session.expiresAt - Date.now() > 60_000) return session
      store(kind).removeItem(KEY)
    } catch {
      // Unreadable storage is an absent session, not a crash.
    }
  }
  return null
}

function write(session: Session | null) {
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
    if (session) store(session.kind).setItem(KEY, JSON.stringify(session))
  } catch {
    // A browser that refuses storage still works; the session just ends with
    // the page.
  }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(read)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sign out on the tick the token dies, so the interface never offers an
  // action that will 401.
  useEffect(() => {
    if (!session) return
    const remaining = session.expiresAt - Date.now()
    const timer = setTimeout(() => {
      setSession(null)
      write(null)
    }, Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [session])

  const authenticate = useCallback(async (
    kind: 'login' | 'register', email: string, password: string,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const token = await (kind === 'login'
        ? api.login(email, password)
        : api.register(email, password))
      const next: Session = {
        email,
        kind: 'account',
        token: token.accessToken,
        expiresAt: Date.now() + token.expiresInSeconds * 1000,
      }
      setSession(next)
      write(next)
      return true
    } catch (cause) {
      setError(cause instanceof ApiError
        ? describe(kind, cause)
        : 'something went wrong signing in')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * A session with no account behind it, for this tab only.
   *
   * What it buys is that a run survives navigating away from the page and
   * coming back. What it does not buy is anything after the tab closes - which
   * is why the control that offers it says so, and why claiming exists.
   */
  const continueAsGuest = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const token = await api.guest()
      const next: Session = {
        email: null,
        kind: 'guest',
        token: token.accessToken,
        expiresAt: Date.now() + token.expiresInSeconds * 1000,
      }
      setSession(next)
      write(next)
      return true
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 0
        ? 'the server could not be reached'
        : 'a guest session could not be started')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * Turn this tab's guest session into an account, keeping its runs.
   *
   * The runs do not move on the server - the row that owns them stops being a
   * guest - so the identifiers anything already holds stay correct.
   */
  const claim = useCallback(async (email: string, password: string) => {
    if (!session || session.kind !== 'guest') return false
    setBusy(true)
    setError(null)
    try {
      const token = await api.claim(session.token, email, password)
      const next: Session = {
        email,
        kind: 'account',
        token: token.accessToken,
        expiresAt: Date.now() + token.expiresInSeconds * 1000,
      }
      setSession(next)
      write(next)
      return true
    } catch (cause) {
      setError(cause instanceof ApiError
        ? describe('register', cause)
        : 'the account could not be created')
      return false
    } finally {
      setBusy(false)
    }
  }, [session])

  const signOut = useCallback(() => {
    setSession(null)
    write(null)
    setError(null)
  }, [])

  return { session, busy, error, authenticate, continueAsGuest, claim, signOut }
}

/**
 * What the status actually means to someone standing in front of the form.
 *
 * The server's own wording is written for a client, not a person: "credentials
 * are not valid" is right and unhelpful when what you need to know is whether
 * to try a different password or a different address.
 */
function describe(kind: 'login' | 'register', error: ApiError): string {
  if (error.status === 0) return 'the server could not be reached'
  if (error.status === 401) return 'that email and password do not match an account'
  if (error.status === 409) return 'an account with that email already exists — sign in instead'
  if (error.status === 400) {
    return kind === 'register'
      ? 'the password needs at least 12 characters, and the email has to look like one'
      : error.message
  }
  return error.message
}
