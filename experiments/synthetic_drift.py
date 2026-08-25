"""
Score the detector on a stream whose answer is known by construction.

The benchmarks in ``datasets/bundled`` have class labels but no ground truth for
the events being detected: a run reports eighty-seven drifts and nothing can say
whether eighty-seven is right. ``cedfs.synthetic`` builds a feature stream where
the events are placed on purpose, so both the clustering and the detection can be
graded.

Run it::

    python -m experiments.synthetic_drift
    python -m experiments.synthetic_drift --features-per-window 60 --seed 7

Two streams are available. ``--stream canonical`` is five windows over a fixed
set of samples — the sample space is fixed and the *features* arrive, which is
what a feature stream is::

    window 1   {1} {2,3}     class 3 sits on top of class 2
    window 2   {1} {2,3}     nothing changes            -> stable
    window 3   {1} {2} {3}   class 3 separates          -> drift of {2,3}
    window 4   {1} {2} {3}   class 2 moves towards 1    -> stable
    window 5   {1,2} {3}     class 2 merges into 1      -> drift

Every boundary there is stable or drift, and no choice of concepts would change
that: the method matches groups by Dice overlap, which divides by the sizes
involved, so with equal classes a group that splits off always scores above the
threshold. ``--stream uneven`` makes one class small, which is what it takes to
reach the other two categories::

    window 1   {1,2} {3}     class 2 (6 samples) hides inside class 1 (60)
    window 2   {1} {2} {3}   class 2 separates          -> emerging
    window 3   {1,2} {3}     class 2 rejoins            -> forgetting

Exit status is 0 when every window and every boundary matches what was placed,
and 1 otherwise, so the run can be read by a script as well as by a person.
"""

import argparse
import tempfile

import numpy as np

from cedfs import CED_FS
from cedfs.synthetic import (
    CANONICAL_PLACEMENTS, UNEVEN_PLACEMENTS, UNEVEN_SIZES, make_stream,
)

_EVENTS = ("stable", "emerging", "drift", "forgetting")

#: The two streams this runs. `canonical` moves concepts around with the classes
#: all the same size; `uneven` makes one class small, which is the only way the
#: method's Dice rule can report emerging or forgetting at all.
_STREAMS = {
    "canonical": (CANONICAL_PLACEMENTS, 30),
    "uneven": (UNEVEN_PLACEMENTS, UNEVEN_SIZES),
}


def _format_row(cells: list[str], widths: list[int]) -> str:
    return "  " + "  ".join(cell.ljust(w) for cell, w in zip(cells, widths)).rstrip()


def _table(header: list[str], rows: list[list[str]]) -> str:
    widths = [max(len(header[i]), *(len(r[i]) for r in rows)) for i in range(len(header))]
    lines = [_format_row(header, widths),
             _format_row(["-" * w for w in widths], widths)]
    lines += [_format_row(r, widths) for r in rows]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stream", choices=sorted(_STREAMS), default="canonical")
    parser.add_argument("--samples-per-class", type=int, default=None,
                        help="Override the stream's class sizes with one count for every class.")
    parser.add_argument("--features-per-window", type=int, default=60)
    parser.add_argument("--spread", type=float, default=0.35)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--sigma", type=float, default=6.0)
    parser.add_argument("--p", type=float, default=0.05)
    parser.add_argument("--kernel", type=int, default=1)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    placements, sizes = _STREAMS[args.stream]
    stream = make_stream(
        placements,
        samples_per_class=args.samples_per_class if args.samples_per_class else sizes,
        features_per_window=args.features_per_window,
        spread=args.spread,
        seed=args.seed,
        threshold=args.threshold,
    )
    X = np.hstack([stream.features, stream.labels.reshape(-1, 1)])

    print(f"synthetic feature stream: {args.stream}")
    print(f"  samples={stream.features.shape[0]}  features={stream.features.shape[1]}"
          f"  windows={stream.n_windows}  features/window={stream.features_per_window}"
          f"  seed={args.seed}")
    print(f"  kernel={args.kernel}  sigma={args.sigma}  p={args.p}  threshold={args.threshold}")
    print()

    with tempfile.TemporaryDirectory() as image_dir:
        best_ri, events, cluster_counts, _ = CED_FS(
            X,
            d=stream.features.shape[1],
            winsize=stream.features_per_window,
            image_dir=image_dir,
            algorithm_params={
                "kernelType": args.kernel,
                "sigma": args.sigma,
                "p": args.p,
                "similarityThreshold": args.threshold,
            },
        )

    expected_counts = stream.expected_cluster_counts()
    rows = []
    for i, placed in enumerate(expected_counts):
        found = cluster_counts[i] if i < len(cluster_counts) else None
        rows.append([str(i + 1), str(placed), str(found), "ok" if found == placed else "MISS"])
    print("clusters per window")
    print(_table(["window", "placed", "found", ""], rows))

    clusters_ok = cluster_counts == expected_counts
    print()
    print(f"  cluster count recovered in "
          f"{sum(1 for r in rows if r[3] == 'ok')}/{len(expected_counts)} windows")
    print(f"  best Rand Index against the placed labels: {best_ri:.4f}")
    print()

    expected_events = stream.expected_counts()
    rows = []
    events_ok = True
    for b in range(len(stream.boundaries)):
        placed = {name: expected_events[name][b] for name in _EVENTS}
        found = {name: (events[name][b] if b < len(events[name]) else None) for name in _EVENTS}
        matched = placed == found
        events_ok &= matched
        rows.append([
            f"{b + 1} -> {b + 2}",
            " ".join(f"{name[0].upper()}{placed[name]}" for name in _EVENTS),
            " ".join(f"{name[0].upper()}{found[name]}" for name in _EVENTS),
            "ok" if matched else "MISS",
        ])
    print("events per boundary   (S)table (E)merging (D)rift (F)orgetting")
    print(_table(["boundary", "placed", "detected", ""], rows))

    print()
    if clusters_ok and events_ok:
        print("  every window and every boundary matches the placement.")
        return 0
    print("  the run does not match the placement; the rows marked MISS are where.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
