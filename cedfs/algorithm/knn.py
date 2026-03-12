"""
knn.py – K-nearest neighbor search utilities.
"""

import numpy as np
from sklearn.neighbors import KDTree


def search_knn(dataset: np.ndarray, k: int):
    """Return the indices and distances of the *k* nearest neighbors for every
    point in *dataset* (excluding the point itself).

    Parameters
    ----------
    dataset : np.ndarray, shape (n, d)
        Data matrix with *n* samples and *d* features.
    k : int
        Number of nearest neighbors to retrieve.

    Returns
    -------
    index_knn : np.ndarray, shape (n, k)
        Row *i* contains the indices of the *k* nearest neighbors of point *i*.
    k_dist : np.ndarray, shape (n, k)
        Corresponding Euclidean distances.
    """
    tree = KDTree(dataset, leaf_size=500)
    n = dataset.shape[0]
    index_knn = np.zeros((n, k), dtype=int)
    k_dist = np.zeros((n, k))

    for i in range(n):
        distances, indices = tree.query(dataset[i : i + 1], k=k + 1)
        index_knn[i] = indices[0, 1:]   # skip self
        k_dist[i] = distances[0, 1:]

    return index_knn, k_dist


def search_rknn(index_knn: np.ndarray):
    """Compute the reverse K-nearest neighbor (rKNN) sets.

    Parameters
    ----------
    index_knn : np.ndarray, shape (n, k)
        KNN index matrix returned by :func:`search_knn`.

    Returns
    -------
    neighbors : list of list of int
        ``neighbors[i]`` is the list of indices whose KNN sets contain
        point *i*.
    """
    n = index_knn.shape[0]
    neighbors = [[] for _ in range(n)]
    for i in range(n):
        for j in range(index_knn.shape[1]):
            neighbors[index_knn[i, j]].append(i)
    return neighbors
