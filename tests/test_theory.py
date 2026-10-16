"""The propositions in README (Theory) that follow from the definitions alone.

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


def test_event_scores_match_by_type_and_boundary():
    from cedfs.evaluation import event_scores
    exp = [{"stable": 1, "drift": 1, "emerging": 1, "forgetting": 0}]
    found = [{"stable": 1, "drift": 2, "emerging": 0, "forgetting": 0}]
    s = event_scores(found, exp)
    assert s["precision"] == 2 / 3 and s["recall"] == 2 / 3
    assert s["f1_emerging_forgetting"] == 0.0 and s["exact_boundaries"] == 0.0
    assert event_scores(exp, exp)["exact_boundaries"] == 1.0


def test_window_labels_merge_classes_that_share_a_centre():
    from cedfs.synthetic import UNEVEN_PLACEMENTS, UNEVEN_SIZES, make_stream
    s = make_stream(UNEVEN_PLACEMENTS, samples_per_class=UNEVEN_SIZES, seed=0)
    assert len(np.unique(s.window_labels(0))) == 2
    assert len(np.unique(s.window_labels(1))) == 3


def test_relative_density_keeps_a_small_separated_group():
    # README (Experiments) E5: a 6-object group the original density absorbs.
    from cedfs.evaluation import run_windows
    from cedfs.synthetic import UNEVEN_PLACEMENTS, UNEVEN_SIZES, make_stream
    s = make_stream(UNEVEN_PLACEMENTS, samples_per_class=UNEVEN_SIZES, spread=0.7, seed=0)
    base = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}
    original = run_windows(s.features, s.labels, 60, base)
    relative = run_windows(s.features, s.labels, 60, {**base, "density": "relative"})
    assert original.cluster_counts[1] == 2
    assert relative.cluster_counts == s.expected_cluster_counts()


def test_nystrom_with_all_points_as_landmarks_matches_exact_kpca_distances():
    from scipy.spatial.distance import pdist
    from cedfs.algorithm.k_pca import k_pca, k_pca_nystrom
    rng = np.random.default_rng(21)
    x = rng.random((60, 8))
    exact = k_pca(x, 6.0, 1, 20)
    approx = k_pca_nystrom(x, 6.0, 1, 20, landmarks=60)
    assert np.allclose(pdist(exact), pdist(approx), rtol=1e-6, atol=1e-9)


def test_the_neighbour_index_gives_the_same_partition_as_the_distance_matrix():
    from cedfs.algorithm.k_r_dpc import k_r_dpc
    rng = np.random.default_rng(31)
    for seed in range(5):
        x = rng.random((120, 30))
        x[: 40 + seed * 5] += 0.8
        a = k_r_dpc(x, None, 1, 6.0, 0.05)
        b = k_r_dpc(x, None, 1, 6.0, 0.05, neighbour_index=True)
        assert (np.asarray(a[0]) == np.asarray(b[0])).all() and a[2] == b[2]
