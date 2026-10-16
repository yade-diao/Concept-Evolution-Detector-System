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

  async function run(next: FleetInfo) {
    setInfo(next)
    setState({ status: 'running' })
    try {
      const fleet = await fetchFleet(next)
      worker.current?.terminate()
      const created = new Worker(new URL('../worker/fleet.worker.ts', import.meta.url), { type: 'module' })
      worker.current = created
      created.onmessage = (event: MessageEvent<FleetDone | FleetFailed>) => {
        const message = event.data
        setState(message.type === 'done'
          ? { status: 'done', result: message }
          : { status: 'error', message: message.message })
      }
      const request: FleetRequest = {
        fleet: { data: fleet.data.buffer as ArrayBuffer, units: fleet.units, samples: fleet.samples, variables: fleet.variables },
        window: next.window,
        alpha: next.alpha ?? 0.001,
        ...(next.monitor === 'deviation' ? { baseline: next.baseline, m: next.m, level: next.level } : {}),
      }
      created.postMessage(request, [request.fleet.data])
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
                    <span className="ordered">{f.monitor === 'deviation' ? 'deviation monitor' : 'clustering monitor'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {info && <p className="dataset-note">{info.why}</p>}
        {info && <p className="muted">{info.source}</p>}
      </section>

      {state.status === 'running' && <p className="muted">Watching {info?.title}…</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'done' && info && <FleetResults info={info} result={state.result} />}
    </>
  )
}

function FleetResults({ info, result }: { info: FleetInfo; result: FleetDone }) {
  const W = result.windows.length
  const deviationMode = info.monitor === 'deviation' && result.alarms !== null
  const marked: boolean[][] = deviationMode
    ? result.alarms!
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
          <span>{lives ? 'rows: shortest life at the top' : 'rows: normal units, then the faulty ones below the line'}</span>
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
