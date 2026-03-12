"""
performance.py – NMI computed directly from cluster–label assignments.

Unlike the histogram-based :func:`cedfs.metrics.nmi.nmi`, this function
accepts cluster-set representations and true-label vectors.
"""

from math import log2, sqrt


def performance(cluster: list, label) -> float:
    """Compute the Normalized Mutual Information of a clustering result.

    Parameters
    ----------
    cluster : list of list of int
        Each inner list contains the *sample indices* belonging to one cluster.
        Length equals the number of clusters k.
    label : array-like of int, length n
        True class labels (one per sample).

    Returns
    -------
    float
        NMI value; higher is better.
    """
    unique_classes = list(set(label.flatten()))
    class_sets = [
        [idx for idx, val in enumerate(label) if val == cls]
        for cls in unique_classes
    ]

    n = len(label)
    mi_sum = entropy_c = entropy_t = 0.0

    for i, ci in enumerate(cluster):
        ni = len(ci)
        if ni > 0:
            entropy_c += ni * log2(ni / n)
            for j, tj in enumerate(class_sets):
                nj = len(tj)
                nij = len(set(ci) & set(tj))
                if nij > 0 and ni > 0 and nj > 0:
                    mi_sum += nij * log2(n * nij / (ni * nj))

    for tj in class_sets:
        nj = len(tj)
        if nj > 0:
            entropy_t += nj * log2(nj / n)

    denom = entropy_c * entropy_t
    return float(mi_sum / sqrt(denom)) if denom != 0 else 0.0
