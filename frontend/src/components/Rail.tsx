/**
 * The sidebar: where you are, who you are, and the way out.
 *
 * A rail rather than a top bar because of what sits in it. Three of the four
 * places are only there for some people - the personal space needs an account,
 * administration needs the role - so the navigation's height is a fact about
 * the visitor, and a vertical list absorbs that without the header reflowing
 * around it. It also puts the unread count at a fixed place on the screen,
 * which is what a notification wants: the same corner every time, not a
 * position that depends on how many links happen to be shown.
 *
 * The account and the way to report something are pinned to the bottom, away
 * from the navigation. They are not places to go; they are what you do at the
 * end.
 */

import { NavLink } from 'react-router-dom'

import { useCurrentSession } from '../api/SessionContext'
import { useUnread } from '../api/unread'
import { AccountBar } from './AccountBar'
import { Feedback } from './Feedback'

export function Rail() {
  const { session } = useCurrentSession()
  const unread = useUnread(session?.token ?? null, session?.role === 'ADMIN')

  return (
    <aside className="rail">
      <div className="rail-brand">
        <p className="eyebrow">CED-FS</p>
        <p className="rail-name">Concept<br />Evolution<br />Detector</p>
      </div>

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

      <div className="rail-foot">
        <AccountBar />
        <Feedback />
        <a href="https://github.com/yade-diao/Concept-Evolution-Detector-System">
          Source, and the tests
        </a>
      </div>
    </aside>
  )
}
