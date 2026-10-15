"""The propositions in docs/THEORY.md that follow from the definitions alone.

Each test builds two partitions by hand and reads the events the way CED-FS
reads them, so a change to the event rules that breaks a documented
consequence fails here rather than in a paragraph nobody re-reads.
"""

import numpy as np

from cedfs.evaluation import event_counts


def _events(past, curr, threshold=0.5):
    past, curr = np.asarray(past), np.asarray(curr)
    return event_counts([past, curr], [int(past.max()), int(curr.max())], threshold)


def test_p1_one_object_moving_ends_stability():
    past = [1] * 10 + [2] * 10
    curr = [1] * 9 + [2] * 11
    assert _events(past, curr)["stable"] == 0
    assert _events(past, past)["stable"] == 2


def test_p2_merge_into_a_cluster_over_three_times_larger_is_forgetting():
    # A (5) is absorbed whole into B, which already held 16 others: r = 21/5 > 3.
    past = [1] * 5 + [2] * 16
    curr = [1] * 21
    assert _events(past, curr)["forgetting"] == 1


def test_p2_merge_of_comparable_clusters_is_drift():
    past = [1] * 10 + [2] * 10
    curr = [1] * 20
    e = _events(past, curr)
    assert e["drift"] == 2 and e["forgetting"] == 0


def test_p2_a_split_is_never_forgetting():
    for small in range(1, 20):
        past = [1] * 20
        curr = [1] * small + [2] * (20 - small)
        assert _events(past, curr)["forgetting"] == 0


def test_p2_a_small_breakaway_is_emerging():
    # B of 3 leaves A of 20: 2*3 / (20+3) < 0.5, so B matches nothing.
    past = [1] * 20
    curr = [1] * 17 + [2] * 3
    e = _events(past, curr)
    assert e["emerging"] == 1 and e["drift"] == 1


def test_p3_two_halvings_of_one_group_are_drift_not_forgetting():
    rng = np.random.default_rng(0)
    n = 40
    for _ in range(50):
        past = np.where(rng.permutation(n) < n // 2, 1, 2)
        curr = np.where(rng.permutation(n) < n // 2, 1, 2)
        e = _events(past, curr)
        assert e["forgetting"] == 0 and e["stable"] == 0
