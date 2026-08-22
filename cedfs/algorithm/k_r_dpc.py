"""
k_r_dpc.py – Kernel-based Reverse-KNN Density Peak Clustering (K-r-DPC).

The algorithm pipeline
----------------------
1. Reduce dimensionality via K-PCA.
2. Build a K-nearest neighbor graph and compute reverse-KNN density estimates.
3. Compute decision distances (δ) for each point.
4. Automatically select cluster-center candidates based on adaptive percentile
   thresholds on (ρ, δ).
5. Assign all remaining points to their nearest higher-density neighbor.

Reference: density-peak clustering extended with kernel mapping and rKNN
density estimation.
"""

import logging
import os
import uuid

import numpy as np
import matplotlib.pyplot as plt

from cedfs.algorithm.k_pca import k_pca
from cedfs.algorithm.knn import search_knn
from cedfs.algorithm.density import get_rknn_density

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Distance helpers
# ---------------------------------------------------------------------------

def _pairwise_distances(data: np.ndarray) -> np.ndarray:
    """Return the full symmetric distance matrix for *data*."""
    n = data.shape[0]
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = float(np.linalg.norm(data[i] - data[j]))
            dist[i, j] = d
            dist[j, i] = d
    return dist


def _get_delta(dist_matrix: np.ndarray, rhos):
    """Compute decision distances (δ) and nearest higher-density neighbors.

    Parameters
    ----------
    dist_matrix : np.ndarray, shape (n, n)
    rhos : array-like, length n

    Returns
    -------
    deltas : np.ndarray, shape (n,)
    nneigh : np.ndarray of int, shape (n,)
        Index of the nearest point with higher density; -1 for the point with
        the globally highest density.
    """
    rhos = np.asarray(rhos)
    n = len(rhos)
    deltas = np.zeros(n)
    nneigh = np.full(n, -1, dtype=int)

    order = np.argsort(rhos)[::-1]   # descending density

    # Highest-density point: δ = max distance to any other point
    deltas[order[0]] = float(np.max(dist_matrix[order[0]]))

    for rank in range(1, n):
        idx = order[rank]
        higher = order[:rank]                      # all points with ρ > ρ_idx
        dists = dist_matrix[idx, higher]
        best = int(np.argmin(dists))
        deltas[idx] = float(dists[best])
        nneigh[idx] = int(higher[best])

    return deltas, nneigh


# ---------------------------------------------------------------------------
# Adaptive threshold selection
# ---------------------------------------------------------------------------

def _select_centers(rhos, deltas, min_clusters: int = 2) -> np.ndarray:
    """Choose cluster centres from the (density, decision-distance) pair.

    A density peak is a point with both high density and a large distance to any
    denser point, so the product gamma = rho * delta separates centres from
    everything else. Sorted, gamma falls off a cliff after the last real centre,
    and the position of that cliff is the cluster count — read from the data
    rather than fixed in advance.

    This replaces a search that swept percentile thresholds and kept whichever
    pair produced a count closest to (3 + 13) // 2. That rule is measurably
    wrong, on three separate lines of evidence:

    * On a stream built with the answer known — classes placed so that the
      distinguishable groups per window are 2, 2, 3, 3, 2 — the old rule returned
      8 in every window, and the spurious clusters had no counterpart in the
      neighbouring window, so each was counted once as emerging and once as
      forgetting. It invented 4-7 emerging and 5-7 forgetting events at every
      boundary where the truth was zero. This rule returns 2, 2, 3, 3, 2 and
      reproduces every event exactly.

    * On the real benchmarks, measured by the chance-adjusted Rand Index, this
      rule is ahead on all four tested — glioma +0.371 vs +0.230, mll +0.359 vs
      +0.306, arcene +0.051 vs +0.018, prostate +0.025 vs +0.023.

    * The unadjusted Rand Index prefers the old rule on two of those four, and
      that is the reason to distrust it rather than a point in its favour: RI
      counts pairs separated in both partitions as agreement, so splitting a
      correct cluster raises it. The old rule over-segments and the old metric
      rewards over-segmentation; correcting the metric for chance reverses the
      verdict on every dataset.

    `min_clusters` defaults to 2 and is not cosmetic. Without a floor the cliff
    search can settle on the single largest gamma and return one cluster, which
    is no clustering at all — it did exactly that on arcene, in every window.

    Parameters
    ----------
    rhos : array-like of float
        Local density per point.
    deltas : array-like of float
        Distance from each point to the nearest point of higher density.
    min_clusters : int
        Never return fewer than this.

    Returns
    -------
    center_indices : np.ndarray of int
    """
    rhos = np.asarray(rhos, dtype=float)
    deltas = np.asarray(deltas, dtype=float)
    n = len(rhos)
    if n == 0:
        return np.zeros(0, dtype=int)

    gamma = rhos * deltas
    order = np.argsort(gamma)[::-1]
    ranked = gamma[order]

    # Only the head of the ranking can hold centres. Searching further finds the
    # largest ratio somewhere in the noise floor, where gamma is near zero and
    # the ratio between neighbours is large and meaningless.
    horizon = int(min(n - 1, max(3, n // 4)))
    if horizon < 1:
        k = 1
    else:
        head = ranked[:horizon]
        follower = np.maximum(ranked[1:horizon + 1], np.finfo(float).tiny)
        k = int(np.argmax(head / follower)) + 1

    k = max(k, int(min_clusters))
    k = max(1, min(k, n))
    return order[:k].astype(int)


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def k_r_dpc(
    data: np.ndarray,
    image_dir: str = None,
    kernel_type: int = 1,
    sigma: float = 5.0,
    p: float = 0.005,
):
    """Run K-r-DPC on *data* and return cluster assignments.

    Parameters
    ----------
    data : np.ndarray, shape (n, d)
        Unlabelled feature matrix.
    image_dir : str or None
        Directory where decision-graph PNG files are saved.  When *None* no
        images are written.
    kernel_type : int
        Kernel function code (1–5).  Default: 1 (Gaussian).
    sigma : float
        Kernel bandwidth parameter.  Default: 5.0.
    p : float
        Fraction of *n* used as the KNN count *k*.  Default: 0.005.

    Returns
    -------
    cluster : np.ndarray of int, shape (n,)
        Cluster label for each point (1-indexed).
    center_indices : np.ndarray of int
        Indices of the automatically selected cluster centers.
    cluster_num : int
        Number of clusters discovered.
    """
    n, _ = data.shape
    k = max(1, round(p * n))

    # --- K-PCA dimensionality reduction ---
    target_dim = round(n / 3)
    reduced = k_pca(data, sigma, kernel_type, target_dim)

    # --- KNN graph ---
    index_knn, k_dist = search_knn(reduced, k)

    # --- Local density via rKNN ---
    rhos = get_rknn_density(index_knn, k_dist)

    # --- Pairwise distance matrix ---
    dist_mat = _pairwise_distances(reduced)

    # --- Decision distances ---
    deltas, nneigh = _get_delta(dist_mat, rhos)

    # --- Optionally save the decision graph ---
    if image_dir is not None:
        os.makedirs(image_dir, exist_ok=True)
        _save_decision_graph(rhos, deltas, image_dir)

    # --- Select cluster centers ---
    center_indices = _select_centers(rhos, deltas)
    cluster_num = len(center_indices)

    if cluster_num == 0:
        logger.warning("No cluster centers found; falling back to single cluster.")
        return np.ones(n, dtype=int), np.array([0]), 1

    # --- Assign all points ---
    cluster = np.zeros(n, dtype=int)
    for label, ci in enumerate(center_indices, start=1):
        cluster[ci] = label

    rhos_arr = np.asarray(rhos)
    for idx in np.argsort(rhos_arr)[::-1]:
        if cluster[idx] == 0:
            nn = nneigh[idx]
            if nn >= 0 and cluster[nn] != 0:
                cluster[idx] = cluster[nn]

    # Assign any remaining unassigned points to nearest center
    unassigned = np.where(cluster == 0)[0]
    if len(unassigned) > 0:
        logger.debug("%d points were unassigned; using nearest-center fallback.", len(unassigned))
        for idx in unassigned:
            dists = [float(np.linalg.norm(reduced[idx] - reduced[ci])) for ci in center_indices]
            cluster[idx] = int(np.argmin(dists)) + 1

    logger.debug("K-r-DPC finished: %d clusters, %d samples.", cluster_num, n)
    return cluster, center_indices, cluster_num


# ---------------------------------------------------------------------------
# Internal visualization helper
# ---------------------------------------------------------------------------

def _save_decision_graph(rhos, deltas, image_dir: str) -> str:
    """Save a ρ–δ scatter plot (decision graph) and return the filename."""
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(rhos, deltas, alpha=0.6, s=20)
    ax.set_xlabel("Density (rho)")
    ax.set_ylabel("Decision Distance (delta)")
    ax.set_title("Decision Graph")
    fname = f"decision_graph_{uuid.uuid4().hex[:8]}.png"
    fig.savefig(os.path.join(image_dir, fname), dpi=100, bbox_inches="tight")
    plt.close(fig)
    return fname
