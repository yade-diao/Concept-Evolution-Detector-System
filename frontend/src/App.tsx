/**
 * The shell, and who is allowed where.
 *
 * Two shells, not one. Without a session there is only the gate: the sign-in
 * page, with no navigation around it, because there is nowhere to navigate to
 * yet. With a session there is the rail and the four places behind it, and the
 * role decides which of them exist for you:
 *
 * - **The experiment space** is open to any session, a guest included, because
 *   the computation is local and there is nothing there to protect. What a
 *   guest cannot do is bring their own data.
 * - **The personal space** - your datasets and your runs - needs an account.
 *   Not as a gate for its own sake: it is storage, and storage has to belong to
 *   somebody.
 * - **Administration** is for an administrator, and carries the count of
 *   unread messages. That badge is this deployment's notification channel:
 *   with no mail relay nothing can be pushed to anybody, so a registration or
 *   a bug report is announced by a number in the rail.
 * - **The method** is prose, and needs an account no more than the experiment
 *   does - but it sits behind the gate with everything else, because a door
 *   that is open for one page is a door.
 *
 * Someone who reaches a place that is not theirs is told which place it is and
 * what would get them in, rather than bounced. Bouncing a visitor who is
 * already signed in to the sign-in page answers a question they did not ask.
 */

import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useCurrentSession } from './api/SessionContext'
import { Gate } from './components/Gate'
import { Rail } from './components/Rail'
import { AdminView } from './views/AdminView'
import { MethodView } from './views/MethodView'
import { RunView } from './views/RunView'
import { SignInView } from './views/SignInView'
import { SpaceView } from './views/SpaceView'

function Require({ role, because, children }: {
  role: 'account' | 'admin'
  because: string
  children: ReactNode
}) {
  const { session } = useCurrentSession()

  const allowed = role === 'admin'
    ? session?.role === 'ADMIN'
    : session?.kind === 'account'
  if (allowed) return <>{children}</>

  return (
    <section className="refusal">
      <h2>Not this page</h2>
      <p>{because}</p>
      {session?.kind === 'guest' && (
        <p className="muted">
          This tab is a guest session. <strong>Keep my runs</strong> in the
          sidebar turns it into an account and brings the runs already in it —
          nothing is lost in the trade.
        </p>
      )}
    </section>
  )
}

/**
 * The title of the place you are in.
 *
 * The rail says which one is selected, but a page that opens straight into
 * "01 A benchmark" has no anchor at the top and no room to say what the page
 * is for. The lede is the one sentence a returning visitor would otherwise
 * only ever have seen on the way in.
 */
function Page({ title, lede, children }: {
  title: string
  lede?: string
  children: ReactNode
}) {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {children}
    </>
  )
}

/** Everything that is not the sign-in page, for someone who has no session. */
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

  return (
    <div className="shell">
      <Rail />
      <main>
        <Routes>
          <Route
            path="/"
            element={(
              <Page title="Experiment"
                    lede="The stream runs along the feature axis: the samples stay, the features
                          arrive. Pick a benchmark, set the detector, and watch the concepts move
                          as the columns go by.">
                <RunView />
              </Page>
            )}
          />
          <Route
            path="/space"
            element={(
              <Require role="account"
                       because="Your own datasets and your run history need an account.">
                <Page title="My space"
                      lede="Your datasets, in this browser and on the server, and every run you
                            have started.">
                  <SpaceView />
                </Page>
              </Require>
            )}
          />
          <Route
            path="/admin"
            element={(
              <Require role="admin" because="That page is for administrators.">
                <Page title="Admin"
                      lede="Who has an account, what has arrived in the inbox, and what the
                            server tried to send.">
                  <AdminView />
                </Page>
              </Require>
            )}
          />
          <Route
            path="/method"
            element={(
              <Page title="Method"
                    lede="What the detector does to a window, what it compares between two of
                          them, and what these benchmarks can and cannot show.">
                <MethodView />
              </Page>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
