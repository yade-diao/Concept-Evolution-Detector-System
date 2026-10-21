"""Does merging the splits one Gaussian explains remove false alarms, and at what cost?

Density peaks ranks centres by gamma = rho * delta, and on a large group with no
structure inside it some point always has a large delta, so the clustering
monitor cuts the edge off the healthy majority and flags it
(`cedfs.algorithm.merging`). This runs the monitor with and without merging:

* on synthetic fleets of 100 to 1 000 units, 4 variables, 40 samples, windows
  of 10, in which a share of units has variable 2 shifted from sample 20 on —
  detection on the faulty units and false alarms on the others, over the two
  windows after the shift;
* on the bundled fleets: Tennessee Eastman faults 5 and 11 (detection after
  onset, false alarms on fault-free runs before and after it) and C-MAPSS FD001
  (`experiments.cmapss_fleet.score`).

    python -m experiments.merging
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np

from cedfs.fleet import monitor
from cedfs.fleets import describe, load
from experiments.cmapss_fleet import score

OUT = Path(__file__).resolve().parent / "results" / "merging.json"
PARAMS = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}
MERGE = 0.001
FLEETS = [(100, 0.10, 3.0), (100, 0.10, 1.5), (100, 0.05, 2.0), (100, 0.02, 3.0),
          (300, 0.10, 1.5), (300, 0.03, 2.0), (1000, 0.10, 3.0), (1000, 0.03, 2.0)]


def synthetic(units: int, share: float, shift: float, merge: float | None) -> dict:
    seeds = range(16) if units <= 300 else range(5)
    detection, false_alarms = [], []
    for seed in seeds:
        rng = np.random.default_rng(seed)
        cube = rng.normal(size=(units, 40, 4))
        bad = max(1, int(units * share))
        cube[:bad, 20:, 2] += shift
        flags = monitor(cube, 10, PARAMS, screen_alpha=0.001, represent="summaries",
                        merge=merge).flags
        detection.append(flags[:bad, 2:4].mean())
        false_alarms.append(flags[bad:, 2:4].mean())
    return {"detection": round(float(np.mean(detection)), 3),
            "false_alarms": round(float(np.mean(false_alarms)), 4)}


def tep(slug: str, merge: float | None) -> dict:
    cube, e = load(slug), describe(slug)
    bad = np.array(e["truth"]["faultyUnits"])
    ok = np.setdiff1d(np.arange(len(cube)), bad)
    onset = e["truth"]["onsetSample"] // e["window"]
    flags = monitor(cube, e["window"], PARAMS, screen_alpha=0.001, represent="summaries",
                    merge=merge).flags
    return {"detection": round(float(flags[bad, onset:].mean()), 3),
            "false_alarms_before": round(float(flags[:, :onset].mean()), 4),
            "false_alarms_after": round(float(flags[ok, onset:].mean()), 4)}


def cmapss(window: int, merge: float | None) -> dict:
    cube, e = load("cmapss-fd001"), describe("cmapss-fd001")
    flags = monitor(cube, window, PARAMS, screen_alpha=0.001, represent="summaries",
                    merge=merge).flags
    r = score(flags, np.array(e["truth"]["lifeCycles"]), window)
    return {"detection": round(r["detection"], 3), "false_alarms": round(r["far"], 3)}


def main() -> None:
    warnings.filterwarnings("ignore")
    results = {"synthetic": [], "bundled": {}}
    for units, share, shift in FLEETS:
        row = {"units": units, "share": share, "shift": shift,
               "original": synthetic(units, share, shift, None),
               "merged": synthetic(units, share, shift, MERGE)}
        results["synthetic"].append(row)
        print(f"{units:5d} units, {share:.0%} shifted by {shift}: "
              f"original {row['original']}  merged {row['merged']}", flush=True)
    for slug in ("tep-fault-5", "tep-fault-11"):
        results["bundled"][slug] = {"original": tep(slug, None), "merged": tep(slug, MERGE)}
        print(slug, results["bundled"][slug])
    for window in (5, 10):
        key = f"cmapss-fd001-w{window}"
        results["bundled"][key] = {"original": cmapss(window, None), "merged": cmapss(window, MERGE)}
        print(key, results["bundled"][key])
    OUT.write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
