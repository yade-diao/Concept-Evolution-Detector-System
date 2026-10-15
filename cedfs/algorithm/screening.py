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


def p_values(stat: np.ndarray, n: int) -> np.ndarray:
    null = lilliefors_null(n)
    above = null.size - np.searchsorted(null, stat, side="left")
    return (1 + above) / (1 + null.size)


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


def summaries(window: np.ndarray) -> np.ndarray:
    """(objects, samples, variables) -> (objects, 2 * variables).

    Window means, then log standard deviations: the spread of a short window is
    chi-like and right-skewed, its logarithm close to symmetric.
    """
    spread = np.log(np.maximum(window.std(1), np.finfo(float).tiny))
    return np.concatenate([window.mean(1), spread], axis=1)


def screen(window: np.ndarray, alpha: float = 0.01):
    """Variables whose window mean or spread is not one Gaussian across objects.

    `window` is (objects, samples, variables). Returns the selected variable
    indices (sorted) and the per-variable p-value, the smaller of its two
    summaries' — Bonferroni over all 2 * variables tests. A held variable's
    spread is not tested (see `held`) but still counts towards the correction.
    """
    s = summaries(np.asarray(window, dtype=float))
    n, m = s.shape
    constant = s.std(0) == 0
    p = p_values(ks_normal(standardise(s)), n)
    p[constant] = 1.0
    n_vars = m // 2
    p[n_vars:][held(window)] = 1.0
    per_var = np.minimum(p[:n_vars], p[n_vars:])
    selected = np.flatnonzero(per_var <= alpha / m)
    return selected, per_var
