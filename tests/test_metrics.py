"""
The metrics, checked against reference implementations.

These are the numbers every result in this project is reported in. They are also
hand-written, which is the reason to check them: a clustering that works and a
metric that is wrong produce the same artifact — a plausible number — and nothing
downstream can tell the two apart.

scikit-learn is already a dependency (``cedfs.algorithm.knn`` uses its KD-tree),
so its implementations serve as the reference rather than a second hand-written
one. Where no reference exists, the check is a closed-form value or an invariant
the definition forces.
"""

import numpy as np
import pytest
from sklearn.metrics import normalized_mutual_info_score, rand_score

from cedfs.metrics.nmi import nmi
from cedfs.metrics.performance import performance
from cedfs.metrics.rand_index import rand_index
from cedfs.utils.similarity import cluster_similarity_matrix


def _rng():
    return np.random.default_rng(20260822)


# ── Rand Index ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("n,k1,k2", [(20, 2, 2), (50, 3, 4), (200, 5, 5), (137, 7, 2)])
def test_rand_index_matches_sklearn(n, k1, k2):
    rng = _rng()
    a = rng.integers(0, k1, size=n)
    b = rng.integers(0, k2, size=n)
    assert rand_index(a, b) == pytest.approx(rand_score(a, b))


def test_rand_index_is_one_for_identical_partitions():
    labels = np.array([0, 0, 1, 1, 2, 2, 2])
    assert rand_index(labels, labels) == pytest.approx(1.0)


def test_rand_index_ignores_label_names():
    """Only the grouping matters; renaming the clusters must change nothing."""
    a = np.array([0, 0, 1, 1, 2])
    renamed = np.array([7, 7, 99, 99, -3])
    assert rand_index(a, renamed) == pytest.approx(1.0)


def test_rand_index_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        rand_index(np.array([0, 1, 2]), np.array([0, 1]))


def test_rand_index_of_a_single_point_is_defined():
    """No pairs exist, so agreement is vacuous — and must not divide by zero."""
    assert rand_index(np.array([0]), np.array([5])) == pytest.approx(1.0)


# ── NMI over cluster labels (performance) ────────────────────────────────────

def _as_cluster_sets(labels):
    """The index-set-per-cluster form `performance` expects."""
    return [np.flatnonzero(labels == c).tolist() for c in np.unique(labels)]


@pytest.mark.parametrize("n,k1,k2", [(40, 2, 3), (120, 4, 4), (200, 3, 6)])
def test_performance_matches_sklearn_geometric_nmi(n, k1, k2):
    rng = _rng()
    truth = rng.integers(0, k1, size=n)
    predicted = rng.integers(0, k2, size=n)
    expected = normalized_mutual_info_score(truth, predicted, average_method="geometric")
    assert performance(_as_cluster_sets(predicted), truth) == pytest.approx(expected)


def test_performance_is_one_for_a_perfect_clustering():
    truth = np.array([0, 0, 0, 1, 1, 1, 2, 2])
    assert performance(_as_cluster_sets(truth), truth) == pytest.approx(1.0)


def test_performance_is_zero_when_one_side_has_no_structure():
    """A single cluster carries no information, and the normaliser is zero."""
    truth = np.array([0, 0, 1, 1])
    one_cluster = [[0, 1, 2, 3]]
    assert performance(one_cluster, truth) == pytest.approx(0.0)


# ── NMI over binned signals ─────────────────────────────────────────────────
#
# This estimator used to raise on every input it was given, so these start from
# "does it run at all" and work up.

def test_nmi_runs_and_is_one_for_a_signal_against_itself():
    x = np.linspace(0.0, 1.0, 200)
    assert nmi(x, x.copy(), 8) == pytest.approx(1.0)


def test_nmi_matches_sklearn_when_bins_align_with_discrete_values():
    """Consecutive integers 0…k-1 in k bins land one value per bin, so the
    binned estimate must equal the exact discrete NMI."""
    rng = _rng()
    for k in (2, 3, 5):
        a = rng.integers(0, k, size=300)
        b = rng.integers(0, k, size=300)
        # Both signals must span the full range for the bin edges to line up.
        a[:k] = np.arange(k)
        b[:k] = np.arange(k)
        expected = normalized_mutual_info_score(a, b, average_method="arithmetic")
        assert nmi(a.astype(float), b.astype(float), k) == pytest.approx(expected)


def test_nmi_is_near_zero_for_independent_signals():
    rng = _rng()
    x = rng.normal(size=4000)
    y = rng.normal(size=4000)
    # Not exactly zero: a histogram estimator on finite samples always reports
    # some spurious dependence. The bound is what "no structure" looks like.
    assert nmi(x, y, 8) < 0.05


def test_nmi_is_symmetric():
    rng = _rng()
    x = rng.normal(size=500)
    y = x * 0.5 + rng.normal(size=500) * 0.5
    assert nmi(x, y, 8) == pytest.approx(nmi(y, x, 8))


def test_nmi_stays_within_zero_and_one():
    rng = _rng()
    for _ in range(20):
        x = rng.normal(size=300)
        y = rng.normal(size=300) + x * rng.uniform(0.0, 3.0)
        value = nmi(x, y, 6)
        assert 0.0 <= value <= 1.0 + 1e-9


def test_nmi_of_a_constant_signal_is_zero():
    """A constant carries no information, so no signal can share any with it."""
    x = np.full(100, 3.0)
    y = np.linspace(0.0, 1.0, 100)
    assert nmi(x, y, 8) == pytest.approx(0.0)


def test_nmi_rejects_bad_arguments():
    x = np.linspace(0.0, 1.0, 10)
    with pytest.raises(ValueError):
        nmi(x, x[:5], 4)
    with pytest.raises(ValueError):
        nmi(x, x.copy(), 0)


# ── Dice similarity between windows ─────────────────────────────────────────

def test_dice_similarity_of_identical_clusters_is_one():
    labels = [1, 1, 2, 2]
    s = cluster_similarity_matrix(labels, 2, labels, 2)
    assert s[0, 0] == pytest.approx(1.0)
    assert s[1, 1] == pytest.approx(1.0)
    assert s[0, 1] == pytest.approx(0.0)


def test_dice_similarity_matches_the_closed_form():
    """2|A ∩ B| / (|A| + |B|), worked through by hand.

    past cluster 1 = {0,1,2}, current cluster 1 = {1,2,3}: overlap 2, sizes 3+3.
    """
    past = [1, 1, 1, 2]
    curr = [2, 1, 1, 1]
    s = cluster_similarity_matrix(past, 2, curr, 2)
    assert s[0, 0] == pytest.approx(2 * 2 / (3 + 3))
    assert s[0, 1] == pytest.approx(2 * 1 / (3 + 1))


def test_dice_similarity_handles_an_empty_cluster():
    """A label with no members must give 0, not a division by zero."""
    s = cluster_similarity_matrix([1, 1], 3, [1, 1], 3)
    assert s[2, 2] == pytest.approx(0.0)
    assert np.all(np.isfinite(s))


# ── Cluster-count selection ─────────────────────────────────────────────────
#
# This used to steer the count toward a constant: the search kept whichever
# percentile pair produced a k nearest (3 + 13) // 2, so two blobs and twenty
# blobs were both reported as eight clusters.

from cedfs.algorithm.k_r_dpc import _select_centers


def test_center_selection_finds_the_cliff_in_gamma():
    """Three clear centres, then a noise floor. k must be 3, not a constant."""
    rhos = np.array([9.0, 8.5, 8.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4])
    deltas = np.array([9.0, 8.5, 8.0, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1])
    assert len(_select_centers(rhos, deltas)) == 3


def test_center_selection_can_return_two():
    """The old rule could not: two was below its hardcoded minimum of three."""
    rhos = np.array([9.0, 8.7, 0.5, 0.4, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1])
    deltas = np.array([9.0, 8.7, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])
    assert len(_select_centers(rhos, deltas)) == 2


def test_center_selection_respects_an_explicit_clamp():
    rhos = np.array([9.0, 8.5, 8.0, 1.0, 0.9, 0.8, 0.7, 0.6])
    deltas = np.array([9.0, 8.5, 8.0, 0.2, 0.2, 0.1, 0.1, 0.1])
    assert len(_select_centers(rhos, deltas, max_clusters=2)) == 2
    assert len(_select_centers(rhos, deltas, min_clusters=5)) == 5


def test_center_selection_handles_degenerate_input():
    assert len(_select_centers(np.array([]), np.array([]))) == 0
    assert len(_select_centers(np.array([1.0]), np.array([1.0]))) == 1
    flat = np.ones(10)
    picked = _select_centers(flat, flat)
    assert 1 <= len(picked) <= 10
