/**
 * What a run produced.
 *
 * One number leads - the best Rand Index, the score the method is reported by -
 * then the four questions worth asking of a run, each in the form that answers
 * it:
 *
 * - How many clusters each window found: a line, because the windows are a
 *   sequence and the shape of the change is the point. The dataset's true class
 *   count is drawn behind it, so "is this the right number" is a glance rather
 *   than an arithmetic.
 * - How well each window's clustering matched the labels: a second line, on its
 *   own axis in its own chart. Two measures of different scale never share a
 *   y-axis.
 * - What happened at each boundary: stacked columns, four categories.
 * - Where the centres came from: the decision graph of the last window, with
 *   the chosen centres drawn on top of the cloud they were chosen from.
 *
 * A table view sits behind a toggle. It is not decoration: two of the four
 * event colours fall below 3:1 against the light surface, and the rule for that
 * is relief - the numbers have to be readable somewhere that is not the colour.
 */

import { useState } from 'react'

import { EVENT_NAMES, type EventName } from '../cedfs/cedFs'
import type { DatasetInfo } from '../datasets/load'
import { chartReadings, overallReading } from '../findings'
import type { RunDone } from '../worker/cedfs.worker'
import { Legend, LineChart, Scatter, StackedColumns } from './charts'

/** Slots 1-4 of the validated categorical palette, in fixed order. */
const EVENT_COLOUR: Record<EventName, string> = {
  stable: 'var(--viz-series-1)',
  drift: 'var(--viz-series-2)',
  emerging: 'var(--viz-series-3)',
  forgetting: 'var(--viz-series-4)',
}

function Figure({ title, note, reading, children }: {
  title: string
  note?: string
  /** What this chart is saying about this run, in one sentence. */
  reading?: string
  children: React.ReactNode
}) {
  return (
    <figure className="chart">
      <figcaption>
        {title}
        {note && <span>{note}</span>}
      </figcaption>
      {children}
      {reading && <p className="reading">{reading}</p>}
    </figure>
  )
}

function Table({ result, randIndices }: { result: RunDone; randIndices: number[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>window</th>
            <th>clusters</th>
            <th>Rand Index</th>
            {EVENT_NAMES.map((name) => <th key={name}>{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {result.clusterCounts.map((count, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{count}</td>
              <td>{randIndices[i] !== undefined ? randIndices[i].toFixed(4) : '—'}</td>
              {EVENT_NAMES.map((name) => (
                // Events belong to boundaries, so window 1 has none: the row
                // shows what happened arriving at that window.
                <td key={name}>{i === 0 ? '—' : result.events[name][i - 1]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Results({
  result, elapsedMs, randIndices, info, windowSize,
}: {
  result: RunDone
  elapsedMs: number
  randIndices: number[]
  /** What was run on, for the reading; null for a file with no description. */
  info: DatasetInfo | null
  windowSize: number
}) {
  const [showTable, setShowTable] = useState(false)

  const classes = info?.classes
  const facts = {
    windowSize,
    clusterCounts: result.clusterCounts,
    randIndices,
    events: result.events,
    bestRandIndex: result.bestRandIndex,
  }
  const said = overallReading(info, facts)
  const reading = chartReadings(info, facts)

  const counts = result.clusterCounts
  const boundaries = result.events.drift.length
  const eventTotal = EVENT_NAMES.reduce(
    (sum, name) => sum + result.events[name].reduce((a, b) => a + b, 0), 0)

  return (
    <section className="results">
      <div className="headline">
        <div className="hero">
          <span className="label">Best Rand Index</span>
          <strong>{result.bestRandIndex.toFixed(4)}</strong>
          <span className="hint">against the benchmark's own labels</span>
        </div>
        <dl className="tiles">
          <div>
            <dt>Windows</dt>
            <dd>{result.windowsTotal}</dd>
          </div>
          <div>
            <dt>Clusters</dt>
            <dd>{Math.min(...counts)}–{Math.max(...counts)}</dd>
          </div>
          <div>
            <dt>Events</dt>
            <dd>{eventTotal}</dd>
          </div>
          <div>
            <dt>Took</dt>
            <dd>{(elapsedMs / 1000).toFixed(1)}<small>s</small></dd>
          </div>
        </dl>
      </div>

      {said.length > 0 && (
        <section className="reading-block">
          <h3>What this run found</h3>
          {said.map((sentence, i) => <p key={i}>{sentence}</p>)}
        </section>
      )}

      <div className="charts">
        <Figure title="Clusters per window"
                note={classes ? `${classes} classes in the data` : undefined}
                reading={reading.clusters}>
          <LineChart
            values={counts}
            yLabel="clusters"
            reference={classes ? { value: classes, label: `${classes} classes` } : undefined}
          />
        </Figure>

        <Figure title="Rand Index per window" note="1.0 is the labelling exactly"
                reading={reading.randIndex}>
          <LineChart
            values={randIndices}
            yLabel="index"
            formatValue={(v) => v.toFixed(4)}
            highlightBest
          />
        </Figure>

        <Figure title="Events per boundary"
                note={boundaries === 0 ? 'one window, so no boundary' : undefined}
                reading={boundaries > 0 ? reading.events : undefined}>
          {boundaries > 0 && (
            <>
              <StackedColumns
                xLabel="boundary"
                series={EVENT_NAMES.map((name) => ({
                  name,
                  colour: EVENT_COLOUR[name],
                  values: result.events[name],
                }))}
              />
              <Legend items={EVENT_NAMES.map((name) => ({
                name,
                colour: EVENT_COLOUR[name],
                note: String(result.events[name].reduce((a, b) => a + b, 0)),
              }))} />
            </>
          )}
        </Figure>

        {result.lastDecisionGraph && (
          <Figure title="Decision graph, last window"
                  note="centres are high in both"
                  reading={reading.decision}>
            <Scatter
              x={Array.from(result.lastDecisionGraph.rho)}
              y={Array.from(result.lastDecisionGraph.delta)}
              highlighted={result.lastDecisionGraph.centres}
              xLabel="density"
              yLabel="distance to a denser point"
            />
            <Legend items={[
              { name: 'sample', colour: 'var(--viz-series-1)' },
              { name: 'chosen centre', colour: 'var(--viz-series-2)' },
            ]} />
          </Figure>
        )}
      </div>

      <div className="results-footer">
        <button type="button" className="ghost" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide the numbers' : 'Show the numbers'}
        </button>
        <p className="caveat">
          Every window clusters every sample — only the features it sees differ —
          so each is scored against the same labels. The Rand Index is not
          adjusted for chance, so a partition that splits a correct cluster can
          score higher than the correct one.
        </p>
      </div>

      {showTable && <Table result={result} randIndices={randIndices} />}
    </section>
  )
}
