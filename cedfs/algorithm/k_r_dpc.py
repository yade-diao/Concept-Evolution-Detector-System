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

_RHO_PERCENTILES_SMALL  = [50, 55, 60, 65, 70, 75, 80, 85]
_RHO_PERCENTILES_MEDIUM = [60, 65, 70, 75, 80, 85, 90, 95]
_RHO_PERCENTILES_LARGE  = [70, 75, 80, 85, 90, 92, 94, 96]

_TARGET_MIN_CLUSTERS = 3
_TARGET_MAX_CLUSTERS = 13


def _select_centers(rhos, deltas) -> np.ndarray:
    """Automatically determine cluster-center indices via adaptive percentile
    thresholds on (density, decision-distance).

    Returns
    -------
    center_indices : np.ndarray of int
    """
    rhos = np.asarray(rhos, dtype=float)
    deltas = np.asarray(deltas, dtype=float)
    n = len(rhos)

    if n < 100:
        pcts = _RHO_PERCENTILES_SMALL
    elif n > 500:
        pcts = _RHO_PERCENTILES_LARGE
    else:
        pcts = _RHO_PERCENTILES_MEDIUM

    sorted_rhos   = np.sort(rhos)[::-1]
    sorted_deltas = np.sort(deltas)[::-1]

    ideal = (_TARGET_MIN_CLUSTERS + _TARGET_MAX_CLUSTERS) // 2
    best_k = 0
    best_rho_thr = best_delta_thr = None
    candidates = []

    for rp in pcts:
        for dp in pcts:
            ri = min(int(n * (100 - rp) / 100), n - 1)
            di = min(int(n * (100 - dp) / 100), n - 1)
            rho_thr   = sorted_rhos[ri]
            delta_thr = sorted_deltas[di]
            k = int(np.sum((rhos > rho_thr) & (deltas > delta_thr)))
            candidates.append((rho_thr, delta_thr, k))

            if _TARGET_MIN_CLUSTERS <= k <= _TARGET_MAX_CLUSTERS:
                if best_k == 0 or abs(k - ideal) < abs(best_k - ideal):
                    best_k = k
                    best_rho_thr, best_delta_thr = rho_thr, delta_thr

    if best_k == 0:
        # Fall back: pick the configuration with k closest to ideal (≥ 2)
        valid = [(abs(c[2] - ideal), c) for c in candidates if c[2] >= 2]
        if valid:
            valid.sort(key=lambda x: x[0])
            best_rho_thr, best_delta_thr, best_k = valid[0][1]

    if best_k == 0:
        # Last resort: use γ = ρ·δ heuristic
        gamma = rhos * deltas
        center_indices = np.argsort(gamma)[::-1][:3]
        return center_indices.astype(int)

    mask = (rhos > best_rho_thr) & (deltas > best_delta_thr)
    return np.where(mask)[0].astype(int)


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
