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


def persistent(flags: np.ndarray, alpha: float, m: int = 5, level: float = 0.001) -> np.ndarray:
    """Alarms that need a unit to keep leaving the fleet, not to leave it once.

    Screening bounds the chance that a window selects anything when the fleet
    has no structure by `alpha` (THEORY.md P6), so under that null a unit is
    flagged in a window with probability at most `alpha`, and its count of
    flags in the last `m` windows is at most Binomial(m, alpha). An alarm is
    raised when that count reaches the smallest k whose binomial tail is below
    `level`. It is the fleet-monitoring counterpart of the k-of-m run rules of
    control charts, and of the way COSMO (Rögnvaldsson et al., Data Mining and
    Knowledge Discovery 2018) accumulates a vehicle's deviation from the fleet
    over time before calling it — with the threshold derived from the
    per-window bound rather than tuned.

    `flags` is (units, windows); the result has the same shape and is true
    from the window in which the count first reaches k (alarms latch).
    """
    from scipy import stats

    k = next(k for k in range(1, m + 1) if stats.binom.sf(k - 1, m, alpha) < level) \
        if stats.binom.sf(m - 1, m, alpha) < level else m + 1
    counts = np.zeros_like(flags, dtype=int)
    for w in range(flags.shape[1]):
        counts[:, w] = flags[:, max(0, w - m + 1):w + 1].sum(1)
    return np.maximum.accumulate(counts >= k, axis=1)
