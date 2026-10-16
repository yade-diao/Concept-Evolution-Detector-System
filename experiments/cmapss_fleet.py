"""A fleet of turbofan engines degrading, watched as a feature stream.

NASA's C-MAPSS run-to-failure simulations (Saxena et al., PHM 2008): each
engine starts healthy with its own manufacturing variation, develops a fault
at an unknown point, and is run until it fails. The fleet is every engine of
a subset, aligned at its first cycle and cut at the shortest life (128 cycles
in FD001), so every engine is present in every window. Engines with short
lives degrade inside that span; long-lived ones stay healthy throughout. A
monitor that compares engines with their peers should see a group leave the
fleet as the short-lived engines approach failure.

There is no switch-on time, so the truth per engine per window comes from the
remaining useful life (RUL) at the window's last cycle:

* degraded — RUL ≤ 50 cycles;
* healthy  — RUL > 125, the cap at which the PHM literature treats an engine
  as not yet degrading (Heimes 2008);
* in between — not scored.

Three monitors, all scored per engine per window (detection on degraded,
false-alarm rate on healthy):

* **CED-FS + screening** (`cedfs.fleet.monitor`), no history;
* **peer robust z**: an engine is flagged when any sensor's window mean is
  beyond a Bonferroni normal quantile in median/MAD units of the fleet — the
  simplest fleet comparison, no history either;
* **PCA T²/SPE** fitted on every engine's first 30 cycles, the usual "the
  start of life is healthy" reference;
* **deviation, accumulated** (`cedfs.fleet.deviation` + `accumulate`): each
  engine minus its own first 30 cycles, a conformal p-value against the fleet
  per window, alarm when the mean of its last m p-values is too small.

    python -m experiments.cmapss_fleet --subset FD001
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy import stats

from cedfs.algorithm.screening import testable
from cedfs.fleet import accumulate, deviation, monitor, persistent
from experiments.tep_fleet import pca_monitor

DATA = Path.home() / "data" / "cmapss"
SENSORS = slice(5, 26)            # columns: unit, cycle, 3 settings, 21 sensors


def load(subset: str, root: Path = DATA):
    raw = np.loadtxt(root / f"train_{subset}.txt")
    units = np.unique(raw[:, 0]).astype(int)
    lives = np.array([int((raw[:, 0] == u).sum()) for u in units])
    horizon = int(lives.min())
    cube = np.stack([raw[raw[:, 0] == u][:horizon, SENSORS] for u in units])
    return cube, lives


def peer_z(cube: np.ndarray, window: int, alpha: float) -> np.ndarray:
    flags = []
    for start in range(0, cube.shape[1] - window + 1, window):
        m = cube[:, start:start + window].mean(1)
        med = np.median(m, 0)
        mad = 1.4826 * np.median(np.abs(m - med), 0)
        # Same rule as the screening: a sensor whose means take a handful of
        # values has a MAD of one quantisation step and alarms on the next.
        usable = testable(m) & (mad > 0)
        z = np.abs(m - med) / np.where(usable, mad, np.inf)
        flags.append((z > stats.norm.ppf(1 - alpha / (2 * m.shape[1]))).any(1))
    return np.array(flags).T


def score(flags: np.ndarray, lives: np.ndarray, window: int) -> dict:
    ends = window * np.arange(1, flags.shape[1] + 1)
    rul = lives[:, None] - ends[None, :]
    degraded, healthy = rul <= 50, rul > 125
    # Engines that are degraded somewhere in the span: when were they first flagged?
    lead = []
    for u in np.flatnonzero(degraded.any(1)):
        hit = np.flatnonzero(flags[u])
        lead.append(int(rul[u, hit[0]]) if hit.size else None)
    caught = [x for x in lead if x is not None]
    return {"detection": float(flags[degraded].mean()),
            "far": float(flags[healthy].mean()),
            "engines_degraded": int(degraded.any(1).sum()),
            "engines_caught": len(caught),
            "median_rul_at_first_flag": float(np.median(caught)) if caught else None}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--subset", default="FD001")
    parser.add_argument("--window", type=int, default=10, help="cycles per window")
    parser.add_argument("--alpha", type=float, default=0.001)
    parser.add_argument("--density", choices=["rknn", "relative"], default="rknn")
    parser.add_argument("--baseline", type=int, default=30,
                        help="samples of each unit's own start removed before the deviation score")
    parser.add_argument("--m", type=int, default=8, help="windows a deviation is accumulated over")
    parser.add_argument("--level", type=float, default=0.01)
    parser.add_argument("--represent", choices=["columns", "summaries"], default="columns")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    cube, lives = load(args.subset)
    params = {"density": args.density}
    watched = monitor(cube, args.window, params, screen_alpha=args.alpha, represent=args.represent)
    alarms, n_pc = pca_monitor(cube[:, :30])
    n_w = watched.flags.shape[1]
    pca = alarms(cube)[:, :n_w * args.window].reshape(len(cube), n_w, args.window).mean(-1) > 0.5
    results = {
        "subset": args.subset, "engines": len(cube), "cycles": cube.shape[1],
        "window": args.window, "cluster_counts": watched.cluster_counts,
        "variables": [[int(v) + 1 for v in w] for w in watched.variables],
        "ced_fs_screened": score(watched.flags, lives, args.window),
        "ced_fs_persistent": score(persistent(watched.flags, args.alpha), lives, args.window),
        "deviation_accumulated": score(accumulate(deviation(cube, args.window, args.baseline),
                                                  args.m, args.level), lives, args.window),
        "peer_z": score(peer_z(cube, args.window, args.alpha), lives, args.window),
        "pca_first_30_cycles": score(pca, lives, args.window),
    }
    print(f"{args.subset}: {len(cube)} engines, first {cube.shape[1]} cycles, "
          f"window {args.window} cycles, PCA keeps {n_pc} components")
    print("clusters per window:", watched.cluster_counts)
    print("sensors selected   :", [",".join(map(str, w)) or "-" for w in results["variables"]])
    for name in ("ced_fs_screened", "ced_fs_persistent", "deviation_accumulated", "peer_z", "pca_first_30_cycles"):
        r = results[name]
        print(f"  {name:20s} detection {r['detection']:.2f}  FAR {r['far']:.3f}  "
              f"caught {r['engines_caught']}/{r['engines_degraded']}  "
              f"median RUL at first flag {r['median_rul_at_first_flag']}")
    if args.out:
        args.out.write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
