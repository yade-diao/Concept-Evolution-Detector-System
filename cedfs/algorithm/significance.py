"""Is there more than one cluster in this window at all?

K-R-DPC never returns fewer than two clusters (see `_select_centers`), so on a
window where the objects form a single group it still returns a partition —
one decided by noise — and the event rules then read noise as evolution
(README (Theory), P3). This module decides first whether the partition is stronger
than what the same procedure finds on data with no clusters in it.

The null is SigClust's (Liu, Hayes, Nobel & Marron, "Statistical significance
of clustering for high-dimension, low-sample size data", JASA 2008): a single
Gaussian with the window's own covariance spectrum. It keeps everything about
the window except grouping — scale, anisotropy, effective dimension — so a
partition that beats it is not explained by the shape of one cloud. The
statistic is the cluster index, within-cluster over total sum of squares
(lower is tighter), computed on the partition the detector actually found.

The covariance spectrum is taken from the sample eigenvalues directly, without
SigClust's soft-thresholding of the noise floor; with n ≪ d the n − 1 nonzero
eigenvalues are what there is.
"""

from __future__ import annotations

from typing import Callable

import numpy as np


def cluster_index(data: np.ndarray, labels: np.ndarray) -> float:
    """Within-cluster sum of squares over total sum of squares, in [0, 1]."""
    data = np.asarray(data, dtype=float)
    total = ((data - data.mean(0)) ** 2).sum()
    if total == 0:
        return 1.0
    within = sum(((data[labels == c] - data[labels == c].mean(0)) ** 2).sum()
                 for c in np.unique(labels))
    return float(within / total)


def gaussian_null(data: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """One draw of n points from a Gaussian with the window's covariance spectrum."""
    centred = np.asarray(data, dtype=float) - np.mean(data, axis=0)
    n = centred.shape[0]
    # The n x n Gram matrix has the same nonzero spectrum as the d x d
    # covariance and is far smaller when d is in the thousands.
    eigval = np.clip(np.linalg.eigvalsh(centred @ centred.T), 0.0, None)[::-1][: n - 1]
    scale = np.sqrt(eigval / max(n - 1, 1))
    return rng.standard_normal((n, scale.size)) * scale


def significance(data: np.ndarray, labels: np.ndarray,
                 cluster: Callable[[np.ndarray], np.ndarray],
                 reps: int = 19, seed: int = 0) -> float:
    """Monte Carlo p-value that `labels` is tighter than a one-cluster null.

    `cluster` is the same procedure that produced `labels`, applied to each
    null draw, so the null carries the procedure's own tendency to find
    structure. With 19 draws the smallest attainable p is 0.05.
    """
    labels = np.asarray(labels)
    if np.unique(labels).size < 2:
        return 1.0
    observed = cluster_index(data, labels)
    rng = np.random.default_rng(seed)
    as_tight = 0
    for _ in range(reps):
        null = gaussian_null(data, rng)
        null_labels = np.asarray(cluster(null))
        # A null draw the procedure leaves as one cluster found nothing, so it
        # cannot be as tight as the observed partition.
        if np.unique(null_labels).size >= 2 and cluster_index(null, null_labels) <= observed:
            as_tight += 1
    return (1 + as_tight) / (reps + 1)
