/**
 * Choosing a benchmark, and saying what choosing one costs.
 *
 * The size matters to the person clicking: the file is downloaded once and then
 * cached, but the first click on `car` is seven megabytes, and the sample count
 * is what decides whether a run takes seconds or minutes - the clustering is an
 * eigendecomposition of an n x n matrix, once per window.
 */

import { useEffect, useState } from 'react'

import { catalogue, isCached } from '../datasets/catalog'
import type { DatasetInfo } from '../datasets/load'

function megabytes(bytes: number | undefined): string {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '—'
}

/**
 * Roughly what a run of this benchmark will cost, from its sample count.
 *
 * Shortened to fit one line beside the size, because the cost and the download
 * are the two things being weighed against each other and reading them on one
 * line is the comparison.
 */
function weight(samples: number): { label: string; className: string } {
  if (samples >= 500) return { label: 'minutes / window', className: 'weight heavy' }
  if (samples >= 150) return { label: '~1s / window', className: 'weight medium' }
  return { label: 'fast', className: 'weight light' }
}

export function DatasetPicker({
  selected, onSelect, disabled,
}: {
  selected: DatasetInfo | null
  onSelect: (info: DatasetInfo) => void
  disabled: boolean
}) {
  const [available, setAvailable] = useState<DatasetInfo[] | null>(null)
  const [cached, setCached] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    catalogue()
      .then(async (entries) => {
        if (!live) return
        setAvailable(entries)
        const flags = await Promise.all(entries.map((entry) => isCached(entry)))
        if (!live) return
        setCached(Object.fromEntries(entries.map((entry, i) => [entry.slug, flags[i]])))
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { live = false }
  }, [])

  if (error) return <p className="error">The dataset catalogue could not be read: {error}</p>
  if (!available) return <p className="muted">Reading the catalogue…</p>

  return (
    <ul className="datasets">
      {available.map((info) => {
        const cost = weight(info.samples)
        return (
          <li key={info.slug}>
            <button
              type="button"
              className={info.slug === selected?.slug ? 'dataset selected' : 'dataset'}
              onClick={() => onSelect(info)}
              disabled={disabled}
            >
              <span className="name">{info.name}</span>
              <span className="shape">
                {info.samples.toLocaleString()} × {info.features.toLocaleString()}
                {' · '}{info.classes} classes
              </span>
              <span className="meta">
                {/* The distinction the whole method rests on - but only worth
                    saying when it holds. Unordered is the ordinary case here,
                    and a label on eight of ten cards is one nobody reads. */}
                {info.ordered && <span className="ordered">time-ordered</span>}
                <span className={cost.className}>{cost.label}</span>
                <span className="size">
                  {cached[info.slug] ? 'cached' : megabytes(info.sizeBytes)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
