"""Sensitivity of the clustering monitor on the Tennessee Eastman fleet.

One parameter at a time around the configuration of INDUSTRIAL.md (window 20
samples, alpha 0.001, summaries, sigma 6, p 0.05), over the 17 detectable
faults, 80 normal + 20 faulty runs. Reported: detection, false alarms before
the fault and on normal runs after it, and the median detection delay in
minutes — the window quantises delay (THEORY.md P4), so window size trades
delay against how much each window sees.

    python -m experiments.tep_sensitivity
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from experiments.tep_fleet import DATA, run

FAULTS = [1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20]
BASE = {"hour": 20, "alpha": 0.001, "sigma": 6.0, "p": 0.05}
SWEEPS = {"hour": [5, 10, 20, 40], "alpha": [1e-2, 1e-3, 1e-4],
          "sigma": [1.0, 3.0, 6.0, 12.0], "p": [0.02, 0.05, 0.1]}


def one(job):
    fault, cfg = job
    data = np.load(DATA)
    params = {"kernel_type": 1, "sigma": cfg["sigma"], "p": cfg["p"]}
    r = run(fault, data, 80, 20, cfg["hour"], params, lambda runs: np.zeros(runs.shape[:2], bool),
            screen_alpha=cfg["alpha"], represent="summaries")
    c = r["ced_fs"]
    delay = c["median_delay_windows"]
    # Delay counted from the onset to the end of the first flagged window.
    return {**cfg, "fault": fault, "detection": c["detection"], "far_pre": c["far_pre"],
            "far_post_normal": c["far_post_normal"],
            "delay_min": None if delay is None else (delay + 1) * cfg["hour"] * 3}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--jobs", type=int, default=12)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    cfgs = []
    for key, values in SWEEPS.items():
        for v in values:
            cfg = {**BASE, key: v}
            if cfg not in cfgs:
                cfgs.append(cfg)
    with ProcessPoolExecutor(args.jobs) as pool:
        rows = list(pool.map(one, [(f, c) for c in cfgs for f in FAULTS]))
    print(f"{'parameter':>9} {'value':>7}  {'det':>5} {'FAR pre':>7} {'FAR after':>9} {'delay (min)':>11}")
    for key, values in SWEEPS.items():
        for v in values:
            sel = [r for r in rows if r[key] == v and all(r[k] == BASE[k] for k in BASE if k != key)]
            delays = [r["delay_min"] for r in sel if r["delay_min"] is not None and r["detection"] > 0.5]
            print(f"{key:>9} {v:>7g}  {np.mean([r['detection'] for r in sel]):>5.2f} "
                  f"{np.mean([r['far_pre'] for r in sel]):>7.3f} "
                  f"{np.mean([r['far_post_normal'] for r in sel]):>9.3f} "
                  f"{np.median(delays) if delays else float('nan'):>11.0f}")
        print()
    if args.out:
        args.out.write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
