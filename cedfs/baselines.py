"""Per-window clusterers to compare K-R-DPC against.

Each is a function `(window, previous_labels) -> labels`, labels 1-based, so
that the same overlap rules (Dice events, MONIC transitions) read all of them.
`previous_labels` is the partition of the previous window, or None.

* `kmeans`     — k-means, k in 2..k_max chosen by silhouette. The default
  choice of every applied paper; like K-R-DPC it cannot return one cluster.
* `hdbscan`    — HDBSCAN (Campello, Moulavi & Sander, PAKDD 2013), the
  parameter-light density clusterer. It can return a single cluster, and
  labels sparse points as noise; noise points are given a cluster of their own
  so the overlap rules see every object.
* `evolutionary` — k-means seeded from the previous window's partition. The
  evolutionary-clustering idea (Chakrabarti, Kumar & Tomkins, KDD 2006; Chi et
  al.'s PCQ, KDD 2007) penalises disagreement with the past; in a feature
  stream the previous centroids live in other columns and cannot be reused,
  but the previous *partition* can: its group means in the current window
  are the initial centroids, so k-means only moves objects the new columns
  give a reason to move. k may grow by one when the silhouette says so.
"""

from __future__ import annotations

import numpy as np
from sklearn.cluster import HDBSCAN, KMeans
from sklearn.metrics import silhouette_score


def _relabel(labels: np.ndarray) -> np.ndarray:
    _, out = np.unique(labels, return_inverse=True)
    return out + 1


def kmeans(window: np.ndarray, previous=None, k_max: int = 6, seed: int = 0) -> np.ndarray:
    best, best_s = None, -np.inf
    for k in range(2, min(k_max, len(window) - 1) + 1):
        labels = KMeans(k, n_init=5, random_state=seed).fit_predict(window)
        s = silhouette_score(window, labels)
        if s > best_s:
            best, best_s = labels, s
    return _relabel(best)


def hdbscan(window: np.ndarray, previous=None, min_cluster_size: int | None = None) -> np.ndarray:
    m = min_cluster_size or max(5, len(window) // 20)
    labels = HDBSCAN(min_cluster_size=m).fit_predict(window)
    labels = labels.copy()
    labels[labels < 0] = labels.max() + 1          # noise becomes one more group
    return _relabel(labels)


def evolutionary(window: np.ndarray, previous=None, seed: int = 0) -> np.ndarray:
    if previous is None:
        return kmeans(window, seed=seed)
    groups = np.unique(previous)
    init = np.stack([window[previous == g].mean(0) for g in groups])
    candidates = [KMeans(len(groups), init=init, n_init=1).fit_predict(window)]
    if len(groups) + 1 < len(window):
        candidates.append(KMeans(len(groups) + 1, n_init=5, random_state=seed).fit_predict(window))
    scores = [silhouette_score(window, c) if len(np.unique(c)) > 1 else -1 for c in candidates]
    # Keep the seeded partition unless adding a group is clearly better.
    pick = 1 if len(scores) > 1 and scores[1] > scores[0] + 0.05 else 0
    return _relabel(candidates[pick])


CLUSTERERS = {"kmeans": kmeans, "hdbscan": hdbscan, "evolutionary": evolutionary}
