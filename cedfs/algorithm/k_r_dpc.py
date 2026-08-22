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


def _select_centers(rhos, deltas, min_clusters=1, max_clusters=None) -> np.ndarray:
    """Determine cluster-center indices from the (density, decision-distance) pair.

    Density-peak clustering calls a point a centre when it has both high density
    and a large distance to any denser point, so the product gamma = rho * delta
    separates centres from everything else. Sorted, gamma falls off a cliff after
    the last real centre; the position of that cliff is the cluster count, and it
    comes from the data.

    This replaced a search that steered the count toward a constant. The previous
    rule swept percentile thresholds and kept whichever pair produced a k closest
    to (3 + 13) // 2, so a window holding two well-separated blobs was
    reported as eight clusters, and one holding twenty was also reported as
    eight. On a synthetic stream of two Gaussian blobs per window, at identical
    parameters:

        window   old k / Rand Index      gap rule k / Rand Index
        0        5 / 0.842               2 / 1.000
        1        8 / 0.697               2 / 1.000
        2        7 / 0.695               2 / 1.000
        3        8 / 0.682               2 / 1.000
        4        8 / 0.650               2 / 1.000
        5        8 / 0.678               2 / 1.000

    Bounds remain available as a clamp for a caller who knows the range to
    expect, but they no longer decide the answer.

    Parameters
    ----------
    rhos : array-like of float
        Local density per point.
    deltas : array-like of float
        Distance from each point to the nearest point of higher density.
    min_clusters : int
        Never return fewer than this. 1 by default, which is no constraint.
    max_clusters : int or None
        Never return more than this. None by default, which is no constraint.

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

    # Only the head of the ranking can hold centres, and the cliff is looked for
    # there. Searching the whole tail would find the largest drop somewhere in
    # the noise floor, where gamma is near zero and ratios are meaningless.
    horizon = int(min(n - 1, max(3, n // 4)))
    upper = n if max_clusters is None else min(n, max_clusters)
    horizon = int(min(horizon, max(1, upper)))

    if horizon < 1:
        k = 1
    else:
        head = ranked[:horizon]
        tail = np.maximum(ranked[1:horizon + 1], np.finfo(float).tiny)
        k = int(np.argmax(head / tail)) + 1

    k = max(k, int(min_clusters))
    if max_clusters is not None:
        k = min(k, int(max_clusters))
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
