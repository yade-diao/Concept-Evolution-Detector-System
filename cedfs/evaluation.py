"""
Measuring what the detector actually recovers.

The method reports one number, ``max(ri_values)`` — the best Rand Index over
every window. On a 10 000-feature dataset with a window of 50 that is the maximum
of two hundred noisy scores, and the maximum of two hundred noisy scores is high
whether or not any of them mean anything. This module is what tells the two
apart.

Three questions, each with a baseline that answers "what would this look like if
there were nothing there":

* **How well does a typical window recover the classes?** Reported as a mean over
  windows with its spread, against the same statistic computed with the labels
  shuffled. Shuffling destroys every association between a sample and its class
  while leaving the clustering problem exactly as hard, so the gap between the
  two is the part that is not an artefact of the metric.

* **How much of the headline figure is the maximisation?** The same shuffled
  baseline, read at the maximum instead of the mean.

* **Does the detected evolution survive reordering the features?** These
  benchmarks are not streams. Their columns are gene indices and pixel positions,
  in no meaningful order, and the stream is simulated by walking that order. If
  the events change when the order changes, they describe the ordering rather
  than the data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from cedfs.algorithm.k_r_dpc import k_r_dpc
from cedfs.metrics.rand_index import rand_index
from cedfs.utils.similarity import cluster_similarity_matrix

DEFAULT_PARAMS = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}


def window_bounds(n_features: int, winsize: int) -> list[tuple[int, int]]:
    """The column ranges CED_FS walks, reproduced so evaluation windows the same
    way the detector does. Kept in one place rather than re-derived per caller."""
    parts = round(n_features / winsize)
    bounds = []
    for i in range(1, parts + 1):
        start = (i - 1) * winsize
        end = n_features if (i == parts and (n_features % winsize) >= winsize / 2) else i * winsize
        bounds.append((start, end))
    return bounds


@dataclass
class WindowRun:
    """What one pass over a feature stream produced, window by window."""

    rand_indices: np.ndarray
    cluster_counts: list[int]
    clusterings: list[np.ndarray] = field(default_factory=list)

    @property
    def mean_ri(self) -> float:
        return float(self.rand_indices.mean())

    @property
    def std_ri(self) -> float:
        return float(self.rand_indices.std())

    @property
    def max_ri(self) -> float:
        return float(self.rand_indices.max())


def run_windows(features: np.ndarray, labels: np.ndarray, winsize: int,
                params: dict | None = None, keep_clusterings: bool = False) -> WindowRun:
    """Cluster every window and score it against the labels.

    `features` is (n_samples, n_features), already normalised, with no label
    column. Every window sees every sample; only the columns differ.
    """
    p = {**DEFAULT_PARAMS, **(params or {})}
    ris, counts, clusterings = [], [], []

    for start, end in window_bounds(features.shape[1], winsize):
        clustering, _, k = k_r_dpc(features[:, start:end], image_dir=None,
                                   kernel_type=p["kernel_type"], sigma=p["sigma"], p=p["p"])
        ris.append(rand_index(clustering, labels))
        counts.append(int(k))
        if keep_clusterings:
            clusterings.append(np.asarray(clustering))

    return WindowRun(np.asarray(ris, dtype=float), counts, clusterings)


@dataclass
class NullComparison:
    """A run and the same run with the labels shuffled."""

    observed: WindowRun
    shuffled: list[WindowRun]

    def _null(self, attr: str) -> np.ndarray:
        return np.asarray([getattr(run, attr) for run in self.shuffled], dtype=float)

    def effect(self, statistic: str = "mean_ri") -> float:
        """How far the observed statistic sits above the null, in null standard
        deviations. Reported this way because the raw gap is not comparable
        across datasets with different class counts — a Rand Index of 0.5 means
        something different for two classes than for eleven."""
        null = self._null(statistic)
        spread = null.std()
        gap = getattr(self.observed, statistic) - null.mean()
        return float(gap / spread) if spread > 0 else float("inf") if gap > 0 else 0.0

    def summary(self) -> dict[str, float]:
        return {
            "mean_ri": self.observed.mean_ri,
            "max_ri": self.observed.max_ri,
            "null_mean_ri": float(self._null("mean_ri").mean()),
            "null_max_ri": float(self._null("max_ri").mean()),
            "effect_at_mean": self.effect("mean_ri"),
            "effect_at_max": self.effect("max_ri"),
        }


def against_shuffled_labels(features: np.ndarray, labels: np.ndarray, winsize: int,
                            repeats: int = 5, seed: int = 0,
                            params: dict | None = None) -> NullComparison:
    """Run once as given, then `repeats` times with the labels permuted.

    Permuting the labels — rather than the data — keeps the clustering problem
    identical and removes only the thing being measured. Anything the comparison
    still shows is produced by the metric and the number of windows, not by the
    data.
    """
    rng = np.random.default_rng(seed)
    observed = run_windows(features, labels, winsize, params)
    shuffled = [run_windows(features, rng.permutation(labels), winsize, params)
                for _ in range(repeats)]
    return NullComparison(observed, shuffled)


def event_counts(clusterings: list[np.ndarray], cluster_counts: list[int],
                 threshold: float = 0.5) -> dict[str, int]:
    """Total events over a run, classified as CED-FS classifies them.

    Totals rather than per-boundary lists: this is used to compare whole runs
    against each other, where the question is how much the run changed, not
    where.
    """
    totals = {"stable": 0, "drift": 0, "forgetting": 0, "emerging": 0}
    for i in range(1, len(clusterings)):
        past, curr = clusterings[i - 1], clusterings[i]
        similarity = cluster_similarity_matrix(past, cluster_counts[i - 1],
                                               curr, cluster_counts[i])
        if similarity.size == 0:
            continue
        for row in range(similarity.shape[0]):
            best = float(similarity[row].max())
            if best == 1.0:
                totals["stable"] += 1
            elif best >= threshold:
                totals["drift"] += 1
            else:
                totals["forgetting"] += 1
        for col in range(similarity.shape[1]):
            if float(similarity[:, col].max()) < threshold:
                totals["emerging"] += 1
    return totals


def feature_order_sensitivity(features: np.ndarray, labels: np.ndarray, winsize: int,
                              repeats: int = 5, seed: int = 0,
                              params: dict | None = None) -> dict[str, object]:
    """Re-run the detector on permuted column orders.

    A feature stream has an order — sensors are installed one after another. A
    gene expression matrix does not: column 7 is not earlier than column 8 in any
    sense, and walking the columns imposes an order the data never had. Every
    permutation is therefore as legitimate a "stream" as the original, and the
    events they produce should be read together rather than one of them being
    taken as the answer.

    Returns the observed run alongside the spread across permutations, which is
    the uncertainty a single reported figure hides.
    """
    rng = np.random.default_rng(seed)
    observed = run_windows(features, labels, winsize, params, keep_clusterings=True)
    observed_events = event_counts(observed.clusterings, observed.cluster_counts)

    permuted_events, permuted_max_ri = [], []
    for _ in range(repeats):
        order = rng.permutation(features.shape[1])
        run = run_windows(features[:, order], labels, winsize, params, keep_clusterings=True)
        permuted_events.append(event_counts(run.clusterings, run.cluster_counts))
        permuted_max_ri.append(run.max_ri)

    spread = {}
    for name in observed_events:
        values = np.asarray([e[name] for e in permuted_events], dtype=float)
        spread[name] = {
            "observed": observed_events[name],
            "permuted_mean": float(values.mean()),
            "permuted_std": float(values.std()),
            "permuted_range": (int(values.min()), int(values.max())),
        }

    return {
        "events": spread,
        "observed_max_ri": observed.max_ri,
        "permuted_max_ri_mean": float(np.mean(permuted_max_ri)),
        "permuted_max_ri_range": (float(np.min(permuted_max_ri)), float(np.max(permuted_max_ri))),
    }
