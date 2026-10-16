"""Dice events against MONIC transitions, on streams whose answer is known.

For each synthetic stream the truth in *both* vocabularies is obtained by
applying each rule set to the perfect per-window partitions
(`SyntheticStream.window_labels`); the detector's partitions are then read
both ways and compared with their own truth. The question is not which rule
is "right" but what each one can say: the placed splits and merges are named
as such by MONIC and folded into drift / forgetting by the Dice rules.

    python -m experiments.transitions --seeds 20
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from cedfs.evaluation import EVENT_TYPES, boundary_events, run_windows
from cedfs.synthetic import CANONICAL_PLACEMENTS, UNEVEN_PLACEMENTS, UNEVEN_SIZES, make_stream
from cedfs.transitions import TYPES, boundary_transitions

STREAMS = {"canonical": (CANONICAL_PLACEMENTS, 30), "uneven": (UNEVEN_PLACEMENTS, UNEVEN_SIZES)}


def one(job):
    name, spread, seed, density = job
    placements, sizes = STREAMS[name]
    s = make_stream(placements, samples_per_class=sizes, spread=spread, seed=seed)
    perfect = [s.window_labels(i) for i in range(s.n_windows)]
    run = run_windows(s.features, s.labels, s.features_per_window,
                      {"kernel_type": 1, "sigma": 6.0, "p": 0.05, "density": density},
                      keep_clusterings=True)
    found = run.clusterings

    def exact(a, b, keys):
        return float(np.mean([all(x[k] == y[k] for k in keys) for x, y in zip(a, b)]))

    return {"stream": name, "spread": spread, "seed": seed,
            "dice_truth": boundary_events(perfect), "monic_truth": boundary_transitions(perfect),
            "dice_exact": exact(boundary_events(found), boundary_events(perfect), EVENT_TYPES),
            "monic_exact": exact(boundary_transitions(found), boundary_transitions(perfect), TYPES)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seeds", type=int, default=20)
    parser.add_argument("--spreads", type=float, nargs="+", default=[0.35, 0.7, 1.0, 1.4])
    parser.add_argument("--density", default="relative")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    jobs = [(n, sp, seed, args.density) for n in STREAMS for sp in args.spreads
            for seed in range(args.seeds)]
    with ProcessPoolExecutor(8) as pool:
        rows = list(pool.map(one, jobs, chunksize=4))

    for n in STREAMS:
        r0 = next(r for r in rows if r["stream"] == n)
        print(f"\n{n}: truth per boundary")
        for b, (d, m) in enumerate(zip(r0["dice_truth"], r0["monic_truth"]), start=1):
            dice = " ".join(f"{k[0].upper()}{d[k]}" for k in EVENT_TYPES)
            monic = " ".join(f"{k}={m[k]}" for k in TYPES if m[k])
            print(f"  {b}->{b + 1}   Dice: {dice:14s} MONIC: {monic}")
        for sp in args.spreads:
            sel = [r for r in rows if r["stream"] == n and r["spread"] == sp]
            print(f"  spread {sp:<4}  exact boundaries  Dice {np.mean([r['dice_exact'] for r in sel]):.2f}"
                  f"   MONIC {np.mean([r['monic_exact'] for r in sel]):.2f}")
    if args.out:
        args.out.write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
