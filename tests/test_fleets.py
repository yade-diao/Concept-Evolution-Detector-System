"""The bundled fleets load, and say what README (industrial fleets) says they say."""

import numpy as np

from cedfs.fleet import monitor
from cedfs.fleets import describe, load, manifest


def test_every_bundled_fleet_has_its_declared_shape():
    for e in manifest():
        assert load(e["slug"]).shape == (e["units"], e["samples"], len(e["variables"]))


def test_the_condenser_fault_fleet_splits_exactly_at_the_fault():
    e = describe("tep-fault-5")
    r = monitor(load("tep-fault-5"), e["window"], screen_alpha=e["alpha"], represent="summaries")
    onset = e["truth"]["onsetSample"] // e["window"]
    faulty = np.zeros(e["units"], bool)
    faulty[e["truth"]["faultyUnits"]] = True
    assert not r.flags[:, :onset].any()
    assert r.flags[faulty, onset:].all() and not r.flags[~faulty].any()
