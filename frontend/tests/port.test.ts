/**
 * The pieces of the port, each against the Python reference's answer.
 *
 * `benchmarks.test.ts` runs the whole method and would catch anything these
 * catch, but not where it went wrong: a stream whose cluster counts disagree in
 * window three says nothing about whether the kernel, the eigendecomposition or
 * the density estimate is at fault. These localise it.
 *
 * What is compared exactly and what is compared loosely is deliberate. Kernel
 * values, Dice matrices and Rand Indices are arithmetic both languages must
 * agree on, and are compared to the precision they were recorded at. Projected
 * coordinates are never compared, only distances between them: a sign flip per
 * component, or a rotation inside a degenerate eigenspace, is free to differ
 * between LAPACK and the Jacobi rotation used here, and neither changes a
 * distance.
 */

import { describe, expect, it } from 'vitest'

import { windowCount } from '../src/cedfs/cedFs'
import { gramMatrix, type KernelType } from '../src/cedfs/kernel'
import { kernelPca } from '../src/cedfs/kpca'
import { diceSimilarity, randIndex } from '../src/cedfs/metrics'
import { answers, columns, dataset } from './reference'

describe('kernels', () => {
  // The Gram matrix is the only way in to the kernel functions, so a 2 x d
  // window is built from the two rows the reference used and its off-diagonal
  // entry read: that cell is exactly k(x, y). It exercises the Gram loop's
  // symmetry at the same time.
  for (const [i, kase] of answers.kernels.entries()) {
    it(`kernel ${kase.kernelType} at sigma ${kase.sigma} (case ${i})`, async () => {
      const data = await dataset(kase.dataset)
      const width = kase.columnEnd - kase.columnStart
      const pair = new Float64Array(2 * width)
      for (const [slot, row] of [kase.rowA, kase.rowB].entries()) {
        const from = row * data.featureCount + kase.columnStart
        pair.set(data.features.subarray(from, from + width), slot * width)
      }

      const K = gramMatrix(pair, 2, width, kase.kernelType as KernelType, kase.sigma)

      expect(K[1]).toBeCloseTo(kase.expected, 10)
      expect(K[2]).toBe(K[1])
    })
  }
})

describe('kernel PCA', () => {
  it('preserves the distances the reference projects to', async () => {
    const kase = answers.kpca
    const data = await dataset(kase.dataset)
    const block = columns(
      data.features, kase.sampleLimit, data.featureCount, kase.columnStart, kase.columnEnd)

    const { data: reduced, dim } = kernelPca(
      block, kase.sampleLimit, kase.columnEnd - kase.columnStart,
      kase.sigma, kase.kernelType as KernelType, kase.targetDim)

    const distances: number[] = []
    for (let i = 0; i < kase.sampleLimit; i++) {
      for (let j = i + 1; j < kase.sampleLimit; j++) {
        let sum = 0
        for (let k = 0; k < dim; k++) {
          const d = reduced[i * dim + k] - reduced[j * dim + k]
          sum += d * d
        }
        distances.push(Math.sqrt(sum))
      }
    }

    expect(distances).toHaveLength(kase.expectedDistances.length)
    for (const [i, expected] of kase.expectedDistances.entries()) {
      expect(distances[i]).toBeCloseTo(expected, 6)
    }
  })
})

describe('Rand Index', () => {
  for (const [i, kase] of answers.randIndex.entries()) {
    it(`agrees on case ${i} (${kase.a.length} points)`, () => {
      expect(randIndex(kase.a, kase.b)).toBeCloseTo(kase.expected, 10)
    })
  }
})

describe('Dice similarity', () => {
  it('agrees cell by cell', () => {
    const { past, pastCount, current, currentCount, expected } = answers.similarity
    const matrix = diceSimilarity(past, pastCount, current, currentCount)

    expect(matrix).toHaveLength(expected.length)
    for (const [i, row] of expected.entries()) {
      expect(matrix[i]).toHaveLength(row.length)
      for (const [j, value] of row.entries()) {
        expect(matrix[i][j]).toBeCloseTo(value, 10)
      }
    }
  })
})

describe('window count', () => {
  // Python's round() breaks halves to even and JavaScript's Math.round breaks
  // them upwards. The rule has to hold in three places - here, in the Python,
  // and in Java's Run.windowCount - because ced-api rejects a result whose
  // cluster counts do not number exactly as many as the windows it expects, and
  // a disagreement therefore throws away work that was correct.
  it('rounds halves to even, not upwards', () => {
    expect(windowCount(125, 50)).toBe(2)   // 2.5 -> 2, and Math.round says 3
    expect(windowCount(175, 50)).toBe(4)   // 3.5 -> 4
    expect(windowCount(75, 50)).toBe(2)    // 1.5 -> 2
    expect(windowCount(25, 50)).toBe(1)    // 0.5 -> 0, floored to one window
  })

  it('never reports fewer than one window', () => {
    expect(windowCount(1, 50)).toBe(1)
    expect(windowCount(10, 50)).toBe(1)
  })
})
