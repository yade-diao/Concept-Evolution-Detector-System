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

import { tridiagonalEigen } from './tridiagonal'
import { crossKernel, gramMatrix, type KernelType } from './kernel'

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
  const { values, vectors } = tridiagonalEigen(centred, n)

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[b] - values[a])
  const dim = Math.max(1, Math.min(targetDim, n))

  const data = new Float64Array(n * dim)
  for (let k = 0; k < dim; k++) {
    const column = order[k]

    let norm = 0
    for (let i = 0; i < n; i++) norm += vectors[i * n + column] ** 2
    norm = Math.sqrt(norm) || 1

    // The Python projects with `K_c @ V`. For an eigenvector that product is
    // lambda v by definition, so it is read off the decomposition instead of
    // recomputed: O(n) per component rather than O(n^2), which at a thousand
    // samples took as long as the decomposition itself.
    const scale = values[column] / norm
    for (let i = 0; i < n; i++) data[i * dim + k] = scale * vectors[i * n + column]
  }
  return { data, dim }
}

/**
 * m of 0..n-1 without replacement, ascending: `landmark_indices` in
 * `cedfs/algorithm/k_pca.py`, bit for bit. mulberry32 drives a partial
 * Fisher-Yates shuffle; the index drawn at step i is i + floor(x (n - i) / 2^32)
 * for a 32-bit x, an integer below 2^53 while n < 2^21, so it is exact here too.
 */
export function landmarkIndices(n: number, m: number, seed = 0): Int32Array {
  const count = Math.min(Math.floor(m), n)
  const perm = Int32Array.from({ length: n }, (_, i) => i)
  let state = seed >>> 0
  for (let i = 0; i < count; i++) {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1) >>> 0
    t = ((t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0) ^ t
    const x = (t ^ (t >>> 14)) >>> 0
    const j = i + Math.floor((x * (n - i)) / 4294967296)
    const swap = perm[i]
    perm[i] = perm[j]
    perm[j] = swap
  }
  return perm.slice(0, count).sort()
}

/**
 * `k_pca` through a Nystrom approximation of the kernel: `k_pca_nystrom` in
 * `cedfs/algorithm/k_pca.py` (Williams & Seeger, NIPS 2001), O(n m^2) instead
 * of O(n^3).
 *
 * K is approximated by F F^T with F = K_nm U_m Lambda_m^(-1/2), F's columns
 * centred. The Python takes the SVD of F and returns U s^2; here the r x r
 * matrix F^T F = W S^2 W^T is decomposed instead, with the same tridiagonal
 * QL as the exact path, and U s^2 = F W s. As in `kernelPca`, only distances
 * between the rows are read downstream, so a sign or rotation within a
 * repeated singular value does not matter.
 */
export function kernelPcaNystrom(
  X: Float64Array,
  n: number,
  width: number,
  sigma: number,
  kernelType: KernelType,
  targetDim: number,
  landmarks: number,
  seed = 0,
): Reduced {
  const index = landmarkIndices(n, landmarks, seed)
  const m = index.length
  const sub = new Float64Array(m * width)
  for (let l = 0; l < m; l++) sub.set(X.subarray(index[l] * width, (index[l] + 1) * width), l * width)
  const { values: lam, vectors: U } = tridiagonalEigen(gramMatrix(sub, m, width, kernelType, sigma), m)
  const Knm = crossKernel(X, n, width, index, kernelType, sigma)

  let lamMax = -Infinity
  for (const v of lam) lamMax = Math.max(lamMax, v)
  const keep: number[] = []
  for (let j = 0; j < m; j++) if (lam[j] > lamMax * 1e-10) keep.push(j)
  const r = keep.length

  const F = new Float64Array(n * r)
  for (let c = 0; c < r; c++) {
    const col = keep[c]
    const inv = 1 / Math.sqrt(lam[col])
    let mean = 0
    for (let i = 0; i < n; i++) {
      let acc = 0
      for (let l = 0; l < m; l++) acc += Knm[i * m + l] * U[l * m + col]
      F[i * r + c] = acc * inv
      mean += F[i * r + c]
    }
    mean /= n
    for (let i = 0; i < n; i++) F[i * r + c] -= mean
  }

  const G = new Float64Array(r * r)
  for (let i = 0; i < n; i++) {
    const row = i * r
    for (let a = 0; a < r; a++) {
      const fa = F[row + a]
      for (let b = a; b < r; b++) G[a * r + b] += fa * F[row + b]
    }
  }
  for (let a = 0; a < r; a++) for (let b = 0; b < a; b++) G[a * r + b] = G[b * r + a]
  const { values: mu, vectors: W } = tridiagonalEigen(G, r)

  const order = Array.from({ length: r }, (_, i) => i).sort((a, b) => mu[b] - mu[a])
  const dim = Math.max(1, Math.min(targetDim, r))
  const data = new Float64Array(n * dim)
  for (let k = 0; k < dim; k++) {
    const column = order[k]
    let norm = 0
    for (let c = 0; c < r; c++) norm += W[c * r + column] ** 2
    const scale = Math.sqrt(Math.max(mu[column], 0)) / (Math.sqrt(norm) || 1)
    for (let i = 0; i < n; i++) {
      let acc = 0
      for (let c = 0; c < r; c++) acc += F[i * r + c] * W[c * r + column]
      data[i * dim + k] = acc * scale
    }
  }
  return { data, dim }
}
