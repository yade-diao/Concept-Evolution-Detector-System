"""Is the C-MAPSS FD003 first-window split the fault mode?

FD003 engines degrade by one of two fault modes (HPC or fan), and the release
does not say which engine has which. A proxy from the data: each engine's
sensor change from its first 30 to its last 30 cycles, standardised, split
into two groups by k-means. The two groups differ in the direction several
sensors move at end of life. The question is whether the fleet monitor's
split in cycles 1-10 — long before any degradation — lines up with them.

    python -m experiments.cmapss_modes
"""

from __future__ import annotations

import numpy as np
from scipy import stats
from sklearn.cluster import KMeans

from cedfs.fleet import monitor
from experiments.cmapss_fleet import DATA, load


def main() -> None:
    raw = np.loadtxt(DATA / "train_FD003.txt")
    units = np.unique(raw[:, 0]).astype(int)
    trend = np.array([raw[raw[:, 0] == u][-30:, 5:26].mean(0) - raw[raw[:, 0] == u][:30, 5:26].mean(0)
                      for u in units])
    sd = trend.std(0)
    use = sd > 1e-9
    z = trend[:, use] / sd[use]
    modes = KMeans(2, n_init=20, random_state=0).fit_predict(z)

    cube, life = load("FD003")
    split = monitor(cube, 10, screen_alpha=0.01).flags[:, 0]
    table = np.array([[np.sum((split == a) & (modes == b)) for b in (0, 1)] for a in (False, True)])
    names = np.array([f"sensor {i}" for i in range(1, 22)])[use]
    contrast = z[modes == 0].mean(0) - z[modes == 1].mean(0)
    top = np.argsort(-np.abs(contrast))[:6]
    print("end-of-life groups:", np.bincount(modes).tolist(),
          " median life:", [int(np.median(life[modes == k])) for k in (0, 1)])
    print("sensors separating them (group 0 minus group 1, sd units):",
          ", ".join(f"{names[i]} {contrast[i]:+.1f}" for i in top))
    print("split off in cycles 1-10 vs end-of-life group:\n", table)
    print(f"Fisher exact p = {stats.fisher_exact(table).pvalue:.1e}")


if __name__ == "__main__":
    main()
