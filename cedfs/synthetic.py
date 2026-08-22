"""
Feature streams whose concept evolution is known, because it was placed there.

Every experiment in this project so far has run on benchmarks with no ground
truth for the thing being detected. A run reports eighty-seven drift events and
nothing can say whether eighty-seven is right, so the only figure that can be
reported is a Rand Index against class labels — which measures the clustering,
not the detection.

A stream built here has an answer. The generator is told, per window, which
classes are distinguishable from which; the events at each boundary follow from
that and are returned alongside the data. A detector can then be scored on the
thing it claims to do.

The construction also makes the simulation honest about what it is. Walking the
columns of a gene expression matrix imposes an arrival order the data never had,
so the events found describe that order as much as the data. Here the order is
the point: feature blocks are generated in sequence, and each block is what makes
some structure visible or stops doing so — which is what a feature stream is.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Boundary:
    """What happens between two consecutive windows, by construction."""

    index: int
    stable: int
    emerging: int
    drift: int
    forgetting: int

    def as_dict(self) -> dict[str, int]:
        return {"stable": self.stable, "emerging": self.emerging,
                "drift": self.drift, "forgetting": self.forgetting}


@dataclass
class SyntheticStream:
    features: np.ndarray          # (n_samples, n_windows * features_per_window)
    labels: np.ndarray            # (n_samples,) true class per sample
    features_per_window: int
    groups_per_window: list[list[frozenset[int]]]
    boundaries: list[Boundary]

    @property
    def n_windows(self) -> int:
        return len(self.groups_per_window)

    def expected_counts(self) -> dict[str, list[int]]:
        """The events, in the shape CED_FS reports them: one entry per boundary."""
        return {
            name: [getattr(b, name) for b in self.boundaries]
            for name in ("stable", "emerging", "drift", "forgetting")
        }

    def expected_cluster_counts(self) -> list[int]:
        """How many groups are distinguishable in each window."""
        return [len(groups) for groups in self.groups_per_window]


def _groups(placement: dict[int, float]) -> list[frozenset[int]]:
    """Classes sharing a centre are one group: in that window they cannot be told
    apart, however different they are elsewhere in the stream."""
    by_centre: dict[float, set[int]] = {}
    for label, centre in placement.items():
        by_centre.setdefault(centre, set()).add(label)
    return sorted((frozenset(members) for members in by_centre.values()), key=sorted)


def _classify(previous: list[frozenset[int]], current: list[frozenset[int]]) -> Boundary:
    """Label a boundary by what happened to each group, using CED-FS's own
    categories.

    A group that survives unchanged is stable. One whose membership shifts but
    still overlaps a group on the other side has drifted. A group on the left
    with no overlap on the right is forgotten; one on the right with no overlap
    on the left is emerging. Overlap is by class membership, which is what
    "the same concept" means here.
    """
    stable = drift = forgetting = emerging = 0

    for group in previous:
        matches = [other for other in current if group & other]
        if not matches:
            forgetting += 1
        elif any(other == group for other in matches):
            stable += 1
        else:
            drift += 1

    for group in current:
        if not any(group & other for other in previous):
            emerging += 1

    return Boundary(0, stable, emerging, drift, forgetting)


def make_stream(placements: list[dict[int, float]], samples_per_class: int = 30,
                features_per_window: int = 60, spread: float = 0.35,
                seed: int = 7) -> SyntheticStream:
    """Build a feature stream from a per-window placement of the classes.

    Each entry of `placements` describes one window: a centre per class label.
    Two classes given the same centre are indistinguishable in that window; give
    them different centres in a later window and that later window is where the
    distinction arrives.

        placements = [
            {1: 0.0, 2: 4.0, 3: 4.0},   # class 3 hides behind class 2
            {1: 0.0, 2: 4.0, 3: 4.0},   # nothing changes        -> stable
            {1: 0.0, 2: 4.0, 3: 8.0},   # class 3 separates      -> emerging
            {1: 0.0, 2: 1.0, 3: 8.0},   # class 2 moves closer   -> drift
            {1: 0.0, 2: 0.0, 3: 8.0},   # class 2 merges into 1  -> forgetting
        ]

    The sample space is fixed, as a feature stream requires: the same rows run
    through every window, and only the columns are new.
    """
    if len(placements) < 2:
        raise ValueError("A stream needs at least two windows to have a boundary.")

    labels_in_order = sorted({label for placement in placements for label in placement})
    for i, placement in enumerate(placements):
        missing = set(labels_in_order) - set(placement)
        if missing:
            raise ValueError(f"Window {i} places no centre for class(es) {sorted(missing)}. "
                             "Every class exists in every window — a feature stream adds "
                             "features, not samples.")

    rng = np.random.default_rng(seed)
    labels = np.repeat(labels_in_order, samples_per_class).astype(float)

    blocks = []
    for placement in placements:
        centres = np.array([placement[int(label)] for label in labels], dtype=float)
        block = rng.normal(centres[:, None], spread, size=(labels.size, features_per_window))
        blocks.append(block)

    features = np.hstack(blocks)
    groups = [_groups(placement) for placement in placements]
    boundaries = [
        Boundary(i, *(_classify(groups[i], groups[i + 1]).as_dict()[name]
                      for name in ("stable", "emerging", "drift", "forgetting")))
        for i in range(len(groups) - 1)
    ]

    return SyntheticStream(features, labels, features_per_window, groups, boundaries)


#: A stream exercising every event type once, used as the default in experiments
#: and in the tests. Written out rather than generated so the intent is readable.
CANONICAL_PLACEMENTS: list[dict[int, float]] = [
    {1: 0.0, 2: 4.0, 3: 4.0},
    {1: 0.0, 2: 4.0, 3: 4.0},
    {1: 0.0, 2: 4.0, 3: 8.0},
    {1: 0.0, 2: 1.2, 3: 8.0},
    {1: 0.0, 2: 0.0, 3: 8.0},
]
