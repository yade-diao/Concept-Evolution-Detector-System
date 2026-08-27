/**
 * The shell, and who is allowed where.
 *
 * Four places, and the role decides which of them exist for you:
 *
 * - **The experiment space** is open to everyone, a guest included, because the
 *   computation is local and there is nothing there to protect. What a guest
 *   cannot do is bring their own data.
 * - **The personal space** - your datasets and your runs - needs an account.
 *   Not as a gate for its own sake: it is storage, and storage has to belong to
 *   somebody.
 * - **Administration** is for an administrator, and carries the count of
 *   unread messages. That badge is this deployment's notification channel:
 *   with no mail relay nothing can be pushed to anybody, so a registration or
 *   a bug report is announced by a number in the header.
 * - **The method** is prose and needs nobody.
 *
 * Someone who reaches a place that is not theirs is sent to the sign-in page
 * with the reason, rather than to a blank refusal. Being told what to do next is
 * the difference between a locked door and a wall.
 */

import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useCurrentSession } from './api/SessionContext'
import { useUnread } from './api/unread'
import { AccountBar } from './components/AccountBar'
import { Feedback } from './components/Feedback'
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
  const location = useLocation()

  const allowed = role === 'admin'
    ? session?.role === 'ADMIN'
    : session?.kind === 'account'

  if (allowed) return <>{children}</>
  return <Navigate to="/signin" replace state={{ from: location.pathname, because }} />
}

export function App() {
  const { session } = useCurrentSession()
  const unread = useUnread(session?.token ?? null, session?.role === 'ADMIN')

  return (
    <div className="shell">
      <header>
        <div>
          <p className="eyebrow">CED-FS · feature stream</p>
          <h1>Concept Evolution Detector</h1>
          <p className="subtitle">
            The stream runs along the feature axis: the samples stay, the
            features arrive. This watches concepts appear, move and disappear as
            they do — clustered in this browser, not on a server.
          </p>
        </div>
        <div className="header-side">
          <nav>
            <NavLink to="/" end>Experiment</NavLink>
            {session?.kind === 'account' && <NavLink to="/space">My space</NavLink>}
            {session?.role === 'ADMIN' && (
              <NavLink to={unread > 0 ? '/admin?tab=messages' : '/admin'}>
                Admin
                {unread > 0 && (
                  <span className="badge" title={`${unread} unread`}>{unread}</span>
                )}
              </NavLink>
            )}
            <NavLink to="/method">Method</NavLink>
          </nav>
          <AccountBar />
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<RunView />} />
          <Route path="/signin" element={<SignInView />} />
          <Route
            path="/space"
            element={(
              <Require role="account"
                       because="Your own datasets and your run history need an account.">
                <SpaceView />
              </Require>
            )}
          />
          <Route
            path="/admin"
            element={(
              <Require role="admin" because="That page is for administrators.">
                <AdminView />
              </Require>
            )}
          />
          <Route path="/method" element={<MethodView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer>
        <a href="https://github.com/yade-diao/Concept-Evolution-Detector-System">
          Source, and the tests that hold this port to the Python reference
        </a>
        <Feedback />
      </footer>
    </div>
  )
}
