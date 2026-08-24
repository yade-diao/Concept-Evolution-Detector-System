/**
 * K-r-DPC: kernel PCA, then density peaks over the reduced space.
 *
 * Ported from `cedfs/algorithm/k_r_dpc.py`.
 */

import { decisionDistances, selectCentres, assign } from './dpc'
import { kernelPca } from './kpca'
import { nearestNeighbours, pairwiseDistances, reverseKnnDensity } from './neighbours'
import type { KernelType } from './kernel'
import { roundHalfToEven } from './rounding'

export interface ClusteringParameters {
  kernelType: KernelType
  sigma: number
  /** Neighbourhood size as a fraction of the sample count. */
  p: number
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
  { kernelType, sigma, p }: ClusteringParameters,
): Clustering {
  // Python's round, not JavaScript's: at p = 0.05 a 50-sample window asks for
  // round(2.5) neighbours, which is two there and three under Math.round, and
  // the density estimate that follows is built on those neighbours. See
  // ./rounding.
  const k = Math.max(1, roundHalfToEven(p * n))
  const targetDim = roundHalfToEven(n / 3)

  const { data: reduced, dim } = kernelPca(X, n, width, sigma, kernelType, targetDim)
  const D = pairwiseDistances(reduced, n, dim)
  const neighbours = nearestNeighbours(D, n, k)
  const rho = reverseKnnDensity(neighbours, n)
  const { delta, nearestDenser } = decisionDistances(D, rho, n)
  const centres = selectCentres(rho, delta, n)
  const cluster = assign(centres, rho, nearestDenser, reduced, n, dim)

  return { cluster, centres, clusterCount: centres.length, rho, delta }
}
