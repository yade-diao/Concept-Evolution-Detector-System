import numpy as np

from cedfs.algorithm.merging import merge_gaussian


def test_a_gaussian_cut_in_two_is_one_group_again():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(2000, 2))
    labels = np.where(x[:, 0] > 0.8, 2, 1)
    assert (merge_gaussian(x, labels) == 1).all()


def test_two_groups_apart_stay_apart():
    rng = np.random.default_rng(1)
    x = rng.normal(size=(300, 2))
    x[:30] += 4
    labels = np.r_[np.full(30, 1), np.full(270, 2)]
    assert (merge_gaussian(x, labels) == labels).all()


def test_only_the_spurious_split_is_merged():
    # The healthy bulk cut at its edge, plus a real group: the bulk is rejoined,
    # the real group kept, and the labels numbered by smallest original label.
    rng = np.random.default_rng(2)
    x = rng.normal(size=(1000, 1))
    x[:100] += 6
    labels = np.where(np.arange(1000) < 100, 3, np.where(x[:, 0] > 0.5, 2, 1))
    merged = merge_gaussian(x, labels)
    assert set(merged[:100]) == {2} and set(merged[100:]) == {1}
