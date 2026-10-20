"""CED-FS as a fleet monitor.

A fleet is a fixed set of like units — machines, engines, process runs —
observed together, sample by sample, on the same variables. Laid out as a
feature stream (README (Theory) §1) a row is a unit and a column is one variable at
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
from cedfs.algorithm.screening import screen_summaries
from cedfs.algorithm.significance import significance
from cedfs.evaluation import boundary_events

DEFAULT_PARAMS = {"kernel_type": 1, "sigma": 6.0, "p": 0.05}

#: Past this many units the exact KPCA (cubic) and the n x n distances are
#: replaced by a Nystrom KPCA and a kNN-only delta (`k_r_dpc`'s `landmarks` and
#: `neighbour_index`, README (Experiments) E4), unless `params` says otherwise.
#: The browser applies the same rule, so a large CSV gets the same answer there.
LARGE_FLEET = 1000
LARGE_FLEET_PARAMS = {"landmarks": 300, "neighbour_index": True}


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
            threshold: float = 0.5, represent: str = "columns",
            roughness: bool | str = "fallback", roughness_weight: float = 0.25) -> FleetResult:
    """Watch a fleet window by window.

    `units` is (units, samples, variables). Trailing samples that do not fill a
    window are dropped. `screen_alpha` screens variables first
    (`cedfs.algorithm.screening`): a window in which no variable splits the
    fleet is one cluster, and otherwise only the selected variables' columns
    are clustered. `gate` is the SigClust alternative
    (`cedfs.algorithm.significance`). Without either, every window is
    clustered on every variable, as the original method does.

    `represent` chooses what a screened window is clustered on: "columns",
    the raw stream columns of the selected variables (the original's view), or
    "summaries", the selected per-unit window means and spreads (s^(2/3)). A fault
    that adds variance spreads its units out in the raw columns instead of
    gathering them, and only the summaries make them a group.

    `roughness` (default "fallback") also screens each variable's spread of
    first differences - how much it moves between samples - and clusters on it,
    at `roughness_weight` (default 0.25), only for variables that neither level
    nor spread selected. On Tennessee Eastman this raises detection from 0.827
    to 0.855 and changes no fault for the worse (README, Tennessee Eastman).
    `roughness=False` is the screening without it.
    """
    units = np.asarray(units)
    n_units, n_samples, n_vars = units.shape
    p = {**DEFAULT_PARAMS, **(params or {})}
    if n_units > LARGE_FLEET:
        p = {**LARGE_FLEET_PARAMS, **p}
    stream = as_stream(units)

    def cluster(x):
        return np.asarray(k_r_dpc(x, image_dir=None, **p)[0])

    clusterings, counts, flags, chosen = [], [], [], []
    for start in range(0, n_samples - window + 1, window):
        variables = np.arange(n_vars)
        if screen_alpha is not None:
            variables, _, summary = screen_summaries(units[:, start:start + window], screen_alpha,
                                                     roughness, roughness_weight)
        if screen_alpha is not None and represent == "summaries":
            x = summary
        else:
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
    has no structure by `alpha` (README (Theory) P6), so under that null a unit is
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


def deviation(units: np.ndarray, window: int, baseline: int | None = None,
              groups: np.ndarray | None = None, min_group: int = 10) -> np.ndarray:
    """How unusual each unit is within the fleet, per window, as a p-value.

    The clustering of `monitor` sees a fleet that splits into groups. A fleet
    that degrades gradually does not split: its units spread out along a
    continuum, and "outside the largest cluster" then cuts that continuum at an
    arbitrary place (README (industrial fleets) I2). This is the graded counterpart.

    Per window, each unit is summarised by its window mean per variable; each
    variable is put in fleet units by median and MAD; a unit's strangeness is
    the sum of its squared robust z-scores over the variables that are
    continuous enough to scale (`screening.testable`). Its p-value is the
    conformal one — the share of the fleet at least as strange, itself
    included — which is uniform on {1/n, ..., 1} when the units are
    exchangeable (Vovk, Gammerman & Shafer, *Algorithmic Learning in a Random
    World*, 2005). COSMO (Rögnvaldsson et al., DMKD 2018) scores vehicles
    against their fleet in the same way.

    `baseline` removes each unit's own mean over its first `baseline` samples
    first, so that what is compared is how each unit has *changed*, not how it
    was built: in C-MAPSS the engine-to-engine spread at the start is nearly as
    large as the drift a failing engine accumulates.

    `groups` assigns each unit a peer group (e.g. the partition `monitor`
    found in the first window): each unit is then scored only against its own
    group, as Hendrickx et al. (MSSP 2020) compare a machine with the cluster of
    machines like it. A fleet that holds two kinds of unit otherwise reports
    the minority kind as deviating, whatever its health. Groups smaller than
    `min_group` are scored against the whole fleet.

    Returns (units, windows) p-values; small means unusual.
    """
    from cedfs.algorithm.screening import testable

    x = np.asarray(units, dtype=float)
    if baseline:
        x = x - x[:, :baseline].mean(1, keepdims=True)
    n = x.shape[0]
    if groups is not None:
        groups = np.asarray(groups)
        sizes = {g: int(np.sum(groups == g)) for g in np.unique(groups)}
        if sum(size >= min_group for size in sizes.values()) >= 2:
            p = np.ones((n, x.shape[1] // window))
            rest = np.ones(n, bool)
            for g, size in sizes.items():
                if size >= min_group:
                    member = groups == g
                    p[member] = deviation(x[member], window)
                    rest &= ~member
            if rest.any():
                p[rest] = deviation(x, window)[rest]
            return p
    out = []
    for start in range(0, x.shape[1] - window + 1, window):
        m = x[:, start:start + window].mean(1)
        med = np.median(m, 0)
        mad = 1.4826 * np.median(np.abs(m - med), 0)
        use = testable(m) & (mad > 0)
        if not use.any():
            out.append(np.ones(n))
            continue
        strangeness = (((m[:, use] - med[use]) / mad[use]) ** 2).sum(1)
        out.append((strangeness[None, :] >= strangeness[:, None]).sum(1) / n)
    return np.array(out).T


def accumulate(p: np.ndarray, m: int = 5, level: float = 0.001,
               latch: bool = False) -> np.ndarray:
    """Alarm when a unit's recent p-values are too small on average to be chance.

    Under exchangeability each p-value is (close to) uniform, so the mean of a
    unit's last `m` is approximately normal with mean 1/2 and variance
    1/(12 m). An alarm is raised when it falls below the `level` quantile of
    that law, i.e. when the unit has been consistently among the strangest of
    the fleet. Alarms latch. This is the accumulation over time that turns a
    deviation score into a decision, as in COSMO; the threshold follows from
    the null rather than being tuned.

    The alarm is the state of the last m windows, so it clears when the unit
    stops deviating; `latch=True` keeps it on from the first alarm, which
    suits run-to-failure data and overstates false alarms anywhere else.
    """
    from scipy import stats

    out = np.zeros_like(p, dtype=bool)
    for w in range(m - 1, p.shape[1]):
        mean = p[:, w - m + 1:w + 1].mean(1)
        z = (mean - 0.5) / np.sqrt(1 / (12 * m))
        out[:, w] = z < stats.norm.ppf(level)
    return np.maximum.accumulate(out, axis=1) if latch else out


def own_change(units: np.ndarray, window: int, baseline: int,
               statistic: str = "magnitude") -> np.ndarray:
    """How much each unit has changed from its own start, ranked in the fleet.

    `deviation` asks how unlike the fleet a unit is, which is two-sided: a unit
    that changes *less* than its peers is as strange as one that changes more.
    In a fleet whose units are used differently - the Severson battery cells
    run 70 charging protocols - and in one where some units simply wear more
    slowly (C-MAPSS FD003), the slow ones are then flagged with the failing
    ones. This is one-sided: each unit is compared only with itself, and the
    fleet is used only to rank how much.

    Per window, the change is the window mean minus the unit's mean over its
    first `baseline` samples. The statistic is
      "magnitude" - the sum of squared changes, each variable scaled by the
                    fleet's spread at baseline (variables in different units);
      "shape"     - the log variance of the change across the variables, for
                    variables on one scale such as the bands of a curve: a
                    uniform shift scores nothing, a change of shape scores.
                    On a discharge curve binned by voltage this is the online
                    form of Severson et al.'s ΔQ(V) variance feature.
    The p-value is the share of the fleet that changed at least as much,
    itself included: small means the unit is among those that changed most.

    Returns (units, windows) p-values for `accumulate`.
    """
    x = np.asarray(units, dtype=float)
    n = x.shape[0]
    base = x[:, :baseline].mean(1)
    scale = np.std(base, axis=0)
    scale = np.where(scale > 0, scale, 1.0)
    out = []
    for start in range(0, x.shape[1] - window + 1, window):
        change = x[:, start:start + window].mean(1) - base
        if statistic == "magnitude":
            s = ((change / scale) ** 2).sum(1)
        elif statistic == "shape":
            s = np.log10(np.var(change, axis=1) + np.finfo(float).tiny)
        else:
            raise ValueError(f"statistic must be 'magnitude' or 'shape', not {statistic!r}")
        out.append((s[None, :] >= s[:, None]).sum(1) / n)
    return np.array(out).T
