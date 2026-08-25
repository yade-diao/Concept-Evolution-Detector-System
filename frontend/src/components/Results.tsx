/**
 * What a run produced, drawn.
 *
 * Three pictures, each answering a different question:
 *
 * - How many clusters each window found, which is what the method reports.
 * - What happened at each boundary between windows, which is what the method
 *   is for. `stable` tests an exact Dice of 1, so on real data it is nearly
 *   always zero and near-identical windows are reported as drift - that is the
 *   published rule, and the chart shows what it produces rather than hiding it.
 * - The decision graph of the last window: density against distance-to-a-denser
 *   -point, the plot the cluster centres are chosen from.
 *
 * Inline SVG rather than a charting library: three charts do not justify a
 * dependency, and these have to stay legible in both colour schemes, which is
 * easier when the colours are the page's own custom properties.
 */

import type { RunDone } from '../worker/cedfs.worker'
import { EVENT_NAMES, type EventName } from '../cedfs/cedFs'

const EVENT_COLOURS: Record<EventName, string> = {
  stable: 'var(--event-stable)',
  drift: 'var(--event-drift)',
  emerging: 'var(--event-emerging)',
  forgetting: 'var(--event-forgetting)',
}

function ClusterCounts({ counts }: { counts: number[] }) {
  if (counts.length === 0) return null
  const max = Math.max(...counts, 1)
  const width = Math.max(counts.length * 12, 120)

  return (
    <figure className="chart">
      <figcaption>Clusters per window</figcaption>
      <svg viewBox={`0 0 ${width} 110`} role="img"
           aria-label={`Cluster counts: ${counts.join(', ')}`}>
        {counts.map((count, i) => {
          const height = (count / max) * 90
          return (
            <rect key={i} x={i * 12 + 1} y={100 - height} width={10} height={height}
                  fill="var(--accent)" rx={1} />
          )
        })}
        <line x1={0} y1={100} x2={width} y2={100} stroke="var(--rule)" strokeWidth={1} />
      </svg>
      <p className="axis">
        window 1 – {counts.length} · highest {max}
      </p>
    </figure>
  )
}

function Events({ events }: { events: RunDone['events'] }) {
  const boundaries = events.drift.length
  if (boundaries === 0) {
    return (
      <figure className="chart">
        <figcaption>Events per boundary</figcaption>
        <p className="muted">
          One window, so no boundary: events are what happens <em>between</em>
          consecutive windows.
        </p>
      </figure>
    )
  }

  const totals = boundaries === 0 ? 1 : Math.max(
    ...Array.from({ length: boundaries }, (_, i) =>
      EVENT_NAMES.reduce((sum, name) => sum + events[name][i], 0)), 1)
  const width = Math.max(boundaries * 12, 120)

  return (
    <figure className="chart">
      <figcaption>Events per boundary</figcaption>
      <svg viewBox={`0 0 ${width} 110`} role="img" aria-label="Concept evolution events">
        {Array.from({ length: boundaries }, (_, i) => {
          let offset = 0
          return (
            <g key={i}>
              {EVENT_NAMES.map((name) => {
                const value = events[name][i]
                if (!value) return null
                const height = (value / totals) * 90
                const y = 100 - offset - height
                offset += height
                return (
                  <rect key={name} x={i * 12 + 1} y={y} width={10} height={height}
                        fill={EVENT_COLOURS[name]}>
                    <title>{`boundary ${i + 1}: ${value} ${name}`}</title>
                  </rect>
                )
              })}
            </g>
          )
        })}
        <line x1={0} y1={100} x2={width} y2={100} stroke="var(--rule)" strokeWidth={1} />
      </svg>
      <ul className="legend">
        {EVENT_NAMES.map((name) => (
          <li key={name}>
            <span className="swatch" style={{ background: EVENT_COLOURS[name] }} />
            {name} ({events[name].reduce((a, b) => a + b, 0)})
          </li>
        ))}
      </ul>
    </figure>
  )
}

function DecisionGraph({ graph }: { graph: RunDone['lastDecisionGraph'] }) {
  if (!graph || graph.rho.length === 0) return null
  const maxRho = Math.max(...graph.rho, 1)
  const maxDelta = Math.max(...graph.delta, Number.MIN_VALUE)

  return (
    <figure className="chart">
      <figcaption>Decision graph, last window</figcaption>
      <svg viewBox="0 0 220 130" role="img"
           aria-label="Density against distance to the nearest denser point">
        {graph.rho.map((rho, i) => (
          <circle key={i}
                  cx={10 + (rho / maxRho) * 200}
                  cy={115 - (graph.delta[i] / maxDelta) * 105}
                  r={2.2} fill="var(--accent)" fillOpacity={0.65} />
        ))}
        <line x1={10} y1={118} x2={215} y2={118} stroke="var(--rule)" />
        <line x1={10} y1={5} x2={10} y2={118} stroke="var(--rule)" />
      </svg>
      <p className="axis">
        density → · distance to a denser point ↑ · centres are the points in the
        top right
      </p>
    </figure>
  )
}

export function Results({ result, elapsedMs }: { result: RunDone; elapsedMs: number }) {
  return (
    <section className="results">
      <dl className="headline">
        <div>
          <dt>Windows</dt>
          <dd>{result.windowsTotal}</dd>
        </div>
        <div>
          <dt>Best Rand Index</dt>
          <dd>{result.bestRandIndex.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Took</dt>
          <dd>{(elapsedMs / 1000).toFixed(1)} s</dd>
        </div>
      </dl>

      <div className="charts">
        <ClusterCounts counts={result.clusterCounts} />
        <Events events={result.events} />
        <DecisionGraph graph={result.lastDecisionGraph} />
      </div>

      <p className="caveat">
        The Rand Index is measured against the benchmark's class labels, which
        every window is scored on: each window clusters every sample and only the
        features it sees differ. It is not adjusted for chance, so a partition
        that splits a correct cluster can score higher than the correct one.
      </p>
    </section>
  )
}
