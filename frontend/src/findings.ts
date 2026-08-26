/**
 * Turning a run into sentences.
 *
 * A page of correct numbers still leaves the reader to work out what happened,
 * and most readers will not: they see that the third window found four clusters
 * and have no way to know whether four is the answer, an improvement, or a
 * symptom. So the numbers are read here, in the terms of the data they came
 * from.
 *
 * Two registers, because there are two situations. A **bundled** benchmark has
 * a known subject, so the reading can say what a window is - fifty milliseconds
 * of eye movement, a hundred minutes of a household's day - and what the shape
 * of the result means for that subject. A dataset **someone brought** has no
 * such story, so the reading describes the shape and stops: it says what
 * happened to the clusters and leaves what it means to the person who chose the
 * file, rather than inventing a narrative about data it has never seen.
 *
 * Nothing here computes anything. Every number it uses came out of the run; the
 * only thing added is the reading.
 */

import type { EventName } from './cedfs/cedFs'
import type { DatasetInfo } from './datasets/load'

export interface RunFacts {
  windowSize: number
  clusterCounts: number[]
  randIndices: number[]
  events: Record<EventName, number[]>
  bestRandIndex: number
}

/** How long, or how wide, one window of columns is - in the data's own units. */
export function windowSpan(info: DatasetInfo | null, windowSize: number): string {
  if (!info?.ordered || !info.unit || !info.perColumn) {
    return `${windowSize} columns`
  }
  const amount = windowSize * info.perColumn
  if (info.unit === 'ms' && amount >= 1000) return `${(amount / 1000).toFixed(2)} s`
  if (info.unit === 'min' && amount >= 60) {
    const hours = amount / 60
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`
  }
  return `${amount} ${info.unit}`
}

/** Where window `index` sits in the stream, in the data's own units. */
function windowAt(info: DatasetInfo | null, windowSize: number, index: number): string {
  if (!info?.ordered || !info.unit || !info.perColumn) {
    return `window ${index + 1}`
  }
  const from = index * windowSize * info.perColumn
  const to = (index + 1) * windowSize * info.perColumn
  if (info.unit === 'ms') return `window ${index + 1} (${from}–${to} ms)`
  if (info.unit === 'min') {
    const clock = (minutes: number) =>
      `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    return `window ${index + 1} (${clock(from)}–${clock(to)})`
  }
  return `window ${index + 1} (${from}–${to} ${info.unit})`
}

function totals(events: Record<EventName, number[]>): Record<EventName, number> {
  return {
    stable: events.stable.reduce((a, b) => a + b, 0),
    drift: events.drift.reduce((a, b) => a + b, 0),
    emerging: events.emerging.reduce((a, b) => a + b, 0),
    forgetting: events.forgetting.reduce((a, b) => a + b, 0),
  }
}

function indexOfMax(values: number[]): number {
  return values.reduce((best, value, i) => (value > values[best] ? i : best), 0)
}

/**
 * The reading of the whole run: three or four sentences, in order of what a
 * reader wants to know first.
 */
export function overallReading(info: DatasetInfo | null, facts: RunFacts): string[] {
  const { clusterCounts: counts, randIndices: ri, windowSize } = facts
  if (counts.length === 0) return []

  const first = counts[0]
  const last = counts[counts.length - 1]
  const peak = Math.max(...counts)
  const classes = info?.classes
  const event = totals(facts.events)
  const best = ri.length ? indexOfMax(ri) : -1
  const said: string[] = []

  // 1. What the stream was, and how it was cut.
  const span = info?.ordered && info.unit && info.perColumn
    ? `${(counts.length * windowSize * info.perColumn).toLocaleString()} ${info.unit} of it`
    : `${(counts.length * windowSize).toLocaleString()} columns`
  said.push(
    `The stream was cut into ${counts.length} windows of ${windowSpan(info, windowSize)}, ` +
    `covering ${span}.`)

  // 2. Whether the clustering moved, and in which direction. This is the
  //    finding: a count that changes is the method reporting evolution.
  if (first === last && peak === first) {
    said.push(
      `Every window found the same ${first} cluster${first === 1 ? '' : 's'}. ` +
      (info?.ordered
        ? 'Nothing about the grouping changed as the stream arrived.'
        : 'That is what an unordered matrix usually gives: the columns carry no arrival order, ' +
          'so consecutive windows are interchangeable samples of the same data.'))
  } else {
    said.push(
      `The number of clusters went from ${first} in the first window to ${last} in the last, ` +
      `reaching ${peak} at ${windowAt(info, windowSize, counts.indexOf(peak))}.` +
      (classes ? ` The data has ${classes} classes.` : ''))
  }

  // 3. What the boundaries reported, with the rule's own bias stated.
  if (event.emerging + event.forgetting > 0) {
    const parts: string[] = []
    if (event.emerging) parts.push(`${event.emerging} concept${event.emerging === 1 ? '' : 's'} emerged`)
    if (event.forgetting) parts.push(`${event.forgetting} were forgotten`)
    if (event.drift) parts.push(`${event.drift} drifted`)
    said.push(`Across the boundaries, ${parts.join(', ')}.`)
  } else if (event.drift > 0) {
    said.push(
      `Every boundary was drift (${event.drift} in total) and none was stable. ` +
      'That is the published rule showing its edge: stable requires an exact overlap of 1, ' +
      'and two windows almost never partition the samples identically.')
  }

  // 4. How close any of it came to the labels.
  if (best >= 0) {
    said.push(
      `Measured against the labels, the clustering was closest at ` +
      `${windowAt(info, windowSize, best)} — Rand Index ${ri[best].toFixed(4)}` +
      (ri.length > 1
        ? `, against ${ri[0].toFixed(4)} in the first window.`
        : '.'))
  }

  return said
}

/**
 * What each chart is saying, in one sentence.
 *
 * One per figure, printed under it. A caption that repeats the title is noise;
 * these say what this particular run put in that particular chart.
 */
export function chartReadings(info: DatasetInfo | null, facts: RunFacts): Record<string, string> {
  const { clusterCounts: counts, randIndices: ri, windowSize } = facts
  const event = totals(facts.events)
  const classes = info?.classes
  const readings: Record<string, string> = {}

  if (counts.length > 0) {
    const first = counts[0]
    const peakIndex = counts.indexOf(Math.max(...counts))
    readings.clusters = classes
      ? (first < classes
          ? `The first window found ${first} where the data has ${classes} classes: at that point in ` +
            `the stream, ${classes - first} of them are not yet distinguishable. The most it ever ` +
            `separated was ${counts[peakIndex]}, at ${windowAt(info, windowSize, peakIndex)}.`
          : `The first window already separated ${first} groups, and the most it ever found was ` +
            `${counts[peakIndex]} at ${windowAt(info, windowSize, peakIndex)}, against ${classes} ` +
            `classes in the data.`)
      : `Between ${Math.min(...counts)} and ${Math.max(...counts)} clusters per window.`
  }

  if (ri.length > 0) {
    const best = indexOfMax(ri)
    const rise = ri[best] - ri[0]
    readings.randIndex = rise > 0.05
      ? `It climbs ${rise.toFixed(2)} from the first window to its best at ` +
        `${windowAt(info, windowSize, best)} — the later windows recover the labelled groups that ` +
        'the early ones could not see.'
      : `It stays within ${Math.abs(rise).toFixed(2)} of where it started, so no window sees the ` +
        'labelled groups much better than the first one did.'
  }

  const boundaries = facts.events.drift.length
  if (boundaries > 0) {
    readings.events = event.emerging + event.forgetting > 0
      ? `${event.emerging} emerging and ${event.forgetting} forgotten across ${boundaries} ` +
        `boundaries: clusters that had no counterpart on the other side. The ${event.drift} drifts ` +
        'are groups that survived in changed form.'
      : `All ${event.drift} boundary events are drift. Nothing appeared or disappeared — the same ` +
        'groups persisted, rearranged.'
  }

  readings.decision = 'Each point is one sample. The ones far from the origin in both directions ' +
    'are dense and far from anything denser, which is what makes a centre; the rest follow their ' +
    'density gradient to one.'

  return readings
}

/**
 * The standing note about a dataset, shown before and after a run.
 *
 * For a bundled benchmark this is written down in the manifest, because these
 * have a subject and the subject is the point. For a file someone brought, it
 * is the generic reading: what a window is in general, and the one thing that
 * decides whether any of this means what it appears to.
 */
export function datasetNote(info: DatasetInfo | null): { what: string; why: string } | null {
  if (!info) return null
  if (info.what && info.why) return { what: info.what, why: info.why }

  return {
    what: 'Your file: each row is a sample, each column a feature, and the windows are ' +
          'consecutive blocks of columns.',
    why: 'What the result means depends on whether your columns have an order. If column t was ' +
         'measured before column t+1 — time points, stages of a process — then the windows are ' +
         'moments and a change between them is concept evolution. If the order is arbitrary, the ' +
         'clustering is still real but the evolution is an artefact of how the columns happen to ' +
         'be arranged.',
  }
}
