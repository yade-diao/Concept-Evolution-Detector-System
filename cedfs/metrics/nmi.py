"""
nmi.py – Normalized Mutual Information (NMI) computed via histogram binning.

For two continuous signals — a pair of feature streams, say — rather than two
clusterings. Cluster labels are compared with :func:`cedfs.metrics.performance`,
which works from the contingency table directly and needs no binning.
"""

import numpy as np


def _bin_indices(values: np.ndarray, n_bins: int) -> np.ndarray:
    """Assign each sample to one of `n_bins` equal-width bins.

    Returns the bin index per sample, in 0 … n_bins-1.

    This is what MATLAB's ``[counts, idx] = histc(x, edges)`` gives in one call.
    NumPy's ``np.histogram`` looks like the same function and is not: its second
    return value is the bin *edges*, not the per-sample index. Assigning those
    edges to a per-sample array raised on every input the estimator was ever
    given, so the estimator had never actually run.
    """
    lo = float(values.min())
    hi = float(values.max())

    # A constant signal occupies one bin and carries zero entropy. Without this
    # the edges below collapse onto each other and every sample still lands in
    # bin 0 — but by accident rather than on purpose.
    if hi <= lo:
        return np.zeros(values.shape[0], dtype=np.int64)

    # Interior edges only. np.digitize then returns 0 below the first edge and
    # n_bins-1 at or above the last, so the extremes need no ±inf sentinels —
    # those were what produced an out-of-range index once cast to an integer.
    edges = lo + (hi - lo) * np.arange(1, n_bins, dtype=float) / n_bins
    return np.digitize(values, edges).astype(np.int64)


def nmi(vector1: np.ndarray, vector2: np.ndarray, n_bins: int) -> float:
    """Compute the Normalized Mutual Information between two signals.

    A histogram-based estimator approximates the marginal and joint probability
    distributions.

    Parameters
    ----------
    vector1 : np.ndarray, shape (n,) or (n, 1)
        First signal.
    vector2 : np.ndarray, shape (n,) or (n, 1)
        Second signal.
    n_bins : int
        Number of histogram bins. A larger value increases precision but
        requires more samples to be reliable.

    Returns
    -------
    float
        NMI in [0, 1], under the arithmetic-mean normalisation
        ``2 * I(X;Y) / (H(X) + H(Y))``. 0 indicates independence at this
        binning; 1 indicates that either signal determines the other.

    Raises
    ------
    ValueError
        If the signals differ in length, or `n_bins` is below 1.
    """
    v1 = np.asarray(vector1, dtype=float).reshape(-1)
    v2 = np.asarray(vector2, dtype=float).reshape(-1)

    if v1.shape[0] != v2.shape[0]:
        raise ValueError(
            f"Signals must have the same length: {v1.shape[0]} vs {v2.shape[0]}."
        )
    if n_bins < 1:
        raise ValueError(f"n_bins must be at least 1, got {n_bins}.")

    n = v1.shape[0]
    if n == 0:
        return 0.0

    b1 = _bin_indices(v1, n_bins)
    b2 = _bin_indices(v2, n_bins)

    joint = np.zeros((n_bins, n_bins), dtype=float)
    np.add.at(joint, (b1, b2), 1.0)
    joint /= n

    p_x = joint.sum(axis=1)
    p_y = joint.sum(axis=0)

    # Empty bins are skipped rather than nudged by an epsilon. 0·log 0 is 0,
    # while (0+eps)·log(0+eps) is a small negative quantity that accumulates
    # across every empty bin and reports entropy the data does not have.
    nz_x = p_x > 0
    nz_y = p_y > 0
    h_x = -float(np.sum(p_x[nz_x] * np.log2(p_x[nz_x])))
    h_y = -float(np.sum(p_y[nz_y] * np.log2(p_y[nz_y])))

    nz = joint > 0
    outer = np.outer(p_x, p_y)
    mi = float(np.sum(joint[nz] * np.log2(joint[nz] / outer[nz])))

    denom = h_x + h_y
    return float(2.0 * mi / denom) if denom > 0 else 0.0
