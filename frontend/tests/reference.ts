/**
 * The bundled benchmarks and the answers the Python reference gave on them.
 *
 * Both implementations read the same `.mat` files, so nothing about the inputs
 * is copied into a fixture: `tests/reference/answers.json` holds only numbers
 * the port has to reproduce, and everything it refers to is loaded from
 * `datasets/bundled` here. Regenerate it with
 * `python -m tests.generate_reference_answers`.
 */

import { readFileSync } from 'node:fs'

import { loadDataset, type Dataset, type DatasetInfo } from '../src/datasets/load'
import type { EventName } from '../src/cedfs/cedFs'
import type { KernelType } from '../src/cedfs/kernel'

export interface KernelCase {
  dataset: string
  rowA: number
  rowB: number
  columnStart: number
  columnEnd: number
  kernelType: number
  sigma: number
  expected: number
}

export interface KpcaCase {
  dataset: string
  sampleLimit: number
  columnStart: number
  columnEnd: number
  kernelType: number
  sigma: number
  targetDim: number
  expectedDistances: number[]
}

export interface BenchmarkCase {
  slug: string
  featureLimit: number
  windowSize: number
  /** Too slow to run in the browser, and so opt-in here. */
  slow: boolean
  expectedWindows: number
  expectedClusterCounts: number[]
  expectedEvents: Record<EventName, number[]>
  expectedBestRandIndex: number
}

export interface ReferenceAnswers {
  parameters: {
    kernelType: KernelType
    sigma: number
    p: number
    windowSize: number
    similarityThreshold: number
  }
  kernels: KernelCase[]
  kpca: KpcaCase
  randIndex: Array<{ a: number[]; b: number[]; expected: number }>
  similarity: {
    past: number[]; pastCount: number; current: number[]; currentCount: number
    expected: number[][]
  }
  benchmarks: BenchmarkCase[]
}

const BUNDLED = new URL('../../datasets/bundled/', import.meta.url)

export const answers: ReferenceAnswers = JSON.parse(
  readFileSync(new URL('./reference/answers.json', import.meta.url), 'utf8'))

const manifest: DatasetInfo[] = JSON.parse(
  readFileSync(new URL('manifest.json', BUNDLED), 'utf8'))

const loaded = new Map<string, Promise<Dataset>>()

/** One benchmark, read from disk once however many tests ask for it. */
export function dataset(slug: string): Promise<Dataset> {
  const cached = loaded.get(slug)
  if (cached) return cached

  const info = manifest.find((entry) => entry.slug === slug)
  if (!info) throw new Error(`no dataset ${slug} in the manifest`)

  const promise = loadDataset(
    info,
    readFileSync(new URL(info.dataFile, BUNDLED)),
    readFileSync(new URL(info.labelFile, BUNDLED)),
  )
  loaded.set(slug, promise)
  return promise
}

export function datasets(): DatasetInfo[] {
  return manifest
}

/** A contiguous block of columns, row-major, as the algorithm wants it. */
export function columns(
  data: Float64Array,
  rows: number,
  stride: number,
  start: number,
  end: number,
): Float64Array {
  const width = end - start
  const block = new Float64Array(rows * width)
  for (let r = 0; r < rows; r++) {
    block.set(data.subarray(r * stride + start, r * stride + end), r * width)
  }
  return block
}
