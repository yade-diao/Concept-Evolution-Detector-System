/**
 * The shell, and who is allowed where.
 *
 * Two shells, not one. Without a session there is only the gate: the sign-in
 * page, with no navigation around it, because there is nowhere to navigate to
 * yet. With a session there is the rail, a topbar, and the modules behind
 * them.
 *
 * The topbar is the extension point, and the reason it exists on a page that
 * currently has no actions to put in it. Every module gets the same one, so a
 * page that arrives later - export, share, compare - has a place for its
 * buttons that is already the right place, rather than inventing a row of
 * controls somewhere in its own content. Its title and lede come from the
 * module registry, so a page cannot end up reachable but unnamed.
 *
 * What each module needs is declared in nav.ts and enforced here by Require.
 * The listing hides what a visitor cannot use, which is courtesy; the server
 * decides every one of these, which is the guard.
 *
 * Someone who reaches a place that is not theirs is told which place it is and
 * what would get them in. Bouncing a visitor who is already signed in to the
 * sign-in page answers a question they did not ask.
 */

import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useCurrentSession } from './api/SessionContext'
import { Gate } from './components/Gate'
import { Rail } from './components/Rail'
import { moduleFor, type Access } from './nav'
import { AccountsView } from './views/AccountsView'
import { DatasetsView } from './views/DatasetsView'
import { InboxView } from './views/InboxView'
import { MailView } from './views/MailView'
import { MethodView } from './views/MethodView'
import { RunView } from './views/RunView'
import { RunsView } from './views/RunsView'
import { SignInView } from './views/SignInView'

/** The title bar, from the registry, with a slot nothing fills yet. */
function TopBar() {
  const { pathname } = useLocation()
  const module = moduleFor(pathname)
  return (
    <div className="topbar">
      <h1>{module?.label ?? 'Not found'}</h1>
      <div className="topbar-actions" />
    </div>
  )
}

function Require({ need, because, children }: {
  need: Access
  because: string
  children: ReactNode
}) {
  const { session } = useCurrentSession()

  const allowed = need === 'admin' ? session?.role === 'ADMIN'
    : need === 'account' ? session?.kind === 'account'
    : true
  if (allowed) return <>{children}</>

  return (
    <section className="refusal">
      <h2>Not this page</h2>
      <p>{because}</p>
      {session?.kind === 'guest' && (
        <p className="muted">
          This tab is a guest session. <strong>Keep my runs</strong> in the sidebar turns it
          into an account and brings the runs already in it — nothing is lost in the trade.
        </p>
      )}
    </section>
  )
}

/** One module's page: the lede the registry wrote for it, then the module. */
function Module({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const lede = moduleFor(pathname)?.lede
  return (
    <>
      {lede && <p className="page-lede">{lede}</p>}
      {children}
    </>
  )
}

/** Everything that is not the sign-in page, for someone with no session. */
function ToGate() {
  const location = useLocation()
  return (
    <Navigate to="/signin" replace
              state={{
                from: location.pathname === '/signin' ? '/' : location.pathname,
                because: 'Choose how to start. Either way the data is clustered in this browser.',
              }} />
  )
}

export function App() {
  const { session } = useCurrentSession()

  if (!session) {
    return (
      <Gate>
        <Routes>
          <Route path="/signin" element={<SignInView />} />
          <Route path="*" element={<ToGate />} />
        </Routes>
      </Gate>
    )
  }

  const account = 'Your own datasets and your run history need an account.'
  const admin = 'That page is for administrators.'

  return (
    <div className="shell">
      <Rail />
      <div>
        <TopBar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Module><RunView /></Module>} />
            <Route path="/datasets" element={(
              <Require need="account" because={account}>
                <Module><DatasetsView /></Module>
              </Require>
            )} />
            <Route path="/runs" element={(
              <Require need="account" because={account}>
                <Module><RunsView /></Module>
              </Require>
            )} />
            <Route path="/method" element={<Module><MethodView /></Module>} />
            <Route path="/admin/accounts" element={(
              <Require need="admin" because={admin}>
                <Module><AccountsView /></Module>
              </Require>
            )} />
            <Route path="/admin/inbox" element={(
              <Require need="admin" because={admin}>
                <Module><InboxView /></Module>
              </Require>
            )} />
            <Route path="/admin/mail" element={(
              <Require need="admin" because={admin}>
                <Module><MailView /></Module>
              </Require>
            )} />
            {/* The two places that used to hold several modules each. */}
            <Route path="/space" element={<Navigate to="/datasets" replace />} />
            <Route path="/admin" element={<Navigate to="/admin/accounts" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
