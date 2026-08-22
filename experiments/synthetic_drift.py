"""
A stream whose concept evolution is known, so the detector can be scored.

The datasets this project was written for are not in the repository, which left
its results unreproducible: the README described a method and showed nothing it
had done. This builds a stream where the answer is known by construction — the
clusters are placed, moved and removed on purpose — and reports what the detector
recovers.

Run it:

    python -m experiments.synthetic_drift
    python -m experiments.synthetic_drift --winsize 60 --seed 7

The stream, five windows of `winsize` samples each:

    window 1   A  B          two concepts
    window 2   A  B          unchanged            -> stable
    window 3   A  B  C       C appears            -> emerging
    window 4   A  B' C       B moves partway      -> drift
    window 5   A     C       B is gone            -> forgetting

Every event type appears at least once, so a detector that silently reports one
category for everything cannot score well by accident.
"""

import argparse
import tempfile

import numpy as np

from cedfs import CED_FS


# Well separated, so a clustering that misses the structure is failing at
# something other than a hard problem.
_A = 0.0
_B = 4.0
_C = -4.0
_B_DRIFTED = 6.0
_SPREAD = 0.35


def build_stream(winsize: int, dim: int, seed: int):
    """Return (X, expectation) for the five-window stream described above.

    X has shape (5 * winsize, dim + 1); the last column holds the concept label.
    """
    rng = np.random.default_rng(seed)

    def blob(centre_value: float, n: int, label: int):
        centre = np.full(dim, centre_value)
        return rng.normal(centre, _SPREAD, size=(n, dim)), [label] * n

    plan = [
        [(_A, 1), (_B, 2)],
        [(_A, 1), (_B, 2)],
        [(_A, 1), (_B, 2), (_C, 3)],
        [(_A, 1), (_B_DRIFTED, 2), (_C, 3)],
        [(_A, 1), (_C, 3)],
    ]

    rows, labels = [], []
    for window in plan:
        per_cluster = winsize // len(window)
        remainder = winsize - per_cluster * len(window)
        for index, (centre_value, label) in enumerate(window):
            n = per_cluster + (remainder if index == 0 else 0)
            block, block_labels = blob(centre_value, n, label)
            rows.append(block)
            labels.extend(block_labels)

    X = np.hstack([np.vstack(rows), np.array(labels, dtype=float).reshape(-1, 1)])
    expectation = [len(window) for window in plan]
    return X, expectation


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--winsize", type=int, default=60)
    parser.add_argument("--dim", type=int, default=8)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--sigma", type=float, default=6.0)
    parser.add_argument("--p", type=float, default=0.15)
    parser.add_argument("--kernel", type=int, default=1)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    X, expectation = build_stream(args.winsize, args.dim, args.seed)

    print("synthetic concept-evolution stream")
    print(f"  samples={X.shape[0]}  features={args.dim}  winsize={args.winsize}  seed={args.seed}")
    print(f"  kernel={args.kernel}  sigma={args.sigma}  p={args.p}  threshold={args.threshold}")
    print()

    with tempfile.TemporaryDirectory() as image_dir:
        best_ri, events, cluster_nums, _ = CED_FS(
            X,
            d=args.dim,
            winsize=args.winsize,
            image_dir=image_dir,
            algorithm_params={
                "kernelType": args.kernel,
                "sigma": args.sigma,
                "p": args.p,
                "similarityThreshold": args.threshold,
            },
        )

    print("  window   concepts placed   clusters found")
    for i, placed in enumerate(expectation):
        found = cluster_nums[i] if i < len(cluster_nums) else None
        mark = "ok " if found == placed else "  X"
        print(f"    {i + 1}          {placed}                {found}   {mark}")

    recovered = sum(1 for i, placed in enumerate(expectation)
                    if i < len(cluster_nums) and cluster_nums[i] == placed)
    print()
    print(f"  cluster count recovered in {recovered}/{len(expectation)} windows")
    print(f"  best Rand Index against the placed labels: {best_ri:.4f}")
    print()

    print("  events per window boundary (1->2, 2->3, 3->4, 4->5)")
    for name in ("stable", "emerging", "drift", "forgetting"):
        print(f"    {name:11s} {events[name]}")

    # The stream was built so each boundary has a defining event. This is the
    # summary a reader can check against the plan in the docstring.
    print()
    print("  by construction: 1->2 stable, 2->3 emerging, 3->4 drift, 4->5 forgetting")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
