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

      let value: number
      switch (kernelType) {
        case 1: value = Math.exp(-squared / twoSigmaSquared); break
        case 2: value = Math.pow(dot + 1, sigma); break
        case 3: value = dot; break
        case 4: value = Math.exp(-Math.sqrt(squared) / twoSigmaSquared); break
        case 5: value = Math.exp(-Math.sqrt(squared) / sigma); break
        default: {
          const exhaustive: never = kernelType
          throw new Error(`kernel must be 1-5, got ${exhaustive}`)
        }
      }
      K[i * n + j] = value
      K[j * n + i] = value
    }
  }
  return K
}
