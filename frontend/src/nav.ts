/**
 * The module registry: every place in the application, in one list.
 *
 * The rail is generated from this, and so is the topbar's title, so adding a
 * module is one entry here plus one route. That is the whole point of the
 * file - the alternative is a navigation list, a route table and a title
 * lookup that drift apart, which is how a page ends up reachable but unnamed.
 *
 * `access` is a hint for what to show, never the guard. The server decides
 * every one of these; hiding a link the visitor cannot use is courtesy, and
 * courtesy is not security.
 *
 * ── Room that is deliberately left ────────────────────────────────────────
 *
 * These are not built. They are written down because the layout was designed
 * to take them, and knowing where they would go is what makes that true rather
 * than a claim:
 *
 * - **Compare** (Work) - two runs of the same benchmark side by side. The
 *   natural next thing for this tool: the parameters have five dials and the
 *   only way to understand one is to move it and see what changed. Would reuse
 *   the chart primitives with two series and want the topbar's action slot for
 *   "pin this run".
 * - **Dataset detail** (Work, /datasets/:slug) - shape, class balance, a
 *   preview of the matrix, and the runs that used it, before committing to a
 *   download. The dataset cards already link nowhere; this is where they go.
 * - **Sharing** (Work) - a read-only permalink to a finished run, which is
 *   what anyone showing this to a supervisor actually needs. Wants a public
 *   route outside the gate, which is why the gate redirects rather than
 *   blanket-refuses.
 * - **Export** - the results as CSV or JSON, from the topbar action slot on
 *   the run page. Cheap, and the reason the slot exists.
 * - **Settings** (Reference) - theme, default parameters, and the account's
 *   own controls. Belongs at the foot of the rail beside the account.
 *
 * Each is a line in MODULES below and a Route in App. Nothing else has to
 * move, which is the test the layout was built to pass.
 */

export type Access = 'session' | 'account' | 'admin'

export const GROUPS = ['Work', 'Reference', 'Administration'] as const
export type Group = (typeof GROUPS)[number]

export interface Module {
  /** The route, and the key. */
  to: string
  /** What it is called in the rail and in the topbar. */
  label: string
  /** One line under the title, when the page wants one. */
  lede?: string
  group: Group
  access: Access
  /** Set on the one module that shows the unread count. */
  counter?: 'unread'
}

export const MODULES: Module[] = [
  {
    to: '/',
    label: 'Experiment',
    lede: 'The stream runs along the feature axis: the samples stay, the features arrive. '
        + 'Pick a benchmark, set the detector, and watch the concepts move as the columns go by.',
    group: 'Work',
    access: 'session',
  },
  {
    to: '/datasets',
    label: 'Datasets',
    lede: 'The files you brought. They are read in this browser and stay here until you '
        + 'choose to upload them.',
    group: 'Work',
    access: 'account',
  },
  {
    to: '/runs',
    label: 'Runs',
    lede: 'Every run you have started, with the parameters that produced it.',
    group: 'Work',
    access: 'account',
  },
  {
    to: '/method',
    label: 'Method',
    lede: 'What the detector does to a window, what it compares between two of them, and '
        + 'what these benchmarks can and cannot show.',
    group: 'Reference',
    access: 'session',
  },
  {
    to: '/admin/accounts',
    label: 'Accounts',
    lede: 'Who has an account here, and how much they have run.',
    group: 'Administration',
    access: 'admin',
  },
  {
    to: '/admin/inbox',
    label: 'Inbox',
    lede: 'What visitors wrote, and what the server has to report. Nothing is pushed '
        + 'anywhere — the count in the rail is the notification.',
    group: 'Administration',
    access: 'admin',
    counter: 'unread',
  },
  {
    to: '/admin/mail',
    label: 'Mail out',
    lede: 'What the server tried to send, and whether it went.',
    group: 'Administration',
    access: 'admin',
  },
]

/** The module a path belongs to, for the topbar's title. */
export function moduleFor(pathname: string): Module | undefined {
  return MODULES.find((m) => m.to === pathname)
    ?? MODULES.find((m) => m.to !== '/' && pathname.startsWith(m.to))
}

/** Whether a session may see a module, for what to draw - not for what to allow. */
export function visibleTo(module: Module, kind?: string, role?: string): boolean {
  if (module.access === 'admin') return role === 'ADMIN'
  if (module.access === 'account') return kind === 'account'
  return true
}
