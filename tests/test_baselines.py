"""cedfs.baselines: the alternative clusterers keep the K-R-DPC interface."""

import numpy as np

from cedfs.baselines import evolutionary, hdbscan, kmeans


def _two_groups(seed=0):
    rng = np.random.default_rng(seed)
    x = rng.standard_normal((40, 5)) * 0.1
    x[:15] += 3
    return x, np.r_[np.ones(15, int), np.full(25, 2)]


def test_every_baseline_recovers_two_separated_groups_with_one_based_labels():
    x, truth = _two_groups()
    for f in (kmeans, hdbscan):
        labels = f(x)
        assert labels.min() == 1
        assert len(np.unique(labels)) == 2
        assert all(len(np.unique(labels[truth == g])) == 1 for g in (1, 2))


def test_evolutionary_keeps_the_previous_partition_when_nothing_changed():
    x, truth = _two_groups()
    assert (evolutionary(x, previous=truth) == truth).all()
