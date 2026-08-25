/**
 * The chart primitives: a line, a stack of columns, a scatter plot.
 *
 * Inline SVG rather than a charting library. Three forms do not pay for a
 * dependency, and these have to read correctly in both colour schemes, which is
 * easier when the marks take their colour from the page's own custom properties
 * instead of a palette baked into a library.
 *
 * The specs the marks follow are not taste:
 *
 * - 2px lines, markers at least 8px across, each with a 2px ring in the surface
 *   colour so overlapping points stay countable.
 * - A 2px gap in the surface colour between touching segments of a stack -
 *   white does the separating, never a stroke, which would add ink that is not
 *   data.
 * - Gridlines a hairline and one step off the surface. Solid, never dashed.
 * - Axis text in the muted ink, never in a series colour: the light aqua and
 *   yellow are illegible as text, and identity belongs to the mark beside the
 *   label rather than to the label.
 *
 * Every chart carries a hover layer, because an SVG chart in a page is
 * interactive whether or not you designed for it: a reader who points at a mark
 * expects it to say what it is.
 */

import { useRef, useState, type ReactNode } from 'react'

const W = 560
const H = 200
const M = { top: 16, right: 20, bottom: 30, left: 42 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

/** Round a maximum up to something a reader would have chosen. */
function niceMax(value: number): number {
  if (value <= 5) return Math.max(1, Math.ceil(value))
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

function ticksFor(max: number, count = 4): number[] {
  if (max <= count) return Array.from({ length: max + 1 }, (_, i) => i)
  const step = niceMax(max / count)
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

interface HoverState {
  index: number
  left: number
  top: number
}

function useHover(count: number, mode: 'band' | 'point') {
  const svg = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const element = svg.current
    if (!element || count === 0) return
    const box = element.getBoundingClientRect()
    const x = ((event.clientX - box.left) * W) / box.width
    const t = (x - M.left) / PLOT_W
    const index = mode === 'band'
      ? Math.floor(t * count)
      : Math.round(t * (count - 1))
    if (index < 0 || index >= count) {
      setHover(null)
      return
    }
    setHover({ index, left: event.clientX - box.left, top: event.clientY - box.top })
  }

  return { svg, hover, onMove, onLeave: () => setHover(null) }
}

function Tooltip({ hover, children }: { hover: HoverState; children: ReactNode }) {
  return (
    <div
      className="tip"
      style={{ left: hover.left, top: hover.top }}
      role="status"
    >
      {children}
    </div>
  )
}

function Axes({
  yTicks, yMax, xLabels, yLabel,
}: {
  yTicks: number[]
  yMax: number
  xLabels: Array<{ at: number; text: string }>
  yLabel?: string
}) {
  return (
    <g>
      {yTicks.map((tick) => {
        const y = M.top + PLOT_H - (tick / yMax) * PLOT_H
        return (
          <g key={tick}>
            <line x1={M.left} y1={y} x2={W - M.right} y2={y}
                  stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={M.left - 8} y={y + 3.5} textAnchor="end"
                  className="tick">{tick}</text>
          </g>
        )
      })}
      <line x1={M.left} y1={M.top + PLOT_H} x2={W - M.right} y2={M.top + PLOT_H}
            stroke="var(--viz-axis)" strokeWidth={1} />
      {xLabels.map((label) => (
        <text key={label.text} x={M.left + label.at * PLOT_W} y={H - 10}
              textAnchor="middle" className="tick">{label.text}</text>
      ))}
      {yLabel && (
        <text x={M.left - 34} y={M.top - 4} className="tick">{yLabel}</text>
      )}
    </g>
  )
}

/** Evenly spaced x labels that never crowd: first, last, and a few between. */
function xLabelsFor(count: number, format: (i: number) => string) {
  if (count === 0) return []
  const wanted = Math.min(count, 6)
  const step = Math.max(1, Math.round((count - 1) / (wanted - 1 || 1)))
  const indices = new Set<number>([0, count - 1])
  for (let i = step; i < count - 1; i += step) indices.add(i)
  return [...indices].sort((a, b) => a - b).map((i) => ({
    at: count === 1 ? 0.5 : i / (count - 1),
    text: format(i),
  }))
}

export function LineChart({
  values, yLabel, reference, formatValue = (v: number) => String(v), highlightBest,
}: {
  values: number[]
  yLabel: string
  /** A horizontal line the series should be read against, with its label. */
  reference?: { value: number; label: string }
  formatValue?: (value: number) => string
  /** Label the highest point directly, the one value worth reading exactly. */
  highlightBest?: boolean
}) {
  const { svg, hover, onMove, onLeave } = useHover(values.length, 'point')
  if (values.length === 0) return null

  const yMax = niceMax(Math.max(...values, reference?.value ?? 0, 1))
  const yTicks = ticksFor(yMax)
  const x = (i: number) => M.left + (values.length === 1 ? PLOT_W / 2
    : (i / (values.length - 1)) * PLOT_W)
  const y = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = `${path} L${x(values.length - 1)},${M.top + PLOT_H} L${x(0)},${M.top + PLOT_H} Z`
  const best = highlightBest
    ? values.reduce((b, v, i) => (v > values[b] ? i : b), 0)
    : -1

  return (
    <div className="plot">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={onLeave}
           role="img" aria-label={`${yLabel} over ${values.length} windows`}>
        <Axes yTicks={yTicks} yMax={yMax} yLabel={yLabel}
              xLabels={xLabelsFor(values.length, (i) => String(i + 1))} />

        {reference && (
          <g>
            <line x1={M.left} y1={y(reference.value)} x2={W - M.right} y2={y(reference.value)}
                  stroke="var(--viz-reference)" strokeWidth={1} />
            <text x={W - M.right} y={y(reference.value) - 5} textAnchor="end"
                  className="tick">{reference.label}</text>
          </g>
        )}

        <path d={area} fill="var(--viz-series-1)" fillOpacity={0.1} />
        <path d={path} fill="none" stroke="var(--viz-series-1)" strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />

        {values.length <= 40 && values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={4}
                  fill="var(--viz-series-1)" stroke="var(--viz-surface)" strokeWidth={2} />
        ))}

        {best >= 0 && (
          <g>
            <circle cx={x(best)} cy={y(values[best])} r={4.5}
                    fill="var(--viz-series-1)" stroke="var(--viz-surface)" strokeWidth={2} />
            <text x={x(best)} y={y(values[best]) - 10} textAnchor="middle"
                  className="value">{formatValue(values[best])}</text>
          </g>
        )}

        {hover && (
          <g>
            <line x1={x(hover.index)} y1={M.top} x2={x(hover.index)} y2={M.top + PLOT_H}
                  stroke="var(--viz-axis)" strokeWidth={1} />
            <circle cx={x(hover.index)} cy={y(values[hover.index])} r={5}
                    fill="var(--viz-series-1)" stroke="var(--viz-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hover && (
        <Tooltip hover={hover}>
          <strong>window {hover.index + 1}</strong>
          <span>{yLabel}: {formatValue(values[hover.index])}</span>
        </Tooltip>
      )}
    </div>
  )
}

export interface StackSeries {
  name: string
  colour: string
  values: number[]
}

export function StackedColumns({ series, xLabel }: { series: StackSeries[]; xLabel: string }) {
  const count = series[0]?.values.length ?? 0
  const { svg, hover, onMove, onLeave } = useHover(count, 'band')
  if (count === 0) return null

  const totals = Array.from({ length: count }, (_, i) =>
    series.reduce((sum, s) => sum + s.values[i], 0))
  const yMax = niceMax(Math.max(...totals, 1))
  const yTicks = ticksFor(yMax)

  const band = PLOT_W / count
  // Never fill the band: the leftover is what keeps neighbouring columns apart.
  const barWidth = Math.max(2, Math.min(24, band * 0.62))
  const GAP = 2

  return (
    <div className="plot">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={onLeave}
           role="img" aria-label={`Events at each of ${count} boundaries`}>
        <Axes yTicks={yTicks} yMax={yMax} yLabel="clusters"
              xLabels={xLabelsFor(count, (i) => `${i + 1}→${i + 2}`)} />

        {Array.from({ length: count }, (_, i) => {
          const centre = M.left + band * (i + 0.5)
          let offset = 0
          return (
            <g key={i} opacity={hover && hover.index !== i ? 0.55 : 1}>
              {series.map((s) => {
                const value = s.values[i]
                if (!value) return null
                const height = (value / yMax) * PLOT_H
                const top = M.top + PLOT_H - offset - height
                offset += height
                return (
                  <rect key={s.name}
                        x={centre - barWidth / 2}
                        y={top}
                        width={barWidth}
                        height={Math.max(1, height - GAP)}
                        rx={2}
                        fill={s.colour} />
                )
              })}
            </g>
          )
        })}
      </svg>

      {hover && (
        <Tooltip hover={hover}>
          <strong>{xLabel} {hover.index + 1} → {hover.index + 2}</strong>
          {series.map((s) => (
            <span key={s.name}>
              <i className="swatch" style={{ background: s.colour }} />
              {s.name}: {s.values[hover.index]}
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  )
}

export function Scatter({
  x: xs, y: ys, highlighted, xLabel, yLabel,
}: {
  x: number[]
  y: number[]
  /** Indices drawn as the second series - here, the chosen centres. */
  highlighted: number[]
  xLabel: string
  yLabel: string
}) {
  const [hover, setHover] = useState<{ i: number; left: number; top: number } | null>(null)
  if (xs.length === 0) return null

  const xMax = niceMax(Math.max(...xs, 1))
  const yMaxRaw = Math.max(...ys)
  const yMax = yMaxRaw > 0 ? yMaxRaw : 1
  const centres = new Set(highlighted)

  const px = (v: number) => M.left + (v / xMax) * PLOT_W
  const py = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H

  return (
    <div className="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label="Density against distance to the nearest denser point">
        <Axes yTicks={[]} yMax={yMax} yLabel={yLabel}
              xLabels={[
                { at: 0, text: '0' },
                { at: 0.5, text: String(Math.round(xMax / 2)) },
                { at: 1, text: String(xMax) },
              ]} />
        <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + PLOT_H}
              stroke="var(--viz-axis)" strokeWidth={1} />
        <text x={W - M.right} y={H - 10} textAnchor="end" className="tick">{xLabel}</text>

        {xs.map((v, i) => (
          centres.has(i) ? null : (
            <circle key={i} cx={px(v)} cy={py(ys[i])} r={4}
                    fill="var(--viz-series-1)" fillOpacity={0.55}
                    stroke="var(--viz-surface)" strokeWidth={1.5}
                    onMouseEnter={(e) => setHover({
                      i,
                      left: e.currentTarget.ownerSVGElement
                        ? e.clientX - e.currentTarget.ownerSVGElement.getBoundingClientRect().left
                        : 0,
                      top: e.currentTarget.ownerSVGElement
                        ? e.clientY - e.currentTarget.ownerSVGElement.getBoundingClientRect().top
                        : 0,
                    })}
                    onMouseLeave={() => setHover(null)} />
          )
        ))}

        {/* The centres last, so they sit above the cloud they were chosen from. */}
        {highlighted.map((i) => (
          <circle key={`c${i}`} cx={px(xs[i])} cy={py(ys[i])} r={6}
                  fill="var(--viz-series-2)"
                  stroke="var(--viz-surface)" strokeWidth={2} />
        ))}
      </svg>

      {hover && (
        <Tooltip hover={{ index: hover.i, left: hover.left, top: hover.top }}>
          <strong>point {hover.i + 1}</strong>
          <span>{xLabel}: {xs[hover.i].toFixed(2)}</span>
          <span>{yLabel}: {ys[hover.i].toFixed(4)}</span>
        </Tooltip>
      )}
    </div>
  )
}

export function Legend({ items }: { items: Array<{ name: string; colour: string; note?: string }> }) {
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.name}>
          <i className="swatch" style={{ background: item.colour }} />
          {item.name}
          {item.note && <em>{item.note}</em>}
        </li>
      ))}
    </ul>
  )
}
