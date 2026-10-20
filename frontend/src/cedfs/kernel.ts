/**
 * The five kernel functions, and the Gram matrix built from one of them.
 *
 * Ported from `cedfs/algorithm/kernel.py`, which stays the reference: any
 * disagreement between the two is a bug here, and `tests/test_port_fixtures.py`
 * generates the fixtures that would catch one.
 */

export const KERNELS = {
  1: 'Gaussian',
  2: 'Polynomial',
  3: 'Linear',
  4: 'Exponential',
  5: 'Laplacian',
} as const

export type KernelType = keyof typeof KERNELS

/**
 * The n x n Gram matrix of a window, row-major.
 *
 * Both the squared distance and the dot product come out of one pass over the
 * feature axis, and only the upper triangle is computed: every kernel here is
 * symmetric, so the other half is a copy rather than a second n*w loop. That
 * matters because this is the hot loop — n^2*w multiplications, run once per
 * window, and there are hundreds of windows in a real stream.
 */
export function gramMatrix(
  X: Float64Array,
  n: number,
  width: number,
  kernelType: KernelType,
  sigma: number,
): Float64Array {
  const K = new Float64Array(n * n)
  const twoSigmaSquared = 2 * sigma * sigma

  for (let i = 0; i < n; i++) {
    const rowI = i * width
    for (let j = i; j < n; j++) {
      const rowJ = j * width
      let squared = 0
      let dot = 0
      for (let c = 0; c < width; c++) {
        const a = X[rowI + c]
        const b = X[rowJ + c]
        const diff = a - b
        squared += diff * diff
        dot += a * b
      }

      const value = kernelOf(squared, dot, kernelType, sigma, twoSigmaSquared)
      K[i * n + j] = value
      K[j * n + i] = value
    }
  }
  return K
}

/**
 * The n x m kernel between every sample and the m `landmarks` (row indices of
 * X, ascending), row-major: the K_nm of the Nystrom approximation.
 */
export function crossKernel(
  X: Float64Array,
  n: number,
  width: number,
  landmarks: Int32Array,
  kernelType: KernelType,
  sigma: number,
): Float64Array {
  const m = landmarks.length
  const K = new Float64Array(n * m)
  const twoSigmaSquared = 2 * sigma * sigma
  for (let i = 0; i < n; i++) {
    const rowI = i * width
    for (let l = 0; l < m; l++) {
      const rowJ = landmarks[l] * width
      let squared = 0
      let dot = 0
      for (let c = 0; c < width; c++) {
        const a = X[rowI + c]
        const b = X[rowJ + c]
        const diff = a - b
        squared += diff * diff
        dot += a * b
      }
      K[i * m + l] = kernelOf(squared, dot, kernelType, sigma, twoSigmaSquared)
    }
  }
  return K
}

/** One kernel value from the squared distance and the dot product of a pair. */
function kernelOf(
  squared: number,
  dot: number,
  kernelType: KernelType,
  sigma: number,
  twoSigmaSquared: number,
): number {
  switch (kernelType) {
    case 1: return Math.exp(-squared / twoSigmaSquared)
    case 2: return Math.pow(dot + 1, sigma)
    case 3: return dot
    case 4: return Math.exp(-Math.sqrt(squared) / twoSigmaSquared)
    case 5: return Math.exp(-Math.sqrt(squared) / sigma)
    default: {
      const exhaustive: never = kernelType
      throw new Error(`kernel must be 1-5, got ${exhaustive}`)
    }
  }
}
