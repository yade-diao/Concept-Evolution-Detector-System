"""
The ground truth has to be right before anything can be scored against it.

These check the generator's own bookkeeping: that the events it reports follow
from the placement it was given, and that the data it produces has the structure
those events describe. A generator that mislabels its own stream would let a
detector be graded against the wrong answer, which is worse than no answer.
"""

import numpy as np
import pytest

from cedfs.synthetic import CANONICAL_PLACEMENTS, make_stream


def test_the_canonical_stream_has_the_shape_it_claims():
    s = make_stream(CANONICAL_PLACEMENTS, samples_per_class=30, features_per_window=60)
    assert s.features.shape == (90, 5 * 60)      # 3 classes x 30, 5 windows x 60
    assert s.labels.shape == (90,)
    assert s.n_windows == 5
    assert len(s.boundaries) == 4                 # one fewer than the windows


def test_classes_sharing_a_centre_are_one_group():
    """Two classes at the same centre cannot be told apart in that window, which
    is how a concept is made to arrive later rather than be present all along."""
    s = make_stream([{1: 0.0, 2: 4.0, 3: 4.0}, {1: 0.0, 2: 4.0, 3: 8.0}])
    assert s.expected_cluster_counts() == [2, 3]
    assert s.groups_per_window[0] == [frozenset({1}), frozenset({2, 3})]
    assert s.groups_per_window[1] == [frozenset({1}), frozenset({2}), frozenset({3})]


def test_a_class_separating_out_is_drift_not_emerging():
    """A concept splitting off is reported as the parent drifting, not as
    something new arriving.

    This follows from the rule the method uses and is worth pinning because it is
    counter-intuitive: {3} leaving {2,3} overlaps its parent, so it has a match
    and is not "emerging" — the group it left is what changed. Whether a split
    ever reads as emerging depends on the sizes involved, not on whether a new
    concept appeared; see the test below."""
    s = make_stream([{1: 0.0, 2: 4.0, 3: 4.0}, {1: 0.0, 2: 4.0, 3: 8.0}])
    b = s.boundaries[0]
    assert b.emerging == 0
    assert b.drift == 1        # {2,3} -> {2} and {3}
    assert b.stable == 1       # {1} untouched
    assert b.forgetting == 0


def test_two_concepts_merging_is_two_drifts_not_a_forgetting():
    """Neither concept disappeared — they fused, so both groups changed and
    neither was lost. Forgetting is reserved for a group with no successor at
    all, which a fixed sample space makes rare: every sample is still somewhere."""
    s = make_stream([{1: 0.0, 2: 4.0}, {1: 0.0, 2: 0.0}])
    b = s.boundaries[0]
    assert (b.stable, b.emerging, b.drift, b.forgetting) == (0, 0, 2, 0)


def test_nothing_changing_is_stable():
    placement = {1: 0.0, 2: 4.0, 3: 8.0}
    s = make_stream([placement, dict(placement)])
    b = s.boundaries[0]
    assert (b.stable, b.emerging, b.drift, b.forgetting) == (3, 0, 0, 0)


def test_every_class_must_be_placed_in_every_window():
    """A feature stream adds features, not samples: a class cannot be absent from
    a window, and a placement that omits one is a mistake worth naming."""
    with pytest.raises(ValueError, match="places no centre"):
        make_stream([{1: 0.0, 2: 4.0}, {1: 0.0}])


def test_a_single_window_has_no_boundary_to_describe():
    with pytest.raises(ValueError, match="at least two windows"):
        make_stream([{1: 0.0, 2: 4.0}])


def test_the_generated_blocks_actually_separate_where_they_should():
    """The bookkeeping and the data have to agree: in a window where two classes
    share a centre their samples must overlap, and where they do not they must
    not."""
    s = make_stream([{1: 0.0, 2: 4.0, 3: 4.0}, {1: 0.0, 2: 4.0, 3: 8.0}],
                    samples_per_class=40, features_per_window=40, spread=0.3, seed=1)
    first = s.features[:, :40].mean(axis=1)
    second = s.features[:, 40:].mean(axis=1)
    by_class = {c: s.labels == c for c in (1, 2, 3)}

    # Window 1: classes 2 and 3 sit on top of each other.
    assert abs(first[by_class[2]].mean() - first[by_class[3]].mean()) < 0.2
    # Window 2: they are four units apart.
    assert abs(second[by_class[2]].mean() - second[by_class[3]].mean()) > 3.0


def test_the_stream_is_reproducible():
    a = make_stream(CANONICAL_PLACEMENTS, seed=5)
    b = make_stream(CANONICAL_PLACEMENTS, seed=5)
    assert np.array_equal(a.features, b.features)


def test_whether_a_split_reads_as_emerging_depends_on_the_sizes_involved():
    """The same semantic event — one concept separating from another — is
    classified differently depending on how many samples each side holds.

    The rule compares groups by Dice overlap against a threshold of 0.5. A group
    of 30 splitting from 60 overlaps at 2*30/(30+60) = 0.67 and reads as drift; a
    group of 5 splitting from 95 overlaps at 2*5/(5+100) = 0.10 and reads as
    emerging. Nothing about the concept differs — only the class sizes do. Any
    event count read off this rule inherits that dependence.
    """
    from cedfs.utils.similarity import cluster_similarity_matrix

    def best_match_for_the_split_off_group(small, large):
        """Emerging is judged per current cluster, so this reads the column for
        the group that split off, not the row for the group it left."""
        past = [1] * (small + large)          # one group before
        curr = [1] * large + [2] * small      # it splits in two
        similarity = cluster_similarity_matrix(past, 1, curr, 2)
        return float(similarity[:, 1].max())  # column 1 is the small group

    assert best_match_for_the_split_off_group(30, 60) >= 0.5   # drift
    assert best_match_for_the_split_off_group(5, 95) < 0.5     # emerging


# ── the detector against the stream it can be scored on ─────────────────────

def test_the_detector_recovers_a_stream_whose_answer_is_known():
    """End to end on ground truth.

    This is the check the benchmarks cannot provide: they have no answer for the
    events, only class labels for the clustering. Here both are known, so a
    detector that reports the right number of clusters for the wrong reason, or
    invents events at boundaries where nothing happened, is visible.
    """
    import tempfile

    from cedfs import CED_FS

    stream = make_stream(CANONICAL_PLACEMENTS, samples_per_class=30,
                         features_per_window=60, seed=7)
    X = np.hstack([stream.features, stream.labels.reshape(-1, 1)])

    with tempfile.TemporaryDirectory() as figures:
        best_ri, events, cluster_counts, _ = CED_FS(
            X, d=stream.features.shape[1], winsize=stream.features_per_window,
            image_dir=figures)

    assert cluster_counts == stream.expected_cluster_counts()
    expected = stream.expected_counts()
    for name in ("stable", "emerging", "drift", "forgetting"):
        assert events[name] == expected[name], name
    assert best_ri > 0.95
