/**
 * Density peaks: decision distances, centre selection, and assignment.
 *
 * Ported from `cedfs/algorithm/k_r_dpc.py`, including the reasoning behind the
 * centre rule, which is the part of this algorithm that was actually changed
 * rather than merely implemented — see `_select_centers` there for the evidence.
 */

export interface Decision {
  /** Distance from each point to the nearest point of higher density. */
  delta: Float64Array
  /** Which point that was; -1 for the globally densest. */
  nearestDenser: Int32Array
}

export function decisionDistances(D: Float64Array, rho: Float64Array, n: number): Decision {
  const byDensity = Array.from({ length: n }, (_, i) => i).sort((a, b) => rho[b] - rho[a])
  const delta = new Float64Array(n)
  const nearestDenser = new Int32Array(n).fill(-1)
  if (n === 0) return { delta, nearestDenser }

  // The densest point has nothing denser to measure against, so it takes the
  // largest distance in the matrix — which is what puts it at the top right of
  // the decision graph and makes it a centre.
  const densest = byDensity[0]
  let furthest = 0
  for (let j = 0; j < n; j++) furthest = Math.max(furthest, D[densest * n + j])
  delta[densest] = furthest

  for (let rank = 1; rank < n; rank++) {
    const i = byDensity[rank]
    let best = Infinity
    let bestIndex = -1
    for (let r = 0; r < rank; r++) {
      const j = byDensity[r]
      const d = D[i * n + j]
      if (d < best) {
        best = d
        bestIndex = j
      }
    }
    delta[i] = best
    nearestDenser[i] = bestIndex
  }
  return { delta, nearestDenser }
}

/**
 * The cluster count, read off the data rather than fixed in advance.
 *
 * gamma = rho * delta is large only for points that are both dense and far from
 * anything denser. Ranked, gamma falls off a cliff after the last real centre,
 * and the cliff's position is the count.
 *
 * Two guards, both of which earned their place on real data:
 *
 * - Only the head of the ranking is searched. Further down, gamma is near zero
 *   and the ratio between neighbouring values is large and meaningless.
 * - Never fewer than two. Without a floor the search settles on the single
 *   largest gamma and returns one cluster, which is not a clustering — it did
 *   exactly that on `arcene`, in every window.
 */
export function selectCentres(
  rho: Float64Array,
  delta: Float64Array,
  n: number,
  minClusters = 2,
): number[] {
  if (n === 0) return []

  const gamma = new Float64Array(n)
  for (let i = 0; i < n; i++) gamma[i] = rho[i] * delta[i]
  const ranked = Array.from({ length: n }, (_, i) => i).sort((a, b) => gamma[b] - gamma[a])

  const horizon = Math.min(n - 1, Math.max(3, Math.floor(n / 4)))
  let count = 1
  if (horizon >= 1) {
    let bestRatio = -Infinity
    for (let i = 0; i < horizon; i++) {
      const follower = Math.max(gamma[ranked[i + 1]], Number.MIN_VALUE)
      const ratio = gamma[ranked[i]] / follower
      if (ratio > bestRatio) {
        bestRatio = ratio
        count = i + 1
      }
    }
  }

  count = Math.max(count, minClusters)
  count = Math.max(1, Math.min(count, n))
  return ranked.slice(0, count)
}

/**
 * Label every point by walking the density gradient to a centre.
 *
 * In descending density order, so a point's nearest denser neighbour is always
 * already labelled by the time the point is reached — which is why one pass is
 * enough and no iteration is needed.
 */
export function assign(
  centres: number[],
  rho: Float64Array,
  nearestDenser: Int32Array,
  reduced: Float64Array,
  n: number,
  dim: number,
): Int32Array {
  const cluster = new Int32Array(n)
  centres.forEach((centre, i) => {
    cluster[centre] = i + 1
  })

  const byDensity = Array.from({ length: n }, (_, i) => i).sort((a, b) => rho[b] - rho[a])
  for (const i of byDensity) {
    if (cluster[i] !== 0) continue
    const denser = nearestDenser[i]
    if (denser >= 0 && cluster[denser] !== 0) cluster[i] = cluster[denser]
  }

  // A point whose chain never reached a centre falls back to the nearest one.
  // Rare, and squared distance is enough since only the argmin is wanted.
  for (let i = 0; i < n; i++) {
    if (cluster[i] !== 0) continue
    let best = Infinity
    let bestLabel = 1
    centres.forEach((centre, c) => {
      let sum = 0
      for (let d = 0; d < dim; d++) {
        const diff = reduced[i * dim + d] - reduced[centre * dim + d]
        sum += diff * diff
      }
      if (sum < best) {
        best = sum
        bestLabel = c + 1
      }
    })
    cluster[i] = bestLabel
  }
  return cluster
}
