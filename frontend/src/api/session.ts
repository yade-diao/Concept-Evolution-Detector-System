/**
 * Who is signed in, for as long as the token lasts.
 *
 * The token is kept in localStorage with the instant it expires, so the page
 * can sign someone out before a request fails rather than after: a 401 in the
 * middle of submitting a finished run loses the run, and the run took minutes.
 *
 * Nothing here is a security boundary - the server is. This only decides which
 * buttons are worth showing.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError } from './client'

const KEY = 'ced-session'

export interface Session {
  email: string
  token: string
  /** Epoch milliseconds. */
  expiresAt: number
}

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    // A token that expires in the next minute is treated as already gone; the
    // alternative is starting a request that cannot finish.
    return session.expiresAt - Date.now() > 60_000 ? session : null
  } catch {
    return null
  }
}

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session))
    else localStorage.removeItem(KEY)
  } catch {
    // A browser that refuses storage still works; the session just ends with
    // the tab.
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

  const signOut = useCallback(() => {
    setSession(null)
    write(null)
    setError(null)
  }, [])

  return { session, busy, error, authenticate, signOut }
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
