"""
merging.py - merge clusters whose union is still one Gaussian.

Density peaks ranks centres by gamma = rho * delta, and on a large group with
no structure inside it some point always has a large delta: the group's edge
facing another group becomes a cluster of its own. On a fleet that is a block
of healthy units flagged as having left their peers (README (Experiments) E6).

Screening already takes "one Gaussian across the units" as the model of no
structure (`cedfs.algorithm.screening`), so the same model decides whether a
split stands. For a pair of clusters, the union is projected on the line
through their means - the direction a split between them would show in - and
tested for normality with the Lilliefors statistic. The pair whose union is the
most Gaussian is merged while its Dallal-Wilkinson p-value is at least `alpha`,
and the pairs are tested again; what remains are splits the null cannot
explain. It is the projection test of Hennig ("Methods for merging Gaussian
mixture components", ADAC 2010) and of dip-means (Kalogeratos & Likas, NIPS
2012), with the screening's test in place of theirs: a closed form, so the
browser port takes the same decisions.
"""

from __future__ import annotations

import numpy as np

from cedfs.algorithm.screening import dallal_wilkinson, ks_normal, standardise


def union_statistic(x: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    """`ks_normal` of the union of rows a and b, projected on mean(b) - mean(a)."""
    direction = x[b].mean(0) - x[a].mean(0)
    if not np.any(direction):
        return 0.0
    z = np.concatenate([x[a], x[b]]) @ direction
    return float(ks_normal(standardise(z[:, None]))[0])


def merge_gaussian(x: np.ndarray, labels: np.ndarray, alpha: float = 0.001) -> np.ndarray:
    """Merge clusters pairwise while their union looks like one Gaussian.

    `labels` are 1-based. Returns 1-based labels, numbered in order of each
    cluster's smallest original label, so that an unmerged partition comes
    back unchanged. `alpha` should be below 0.01, where the Dallal-Wilkinson
    tail is accurate; at or above it a pair is kept apart.
    """
    x = np.asarray(x, dtype=float)
    labels = np.asarray(labels).copy()
    while True:
        groups = np.unique(labels)
        best = None
        for i, g in enumerate(groups):
            for h in groups[i + 1:]:
                a, b = np.flatnonzero(labels == g), np.flatnonzero(labels == h)
                n = a.size + b.size
                stat = union_statistic(x, a, b)
                # The smallest normalised distance is the most Gaussian union;
                # D itself, not the p-value, so that the order is monotone.
                d = stat / np.sqrt(n)
                if dallal_wilkinson(stat, n) >= alpha and (best is None or d < best[0]):
                    best = (d, g, h)
        if best is None:
            break
        labels[labels == best[2]] = best[1]
    _, first = np.unique(labels, return_inverse=True)
    return first + 1
