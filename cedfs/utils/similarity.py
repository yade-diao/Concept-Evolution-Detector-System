"""
similarity.py – Inter-cluster similarity computation.

The Dice similarity coefficient is used to measure the overlap between a pair
of clusters from consecutive windows.
"""

import numpy as np


def cluster_similarity_matrix(
    past_cluster,
    past_k: int,
    curr_cluster,
    curr_k: int,
) -> np.ndarray:
    """Compute the Dice-coefficient similarity matrix between past and current
    clusters.

    Given past clusters {C_1^t-1, …, C_{M}^{t-1}} and current clusters
    {C_1^t, …, C_{N}^t}, the (i, j) entry of the returned matrix is:

    .. math::

        S[i, j] = \\frac{2 |C_i^{t-1} \\cap C_j^{t}|}{|C_i^{t-1}| + |C_j^{t}|}

    Parameters
    ----------
    past_cluster : array-like of int, length n
        Cluster labels assigned in the previous window (1-indexed).
    past_k : int
        Number of clusters in the previous window.
    curr_cluster : array-like of int, length n
        Cluster labels assigned in the current window (1-indexed).
    curr_k : int
        Number of clusters in the current window.

    Returns
    -------
    S : np.ndarray, shape (past_k, curr_k)
        Pairwise Dice similarity scores in [0, 1].
    """
    past_sets = [
        set(idx for idx, v in enumerate(past_cluster) if v == j + 1)
        for j in range(past_k)
    ]
    curr_sets = [
        set(idx for idx, v in enumerate(curr_cluster) if v == j + 1)
        for j in range(curr_k)
    ]

    S = np.zeros((past_k, curr_k))
    for i, ci in enumerate(past_sets):
        for j, cj in enumerate(curr_sets):
            nij = len(ci & cj)
            denom = len(ci) + len(cj)
            S[i, j] = (2 * nij / denom) if denom > 0 else 0.0

    return S
