"""MONIC's external transitions, as an alternative reading of the overlap.

CED-FS reads the overlap between consecutive partitions through one symmetric
number, Dice, and four thresholds on it. README (Theory) P2 shows what that loses: a
split is always "drift", an absorption into a much larger group is
"forgetting", and nothing says *split* or *merge*. MONIC (Spiliopoulou,
Ntoutsi, Theodoridis & Schult, "MONIC: modeling and monitoring cluster
transitions", KDD 2006) reads the same intersections asymmetrically,

    overlap(X, Y) = |X ∩ Y| / |X|        (the share of X that went to Y)

and names what happened to each old cluster X:

* **survive**  — one new cluster Y takes at least `tau` of X, and no other old
  cluster also goes mostly to Y;
* **absorb**   — X and at least one other old cluster each go, `tau` or more,
  into the same Y (a merge);
* **split**    — no Y takes `tau` of X, but the new clusters that each take at
  least `tau_split` of it together take at least `tau`;
* **disappear** — none of these.

and a new cluster Y **emerges** when no old cluster survives into it, is
absorbed into it, or split into it. The defaults, tau = 0.7 and
tau_split = 0.3, are those of the clusTransition R package (CRAN, 2021),
which implements MONIC. Only the external transitions are here; MONIC's
internal ones (location, compactness) need a geometry the overlap does not
carry.
"""

from __future__ import annotations

import numpy as np

TYPES = ("survive", "absorb", "split", "disappear", "emerge")


def overlap(past: np.ndarray, curr: np.ndarray) -> np.ndarray:
    """O[i, j] = |X_i ∩ Y_j| / |X_i| for the clusters of two partitions of the same objects."""
    past, curr = np.asarray(past), np.asarray(curr)
    xs, ys = np.unique(past), np.unique(curr)
    counts = np.array([[np.sum((past == x) & (curr == y)) for y in ys] for x in xs], dtype=float)
    return counts / counts.sum(1, keepdims=True)


def transitions(past: np.ndarray, curr: np.ndarray, tau: float = 0.7,
                tau_split: float = 0.3) -> dict[str, int]:
    """Counts of each MONIC external transition between two partitions."""
    O = overlap(past, curr)
    n_past, n_curr = O.shape
    best = O.argmax(1)
    goes_mostly = O.max(1) >= tau                      # X_i goes mostly to best[i]
    out = dict.fromkeys(TYPES, 0)
    reached = np.zeros(n_curr, bool)
    for i in range(n_past):
        if goes_mostly[i]:
            j = best[i]
            reached[j] = True
            sharing = np.sum(goes_mostly & (best == j))
            out["absorb" if sharing > 1 else "survive"] += 1
            continue
        parts = O[i] >= tau_split
        if parts.sum() >= 2 and O[i, parts].sum() >= tau:
            out["split"] += 1
            reached |= parts
        else:
            out["disappear"] += 1
    out["emerge"] = int(np.sum(~reached))
    return out


def boundary_transitions(clusterings: list[np.ndarray], tau: float = 0.7,
                         tau_split: float = 0.3) -> list[dict[str, int]]:
    return [transitions(a, b, tau, tau_split) for a, b in zip(clusterings, clusterings[1:])]
