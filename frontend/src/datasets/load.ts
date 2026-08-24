/**
 * Turning a benchmark's two `.mat` files into the matrix the detector runs on.
 *
 * The Python side does the same three things in `cedfs/datasets.py`, and for the
 * same reason: which file holds the features, which holds the labels, and which
 * axis is the sample axis are re-derived by every caller otherwise.
 *
 * Orientation is resolved against the label count and never guessed. A feature
 * matrix that arrives transposed clusters 4 434 "samples" of 50 features and
 * reports a perfectly plausible number, so a wrong guess here is silent - which
 * is worse than a refusal.
 */

import { readSingleArray, type MatArray } from './mat'

/** One manifest entry: what the pair of files is supposed to contain. */
export interface DatasetInfo {
  slug: string
  name: string
  dataFile: string
  labelFile: string
  samples: number
  features: number
  classes: number
  /** Where the browser downloads it from, when it is not already cached. */
  sourceUrl?: string
  sizeBytes?: number
}

export interface Dataset {
  slug: string
  samples: number
  featureCount: number
  /** Row-major (samples x features), min-max normalised per column. */
  features: Float64Array
  labels: Int32Array
}

/**
 * Scale every column into [0, 1].
 *
 * Constant columns become zero rather than a division by zero. This is applied
 * everywhere because the kernel bandwidth is shared across benchmarks whose raw
 * scales differ by orders of magnitude, and because leaving it to the caller is
 * how it ends up done in one place and not another.
 */
export function minMaxNormalise(data: Float64Array, rows: number, cols: number): Float64Array {
  const out = new Float64Array(data.length)
  for (let c = 0; c < cols; c++) {
    let min = Infinity
    let max = -Infinity
    for (let r = 0; r < rows; r++) {
      const v = data[r * cols + c]
      if (v < min) min = v
      if (v > max) max = v
    }
    const span = max - min
    const denominator = span === 0 ? 1 : span
    for (let r = 0; r < rows; r++) {
      out[r * cols + c] = (data[r * cols + c] - min) / denominator
    }
  }
  return out
}

/** Put the sample axis first, refusing to guess when both axes could be it. */
export function orient(
  matrix: MatArray,
  sampleCount: number,
  source: string,
): { data: Float64Array; rows: number; cols: number } {
  const { rows, cols, data } = matrix
  if (rows === sampleCount && cols === sampleCount) {
    throw new Error(
      `${source} is square (${rows}x${cols}) and has as many rows as labels, so the ` +
      'sample axis cannot be resolved from the shapes alone')
  }
  if (rows === sampleCount) return { data, rows, cols }
  if (cols === sampleCount) {
    const transposed = new Float64Array(data.length)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) transposed[c * rows + r] = data[r * cols + c]
    }
    return { data: transposed, rows: cols, cols: rows }
  }
  throw new Error(
    `${source} is ${rows}x${cols}, and neither axis matches the ${sampleCount} labels`)
}

/** Read one benchmark from the bytes of its two files. */
export async function loadDataset(
  info: DatasetInfo,
  dataFile: ArrayBuffer | Uint8Array,
  labelFile: ArrayBuffer | Uint8Array,
  { normalise = true }: { normalise?: boolean } = {},
): Promise<Dataset> {
  const labelArray = await readSingleArray(labelFile)
  const labels = Int32Array.from(labelArray.data)

  const oriented = orient(await readSingleArray(dataFile), labels.length, info.dataFile)
  if (oriented.cols !== info.features) {
    throw new Error(
      `${info.dataFile} has ${oriented.cols} features; the manifest says ${info.features}`)
  }

  return {
    slug: info.slug,
    samples: oriented.rows,
    featureCount: oriented.cols,
    features: normalise
      ? minMaxNormalise(oriented.data, oriented.rows, oriented.cols)
      : oriented.data,
    labels,
  }
}
