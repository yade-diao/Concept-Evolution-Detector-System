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


def test_deviation_p_values_are_conformal_and_find_a_drifting_unit():
    from cedfs.fleet import accumulate, deviation
    rng = np.random.default_rng(11)
    units = rng.standard_normal((50, 80, 6)) + rng.standard_normal((50, 1, 6)) * 3
    units[0, 30:, :] += np.linspace(0, 4, 50)[:, None]   # one unit drifts away
    p = deviation(units, window=5, baseline=20)
    assert p.min() >= 1 / 50 and p.max() == 1.0
    alarms = accumulate(p, m=5, level=0.01)
    assert alarms[0, -1] and alarms[1:].mean() < 0.05


def test_accumulate_cannot_alarm_when_the_floor_is_above_the_threshold():
    from cedfs.fleet import accumulate
    p = np.full((3, 10), 1 / 100)                          # the smallest p for n = 100
    assert not accumulate(p, m=3, level=0.001).any()
    alarms = accumulate(p, m=5, level=0.001)
    assert not alarms[:, :4].any() and alarms[:, 4:].all()


def test_accumulate_clears_unless_latched():
    from cedfs.fleet import accumulate
    p = np.full((1, 12), 0.6)
    p[0, 2:7] = 0.01                                  # five unusual windows, then normal
    free, held = accumulate(p, 5, 0.001), accumulate(p, 5, 0.001, latch=True)
    assert free[0, 6] and not free[0, 11]
    assert held[0, 6:].all()


def test_ced_fs_options_default_to_the_original_and_screening_can_say_one_cluster(tmp_path):
    from cedfs import CED_FS
    rng = np.random.default_rng(5)
    X = rng.standard_normal((60, 100))
    X = np.c_[X, np.ones(60)]
    _, events, counts, _ = CED_FS(X, 100, 50, image_dir=str(tmp_path))
    assert min(counts) >= 2
    _, events, counts, _ = CED_FS(X, 100, 50, {"screenAlpha": 0.001}, image_dir=str(tmp_path))
    assert counts == [1, 1] and events["stable"] == [1]
