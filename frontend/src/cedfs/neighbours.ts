/**
 * Distances, the KNN graph, and the reverse-KNN density estimate.
 *
 * Ported from `cedfs/algorithm/knn.py` and `cedfs/algorithm/density.py`. The
 * Python builds a KD-tree; this scans. That is not a shortcut — `n` is the
 * sample count, which is tens to low hundreds, and below a few thousand points a
 * tree costs more to build than the scan it saves. The distance matrix is needed
 * in full anyway for the decision distances, so the neighbours are read off a
 * matrix that already exists.
 */

export function pairwiseDistances(R: Float64Array, n: number, dim: number): Float64Array {
  const D = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sum = 0
      for (let c = 0; c < dim; c++) {
        const diff = R[i * dim + c] - R[j * dim + c]
        sum += diff * diff
      }
      const distance = Math.sqrt(sum)
      D[i * n + j] = distance
      D[j * n + i] = distance
    }
  }
  return D
}

export interface Neighbours {
  /** The k nearest neighbours of point i, excluding i itself. */
  index: Int32Array
  distance: Float64Array
  k: number
}

export function nearestNeighbours(D: Float64Array, n: number, k: number): Neighbours {
  const bounded = Math.max(1, Math.min(k, n - 1))
  const index = new Int32Array(n * bounded)
  const distance = new Float64Array(n * bounded)
  const order = new Int32Array(n)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) order[j] = j
    const row = i * n
    const sorted = Array.from(order).sort((a, b) => D[row + a] - D[row + b])

    let taken = 0
    for (let r = 0; r < n && taken < bounded; r++) {
      const candidate = sorted[r]
      if (candidate === i) continue
      index[i * bounded + taken] = candidate
      distance[i * bounded + taken] = D[row + candidate]
      taken++
    }
  }
  return { index, distance, k: bounded }
}

/**
 * Density from the *reverse* neighbourhood: not how far i's neighbours are, but
 * how many points chose i and how far they were when they did.
 *
 * The formula is the Python's, oddity included — the distances are divided by
 * how many of them there are before the Gaussian, so a point chosen by many
 * others is scored on shrunken distances and comes out denser. That is what
 * makes this a reverse-KNN estimate rather than a kernel density, and it is
 * reproduced rather than corrected: this is a port, and the place to argue with
 * the method is the paper.
 */
export function reverseKnnDensity({ index, distance, k }: Neighbours, n: number): Float64Array {
  const chosenBy: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) chosenBy[index[i * k + c]].push(i)
  }

  const rho = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const members = chosenBy[i]
    const distances: number[] = []
    for (const m of members) {
      for (let c = 0; c < k; c++) {
        if (index[m * k + c] === i) {
          distances.push(distance[m * k + c])
          break
        }
      }
    }
    if (distances.length === 0) continue
    let sum = 0
    for (const d of distances) sum += Math.exp(-((d / distances.length) ** 2))
    rho[i] = sum
  }
  return rho
}
