/**
 * The stream, drawn as what it is.
 *
 * One tick per window, left to right along the feature axis, each tick as tall
 * as that window's cluster count. Before a run it is the shape of the run you
 * are about to start - how many windows this benchmark becomes at this window
 * size. During the run it fills, one tick per window, and the tick being
 * clustered right now is the one in the second colour. After it, it is the
 * result.
 *
 * It replaces the progress bar rather than sitting next to one. A percentage
 * would say how far along the run is and nothing else; this says that, and what
 * has been found so far, in the same marks - which is the honest shape for a
 * method whose progress *is* its result arriving.
 */

export function WindowStrip({
  total, counts, running, note,
}: {
  /** Windows the run will have, known before it starts. */
  total: number
  /** Cluster counts as they arrive. */
  counts: number[]
  running: boolean
  note: string
}) {
  if (total <= 0) return null

  const max = Math.max(...counts, 2)
  const ticks = Array.from({ length: total }, (_, i) => {
    const count = counts[i]
    if (count === undefined) {
      return { key: i, height: 3, className: 'tick pending', title: `window ${i + 1}` }
    }
    return {
      key: i,
      height: 6 + (count / max) * 38,
      className: running && i === counts.length - 1 ? 'tick current' : 'tick',
      title: `window ${i + 1}: ${count} clusters`,
    }
  })

  return (
    <div className={counts.length === 0 ? 'strip idle' : 'strip'}>
      <div className="strip-rail" role="img"
           aria-label={counts.length === 0
             ? `${total} windows to run`
             : `${counts.length} of ${total} windows clustered`}>
        {ticks.map((tick) => (
          <span key={tick.key} className={tick.className}
                style={{ height: `${tick.height}px` }} title={tick.title} />
        ))}
      </div>
      <div className="strip-legend">
        <span>{note}</span>
        <span>
          {counts.length === 0
            ? <><strong>{total}</strong> windows</>
            : <><strong>{counts.length}</strong> / {total} windows
                {counts.length > 0 && <> · <strong>{counts.at(-1)}</strong> clusters</>}</>}
        </span>
      </div>
    </div>
  )
}
