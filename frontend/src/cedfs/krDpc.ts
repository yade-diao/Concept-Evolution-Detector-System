/**
 * K-r-DPC: kernel PCA, then density peaks over the reduced space.
 *
 * Ported from `cedfs/algorithm/k_r_dpc.py`.
 */

import { decisionDistances, decisionDistancesFromNeighbours, selectCentres, assign, type Decision } from './dpc'
import { kernelPca, kernelPcaNystrom } from './kpca'
import { nearestNeighbours, nearestNeighboursOf, pairwiseDistances, reverseKnnDensity } from './neighbours'
import type { KernelType } from './kernel'
import { roundHalfToEven } from './rounding'

export interface ClusteringParameters {
  kernelType: KernelType
  sigma: number
  /** Neighbourhood size as a fraction of the sample count. */
  p: number
  /**
   * The Python's `landmarks`: a Nystrom KPCA on this many samples, O(n m^2),
   * instead of the exact one, O(n^3). Ignored unless below the sample count.
   */
  landmarks?: number
  /** The Python's `neighbour_index`: delta from the kNN graph, no n x n matrix. */
  neighbourIndex?: boolean
}

export interface Clustering {
  /** 1-indexed cluster label per sample, matching the Python's convention. */
  cluster: Int32Array
  centres: number[]
  clusterCount: number
  /** The decision graph's coordinates, kept so the UI can draw it. */
  rho: Float64Array
  delta: Float64Array
}

export function krDpc(
  X: Float64Array,
  n: number,
  width: number,
  { kernelType, sigma, p, landmarks, neighbourIndex = false }: ClusteringParameters,
): Clustering {
  // Python's round, not JavaScript's: at p = 0.05 a 50-sample window asks for
  // round(2.5) neighbours, which is two there and three under Math.round, and
  // the density estimate that follows is built on those neighbours. See
  // ./rounding.
  const k = Math.max(1, roundHalfToEven(p * n))
  const targetDim = roundHalfToEven(n / 3)

  const { data: reduced, dim } = landmarks !== undefined && landmarks < n
    ? kernelPcaNystrom(X, n, width, sigma, kernelType, targetDim, landmarks)
    : kernelPca(X, n, width, sigma, kernelType, targetDim)

  let rho: Float64Array
  let decision: Decision
  if (neighbourIndex) {
    const neighbours = nearestNeighboursOf(reduced, n, dim, k)
    rho = reverseKnnDensity(neighbours, n)
    decision = decisionDistancesFromNeighbours(reduced, n, dim, rho, neighbours)
  } else {
    const D = pairwiseDistances(reduced, n, dim)
    rho = reverseKnnDensity(nearestNeighbours(D, n, k), n)
    decision = decisionDistances(D, rho, n)
  }
  const { delta, nearestDenser } = decision
  const centres = selectCentres(rho, delta, n)
  const cluster = assign(centres, rho, nearestDenser, reduced, n, dim)

  return { cluster, centres, clusterCount: centres.length, rho, delta }
}
