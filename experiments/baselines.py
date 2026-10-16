"""K-R-DPC against other per-window clusterers, under the same event rules.

Every clusterer sees the same windows and is read by the same rules (Dice
events and MONIC transitions), so differences are the clustering's. Two
settings:

* `--setting synthetic`: the protocol of experiments/protocol.py, 20 seeds per
  noise level, scored against the placed events;
* `--setting tep`: the Tennessee Eastman fleet of experiments/tep_fleet.py,
  with and without variable screening, scored by false alarms and detection.

    python -m experiments.baselines --setting synthetic
    python -m experiments.baselines --setting tep --faults 1 2 4 5 6 7 8 10 11 12 13 14 16 17 18 19 20
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from cedfs.algorithm.k_r_dpc import k_r_dpc
from cedfs.algorithm.screening import screen
from cedfs.baselines import CLUSTERERS
from cedfs.evaluation import (EVENT_TYPES, boundary_events, event_scores, partition_scores,
                              window_bounds)
from cedfs.fleet import as_stream
from cedfs.synthetic import CANONICAL_PLACEMENTS, UNEVEN_PLACEMENTS, UNEVEN_SIZES, make_stream
from cedfs.transitions import TYPES, boundary_transitions

STREAMS = {"canonical": (CANONICAL_PLACEMENTS, 30), "uneven": (UNEVEN_PLACEMENTS, UNEVEN_SIZES)}
METHODS = ["k-r-dpc", "k-r-dpc relative", "kmeans", "hdbscan", "evolutionary"]


def cluster(method: str, x: np.ndarray, previous):
    if method.startswith("k-r-dpc"):
        density = "relative" if method.endswith("relative") else "rknn"
        return np.asarray(k_r_dpc(x, image_dir=None, kernel_type=1, sigma=6.0, p=0.05,
                                  density=density)[0])
    return CLUSTERERS[method](x, previous)


def synthetic_one(job):
    method, name, spread, seed = job
    placements, sizes = STREAMS[name]
    s = make_stream(placements, samples_per_class=sizes, spread=spread, seed=seed)
    found, prev = [], None
    for a, b in window_bounds(s.features.shape[1], s.features_per_window):
        prev = cluster(method, s.features[:, a:b], prev)
        found.append(prev)
    perfect = [s.window_labels(i) for i in range(s.n_windows)]
    monic_f, monic_t = boundary_transitions(found), boundary_transitions(perfect)
    return {"method": method, "stream": name, "spread": spread, "seed": seed,
            "ari": float(np.mean([partition_scores(c, perfect[i])["ari"]
                                  for i, c in enumerate(found)])),
            **event_scores(boundary_events(found), [b.as_dict() for b in s.boundaries]),
            "monic_exact": float(np.mean([all(f[k] == t[k] for k in TYPES)
                                          for f, t in zip(monic_f, monic_t)]))}


def tep_one(job):
    method, fault, screened = job
    from experiments.tep_fleet import DATA, ONSET, fleet, rates
    data = np.load(DATA)
    runs, faulty = fleet(data, fault, 80, 20)
    stream, n_vars, hour = as_stream(runs), runs.shape[-1], 20
    flags, prev = [], None
    for start in range(0, runs.shape[1], hour):
        variables = screen(runs[:, start:start + hour], 0.001)[0] if screened else np.arange(n_vars)
        if variables.size == 0:
            labels = np.ones(len(runs), dtype=int)
        else:
            cols = (start + np.arange(hour))[:, None] * n_vars + variables[None, :]
            labels = cluster(method, stream[:, cols.ravel()], prev)
        prev = labels
        flags.append(labels != np.bincount(labels).argmax())
    return {"method": method, "fault": fault, "screened": screened,
            **rates(np.array(flags).T, faulty, ONSET // hour)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--setting", choices=["synthetic", "tep"], default="synthetic")
    parser.add_argument("--seeds", type=int, default=20)
    parser.add_argument("--spreads", type=float, nargs="+", default=[0.35, 0.7, 1.0, 1.4])
    parser.add_argument("--faults", type=int, nargs="+", default=[1, 4, 5, 6, 7, 13])
    parser.add_argument("--jobs", type=int, default=10)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.setting == "synthetic":
        jobs = [(m, n, sp, sd) for m in METHODS for n in STREAMS for sp in args.spreads
                for sd in range(args.seeds)]
        with ProcessPoolExecutor(args.jobs) as pool:
            rows = list(pool.map(synthetic_one, jobs, chunksize=4))
        print(f"{'method':18} {'stream':10} {'spread':>6}  {'ARI':>5} {'F1':>5} "
              f"{'F1 E/F':>6} {'exact':>6} {'MONIC exact':>11}")
        for n in STREAMS:
            for sp in args.spreads:
                for m in METHODS:
                    sel = [r for r in rows if (r["method"], r["stream"], r["spread"]) == (m, n, sp)]
                    a = {k: np.mean([r[k] for r in sel]) for k in
                         ("ari", "f1", "f1_emerging_forgetting", "exact_boundaries", "monic_exact")}
                    print(f"{m:18} {n:10} {sp:>6.2f}  {a['ari']:>5.2f} {a['f1']:>5.2f} "
                          f"{a['f1_emerging_forgetting']:>6.2f} {a['exact_boundaries']:>6.2f} "
                          f"{a['monic_exact']:>11.2f}")
                print()
    else:
        jobs = [(m, f, sc) for m in METHODS for f in args.faults for sc in (False, True)]
        with ProcessPoolExecutor(args.jobs) as pool:
            rows = list(pool.map(tep_one, jobs))
        print(f"{'method':18} {'screened':>8}  {'FAR pre':>7} {'detection':>9} {'FAR normals after':>17}")
        for sc in (False, True):
            for m in METHODS:
                sel = [r for r in rows if r["method"] == m and r["screened"] == sc]
                print(f"{m:18} {str(sc):>8}  {np.mean([r['far_pre'] for r in sel]):>7.3f} "
                      f"{np.mean([r['detection'] for r in sel]):>9.2f} "
                      f"{np.mean([r['far_post_normal'] for r in sel]):>17.3f}")
    if args.out:
        args.out.write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
