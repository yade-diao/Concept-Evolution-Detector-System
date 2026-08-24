/**
 * Rand Index and the Dice similarity matrix.
 *
 * Ported from `cedfs/metrics/rand_index.py` and `cedfs/utils/similarity.py`.
 * The Python versions are checked against scikit-learn in `tests/test_metrics.py`,
 * which is what makes them trustworthy to port from: a clustering that works and
 * a metric that is wrong produce the same artefact - a plausible number.
 */

/**
 * The fraction of point pairs the two labellings agree about, where agreeing
 * means either both put the pair together or both keep it apart.
 *
 * Computed from the contingency table rather than by iterating the n^2/2 pairs:
 * same answer, and it is the difference between instant and noticeable at n in
 * the thousands.
 */
export function randIndex(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length
  if (n !== b.length) throw new Error(`labellings differ in length: ${n} vs ${b.length}`)
  if (n < 2) return 1

  const table = new Map<string, number>()
  const rows = new Map<number, number>()
  const cols = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const key = `${a[i]} ${b[i]}`
    table.set(key, (table.get(key) ?? 0) + 1)
    rows.set(a[i], (rows.get(a[i]) ?? 0) + 1)
    cols.set(b[i], (cols.get(b[i]) ?? 0) + 1)
  }

  const choose2 = (x: number) => (x * (x - 1)) / 2
  let sumTable = 0
  for (const v of table.values()) sumTable += choose2(v)
  let sumRows = 0
  for (const v of rows.values()) sumRows += choose2(v)
  let sumCols = 0
  for (const v of cols.values()) sumCols += choose2(v)

  const total = choose2(n)
  return (total + 2 * sumTable - sumRows - sumCols) / total
}

/**
 * Dice overlap between every past cluster and every current one.
 *
 * `S[i][j] = 2 |Ci n Cj| / (|Ci| + |Cj|)`, over sample indices - which is
 * meaningful precisely because this is a feature stream: consecutive windows
 * hold the *same* samples and differ only in the columns they saw, so index i in
 * one window and index i in the next are the same point.
 */
export function diceSimilarity(
  past: ArrayLike<number>,
  pastCount: number,
  current: ArrayLike<number>,
  currentCount: number,
): number[][] {
  const pastSize = new Array<number>(pastCount).fill(0)
  const currentSize = new Array<number>(currentCount).fill(0)
  const shared: number[][] = Array.from({ length: pastCount }, () =>
    new Array<number>(currentCount).fill(0))

  for (let i = 0; i < past.length; i++) {
    const p = past[i] - 1
    const c = current[i] - 1
    if (p >= 0 && p < pastCount) pastSize[p]++
    if (c >= 0 && c < currentCount) currentSize[c]++
    if (p >= 0 && p < pastCount && c >= 0 && c < currentCount) shared[p][c]++
  }

  return shared.map((row, i) =>
    row.map((count, j) => {
      const denominator = pastSize[i] + currentSize[j]
      return denominator > 0 ? (2 * count) / denominator : 0
    }))
}
