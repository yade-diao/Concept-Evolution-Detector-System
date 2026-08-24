/**
 * Rounding the way Python rounds, because the reference is written in Python.
 *
 * `Math.round` breaks halves upwards; Python's `round` breaks them to even. The
 * difference is one integer, and every place this method rounds, that integer
 * changes the answer rather than the last decimal of it:
 *
 * - `round(p * n)` is the neighbourhood size. On a 50-sample window at p = 0.05
 *   that is `round(2.5)`: two neighbours in Python, three under `Math.round`.
 *   The density estimate is built from those neighbours, so the two clusterings
 *   have nothing in common - this was found as a window of `glioma` that the
 *   port split into three clusters where the reference found two.
 * - `round(features / windowSize)` is the number of windows in a stream, which
 *   ced-api validates a submitted result against: a result whose cluster counts
 *   do not number exactly as many as the API expects is rejected, so a
 *   disagreement here throws away work that was correct.
 *
 * The rule therefore has to hold in three implementations - here, in `cedfs/`,
 * and in `Run.windowCount` on the Java side.
 */

/** `Math.round`, except that halves go to the nearer even integer. */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value)
  const remainder = value - floor
  if (remainder > 0.5) return floor + 1
  if (remainder < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

/**
 * The same rule on a ratio of integers, without forming the ratio.
 *
 * `numerator / denominator` is a float and a half is only a half if the
 * division happened to land on one; comparing the remainder twice is exact for
 * any pair of integers.
 */
export function roundQuotientHalfToEven(numerator: number, denominator: number): number {
  const whole = Math.floor(numerator / denominator)
  const remainder = numerator - whole * denominator
  if (remainder * 2 > denominator) return whole + 1
  if (remainder * 2 < denominator) return whole
  return whole % 2 === 0 ? whole : whole + 1
}
