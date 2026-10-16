"""Which variables, if any, split the fleet in this window?

Clustering a window of a thousand columns in which a fault touches twenty
dilutes the fault into the noise of the other nine hundred and eighty; the
partition is then decided by noise and the fault is missed. Jin & Wang's IF-PCA
("Influential features PCA for high dimensional clustering", *Annals of
Statistics* 44(6), 2016) answers this by screening first: a feature that carries
cluster structure is a mixture across objects and fails a normality test, a
feature that carries none passes it. Cluster only on what fails.

Here the test is applied per *variable* rather than per column, to two
summaries of the variable over the window — its mean and its standard
deviation per object — so that a fault which shifts a level and one which adds
variance are both caught. Each summary is standardised across the objects and
tested with the Kolmogorov–Smirnov distance to N(0, 1); because the mean and
scale are estimated, the null distribution is Lilliefors', obtained here by
simulation. IF-PCA thresholds by Higher Criticism, which is tuned for rare and
weak signals; this module uses Bonferroni instead, because what a monitor needs
is a stated false-alarm rate: if no variable carries structure and the objects
are independent, the probability that a window selects anything is at most
`alpha` (THEORY.md, P6).

A window that selects nothing is one cluster, which is also the answer to
THEORY.md P3.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy import stats


def ks_normal(z: np.ndarray) -> np.ndarray:
    """sqrt(n) * sup |F_n - Phi| for each column of z (already standardised)."""
    n = z.shape[0]
    zs = np.sort(z, axis=0)
    cdf = stats.norm.cdf(zs)
    i = np.arange(1, n + 1)[:, None]
    d = np.maximum(i / n - cdf, cdf - (i - 1) / n).max(0)
    return np.sqrt(n) * d


def standardise(x: np.ndarray) -> np.ndarray:
    sd = x.std(0, ddof=1)
    return (x - x.mean(0)) / np.where(sd > 0, sd, 1.0)


@lru_cache(maxsize=32)
def lilliefors_null(n: int, sims: int = 200_000, seed: int = 0) -> np.ndarray:
    """Sorted simulated null of `ks_normal` after standardisation, for n objects."""
    rng = np.random.default_rng(seed)
    out = []
    for chunk in np.array_split(np.arange(sims), max(1, sims // 20_000)):
        out.append(ks_normal(standardise(rng.standard_normal((n, chunk.size)))))
    return np.sort(np.concatenate(out))


def dallal_wilkinson(stat: np.ndarray, n: int) -> np.ndarray:
    """Lilliefors upper-tail p-value, analytic (Dallal & Wilkinson, *The American
    Statistician* 40, 1986), accurate for p below about 0.1. `stat` is
    sqrt(n) * D as `ks_normal` returns it."""
    d = np.asarray(stat, dtype=float) / np.sqrt(n)
    m = n + 2.78019
    return np.exp(-7.01256 * d ** 2 * m + 2.99587 * d * np.sqrt(m) - 0.122119
                  + 0.974598 / np.sqrt(n) + 1.67997 / n)


def p_values(stat: np.ndarray, n: int) -> np.ndarray:
    """Lilliefors p-values: simulated where the simulation has resolution, the
    Dallal-Wilkinson tail below 1e-3. A simulated p cannot go below
    1 / (sims + 1), and a Bonferroni level of 1e-4 over a hundred summaries
    asks for 1e-6 — without the analytic tail nothing could ever be selected.
    The two agree to within a few percent from 0.1 down to 1e-4."""
    null = lilliefors_null(n)
    above = null.size - np.searchsorted(null, stat, side="left")
    p = (1 + above) / (1 + null.size)
    tail = p < 1e-3
    p[tail] = np.minimum(p[tail], dallal_wilkinson(stat[tail], n))
    return p


def held(window: np.ndarray) -> np.ndarray:
    """Variables that are sample-and-hold within the window, per variable.

    An analyser that reports every fifteen minutes into a three-minute stream
    repeats its last value; over a window its spread takes a handful of
    discrete values, which is never Gaussian and would alarm on every window.
    A variable is held when most of its consecutive samples are identical in
    the typical object.
    """
    same = (np.diff(window, axis=1) == 0).mean(1)          # (objects, variables)
    return np.median(same, axis=0) > 0.5


def spread_scale(sd: np.ndarray) -> np.ndarray:
    """Put per-object window spreads on the scale closest to Gaussian.

    `sd` is (objects, variables). Each column is mapped by the power in
    {0 (log), 1/3, 2/3} that leaves it least skewed across the objects. The
    two ends are each right somewhere: s^(2/3), the cube root of the variance
    (Wilson & Hilferty, PNAS 1931), is the Gaussian scale for the spread of
    white noise — skewness within 0.07 of zero from 5 samples up, where the log
    is at -0.34 (20 samples) to -0.77 (5); the log is the scale for spreads
    that differ multiplicatively between objects, as Tennessee Eastman runs do,
    where s^(2/3) alarmed on a quarter of fault-free windows and the log on
    0.4%. A monotone power cannot make a two-group mixture one Gaussian, so
    choosing among three of them by skewness leaves the test's power for real
    structure; it removes the shape the null does not model.
    """
    sd = np.maximum(np.asarray(sd, dtype=float), np.finfo(float).tiny)
    from scipy import stats
    candidates = [np.log(sd), sd ** (1 / 3), sd ** (2 / 3)]
    skews = np.abs(np.stack([stats.skew(c, axis=0) for c in candidates]))
    skews = np.nan_to_num(skews, nan=np.inf)
    pick = skews.argmin(0)
    return np.choose(pick, candidates)


def summaries(window: np.ndarray) -> np.ndarray:
    """(objects, samples, variables) -> (objects, 2 * variables).

    Window means, then window spreads on the scale `spread_scale` picks.
    """
    return np.concatenate([window.mean(1), spread_scale(window.std(1))], axis=1)


def testable(s: np.ndarray) -> np.ndarray:
    """Summaries continuous enough for a test against a continuous law.

    A sensor recorded at a coarse resolution, or one that barely moves, takes a
    handful of distinct values across the fleet; the KS distance of a handful
    of values to N(0, 1) is large whatever the fleet is doing, so such a
    summary is not tested. Constant summaries are the extreme case. The cut —
    at least a quarter of the objects, and at least ten, have distinct values
    — keeps every window mean of a continuous variable and drops the step
    functions.
    """
    n = s.shape[0]
    distinct = np.array([np.unique(col).size for col in s.T])
    return distinct >= max(10, n // 4)


def screen(window: np.ndarray, alpha: float = 0.01):
    """Variables whose window mean or spread is not one Gaussian across objects.

    `window` is (objects, samples, variables). Returns the selected variable
    indices (sorted) and the per-variable p-value, the smaller of its two
    summaries' — Bonferroni over all 2 * variables tests. A held variable's
    spread is not tested (see `held`), nor is any summary with too few distinct
    values (see `testable`); both still count towards the correction.
    """
    selected, per_var, _ = screen_summaries(window, alpha)
    return selected, per_var


def screen_summaries(window: np.ndarray, alpha: float = 0.01):
    """`screen`, plus the standardised summaries that were selected.

    The third value is (objects, s): the window-mean and spread columns,
    standardised across the objects, of every summary that passed the
    threshold — the representation to cluster on when a fault shows in spread
    rather than level (Wang, Smith & Hyndman, "Characteristic-based clustering
    for time series data", DMKD 2006).
    """
    s = summaries(np.asarray(window, dtype=float))
    n, m = s.shape
    p = p_values(ks_normal(standardise(s)), n)
    p[~testable(s)] = 1.0
    n_vars = m // 2
    p[n_vars:][held(window)] = 1.0
    per_var = np.minimum(p[:n_vars], p[n_vars:])
    hit = p <= alpha / m
    selected = np.flatnonzero(hit[:n_vars] | hit[n_vars:])
    return selected, per_var, standardise(s)[:, hit]
