/**
 * Reading the benchmarks: the `.mat` parser, the orientation rule, the scaling.
 *
 * The numeric agreement with Python is established in `benchmarks.test.ts` -
 * if this file parsed the bytes wrongly, no window there would cluster the way
 * the reference clustered. What is checked here is the part that would
 * otherwise fail silently: a matrix read on the wrong axis, or a label vector
 * that lost its shape, still produces a plausible-looking run.
 */

import { describe, expect, it } from 'vitest'

import { minMaxNormalise, orient } from '../src/datasets/load'
import { dataset, datasets } from './reference'

describe('the bundled benchmarks', () => {
  for (const info of datasets()) {
    it(`reads ${info.slug} as ${info.samples} x ${info.features}`, async () => {
      const data = await dataset(info.slug)

      expect(data.samples).toBe(info.samples)
      expect(data.featureCount).toBe(info.features)
      expect(data.features).toHaveLength(info.samples * info.features)
      expect(data.labels).toHaveLength(info.samples)
      expect(new Set(data.labels).size).toBe(info.classes)

      // Min-max scaling puts every column in [0, 1] and, unless the column is
      // constant, makes it reach both ends. Scanned into four numbers and
      // asserted once: a matrix of ten million entries asserted one at a time
      // costs half a minute of the runner's bookkeeping and says no more.
      let min = Infinity
      let max = -Infinity
      let finite = true
      let zeros = 0
      let ones = 0
      for (const value of data.features) {
        if (!Number.isFinite(value)) { finite = false; break }
        if (value < min) min = value
        if (value > max) max = value
        if (value === 0) zeros++
        else if (value === 1) ones++
      }

      expect(finite).toBe(true)
      expect(min).toBe(0)
      expect(max).toBe(1)
      // Every column contributes its own minimum, so there is at least one zero
      // per column. Ones are only counted in bulk because a constant column
      // scales to all-zero and never reaches the top of the range.
      expect(zeros).toBeGreaterThanOrEqual(info.features)
      expect(ones).toBeGreaterThan(0)
    }, 60_000)
  }
})

describe('orientation', () => {
  const matrix = (rows: number, cols: number) => ({
    name: 'data', rows, cols, data: new Float64Array(rows * cols).map((_, i) => i),
  })

  it('leaves a matrix whose rows are the samples alone', () => {
    const oriented = orient(matrix(4, 3), 4, 'data.mat')
    expect([oriented.rows, oriented.cols]).toEqual([4, 3])
    expect(Array.from(oriented.data.slice(0, 3))).toEqual([0, 1, 2])
  })

  it('transposes a matrix whose columns are the samples', () => {
    const oriented = orient(matrix(3, 4), 4, 'data.mat')
    expect([oriented.rows, oriented.cols]).toEqual([4, 3])
    // Row 0 of the transpose is column 0 of the original.
    expect(Array.from(oriented.data.slice(0, 3))).toEqual([0, 4, 8])
  })

  // A wrong guess here is the failure this whole module exists to prevent: a
  // transposed benchmark clusters 4 434 "samples" of 50 features and reports a
  // number that looks fine.
  it('refuses a square matrix rather than guess which axis is which', () => {
    expect(() => orient(matrix(4, 4), 4, 'data.mat')).toThrow(/square/)
  })

  it('refuses a matrix that matches the labels on neither axis', () => {
    expect(() => orient(matrix(3, 5), 4, 'data.mat')).toThrow(/neither axis/)
  })
})

describe('min-max scaling', () => {
  it('scales each column on its own', () => {
    const scaled = minMaxNormalise(Float64Array.from([0, 10, 5, 20, 10, 30]), 3, 2)
    expect(Array.from(scaled)).toEqual([0, 0, 0.5, 0.5, 1, 1])
  })

  it('sends a constant column to zero instead of dividing by it', () => {
    const scaled = minMaxNormalise(Float64Array.from([7, 1, 7, 3]), 2, 2)
    expect(Array.from(scaled)).toEqual([0, 0, 0, 1])
  })
})
