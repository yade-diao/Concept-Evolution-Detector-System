/**
 * The sidebar: where you are, who you are, and the way out.
 *
 * Generated from the module registry, grouped, so a module that arrives later
 * lands in the right place with the right spacing by adding a line to nav.ts.
 * A group with nothing visible in it disappears - an administrator sees three
 * groups, a guest sees one, and neither sees a heading over an empty list.
 *
 * A rail rather than a top bar because of what sits in it. Most of these
 * places are only there for some people, so the navigation's height is a fact
 * about the visitor, and a vertical list absorbs that without the header
 * reflowing around it. It also puts the unread count at a fixed place on the
 * screen, which is what a notification wants: the same corner every time.
 */

import { NavLink } from 'react-router-dom'

import { useCurrentSession } from '../api/SessionContext'
import { useUnread } from '../api/unread'
import { GROUPS, MODULES, visibleTo } from '../nav'
import { AccountBar } from './AccountBar'
import { Feedback } from './Feedback'

export function Rail() {
  const { session } = useCurrentSession()
  const unread = useUnread(session?.token ?? null, session?.role === 'ADMIN')

  return (
    <aside className="rail">
      <div className="rail-brand">
        <p className="eyebrow">CED-FS</p>
        <p className="rail-name">Concept<br />Evolution Detector</p>
      </div>

      <nav className="rail-nav">
        {GROUPS.map((group) => {
          const items = MODULES.filter((m) => m.group === group
            && visibleTo(m, session?.kind, session?.role))
          if (items.length === 0) return null
          return (
            <div className="nav-group" key={group}>
              <p className="nav-group-label">{group}</p>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                  {item.label}
                  {item.counter === 'unread' && unread > 0 && (
                    <span className="badge" title={`${unread} unread`}>{unread}</span>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
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
