import { test, expect } from 'vitest'
import { gramMatrix } from '../src/cedfs/kernel'
import { centreInFeatureSpace } from '../src/cedfs/kpca'
import { symmetricEigen } from '../src/cedfs/eigen'
import { tridiagonalEigen } from '../src/cedfs/tridiagonal'

// The tridiagonal solver must give Jacobi's answer: same eigenvalues, same
// eigenvectors up to sign, and A v = lambda v to rounding.
test('tridiagonal QL agrees with Jacobi', () => {
  for (const n of [72, 3, 1]) {
    const w = 60
    let seed = 11
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const X = new Float64Array(n * w).map(() => rnd() + (rnd() < 0.3 ? 2 : 0))
    const K = centreInFeatureSpace(gramMatrix(X, n, w, 1, 1.5), n)
    const a = symmetricEigen(K, n)
    const b = tridiagonalEigen(K, n)
    const order = (v: Float64Array) => Array.from(v.keys()).sort((i, j) => v[j] - v[i])
    const oa = order(a.values), ob = order(b.values)
    let valDiff = 0, worstDot = 1, residual = 0
    for (let r = 0; r < n; r++) valDiff = Math.max(valDiff, Math.abs(a.values[oa[r]] - b.values[ob[r]]))
    for (let r = 0; r < Math.min(n, Math.ceil(n / 3)); r++) {
      if (r + 1 < n && Math.abs(b.values[ob[r]] - b.values[ob[r + 1]]) < 1e-9) continue // degenerate pair
      let dot = 0
      for (let i = 0; i < n; i++) dot += a.vectors[i * n + oa[r]] * b.vectors[i * n + ob[r]]
      worstDot = Math.min(worstDot, Math.abs(dot))
    }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
      let s = 0
      for (let j = 0; j < n; j++) s += K[i * n + j] * b.vectors[j * n + k]
      residual = Math.max(residual, Math.abs(s - b.values[k] * b.vectors[i * n + k]))
    }
    expect(valDiff).toBeLessThan(1e-10)
    expect(worstDot).toBeGreaterThan(1 - 1e-9)
    expect(residual).toBeLessThan(1e-10)
  }
})
