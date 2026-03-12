"""
density.py – rKNN-based local density estimation for density-peak clustering.
"""

import numpy as np
from cedfs.algorithm.knn import search_rknn


def get_rknn_density(knn_indices: np.ndarray, knn_distances: np.ndarray):
    """Estimate the local density of each point using its reverse K-nearest
    neighbors and a Gaussian kernel over the corresponding distances.

    Parameters
    ----------
    knn_indices : np.ndarray, shape (n, k)
        KNN index matrix.
    knn_distances : np.ndarray, shape (n, k)
        KNN distance matrix.

    Returns
    -------
    densities : list of float
        Local density estimate for each of the *n* data points.
    """
    n = knn_indices.shape[0]
    rknn = search_rknn(knn_indices)
    densities = []

    for i in range(n):
        rk_neighbors = rknn[i]
        rk_distances = []

        for neighbor_idx in rk_neighbors:
            # neighbor_idx has i in its forward KNN; find that column
            cols = np.where(knn_indices[neighbor_idx] == i)[0]
            if cols.size > 0:
                rk_distances.append(float(knn_distances[neighbor_idx, cols[0]]))

        if rk_distances:
            d = np.array(rk_distances)
            p = float(np.sum(np.exp(-((d / len(d)) ** 2))))
        else:
            p = 0.0
        densities.append(p)

    return densities
