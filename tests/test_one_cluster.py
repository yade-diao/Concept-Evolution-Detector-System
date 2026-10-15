"""The two answers to "is there more than one cluster here?" (THEORY.md P3, P6)."""

import numpy as np

from cedfs.algorithm.k_r_dpc import k_r_dpc
from cedfs.algorithm.screening import held, screen
from cedfs.algorithm.significance import cluster_index, significance


def _cluster(x):
    return np.asarray(k_r_dpc(x, image_dir=None, kernel_type=1, sigma=6.0, p=0.05)[0])


def test_cluster_index_is_low_for_separated_groups():
    x = np.r_[np.zeros((10, 3)), np.ones((10, 3)) * 10]
    assert cluster_index(x, np.r_[np.ones(10), np.full(10, 2)]) < 1e-12


def test_significance_tells_one_gaussian_from_two():
    rng = np.random.default_rng(1)
    one = rng.standard_normal((60, 40)) * 0.1
    two = one.copy()
    two[:20] += 0.6
    assert significance(one, _cluster(one), _cluster) > 0.05
    assert significance(two, _cluster(two), _cluster) <= 0.05


def test_screen_is_quiet_on_independent_gaussian_objects():
    rng = np.random.default_rng(2)
    quiet = sum(screen(rng.standard_normal((100, 20, 30)), 0.01)[0].size == 0
                for _ in range(40))
    assert quiet >= 36            # nominal family-wise rate 1%


def test_screen_finds_the_variable_a_fault_shifts():
    rng = np.random.default_rng(3)
    w = rng.standard_normal((100, 20, 30))
    w[:20, :, 7] += 1.5           # a fifth of the fleet shifts in variable 7
    assert screen(w, 0.01)[0].tolist() == [7]


def test_screen_finds_added_variance_too():
    rng = np.random.default_rng(4)
    w = rng.standard_normal((100, 20, 30))
    w[:20, :, 4] *= 4
    assert 4 in screen(w, 0.01)[0]


def test_sample_and_hold_variables_are_recognised():
    rng = np.random.default_rng(5)
    w = rng.standard_normal((50, 20, 3))
    w[:, :, 1] = np.repeat(w[:, ::5, 1], 5, axis=1)
    assert held(w).tolist() == [False, True, False]
