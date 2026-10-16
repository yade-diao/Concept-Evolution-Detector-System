"""How small a faulty share can each fleet monitor see?

experiments/tep_fleet.py uses 20 faulty runs in a fleet of 100. A real fleet
rarely has a fifth of its units failing at once, so this sweeps the number of
faulty runs, k = 1, 2, 5, 10, 20, in a fleet of 100 (100 - k fault-free runs),
for the two monitors:

* clustering — `cedfs.fleet.monitor`, screened at alpha = 0.001, clustered on
  the selected summaries;
* deviation — `cedfs.fleet.deviation` (own baseline: the first 100 samples,
  five fault-free hours) + `accumulate` (m = 5, level 0.01).

Screening tests whether a variable's spread across the fleet is one Gaussian;
a single deviant among a hundred moves the empirical distribution by 1/100,
which the KS distance barely registers. The deviation score ranks units
individually, so it should not care how many deviate — until the deviants are
so many that they define the fleet.

    python -m experiments.tep_fraction
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from cedfs.fleet import accumulate, deviation, monitor
from experiments.tep_fleet import DATA, ONSET, rates

FAULTS = [1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20]


def one(job):
    fault, k = job
    data = np.load(DATA)
    runs = np.concatenate([data["normal"][:100 - k], data["faulty"][fault - 1, :k]])
    faulty = np.r_[np.zeros(100 - k, bool), np.ones(k, bool)]
    onset = ONSET // 20
    c = monitor(runs, 20, screen_alpha=0.001, represent="summaries").flags
    d = accumulate(deviation(runs, 20, baseline=100), m=5, level=0.01)
    return {"fault": fault, "k": k, "clustering": rates(c, faulty, onset),
            "deviation": rates(d, faulty, onset)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ks", type=int, nargs="+", default=[1, 2, 5, 10, 20])
    parser.add_argument("--jobs", type=int, default=12)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    with ProcessPoolExecutor(args.jobs) as pool:
        rows = list(pool.map(one, [(f, k) for f in FAULTS for k in args.ks]))
    print(f"{'faulty':>6}   {'clustering det':>14} {'FAR pre':>7} {'FAR after':>9}   "
          f"{'deviation det':>13} {'FAR pre':>7} {'FAR after':>9}")
    for k in args.ks:
        sel = [r for r in rows if r["k"] == k]
        m = {(mon, key): np.mean([r[mon][key] for r in sel])
             for mon in ("clustering", "deviation")
             for key in ("detection", "far_pre", "far_post_normal")}
        print(f"{k:>6}   {m['clustering', 'detection']:>14.2f} {m['clustering', 'far_pre']:>7.3f} "
              f"{m['clustering', 'far_post_normal']:>9.3f}   {m['deviation', 'detection']:>13.2f} "
              f"{m['deviation', 'far_pre']:>7.3f} {m['deviation', 'far_post_normal']:>9.3f}")
    if args.out:
        args.out.write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
