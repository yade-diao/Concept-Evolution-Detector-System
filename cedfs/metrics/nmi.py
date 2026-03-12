"""
nmi.py – Normalized Mutual Information (NMI) computed via histogram binning.
"""

import numpy as np


def nmi(vector1: np.ndarray, vector2: np.ndarray, n_bins: int) -> float:
    """Compute the Normalized Mutual Information between two signals.

    A histogram-based estimator is used to approximate the marginal and joint
    probability distributions.

    Parameters
    ----------
    vector1 : np.ndarray, shape (n,) or (n, 1)
        First signal.
    vector2 : np.ndarray, shape (n,) or (n, 1)
        Second signal.
    n_bins : int
        Number of histogram bins.  A larger value increases precision but
        requires more samples to be reliable.

    Returns
    -------
    float
        NMI in [0, 2].  Values near 0 indicate statistical independence;
        values near 2 indicate maximal correlation.
    """
    v1 = vector1.reshape(-1, 1)
    v2 = vector2.reshape(-1, 1)
    combined = np.hstack((v1, v2))
    n = combined.shape[0]

    pmf = np.zeros((n_bins, 2))
    bin_idx = np.zeros((n, 2), dtype=int)

    for col in range(2):
        lo, hi = combined[:, col].min(), combined[:, col].max()
        width = (hi - lo) / n_bins
        edges = lo + width * np.arange(n_bins + 1)
        hist_edges = [-np.inf] + edges[1:-1].tolist() + [np.inf]
        counts, bin_idx[:, col] = np.histogram(combined[:, col], bins=hist_edges)
        pmf[:, col] = counts / n

    joint = np.zeros((n_bins, n_bins))
    for idx in range(n):
        joint[bin_idx[idx, 0], bin_idx[idx, 1]] += 1
    joint /= n

    eps = np.finfo(float).eps
    H_x  = -np.sum(pmf[:, 0] * np.log2(pmf[:, 0] + eps))
    H_y  = -np.sum(pmf[:, 1] * np.log2(pmf[:, 1] + eps))
    H_xy = -np.sum(joint      * np.log2(joint      + eps))

    mi = H_x + H_y - H_xy
    denom = H_x + H_y
    return float(2 * mi / denom) if denom > 0 else 0.0
