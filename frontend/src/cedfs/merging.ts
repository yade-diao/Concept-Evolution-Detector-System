/**
 * Merge clusters whose union is still one Gaussian.
 *
 * Ported from `cedfs/algorithm/merging.py`, which says why: density peaks cuts
 * the edge off a large structureless group, and the screening's own null model
 * - one Gaussian across the units - decides whether a split stands. The pair of
 * clusters whose union, projected on the line through their means, is the most
 * Gaussian is merged while the Lilliefors p-value is at least `alpha`.
 */

import { ksNormal, pValue, standardise } from './screening'

/** `ksNormal` of rows a and b together, projected on mean(b) - mean(a). */
export function unionStatistic(x: Float64Array, width: number, a: number[], b: number[]): number {
  const direction = new Float64Array(width)
  for (const i of b) for (let c = 0; c < width; c++) direction[c] += x[i * width + c] / b.length
  for (const i of a) for (let c = 0; c < width; c++) direction[c] -= x[i * width + c] / a.length
  if (direction.every((v) => v === 0)) return 0
  const rows = [...a, ...b]
  const z = new Float64Array(rows.length)
  rows.forEach((i, r) => {
    let dot = 0
    for (let c = 0; c < width; c++) dot += x[i * width + c] * direction[c]
    z[r] = dot
  })
  return ksNormal(standardise(z, rows.length, 1), rows.length, 1)[0]
}

/**
 * 1-based labels in, 1-based labels out, numbered by each cluster's smallest
 * original label, so a partition with nothing to merge comes back unchanged.
 */
export function mergeGaussian(x: Float64Array, width: number, labels: Int32Array, alpha = 0.001): Int32Array {
  const out = Int32Array.from(labels)
  for (;;) {
    const members = new Map<number, number[]>()
    out.forEach((g, i) => {
      if (!members.has(g)) members.set(g, [])
      members.get(g)!.push(i)
    })
    const groups = [...members.keys()].sort((p, q) => p - q)
    let best: { d: number; keep: number; drop: number } | null = null
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = members.get(groups[i])!
        const b = members.get(groups[j])!
        const n = a.length + b.length
        const stat = unionStatistic(x, width, a, b)
        const d = stat / Math.sqrt(n)
        if (pValue(stat, n) >= alpha && (best === null || d < best.d)) best = { d, keep: groups[i], drop: groups[j] }
      }
    }
    if (best === null) break
    for (let i = 0; i < out.length; i++) if (out[i] === best.drop) out[i] = best.keep
  }
  const kept = [...new Set(out)].sort((p, q) => p - q)
  const relabel = new Map(kept.map((g, i) => [g, i + 1]))
  return out.map((g) => relabel.get(g)!)
}
