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


def _classify(previous: list[frozenset[int]], current: list[frozenset[int]],
              sizes: dict[int, int], threshold: float) -> Boundary:
    """Label a boundary by what happened to each group, applying CED-FS's own rule
    to the groups that were placed.

    The rule is the one in ``cedfs.algorithm.ced_fs``: score every pair of groups
    by Dice overlap, then read each row and each column against the threshold
    tau. A row whose best match reaches 1 is stable, one that reaches tau has
    drifted, one that reaches neither is forgotten; a column that reaches nothing
    above tau is emerging.

    Applying the detector's rule rather than a cleaner one — "any overlap at all
    counts as a match" — is deliberate. The two agree while the classes are the
    same size and part company as soon as they are not, because Dice divides by
    the sizes involved. Grading against the cleaner rule would report failures at
    boundaries where the detector did exactly what the method says to do. What is
    being graded here is whether the clustering and the matching recover the
    groups that were placed, not whether the method's own threshold is a good
    idea; that question is a limitation, and it belongs in the README.
    """
    prev_sizes = [sum(sizes[label] for label in group) for group in previous]
    curr_sizes = [sum(sizes[label] for label in group) for group in current]

    similarity = np.zeros((len(previous), len(current)))
    for i, before in enumerate(previous):
        for j, after in enumerate(current):
            shared = sum(sizes[label] for label in before & after)
            similarity[i, j] = 2 * shared / (prev_sizes[i] + curr_sizes[j])

    stable = drift = forgetting = emerging = 0
    for i in range(len(previous)):
        best = float(similarity[i].max()) if similarity.size else 0.0
        if best == 1.0:
            stable += 1
        elif best >= threshold:
            drift += 1
        else:
            forgetting += 1
    for j in range(len(current)):
        best = float(similarity[:, j].max()) if similarity.size else 0.0
        if best < threshold:
            emerging += 1

    return Boundary(0, stable, emerging, drift, forgetting)


def make_stream(placements: list[dict[int, float]],
                samples_per_class: int | dict[int, int] = 30,
                features_per_window: int = 60, spread: float = 0.35,
                seed: int = 7, threshold: float = 0.5) -> SyntheticStream:
    """Build a feature stream from a per-window placement of the classes.

    Each entry of `placements` describes one window: a centre per class label.
    Two classes given the same centre are indistinguishable in that window; give
    them different centres in a later window and that later window is where the
    distinction arrives.

        placements = [
            {1: 0.0, 2: 4.0, 3: 4.0},   # class 3 hides behind class 2
            {1: 0.0, 2: 4.0, 3: 4.0},   # nothing changes            -> stable
            {1: 0.0, 2: 4.0, 3: 8.0},   # class 3 separates          -> drift
            {1: 0.0, 2: 1.2, 3: 8.0},   # class 2 moves towards 1    -> stable
            {1: 0.0, 2: 0.0, 3: 8.0},   # class 2 merges into 1      -> drift
        ]

    `samples_per_class` is one count for every class, or a count per class. The
    per-class form is what makes emerging and forgetting reachable: the method
    matches groups by Dice overlap, which divides by the sizes involved, so a
    small group leaving or joining a large one scores below the threshold and is
    read as a new or a lost concept. With every class the same size no boundary
    can produce either, whatever the concepts do.

    `threshold` is the tau the events are derived under, and must match the one
    the detector is run with for the two to be comparable.

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

    if isinstance(samples_per_class, dict):
        missing = set(labels_in_order) - set(samples_per_class)
        if missing:
            raise ValueError(f"No sample count given for class(es) {sorted(missing)}.")
        sizes = {label: int(samples_per_class[label]) for label in labels_in_order}
    else:
        sizes = {label: int(samples_per_class) for label in labels_in_order}
    if any(count < 1 for count in sizes.values()):
        raise ValueError("Every class needs at least one sample.")

    rng = np.random.default_rng(seed)
    labels = np.repeat(labels_in_order,
                       [sizes[label] for label in labels_in_order]).astype(float)

    blocks = []
    for placement in placements:
        centres = np.array([placement[int(label)] for label in labels], dtype=float)
        block = rng.normal(centres[:, None], spread, size=(labels.size, features_per_window))
        blocks.append(block)

    features = np.hstack(blocks)
    groups = [_groups(placement) for placement in placements]
    boundaries = [
        Boundary(i, *(_classify(groups[i], groups[i + 1], sizes, threshold).as_dict()[name]
                      for name in ("stable", "emerging", "drift", "forgetting")))
        for i in range(len(groups) - 1)
    ]

    return SyntheticStream(features, labels, features_per_window, groups, boundaries)


#: The default stream: concepts merge and separate over five windows with the
#: classes all the same size. Written out rather than generated so the intent is
#: readable. Every boundary here is stable or drift — see UNEVEN_PLACEMENTS for
#: why that is a property of the sizes, not of the concepts.
CANONICAL_PLACEMENTS: list[dict[int, float]] = [
    {1: 0.0, 2: 4.0, 3: 4.0},
    {1: 0.0, 2: 4.0, 3: 4.0},
    {1: 0.0, 2: 4.0, 3: 8.0},
    {1: 0.0, 2: 1.2, 3: 8.0},
    {1: 0.0, 2: 0.0, 3: 8.0},
]


#: A stream reaching the other two event types. Used with UNEVEN_SIZES, where
#: class 2 is small enough that leaving class 1 scores below tau and reads as a
#: new concept, and rejoining it reads as a lost one.
#:
#:     window 1   {1,2} {3}      class 2 hides inside class 1
#:     window 2   {1} {2} {3}    class 2 separates    -> emerging
#:     window 3   {1,2} {3}      class 2 rejoins      -> forgetting
UNEVEN_PLACEMENTS: list[dict[int, float]] = [
    {1: 0.0, 2: 0.0, 3: 8.0},
    {1: 0.0, 2: 4.0, 3: 8.0},
    {1: 0.0, 2: 0.0, 3: 8.0},
]

#: Sizes for UNEVEN_PLACEMENTS. Class 2 is 6 samples against class 1's 60, so
#: the Dice overlap when it splits off is 2*6/(6+66) = 0.17, below the default
#: tau of 0.5.
UNEVEN_SIZES: dict[int, int] = {1: 60, 2: 6, 3: 30}
