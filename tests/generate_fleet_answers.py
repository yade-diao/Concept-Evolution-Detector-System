"""
Record what the Python fleet monitors answer on the bundled fleets, so the
browser port (frontend/src/cedfs/fleet.ts) can be held to it.

The same rule as tests/generate_reference_answers.py: only answers are written
here, never inputs. Both sides read `datasets/bundled/fleets/*.i16`.

    python -m tests.generate_fleet_answers

Regenerate deliberately, never to make a failing test pass.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from cedfs.fleet import accumulate, deviation, monitor, own_change
from cedfs.fleets import load, manifest
from cedfs.transitions import boundary_transitions

OUT = Path(__file__).resolve().parent.parent / "frontend" / "tests" / "reference" / "fleet_answers.json"
PARAMS = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}
MERGE = 0.001                           # cedfs.algorithm.merging, opt-in
TEP_BASELINE = 100                      # five fault-free hours


def main() -> None:
    answers = []
    for e in manifest():
        cube = load(e["slug"])
        window, alpha = e["window"], e.get("alpha", 0.001)
        r = monitor(cube, window, PARAMS, screen_alpha=alpha, represent="summaries")
        merged = monitor(cube, window, PARAMS, screen_alpha=alpha, represent="summaries",
                         merge=MERGE)
        monic = boundary_transitions(r.clusterings)
        baseline = e.get("baseline", TEP_BASELINE)
        m, level = e.get("m", 5), e.get("level", 0.01)
        p = deviation(cube, window, baseline)
        answers.append({
            "slug": e["slug"], "window": window, "alpha": alpha,
            "baseline": baseline, "m": m, "level": level,
            "clusterCounts": r.cluster_counts,
            "flagged": [np.flatnonzero(r.flags[:, w]).tolist() for w in range(r.flags.shape[1])],
            "variables": r.variables,
            "events": r.events,
            "transitions": monic,
            "mergedClusterCounts": merged.cluster_counts,
            "mergedFlagged": [np.flatnonzero(merged.flags[:, w]).tolist()
                              for w in range(merged.flags.shape[1])],
            # p-values are k / n exactly; stored as the integer k.
            "pCounts": np.rint(p * cube.shape[0]).astype(int).tolist(),
            "alarms": [np.flatnonzero(a).tolist() for a in accumulate(p, m, level).T],
            "ownChangeCounts": np.rint(own_change(cube, window, baseline) * cube.shape[0])
                                .astype(int).tolist(),
            "ownShapeCounts": np.rint(own_change(cube, window, baseline, "shape") * cube.shape[0])
                               .astype(int).tolist(),
        })
    OUT.write_text(json.dumps(answers))
    print(f"{OUT}: {len(answers)} fleets")


if __name__ == "__main__":
    main()
