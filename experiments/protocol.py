"""The evaluation protocol: many seeds, chance-corrected scores, events scored.

The thesis reports one number per dataset — the best Rand Index over the
windows of one run. This reports, per configuration, over `--seeds` streams
generated independently:

* window ARI and NMI against what each window can show (classes that share a
  centre in a window are one group there), mean ± std;
* event precision / recall / F1 against the placed events, and F1 on emerging
  and forgetting alone — the two rare types the method exists for;
* the share of boundaries whose four counts are exactly right;
* and, for contrast, the thesis's headline figure, max RI against the class
  labels, which is high whether or not the events are right.

The noise level `spread` is swept, since a detector that is exact at one noise
level says little about the next.

    python -m experiments.protocol --seeds 20
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from cedfs.evaluation import boundary_events, event_scores, partition_scores, run_windows
from cedfs.synthetic import (CANONICAL_PLACEMENTS, UNEVEN_PLACEMENTS, UNEVEN_SIZES,
                             make_stream)

STREAMS = {"canonical": (CANONICAL_PLACEMENTS, 30), "uneven": (UNEVEN_PLACEMENTS, UNEVEN_SIZES)}
PARAMS = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}


def one(job):
    name, spread, seed, threshold, params = job
    placements, sizes = STREAMS[name]
    s = make_stream(placements, samples_per_class=sizes, spread=spread, seed=seed,
                    threshold=threshold)
    run = run_windows(s.features, s.labels, s.features_per_window, params, keep_clusterings=True)
    windows = [partition_scores(c, s.window_labels(i)) for i, c in enumerate(run.clusterings)]
    expected = [b.as_dict() for b in s.boundaries]
    events = event_scores(boundary_events(run.clusterings, threshold), expected)
    return {"stream": name, "spread": spread, "seed": seed,
            "ari": float(np.mean([w["ari"] for w in windows])),
            "nmi": float(np.mean([w["nmi"] for w in windows])),
            "max_ri_vs_labels": run.max_ri,
            "counts_right": float(np.mean(np.array(run.cluster_counts)
                                          == np.array(s.expected_cluster_counts()))),
            **events}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seeds", type=int, default=20)
    parser.add_argument("--spreads", type=float, nargs="+", default=[0.35, 0.7, 1.0, 1.4, 2.0])
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--density", choices=["rknn", "relative"], default="rknn")
    parser.add_argument("--kpca-scaling", choices=["eigenvalue", "sqrt"], default="eigenvalue")
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    params = {**PARAMS, "density": args.density, "kpca_scaling": args.kpca_scaling}
    jobs = [(n, sp, seed, args.threshold, params) for n in STREAMS for sp in args.spreads
            for seed in range(args.seeds)]
    with ProcessPoolExecutor(args.jobs) as pool:
        rows = list(pool.map(one, jobs, chunksize=4))

    cols = ["ari", "nmi", "f1", "f1_emerging_forgetting", "exact_boundaries",
            "counts_right", "max_ri_vs_labels"]
    print(f"{args.seeds} seeds per row, mean ± std\n")
    print(f"{'stream':10} {'spread':>6}  " + "  ".join(f"{c[:14]:>14}" for c in cols))
    summary = []
    for n in STREAMS:
        for sp in args.spreads:
            sel = [r for r in rows if r["stream"] == n and r["spread"] == sp]
            stats = {c: (float(np.mean([r[c] for r in sel])), float(np.std([r[c] for r in sel])))
                     for c in cols}
            summary.append({"stream": n, "spread": sp, **stats})
            print(f"{n:10} {sp:>6.2f}  " + "  ".join(f"{m:>7.2f} ± {s:<4.2f}" for m, s in stats.values()))
    if args.out:
        args.out.write_text(json.dumps({"rows": rows, "summary": summary}, indent=1))


if __name__ == "__main__":
    main()
