/**
 * Which variables, if any, split the fleet in this window?
 *
 * Ported from `cedfs/algorithm/screening.py`; the reasoning is there and in
 * docs/THEORY.md (P6). A window is (objects, samples, variables), stored
 * object-major: value (o, t, v) at `(o * samples + t) * variables + v`.
 *
 * One difference from the reference, by design: Python computes Lilliefors
 * p-values from a simulated null above 0.01 and from the Dallal-Wilkinson
 * closed form below it. Every selection is made at a level below 0.01, so it is
 * decided by the closed form alone, and that is all this port computes —
 * `pValue` returns 1 wherever the closed form is not below 0.01.
 */

export interface Window {
  data: Float64Array
  objects: number
  samples: number
  variables: number
}

/** Standard normal CDF, via erfc (W. J. Cody's rational approximations). */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2)
}

function erfc(x: number): number {
  // Numerical Recipes' erfc with Chebyshev coefficients: relative error < 1.2e-7.
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return x >= 0 ? r : 2 - r
}

/** Inverse standard normal CDF (Acklam's algorithm, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Column standardisation across objects, sample standard deviation (ddof 1). */
export function standardise(s: Float64Array, n: number, m: number): Float64Array {
  const out = new Float64Array(n * m)
  for (let j = 0; j < m; j++) {
    let mean = 0
    for (let i = 0; i < n; i++) mean += s[i * m + j]
    mean /= n
    let ss = 0
    for (let i = 0; i < n; i++) ss += (s[i * m + j] - mean) ** 2
    const sd = Math.sqrt(ss / (n - 1)) || 1
    for (let i = 0; i < n; i++) out[i * m + j] = (s[i * m + j] - mean) / sd
  }
  return out
}

/** sqrt(n) * sup |F_n - Phi| for each column of z. */
export function ksNormal(z: Float64Array, n: number, m: number): Float64Array {
  const out = new Float64Array(m)
  const col = new Float64Array(n)
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) col[i] = z[i * m + j]
    col.sort()
    let d = 0
    for (let i = 0; i < n; i++) {
      const c = normalCdf(col[i])
      d = Math.max(d, (i + 1) / n - c, c - i / n)
    }
    out[j] = Math.sqrt(n) * d
  }
  return out
}

/** Lilliefors upper tail, Dallal & Wilkinson (1986); 1 where it is not below 0.01. */
export function pValue(stat: number, n: number): number {
  const d = stat / Math.sqrt(n)
  const m = n + 2.78019
  const p = Math.exp(-7.01256 * d * d * m + 2.99587 * d * Math.sqrt(m) - 0.122119 + 0.974598 / Math.sqrt(n) + 1.67997 / n)
  return p < 0.01 ? p : 1
}

/** Summaries with at least max(10, n/4) distinct values across the objects. */
export function testable(s: Float64Array, n: number, m: number): boolean[] {
  const need = Math.max(10, Math.floor(n / 4))
  const out: boolean[] = []
  for (let j = 0; j < m; j++) {
    const seen = new Set<number>()
    for (let i = 0; i < n; i++) seen.add(s[i * m + j])
    out.push(seen.size >= need)
  }
  return out
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b)
  const h = v.length >> 1
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2
}

/** Sample-and-hold variables: most consecutive samples identical in the typical object. */
export function held({ data, objects, samples, variables }: Window): boolean[] {
  const out: boolean[] = []
  for (let v = 0; v < variables; v++) {
    const share: number[] = []
    for (let o = 0; o < objects; o++) {
      let same = 0
      for (let t = 1; t < samples; t++) {
        if (data[(o * samples + t) * variables + v] === data[(o * samples + t - 1) * variables + v]) same++
      }
      share.push(samples > 1 ? same / (samples - 1) : NaN)
    }
    out.push(median(share) > 0.5)
  }
  return out
}

function skewness(col: Float64Array): number {
  const n = col.length
  let mean = 0
  for (const x of col) mean += x
  mean /= n
  let m2 = 0
  let m3 = 0
  for (const x of col) {
    m2 += (x - mean) ** 2
    m3 += (x - mean) ** 3
  }
  m2 /= n
  m3 /= n
  return m2 > 0 ? m3 / m2 ** 1.5 : NaN
}

/** Per column, the least skewed of log s, s^(1/3), s^(2/3). See `spread_scale`. */
export function spreadScale(sd: Float64Array, n: number, m: number): Float64Array {
  const out = new Float64Array(n * m)
  const tiny = 2.2250738585072014e-308
  const transforms = [(x: number) => Math.log(x), (x: number) => x ** (1 / 3), (x: number) => x ** (2 / 3)]
  for (let j = 0; j < m; j++) {
    const columns = transforms.map((f) => {
      const c = new Float64Array(n)
      for (let i = 0; i < n; i++) c[i] = f(Math.max(sd[i * m + j], tiny))
      return c
    })
    let best = 0
    let bestSkew = Infinity
    columns.forEach((c, k) => {
      const s = Math.abs(skewness(c))
      const score = Number.isNaN(s) ? Infinity : s
      if (score < bestSkew) {
        bestSkew = score
        best = k
      }
    })
    for (let i = 0; i < n; i++) out[i * m + j] = columns[best][i]
  }
  return out
}

/** (objects, 2V): window means, then spreads on the scale `spreadScale` picks. */
export function summaries({ data, objects, samples, variables }: Window): Float64Array {
  const V = variables
  const means = new Float64Array(objects * V)
  const sds = new Float64Array(objects * V)
  for (let o = 0; o < objects; o++) {
    for (let v = 0; v < V; v++) {
      let mean = 0
      for (let t = 0; t < samples; t++) mean += data[(o * samples + t) * V + v]
      mean /= samples
      let ss = 0
      for (let t = 0; t < samples; t++) ss += (data[(o * samples + t) * V + v] - mean) ** 2
      means[o * V + v] = mean
      sds[o * V + v] = Math.sqrt(ss / samples)
    }
  }
  const spreads = spreadScale(sds, objects, V)
  const out = new Float64Array(objects * 2 * V)
  for (let o = 0; o < objects; o++) {
    for (let v = 0; v < V; v++) {
      out[o * 2 * V + v] = means[o * V + v]
      out[o * 2 * V + V + v] = spreads[o * V + v]
    }
  }
  return out
}

export interface Screened {
  /** Variables selected, ascending. */
  selected: number[]
  /** The same variables, most significant first - for saying "through what". */
  ranked: number[]
  /** (objects, width): the standardised summaries that passed, for clustering. */
  summary: Float64Array
  width: number
}

/** `screen_summaries`: Bonferroni over 2V tests at family-wise level alpha. */
export function screenSummaries(window: Window, alpha: number): Screened {
  const n = window.objects
  const V = window.variables
  const m = 2 * V
  const s = summaries(window)
  const z = standardise(s, n, m)
  const stats = ksNormal(z, n, m)
  const ok = testable(s, n, m)
  const hold = held(window)
  const hit: boolean[] = []
  const p: number[] = []
  for (let j = 0; j < m; j++) {
    const untested = !ok[j] || (j >= V && hold[j - V])
    p.push(untested ? 1 : pValue(stats[j], n))
    hit.push(!untested && p[j] <= alpha / m)
  }
  const selected: number[] = []
  for (let v = 0; v < V; v++) if (hit[v] || hit[V + v]) selected.push(v)
  const strength = (v: number) => Math.min(p[v], p[V + v])
  const ranked = [...selected].sort((a, b) => strength(a) - strength(b) || a - b)
  const columns = hit.flatMap((h, j) => (h ? [j] : []))
  const summary = new Float64Array(n * columns.length)
  for (let i = 0; i < n; i++) columns.forEach((j, k) => (summary[i * columns.length + k] = z[i * m + j]))
  return { selected, ranked, summary, width: columns.length }
}
