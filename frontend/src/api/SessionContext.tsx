/**
 * One session, shared by the header that shows it and the pages that use it.
 *
 * A context rather than a prop chain because the two places that need it - the
 * account control in the header and the run recorder three levels down - have
 * no relationship except that they are on the same page.
 */

import { createContext, useContext, type ReactNode } from 'react'

import { useSession } from './session'

type SessionValue = ReturnType<typeof useSession>

const Context = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useSession()}>{children}</Context.Provider>
}

export function useCurrentSession(): SessionValue {
  const value = useContext(Context)
  if (!value) throw new Error('useCurrentSession used outside a SessionProvider')
  return value
}
