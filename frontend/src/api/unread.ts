/**
 * How many messages the administrator has not read.
 *
 * A number small enough that it could have lived inside the administration
 * page, except that the whole point of it is to be visible from somewhere
 * else: it is the notification. There is no mail going out of this deployment,
 * so a badge in the header is what tells whoever runs this that a registration
 * happened or somebody reported a bug.
 *
 * Shared through a module-level value rather than context because two places
 * show the same number and one of them changes it - the header counts down as
 * the administration page marks things read - and threading that through the
 * session context would put administration into something every page uses.
 *
 * Polling, and slowly. A count that is a minute stale costs nothing here; a
 * socket held open for it would cost a socket.
 */

import { useEffect, useState } from 'react'

import { api } from './client'

const EVERY_MS = 60_000

let current = 0
const listeners = new Set<(count: number) => void>()

function publish(count: number) {
  if (count === current) return
  current = count
  listeners.forEach((listen) => listen(count))
}

/** Ask the server now, and tell everyone showing the number. */
export async function refreshUnread(token: string): Promise<void> {
  try {
    publish((await api.unreadMessages(token)).count)
  } catch {
    // A count that could not be fetched is not worth an error anywhere: the
    // page it belongs to will say so when it fails to load for real.
  }
}

/** Set the number without asking, for the moment after marking them read. */
export function setUnread(count: number) {
  publish(count)
}

/**
 * The count, for an administrator. Anyone else gets zero and no request:
 * the endpoint would refuse them, and asking would be asking to be refused.
 */
export function useUnread(token: string | null, isAdmin: boolean): number {
  const [count, setCount] = useState(current)

  useEffect(() => {
    if (!token || !isAdmin) {
      publish(0)
      setCount(0)
      return
    }
    listeners.add(setCount)
    void refreshUnread(token)
    const timer = window.setInterval(() => {
      // Not while the tab is in the background: a page nobody is looking at
      // does not need a fresh number, and browsers throttle it anyway.
      if (!document.hidden) void refreshUnread(token)
    }, EVERY_MS)
    return () => {
      listeners.delete(setCount)
      window.clearInterval(timer)
    }
  }, [token, isAdmin])

  return count
}
