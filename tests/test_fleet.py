"""cedfs.fleet: the detector as a monitor of a fixed set of units."""

import numpy as np

from cedfs.fleet import monitor


def _fleet(seed=0, shift_from=None):
    rng = np.random.default_rng(seed)
    units = rng.standard_normal((60, 40, 8))
    if shift_from is not None:
        units[:12, shift_from:, 3] += 3.0      # a fifth of the fleet, one variable
    return units


def test_a_fleet_with_no_structure_is_one_cluster_and_stable():
    r = monitor(_fleet(), window=10, screen_alpha=0.001)
    assert r.cluster_counts == [1, 1, 1, 1]
    assert not r.flags.any()
    assert all(e["stable"] == 1 for e in r.events)


def test_units_that_leave_the_fleet_are_flagged_through_the_right_variable():
    r = monitor(_fleet(shift_from=20), window=10, screen_alpha=0.001)
    assert r.cluster_counts[:2] == [1, 1] and r.cluster_counts[2] >= 2
    assert r.flags[:12, 2:].all() and not r.flags[12:, 2:].any()
    assert r.variables[2] == [3]


def test_without_screening_the_original_always_splits():
    r = monitor(_fleet(), window=10)
    assert min(r.cluster_counts) >= 2
