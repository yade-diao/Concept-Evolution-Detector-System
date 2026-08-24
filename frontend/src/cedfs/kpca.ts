/**
 * Kernel PCA: the Gram matrix, centred in feature space, projected onto its
 * leading eigenvectors.
 *
 * Ported from `cedfs/algorithm/k_pca.py`. One thing is done differently and the
 * difference is exact, not an approximation: the Python centres with three
 * matrix products against an n x n matrix of 1/n, which is O(n^3); the identity
 * it computes is `K[i,j] - rowMean[i] - rowMean[j] + grandMean`, which is O(n^2)
 * and the same number.
 *
 * A sign flip or a rotation inside a degenerate eigenspace would make the
 * projected coordinates differ from NumPy's. It does not matter here, and that
 * is worth stating rather than discovering: everything downstream reads only
 * *distances* between projected points, and those are invariant under both.
 */

import { symmetricEigen } from './eigen'
import { gramMatrix, type KernelType } from './kernel'

export interface Reduced {
  data: Float64Array
  dim: number
}

export function centreInFeatureSpace(K: Float64Array, n: number): Float64Array {
  const rowMean = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < n; j++) sum += K[i * n + j]
    rowMean[i] = sum / n
    total += sum
  }
  const grandMean = total / (n * n)

  const centred = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      centred[i * n + j] = K[i * n + j] - rowMean[i] - rowMean[j] + grandMean
    }
  }
  return centred
}

export function kernelPca(
  X: Float64Array,
  n: number,
  width: number,
  sigma: number,
  kernelType: KernelType,
  targetDim: number,
): Reduced {
  const centred = centreInFeatureSpace(gramMatrix(X, n, width, kernelType, sigma), n)
  const { values, vectors } = symmetricEigen(centred, n)

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[b] - values[a])
  const dim = Math.max(1, Math.min(targetDim, n))

  const data = new Float64Array(n * dim)
  for (let k = 0; k < dim; k++) {
    const column = order[k]

    let norm = 0
    for (let i = 0; i < n; i++) norm += vectors[i * n + column] ** 2
    norm = Math.sqrt(norm) || 1

    for (let i = 0; i < n; i++) {
      let acc = 0
      for (let j = 0; j < n; j++) acc += centred[i * n + j] * vectors[j * n + column]
      data[i * dim + k] = acc / norm
    }
  }
  return { data, dim }
}
