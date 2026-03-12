"""
rand_index.py – Rand Index clustering evaluation metric.
"""

import numpy as np


def rand_index(partition1, partition2) -> float:
    """Compute the Rand Index (RI) between two clusterings.

    The Rand Index measures the fraction of point pairs that are either in the
    same cluster in both partitions or in different clusters in both partitions.

    Parameters
    ----------
    partition1 : array-like of int, length n
        First clustering assignment vector.
    partition2 : array-like of int, length n
        Second clustering assignment vector (e.g. ground-truth labels).

    Returns
    -------
    float
        Rand Index in [0, 1].  1.0 indicates perfect agreement.

    Raises
    ------
    ValueError
        If the two partitions have different lengths.
    """
    p1 = np.asarray(partition1)
    p2 = np.asarray(partition2)

    if p1.shape[0] != p2.shape[0]:
        raise ValueError(
            f"Partitions must have the same length: {p1.shape[0]} vs {p2.shape[0]}."
        )

    n = p1.shape[0]

    # Map labels to compact integer indices
    _, p1 = np.unique(p1, return_inverse=True)
    _, p2 = np.unique(p2, return_inverse=True)

    # Build contingency table
    n1 = len(np.unique(p1))
    n2 = len(np.unique(p2))
    contingency = np.zeros((n1, n2), dtype=np.int64)
    for i in range(n):
        contingency[p1[i], p2[i]] += 1

    # TP: pairs in the same cluster in both partitions
    tp = int(np.sum(contingency * (contingency - 1))) // 2

    # FP: same cluster in p2 but different in p1
    col_sums = contingency.sum(axis=0)
    fp = int(np.sum(col_sums * (col_sums - 1))) // 2 - tp

    # FN: same cluster in p1 but different in p2
    row_sums = contingency.sum(axis=1)
    fn = int(np.sum(row_sums * (row_sums - 1))) // 2 - tp

    total_pairs = n * (n - 1) // 2
    tn = total_pairs - tp - fp - fn

    return (tp + tn) / total_pairs if total_pairs > 0 else 1.0
