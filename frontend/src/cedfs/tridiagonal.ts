/**
 * Symmetric eigendecomposition by Householder tridiagonalisation and the
 * implicit QL algorithm - EISPACK's tred2 and tql2, as ported in JAMA.
 *
 * It replaces cyclic Jacobi as the default because of cost, not accuracy.
 * Jacobi converges in ten to twelve sweeps on a centred kernel matrix, each
 * sweep about 3n^3 multiplications, so a 362-sample window spent 1.5 s in the
 * decomposition alone. Tridiagonalising costs (4/3)n^3 once and QL on the
 * tridiagonal is O(n^2) plus the eigenvector accumulation - several times
 * fewer operations for the same answer to rounding.
 *
 * Same contract as the Jacobi version: values in no particular order (here,
 * ascending), and component i of eigenvector k at `vectors[i * n + k]`.
 */

import type { Eigen } from './eigen'

export function tridiagonalEigen(input: Float64Array, n: number): Eigen {
  const V = Float64Array.from(input)
  const d = new Float64Array(n)
  const e = new Float64Array(n)
  tred2(V, d, e, n)
  tql2(V, d, e, n)
  return { values: d, vectors: V }
}

/** Householder reduction to tridiagonal form, accumulating the transform in V. */
function tred2(V: Float64Array, d: Float64Array, e: Float64Array, n: number) {
  for (let j = 0; j < n; j++) d[j] = V[(n - 1) * n + j]

  for (let i = n - 1; i > 0; i--) {
    // Scale to avoid under/overflow.
    let scale = 0
    let h = 0
    for (let k = 0; k < i; k++) scale += Math.abs(d[k])

    if (scale === 0) {
      e[i] = d[i - 1]
      for (let j = 0; j < i; j++) {
        d[j] = V[(i - 1) * n + j]
        V[i * n + j] = 0
        V[j * n + i] = 0
      }
    } else {
      // Generate the Householder vector.
      for (let k = 0; k < i; k++) {
        d[k] /= scale
        h += d[k] * d[k]
      }
      let f = d[i - 1]
      let g = Math.sqrt(h)
      if (f > 0) g = -g
      e[i] = scale * g
      h -= f * g
      d[i - 1] = f - g
      for (let j = 0; j < i; j++) e[j] = 0

      // Apply the similarity transformation to the remaining columns.
      for (let j = 0; j < i; j++) {
        f = d[j]
        V[j * n + i] = f
        g = e[j] + V[j * n + j] * f
        for (let k = j + 1; k <= i - 1; k++) {
          g += V[k * n + j] * d[k]
          e[k] += V[k * n + j] * f
        }
        e[j] = g
      }
      f = 0
      for (let j = 0; j < i; j++) {
        e[j] /= h
        f += e[j] * d[j]
      }
      const hh = f / (h + h)
      for (let j = 0; j < i; j++) e[j] -= hh * d[j]
      for (let j = 0; j < i; j++) {
        f = d[j]
        g = e[j]
        for (let k = j; k <= i - 1; k++) {
          V[k * n + j] -= f * e[k] + g * d[k]
        }
        d[j] = V[(i - 1) * n + j]
        V[i * n + j] = 0
      }
    }
    d[i] = h
  }

  // Accumulate the transformations.
  for (let i = 0; i < n - 1; i++) {
    V[(n - 1) * n + i] = V[i * n + i]
    V[i * n + i] = 1
    const h = d[i + 1]
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k * n + i + 1] / h
      for (let j = 0; j <= i; j++) {
        let g = 0
        for (let k = 0; k <= i; k++) g += V[k * n + i + 1] * V[k * n + j]
        for (let k = 0; k <= i; k++) V[k * n + j] -= g * d[k]
      }
    }
    for (let k = 0; k <= i; k++) V[k * n + i + 1] = 0
  }
  for (let j = 0; j < n; j++) {
    d[j] = V[(n - 1) * n + j]
    V[(n - 1) * n + j] = 0
  }
  V[(n - 1) * n + n - 1] = 1
  e[0] = 0
}

/** Implicit QL on the tridiagonal (d, e), rotating the vectors in V along. */
function tql2(V: Float64Array, d: Float64Array, e: Float64Array, n: number) {
  for (let i = 1; i < n; i++) e[i - 1] = e[i]
  e[n - 1] = 0

  let f = 0
  let tst1 = 0
  const eps = 2 ** -52
  for (let l = 0; l < n; l++) {
    // Find a small subdiagonal element.
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]))
    let m = l
    while (m < n) {
      if (Math.abs(e[m]) <= eps * tst1) break
      m++
    }

    // If m === l, d[l] is already an eigenvalue; otherwise iterate.
    if (m > l) {
      do {
        // Compute the implicit shift.
        let g = d[l]
        let p = (d[l + 1] - g) / (2 * e[l])
        let r = Math.hypot(p, 1)
        if (p < 0) r = -r
        d[l] = e[l] / (p + r)
        d[l + 1] = e[l] * (p + r)
        const dl1 = d[l + 1]
        let h = g - d[l]
        for (let i = l + 2; i < n; i++) d[i] -= h
        f += h

        // Implicit QL transformation.
        p = d[m]
        let c = 1
        let c2 = c
        let c3 = c
        const el1 = e[l + 1]
        let s = 0
        let s2 = 0
        for (let i = m - 1; i >= l; i--) {
          c3 = c2
          c2 = c
          s2 = s
          g = c * e[i]
          h = c * p
          r = Math.hypot(p, e[i])
          e[i + 1] = s * r
          s = e[i] / r
          c = p / r
          p = c * d[i] - s * g
          d[i + 1] = h + s * (c * g + s * d[i])

          // Accumulate the transformation.
          for (let k = 0; k < n; k++) {
            h = V[k * n + i + 1]
            V[k * n + i + 1] = s * V[k * n + i] + c * h
            V[k * n + i] = c * V[k * n + i] - s * h
          }
        }
        p = -s * s2 * c3 * el1 * e[l] / dl1
        e[l] = s * p
        d[l] = c * p
      } while (Math.abs(e[l]) > eps * tst1)
    }
    d[l] += f
    e[l] = 0
  }
}
