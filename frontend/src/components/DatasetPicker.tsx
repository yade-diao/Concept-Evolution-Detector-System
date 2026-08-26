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

/** Roughly what a run of this benchmark will cost, from its sample count. */
function weight(samples: number): { label: string; className: string } {
  if (samples >= 500) return { label: 'minutes per window', className: 'weight heavy' }
  if (samples >= 150) return { label: 'about a second per window', className: 'weight medium' }
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
                {info.samples.toLocaleString()} samples ×{' '}
                {info.features.toLocaleString()} features · {info.classes} classes
              </span>
              <span className="meta">
                {/* The distinction the whole method rests on, said on the card
                    rather than buried in a description nobody opens. */}
                <span className={info.ordered ? 'ordered' : 'unordered'}>
                  {info.ordered ? 'columns are time' : 'columns unordered'}
                </span>
                <span className="muted">
                  {cached[info.slug] ? 'cached' : megabytes(info.sizeBytes)}
                </span>
              </span>
              <span className="meta">
                <span className={cost.className}>{cost.label}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
