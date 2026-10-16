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


def test_persistence_needs_two_flags_in_five_windows_at_alpha_one_percent():
    from cedfs.fleet import persistent
    flags = np.zeros((3, 8), bool)
    flags[0, 2] = True                    # once: never an alarm
    flags[1, [2, 5]] = True               # twice within five windows: alarm from 5
    flags[2, [0, 6]] = True               # twice, but six windows apart
    alarms = persistent(flags, alpha=0.01, m=5)
    assert not alarms[0].any()
    assert alarms[1].tolist() == [False] * 5 + [True] * 3
    assert not alarms[2].any()


def test_a_variance_fault_needs_the_summary_representation():
    rng = np.random.default_rng(7)
    units = rng.standard_normal((60, 40, 8))
    units[:12, 20:, 5] *= 3.0                  # a fifth of the fleet gets noisier
    columns = monitor(units, window=10, screen_alpha=0.001)
    summaries = monitor(units, window=10, screen_alpha=0.001, represent="summaries")
    assert 5 in summaries.variables[2]
    assert summaries.flags[:12, 2:].mean() > 0.9 and not summaries.flags[12:].any()
    assert columns.flags[:12, 2:].mean() < summaries.flags[:12, 2:].mean()
