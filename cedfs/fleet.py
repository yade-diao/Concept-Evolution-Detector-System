"""CED-FS as a fleet monitor.

A fleet is a fixed set of like units — machines, engines, process runs —
observed together, sample by sample, on the same variables. Laid out as a
feature stream (THEORY.md §1) a row is a unit and a column is one variable at
one sample time, in time order, so a window of `window` samples is the next
stretch of the fleet's life. That is the case the method was built for: the
objects do not change, the features describing them arrive.

`monitor` runs the detector over such a fleet and returns, per window, the
partition, the units outside the largest group (the ones that left their
peers), the variables that drove it, and the events between windows. It needs
no history and no labels.

    from cedfs.fleet import monitor
    result = monitor(units, window=20, screen_alpha=0.001)   # units: (U, T, V)
    result.flags          # (U, windows) bool
    result.variables[w]   # indices of the variables selected in window w
    result.events[b]      # {"stable": .., "drift": .., ...} at boundary b
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from cedfs.algorithm.k_r_dpc import k_r_dpc
from cedfs.algorithm.screening import screen
from cedfs.algorithm.significance import significance
from cedfs.evaluation import boundary_events

DEFAULT_PARAMS = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}


@dataclass
class FleetResult:
    clusterings: list[np.ndarray]     # one partition of the units per window, 1-based
    cluster_counts: list[int]
    flags: np.ndarray                 # (units, windows): outside the largest cluster
    variables: list[list[int]]        # variables each window clustered on
    events: list[dict[str, int]]      # one per boundary


def as_stream(units: np.ndarray) -> np.ndarray:
    """(units, samples, variables) -> (units, samples * variables), time-major.

    Each column is min-max scaled across the fleet at that instant — the only
    normalisation available to a monitor that has nothing but the current
    column — and constant columns become zero.
    """
    flat = units.reshape(units.shape[0], -1).astype(float)
    lo, hi = flat.min(0), flat.max(0)
    span = np.where(hi > lo, hi - lo, 1.0)
    return (flat - lo) / span


def monitor(units: np.ndarray, window: int, params: dict | None = None,
            screen_alpha: float | None = None, gate: float | None = None,
            threshold: float = 0.5) -> FleetResult:
    """Watch a fleet window by window.

    `units` is (units, samples, variables). Trailing samples that do not fill a
    window are dropped. `screen_alpha` screens variables first
    (`cedfs.algorithm.screening`): a window in which no variable splits the
    fleet is one cluster, and otherwise only the selected variables' columns
    are clustered. `gate` is the SigClust alternative
    (`cedfs.algorithm.significance`). Without either, every window is
    clustered on every variable, as the original method does.
    """
    units = np.asarray(units)
    n_units, n_samples, n_vars = units.shape
    p = {**DEFAULT_PARAMS, **(params or {})}
    stream = as_stream(units)

    def cluster(x):
        return np.asarray(k_r_dpc(x, image_dir=None, **p)[0])

    clusterings, counts, flags, chosen = [], [], [], []
    for start in range(0, n_samples - window + 1, window):
        variables = np.arange(n_vars)
        if screen_alpha is not None:
            variables, _ = screen(units[:, start:start + window], screen_alpha)
        cols = (start + np.arange(window))[:, None] * n_vars + variables[None, :]
        x = stream[:, cols.ravel()]
        if variables.size == 0:
            labels, k = np.ones(n_units, dtype=int), 1
        else:
            labels, _, k = k_r_dpc(x, image_dir=None, **p)
            labels = np.asarray(labels)
        if gate is not None and k > 1 and significance(x, labels, cluster, seed=start) > gate:
            labels, k = np.ones_like(labels), 1
        clusterings.append(labels)
        counts.append(int(k))
        flags.append(labels != np.bincount(labels).argmax())
        chosen.append(variables.tolist())

    return FleetResult(clusterings, counts, np.array(flags).T, chosen,
                       boundary_events(clusterings, threshold))
