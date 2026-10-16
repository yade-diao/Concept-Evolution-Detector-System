"""MONIC's external transitions (cedfs.transitions)."""

import numpy as np

from cedfs.transitions import transitions


def test_identity_is_survival():
    p = np.r_[np.ones(10), np.full(10, 2)]
    assert transitions(p, p) == {"survive": 2, "absorb": 0, "split": 0, "disappear": 0, "emerge": 0}


def test_an_even_split_is_named_a_split():
    past = np.ones(20)
    curr = np.r_[np.ones(10), np.full(10, 2)]
    assert transitions(past, curr)["split"] == 1


def test_a_merge_is_two_absorptions_and_not_forgetting():
    past = np.r_[np.ones(20), np.full(5, 2)]
    curr = np.ones(25)
    assert transitions(past, curr)["absorb"] == 2


def test_a_small_breakaway_is_survival_plus_emergence():
    past = np.ones(20)
    curr = np.r_[np.ones(17), np.full(3, 2)]
    t = transitions(past, curr)
    assert t["survive"] == 1 and t["emerge"] == 1


def test_scattering_is_disappearance():
    past = np.r_[np.ones(9), np.full(9, 2)]
    curr = np.tile([1, 2, 3], 6)
    t = transitions(past, curr)
    assert t["disappear"] == 2 and t["emerge"] == 3
