/**
 * A fleet of like units, watched as a feature stream.
 *
 * The units stay, the measurements arrive - the method's own setting, with the
 * units as the samples. Two monitors (README (industrial fleets)): the clustering one
 * reads each window as one group or "these units left, through these
 * variables"; the deviation one scores each unit against the fleet and its own
 * start, for fleets that wear out rather than break. Each bundled fleet names
 * the one its question needs, and its ground truth, so the page can say how the
 * run did and not only what it found.
 */

import { useEffect, useRef, useState } from 'react'

import { LARGE_FLEET, LARGE_FLEET_PARAMETERS, type Fleet } from '../cedfs/fleet'
import { buildFleet, readTable, type FleetTable } from '../datasets/fleetCsv'
import { fetchFleet, fetchFleets, type FleetInfo } from '../datasets/fleets'
import type { FleetDone, FleetFailed, FleetRequest } from '../worker/fleet.worker'

type State =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: FleetDone }
  | { status: 'error'; message: string }

function span(info: FleetInfo, w: number): string {
  const from = w * info.window
  const to = (w + 1) * info.window
  if (info.sampleMinutes) {
    const clock = (s: number) => {
      const minutes = s * info.sampleMinutes!
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
    }
    return `${clock(from)}–${clock(to)}`
  }
  return `${info.sampleUnit ?? 'step'} ${from + 1}–${to}`
}

function percent(x: number): string {
  return `${Math.round(x * 100)}%`
}

export function FleetView() {
  const [fleets, setFleets] = useState<FleetInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<FleetInfo | null>(null)
  const [state, setState] = useState<State>({ status: 'idle' })
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    fetchFleets().then(setFleets, (cause) => setError(String(cause)))
    return () => worker.current?.terminate()
  }, [])

  function watch(next: FleetInfo, fleet: Fleet) {
    setInfo(next)
    setState({ status: 'running' })
    worker.current?.terminate()
    const created = new Worker(new URL('../worker/fleet.worker.ts', import.meta.url), { type: 'module' })
    worker.current = created
    created.onmessage = (event: MessageEvent<FleetDone | FleetFailed>) => {
      const message = event.data
      setState(message.type === 'done'
        ? { status: 'done', result: message }
        : { status: 'error', message: message.message })
    }
    const graded = next.monitor !== 'clustering'
    const request: FleetRequest = {
      fleet: { data: fleet.data.buffer as ArrayBuffer, units: fleet.units, samples: fleet.samples, variables: fleet.variables },
      window: next.window,
      alpha: next.alpha ?? 0.001,
      ...(next.merge != null ? { merge: next.merge } : {}),
      ...(graded ? { baseline: next.baseline, m: next.m, level: next.level,
        against: next.monitor === 'ownChange' ? 'own' as const : 'fleet' as const } : {}),
    }
    created.postMessage(request, [request.fleet.data])
  }

  async function run(next: FleetInfo) {
    setInfo(next)
    setState({ status: 'running' })
    try {
      watch(next, await fetchFleet(next))
    } catch (cause) {
      setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return (
    <>
      <section>
        <div className="section-head">
          <span className="step">01</span>
          <h2>A fleet</h2>
        </div>
        {error && <p className="error">The fleet catalogue could not be read: {error}</p>}
        {!fleets && !error && <p className="muted">Reading the catalogue…</p>}
        {fleets && (
          <ul className="datasets">
            {fleets.map((f) => (
              <li key={f.slug}>
                <button
                  type="button"
                  className={f.slug === info?.slug ? 'dataset selected' : 'dataset'}
                  onClick={() => void run(f)}
                  disabled={state.status === 'running'}
                >
                  <span className="name">{f.title}</span>
                  <span className="shape">
                    {f.units} units × {f.samples} {f.sampleMinutes ? `samples of ${f.sampleMinutes} min` : `${f.sampleUnit ?? 'step'}s`}
                    {' · '}{f.variables.length} variables
                  </span>
                  <span className="meta">
                    <span className="ordered">{MONITOR_NAMES[f.monitor]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {info && info.slug !== 'upload' && <p className="dataset-note">{info.why}</p>}
        {info && info.slug !== 'upload' && <p className="muted">{info.source}</p>}
      </section>

      <OwnFleet disabled={state.status === 'running'} onReady={watch} />

      {state.status === 'running' && <p className="muted">Watching {info?.title}…</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'done' && info && <FleetResults info={info} result={state.result} />}
    </>
  )
}

const MONITOR_NAMES: Record<FleetInfo['monitor'], string> = {
  clustering: 'clustering monitor',
  deviation: 'deviation monitor',
  ownChange: 'own-change monitor',
}

/**
 * A fleet the visitor brings: a long-format CSV, parsed here and never sent
 * anywhere. The three monitors are offered with what each is for, because the
 * right one depends on the shape of the change (see the README).
 */
function OwnFleet({ disabled, onReady }: { disabled: boolean; onReady: (info: FleetInfo, fleet: Fleet) => void }) {
  const [name, setName] = useState<string | null>(null)
  const [table, setTable] = useState<FleetTable | null>(null)
  const [unit, setUnit] = useState('')
  const [time, setTime] = useState('')
  const [windowSize, setWindowSize] = useState(10)
  const [monitor, setMonitor] = useState<FleetInfo['monitor']>('clustering')
  const [baseline, setBaseline] = useState(20)
  const [persist, setPersist] = useState(8)
  const [merge, setMerge] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    setProblem(null)
    setNote(null)
    if (!file) return
    try {
      const t = readTable(await file.text())
      setName(file.name)
      setTable(t)
      setUnit(t.guessUnit)
      setTime(t.guessTime)
    } catch (cause) {
      setTable(null)
      setProblem(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function go() {
    if (!table) return
    setProblem(null)
    try {
      const parsed = buildFleet(table, unit, time)
      if (parsed.fleet.samples < 2 * windowSize) {
        throw new Error(`${parsed.fleet.samples} common time steps; a window of ${windowSize} leaves fewer than two windows`)
      }
      if (monitor !== 'clustering' && baseline >= parsed.fleet.samples) {
        throw new Error(`the baseline (${baseline}) must be shorter than the ${parsed.fleet.samples} common time steps`)
      }
      setNote(`${parsed.fleet.units} units, ${parsed.fleet.samples} common time steps, ${parsed.variables.length} variables`
        + (parsed.skipped.length ? `; left out as not numeric: ${parsed.skipped.join(', ')}` : '')
        + (parsed.trimmed ? `; ${parsed.trimmed} rows past the shortest unit's last step not used` : '')
        + (monitor === 'clustering' && parsed.fleet.units > LARGE_FLEET
          ? `; over ${LARGE_FLEET} units, so clustered through a Nyström approximation on `
            + `${LARGE_FLEET_PARAMETERS.landmarks} landmark units, as the Python reference does`
          : ''))
      const info: FleetInfo = {
        slug: 'upload', title: name ?? 'your fleet', why: '', file: '', units: parsed.fleet.units,
        samples: parsed.fleet.samples, variables: parsed.variables, offset: [], scale: [],
        unitNames: parsed.unitIds, sampleMinutes: null, sampleUnit: time, window: windowSize,
        monitor, alpha: 0.001, merge: merge ? 0.001 : null, baseline, m: persist, level: 0.01, truth: {}, source: '',
      }
      onReady(info, parsed.fleet)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section>
      <div className="section-head">
        <span className="step">02</span>
        <h2>Or your own fleet</h2>
      </div>
      <p className="muted">
        A CSV with one row per unit per time step: a unit column, a time column, and one column per
        variable. It is read in this browser and not uploaded.
      </p>
      <div className="parameters">
        <label className="field">
          <span className="field-label">File</span>
          <input type="file" accept=".csv,.tsv,.txt,text/csv" disabled={disabled}
                 onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {table && (
          <>
            <label className="field">
              <span className="field-label">Unit column</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {table.header.map((h) => <option key={h}>{h}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Time column</span>
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                {table.header.map((h) => <option key={h}>{h}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Window (time steps)</span>
              <input type="number" min={2} value={windowSize}
                     onChange={(e) => setWindowSize(Math.max(2, Number(e.target.value) || 2))} />
            </label>
            <label className="field">
              <span className="field-label">Monitor</span>
              <select value={monitor} onChange={(e) => setMonitor(e.target.value as FleetInfo['monitor'])}>
                <option value="clustering">clustering - units leaving the fleet, and through what</option>
                <option value="deviation">deviation - units drifting, fleet otherwise alike</option>
                <option value="ownChange">own change - units drifting, fleet used differently</option>
              </select>
            </label>
            {monitor === 'clustering' && (
              <label className="field">
                <span className="field-label">Splits</span>
                <select value={merge ? 'merge' : 'keep'} onChange={(e) => setMerge(e.target.value === 'merge')}>
                  <option value="keep">keep every split the clustering finds</option>
                  <option value="merge">merge splits one Gaussian explains - fewer false alarms on large fleets</option>
                </select>
              </label>
            )}
            {monitor !== 'clustering' && (
              <label className="field">
                <span className="field-label">Baseline (each unit's first time steps)</span>
                <input type="number" min={1} value={baseline}
                       onChange={(e) => setBaseline(Math.max(1, Number(e.target.value) || 1))} />
              </label>
            )}
            {monitor !== 'clustering' && (
              <label className="field">
                <span className="field-label">Windows a deviation must persist over</span>
                <input type="number" min={5} value={persist}
                       onChange={(e) => setPersist(Math.max(5, Number(e.target.value) || 5))} />
              </label>
            )}
            <div className="actions">
              <button type="button" onClick={go} disabled={disabled}>Watch this fleet</button>
            </div>
          </>
        )}
      </div>
      {note && <p className="muted">{note}</p>}
      {problem && <p className="error">{problem}</p>}
    </section>
  )
}

function FleetResults({ info, result }: { info: FleetInfo; result: FleetDone }) {
  const W = result.windows.length
  const deviationMode = info.monitor !== 'clustering' && result.alarms !== null
  // A window inside a unit's own baseline is compared with itself (as in cedfs.monitor).
  const inBaseline = Math.ceil((info.baseline ?? 0) / info.window)
  const marked: boolean[][] = deviationMode
    ? result.alarms!.map((row) => row.map((a, w) => a && w >= inBaseline))
    : Array.from({ length: info.units }, (_, u) => result.windows.map((w) => w.flagged.includes(u)))

  // Row order: faulty units last (TEP), or shortest life first (C-MAPSS).
  const lives = info.truth.lifeCycles
  const faulty = new Set(info.truth.faultyUnits ?? [])
  const order = Array.from({ length: info.units }, (_, u) => u)
  if (lives) order.sort((a, b) => lives[a] - lives[b])

  const said: string[] = []
  const onsetWindow = info.truth.onsetSample !== undefined
    ? Math.floor(info.truth.onsetSample / info.window) : null
  if (onsetWindow !== null && faulty.size) {
    let pre = 0, preTotal = 0, hit = 0, hitTotal = 0, normal = 0, normalTotal = 0
    for (let u = 0; u < info.units; u++) {
      for (let w = 0; w < W; w++) {
        if (w < onsetWindow) { preTotal++; pre += marked[u][w] ? 1 : 0 }
        else if (faulty.has(u)) { hitTotal++; hit += marked[u][w] ? 1 : 0 }
        else { normalTotal++; normal += marked[u][w] ? 1 : 0 }
      }
    }
    const firstSplit = result.windows.findIndex((w) => w.clusterCount > 1)
    said.push(`The fault starts at ${span(info, onsetWindow).split('–')[0]}. Before it, ${pre === 0
      ? 'no unit was ever flagged: every window read as one group'
      : `${percent(pre / preTotal)} of unit-windows were flagged`}.`)
    if (firstSplit >= 0) {
      const w = result.windows[firstSplit]
      const through = w.variables.slice(0, 4).map((v) => info.variables[v]).join(', ')
      said.push(`The first split is in window ${firstSplit + 1} (${span(info, firstSplit)}): ${w.flagged.length} units left the fleet, `
        + `${w.flagged.filter((u) => faulty.has(u)).length} of them faulty, through ${through}.`)
    }
    said.push(`After the onset the faulty units were flagged in ${percent(hit / hitTotal)} of their windows, `
      + `the normal ones in ${percent(normal / normalTotal)}.`)
    const leads = new Map<number, number>()
    result.windows.slice(onsetWindow).forEach((w) => {
      if (w.variables.length) leads.set(w.variables[0], (leads.get(w.variables[0]) ?? 0) + 1)
    })
    const lead = [...leads.entries()].sort((a, b) => b[1] - a[1])[0]
    if (lead) {
      said.push(`The variable most often the strongest after the onset is ${info.variables[lead[0]]}, `
        + `first in ${lead[1]} of ${W - onsetWindow} windows.`)
    }
  }
  if (lives && deviationMode) {
    const first = order
      .map((u) => ({ u, w: marked[u].indexOf(true) }))
      .filter((x) => x.w >= 0)
      .sort((a, b) => a.w - b.w || lives[a.u] - lives[b.u])
    const rank = (u: number) => order.indexOf(u) + 1
    if (first.length) {
      const f = first[0]
      const end = (f.w + 1) * info.window
      said.push(`The first unit named is ${info.unitNames[f.u]}, at ${info.sampleUnit ?? 'step'} ${end}: it fails at ${lives[f.u]}, `
        + `${lives[f.u] - end} later, and has the ${ordinal(rank(f.u))}shortest life of the ${info.units}.`)
      const named = first.slice(0, 10).map((x) => rank(x.u))
      said.push(`The first ten named rank ${named.join(', ')} by life (1 = shortest); `
        + `${first.length} of ${info.units} are named by the end of the span.`)
    } else said.push('No unit was consistently unlike the fleet.')
  }

  if (said.length === 0) {
    // No ground truth: say what was found, in the units of the data.
    if (!deviationMode) {
      const splits = result.windows.flatMap((w, i) => (w.clusterCount > 1 ? [i] : []))
      if (splits.length === 0) {
        said.push(`Every one of the ${W} windows read as one group: no variable split the fleet.`)
      } else {
        const w = result.windows[splits[0]]
        said.push(`${splits.length} of ${W} windows split the fleet. The first is window ${splits[0] + 1} `
          + `(${span(info, splits[0])}): ${w.flagged.length} units left `
          + `(${w.flagged.slice(0, 8).map((u) => info.unitNames[u]).join(', ')}${w.flagged.length > 8 ? ', …' : ''}), `
          + `through ${w.variables.slice(0, 4).map((v) => info.variables[v]).join(', ')}.`)
        const counts = new Array<number>(info.units).fill(0)
        result.windows.forEach((x) => x.flagged.forEach((u) => counts[u]++))
        const often = counts.map((c, u) => [c, u]).filter(([c]) => c > 0).sort((a, b) => b[0] - a[0]).slice(0, 8)
        said.push(`Most often outside the largest group: ${often.map(([c, u]) => `${info.unitNames[u]} (${c})`).join(', ')}.`)
      }
    } else {
      const first = marked.map((row, u) => ({ u, w: row.indexOf(true) })).filter((x) => x.w >= 0)
        .sort((a, b) => a.w - b.w)
      if (first.length === 0) said.push('No unit was consistently unlike the fleet.')
      else {
        said.push(`${first.length} of ${info.units} units were named. In order: `
          + first.slice(0, 10).map((x) => `${info.unitNames[x.u]} (${span(info, x.w)})`).join(', ')
          + (first.length > 10 ? ', …' : '.'))
      }
    }
  }

  const cell = Math.max(4, Math.min(28, Math.floor(720 / W)))
  const row = Math.max(2, Math.min(6, Math.floor(420 / info.units)))
  const width = W * cell
  const height = info.units * row

  return (
    <section className="results">
      <div className="headline">
        <div className="hero">
          <span className="label">{deviationMode ? 'Units named' : 'Windows split'}</span>
          <strong>{deviationMode
            ? marked.filter((r) => r.some(Boolean)).length
            : result.windows.filter((w) => w.clusterCount > 1).length}</strong>
          <span className="hint">of {deviationMode ? `${info.units} units` : `${W} windows`}</span>
        </div>
        <dl className="tiles">
          <div><dt>Units</dt><dd>{info.units}</dd></div>
          <div><dt>Windows</dt><dd>{W}</dd></div>
          <div><dt>Variables</dt><dd>{info.variables.length}</dd></div>
          <div><dt>Took</dt><dd>{(result.elapsedMs / 1000).toFixed(1)}<small>s</small></dd></div>
        </dl>
      </div>

      {said.length > 0 && (
        <section className="reading-block">
          <h3>What this run found</h3>
          {said.map((s, i) => <p key={i}>{s}</p>)}
        </section>
      )}

      <figure className="chart">
        <figcaption>
          {deviationMode ? 'Units consistently unlike the fleet' : 'Units outside the largest group'}
          <span>{lives ? 'rows: shortest life at the top' : faulty.size ? 'rows: normal units, then the faulty ones below the line' : 'rows: units in the order of the file'}</span>
        </figcaption>
        <svg className="fleet-grid" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
             role="img" aria-label="unit by window grid">
          {order.map((u, r) => marked[u].map((m, w) => m && (
            <rect key={`${u}-${w}`} x={w * cell} y={r * row} width={cell - 1} height={Math.max(1, row - 0.5)}
                  className={faulty.size && !faulty.has(u) ? 'mark false' : 'mark'} />
          )))}
          {onsetWindow !== null && (
            <line x1={onsetWindow * cell} x2={onsetWindow * cell} y1={0} y2={height} className="onset" />
          )}
          {onsetWindow !== null && (
            <text x={onsetWindow * cell + 4} y={12} className="label">fault starts</text>
          )}
          {faulty.size > 0 && (
            <line x1={0} x2={width} y1={(info.units - faulty.size) * row} y2={(info.units - faulty.size) * row}
                  className="divider" />
          )}
        </svg>
      </figure>

      {!deviationMode && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>window</th><th>span</th><th>groups</th><th>left</th><th>through</th><th>MONIC</th></tr>
            </thead>
            <tbody>
              {result.windows.map((w, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{span(info, i)}</td>
                  <td>{w.clusterCount === 1 ? 'one' : w.groupSizes.join(' + ')}</td>
                  <td>{w.flagged.length || ''}{faulty.size > 0 && w.flagged.length > 0
                    ? ` (${w.flagged.filter((u) => faulty.has(u)).length} faulty)` : ''}</td>
                  <td>{w.variables.slice(0, 4).map((v) => info.variables[v]).join(', ')}
                    {w.variables.length > 4 ? ` +${w.variables.length - 4}` : ''}</td>
                  <td>{w.transitions
                    ? Object.entries(w.transitions).filter(([k, v]) => v && k !== 'survive').map(([k, v]) => `${k} ${v}`).join(', ')
                    : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ordinal(n: number): string {
  if (n === 1) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]} `
}
