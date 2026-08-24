/**
 * Symmetric eigendecomposition, by cyclic Jacobi rotations.
 *
 * The Python side calls `numpy.linalg.eigh`, which is LAPACK. There is no
 * LAPACK in a browser, so this is the substitute, and Jacobi is the right one to
 * pick: it is a page of code with no pivoting or shift strategy to get subtly
 * wrong, and its accuracy on symmetric matrices is as good as the tridiagonal
 * methods — better for the small eigenvalues, which is where a centred kernel
 * matrix keeps most of its spectrum.
 *
 * The cost is speed: O(n^3) per sweep with a large constant. It is affordable
 * because n here is the *sample* count — tens to low hundreds — and never the
 * feature count. A stream of 10 000 features is still a 100 x 100 problem.
 */

export interface Eigen {
  /** Eigenvalue k. */
  values: Float64Array
  /** Component i of eigenvector k, at `vectors[i * n + k]`. */
  vectors: Float64Array
}

export function symmetricEigen(input: Float64Array, n: number, maxSweeps = 100): Eigen {
  const A = Float64Array.from(input)
  const V = new Float64Array(n * n)
  for (let i = 0; i < n; i++) V[i * n + i] = 1

  // Convergence is measured against the matrix's own scale. A fixed epsilon
  // would spin for the full sweep count on a kernel matrix whose entries are
  // ~1e-8, and stop far too early on one whose entries are large.
  let scale = 0
  for (let i = 0; i < n * n; i++) scale += A[i] * A[i]
  const tolerance = Math.sqrt(scale) * 1e-14 + Number.MIN_VALUE

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let offDiagonal = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = A[i * n + j]
        offDiagonal += a * a
      }
    }
    if (Math.sqrt(offDiagonal) <= tolerance) break

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q]
        if (apq === 0) continue

        // The rotation that zeroes (p, q). Written through `theta` and the
        // smaller root of t^2 + 2*t*theta - 1 = 0 rather than through atan2:
        // the smaller root keeps the rotation under 45 degrees, which is what
        // makes the sweep converge quadratically instead of wandering.
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq)
        const sign = theta >= 0 ? 1 : -1
        const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c

        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p]
          const akq = A[k * n + q]
          A[k * n + p] = c * akp - s * akq
          A[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k]
          const aqk = A[q * n + k]
          A[p * n + k] = c * apk - s * aqk
          A[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p]
          const vkq = V[k * n + q]
          V[k * n + p] = c * vkp - s * vkq
          V[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }

  const values = new Float64Array(n)
  for (let i = 0; i < n; i++) values[i] = A[i * n + i]
  return { values, vectors: V }
}
