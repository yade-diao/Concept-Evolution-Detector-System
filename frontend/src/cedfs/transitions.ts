/**
 * MONIC's external transitions between two partitions of the same objects.
 *
 * Ported from `cedfs/transitions.py`, where the definitions and the defaults
 * (tau 0.7, tau_split 0.3, as in the clusTransition R package) are explained.
 */

export const TRANSITION_NAMES = ['survive', 'absorb', 'split', 'disappear', 'emerge'] as const
export type TransitionName = (typeof TRANSITION_NAMES)[number]

export function transitions(
  past: ArrayLike<number>,
  current: ArrayLike<number>,
  tau = 0.7,
  tauSplit = 0.3,
): Record<TransitionName, number> {
  const xs = [...new Set(Array.from(past))].sort((a, b) => a - b)
  const ys = [...new Set(Array.from(current))].sort((a, b) => a - b)
  const xi = new Map(xs.map((x, i) => [x, i]))
  const yi = new Map(ys.map((y, j) => [y, j]))
  const counts = xs.map(() => ys.map(() => 0))
  for (let o = 0; o < past.length; o++) counts[xi.get(past[o])!][yi.get(current[o])!]++
  const O = counts.map((row) => {
    const total = row.reduce((a, b) => a + b, 0)
    return row.map((c) => c / total)
  })

  const best = O.map((row) => row.indexOf(Math.max(...row)))
  const mostly = O.map((row) => Math.max(...row) >= tau)
  const out: Record<TransitionName, number> = { survive: 0, absorb: 0, split: 0, disappear: 0, emerge: 0 }
  const reached = ys.map(() => false)
  O.forEach((row, i) => {
    if (mostly[i]) {
      const j = best[i]
      reached[j] = true
      const sharing = best.filter((b, k) => mostly[k] && b === j).length
      if (sharing > 1) out.absorb++
      else out.survive++
      return
    }
    const parts = row.map((o) => o >= tauSplit)
    const share = row.reduce((acc, o, j) => acc + (parts[j] ? o : 0), 0)
    if (parts.filter(Boolean).length >= 2 && share >= tau) {
      out.split++
      parts.forEach((p, j) => (reached[j] = reached[j] || p))
    } else out.disappear++
  })
  out.emerge = reached.filter((r) => !r).length
  return out
}
