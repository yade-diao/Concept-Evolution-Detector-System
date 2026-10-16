"""A fleet of real lithium-ion cells, watched from their first cycles.

The question Severson et al. (Nature Energy 2019) made famous: can the cells
that will die young be told apart early, before their capacity has visibly
faded? They answered it with a supervised model on hand-built features. This
asks it of the unsupervised fleet monitor: each cell against its own first 20
cycles and against the fleet, window by window — with no lifetime label used
anywhere until scoring.

Scored against the cells' measured lives (experiments/matr_prepare.py):

* Spearman correlation between how early a cell is named and how long it
  lives (cells never named count as named last);
* of the cells named by cycle 100, how many are in the shortest-lived quarter
  (precision), and how much of that quarter is named (recall).

Compared with:

* own fade — each cell's discharge-capacity drop from cycles 2–11 to the
  current window, ranked across the fleet (no peer comparison, no model);
* PCA T²/SPE fitted on every cell's first 20 cycles;
* the paper's own single best feature, log variance of ΔQ_{100-10}(V), the
  difference between the discharge curves of cycles 100 and 10 (|ρ| = 0.93
  with log life in the paper) — read from the in-cycle curves of just those
  two cycles. It is a one-number ranking at cycle 100, not a monitor, and it
  was chosen by looking at lifetimes; it is the bar, not a peer.

    python -m experiments.matr_fleet
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy import stats

from cedfs.fleet import accumulate, deviation, own_change
from experiments.tep_fleet import pca_monitor

RAW = Path.home() / "data" / "matr"


def first_alarm(alarms: np.ndarray, window: int, start_cycle: int = 2) -> np.ndarray:
    """Cycle at the end of the first alarmed window, inf when never."""
    out = np.full(alarms.shape[0], np.inf)
    for u, row in enumerate(alarms):
        hit = np.flatnonzero(row)
        if hit.size:
            out[u] = start_cycle - 1 + (hit[0] + 1) * window
    return out


def score(named_at: np.ndarray, life: np.ndarray, by: int = 100) -> dict:
    """Earlier naming should mean shorter life: Spearman of naming cycle with life."""
    rank_key = np.where(np.isfinite(named_at), named_at, 1e9)
    rho = stats.spearmanr(rank_key, life).statistic
    short = life <= np.quantile(life, 0.25)
    early = named_at <= by
    return {"spearman_with_life": float(rho),
            "named_by_100": int(early.sum()),
            "precision_short_quarter": float(short[early].mean()) if early.any() else None,
            "recall_short_quarter": float(early[short].mean())}


def delta_q_variance(raw: Path, cells_index: list[tuple[int, int]]) -> np.ndarray:
    """log10 var(Q_100(V) - Q_10(V)) per cell from the in-cycle Qdlin curves."""
    import h5py

    from experiments.matr_prepare import FILES

    out = []
    open_files = {}
    for b, i in cells_index:
        if b not in open_files:
            open_files[b] = h5py.File(raw / FILES[b - 1], "r")
        f = open_files[b]
        cycles = f[f["batch"]["cycles"][i, 0]]
        q = [np.ravel(f[cycles["Qdlin"][c, 0]][()]) for c in (9, 99)]   # cycles 10 and 100
        out.append(np.log10(np.var(q[1] - q[0])))
    for f in open_files.values():
        f.close()
    return np.array(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=RAW)
    parser.add_argument("--window", type=int, default=5)
    parser.add_argument("--baseline", type=int, default=20)
    parser.add_argument("--m", type=int, default=8)
    parser.add_argument("--level", type=float, default=0.01)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    d = np.load(args.raw / "matr_summaries.npz")
    x, life = d["x"].astype(float), d["life"]
    # A few summaries are missing or zero in some cycles; carry the last good value.
    for u in range(x.shape[0]):
        for v in range(x.shape[2]):
            col = x[u, :, v]
            bad = ~np.isfinite(col) | (col == 0)
            if bad.all():
                col[:] = 0
                continue
            idx = np.where(~bad, np.arange(col.size), 0)
            np.maximum.accumulate(idx, out=idx)
            first_good = np.flatnonzero(~bad)[0]
            idx[:first_good] = first_good
            x[u, :, v] = col[idx]

    print(f"{x.shape[0]} cells, cycles 2..{x.shape[1] + 1}, life {life.min()}..{life.max()}")
    results = {}

    p = deviation(x, args.window, args.baseline)
    alarms = accumulate(p, args.m, args.level)
    results["deviation"] = score(first_alarm(alarms, args.window), life)
    po = own_change(x, args.window, args.baseline)
    results["own_change"] = score(first_alarm(accumulate(po, args.m, args.level), args.window), life)

    curves_path = args.raw / "matr_curves.npz"
    if curves_path.exists():
        # The same monitor, with the discharge curve's voltage bands as the
        # variables (experiments/matr_curves.py) and cycles 2-11 as each cell's
        # own baseline - the shape the summaries average away.
        q = np.load(curves_path)["q"]
        pq = deviation(q, args.window, 10)
        results["deviation_on_curves"] = score(first_alarm(accumulate(pq, args.m, args.level),
                                                           args.window), life)
        po = own_change(q, args.window, 10, statistic="shape")
        results["own_change_on_curves"] = score(first_alarm(accumulate(po, args.m, args.level),
                                                            args.window), life)

    qd = list(d["variables"]).index("QDischarge")
    fade_alarm = np.full(x.shape[0], np.inf)
    start = x[:, :10, qd].mean(1)
    for w in range(x.shape[1] // args.window):
        now = x[:, w * args.window:(w + 1) * args.window, qd].mean(1)
        fade = start - now
        # The same conformal reading as the deviation monitor, on fade alone.
        pv = (fade[None, :] >= fade[:, None]).sum(1) / x.shape[0]
        hit = (pv <= 0.05) & ~np.isfinite(fade_alarm)
        fade_alarm[hit] = 1 + (w + 1) * args.window
    results["own_fade"] = score(fade_alarm, life)

    monitor, _ = pca_monitor(x[:, :args.baseline])
    n_w = x.shape[1] // args.window
    pca = monitor(x)[:, :n_w * args.window].reshape(x.shape[0], n_w, args.window).mean(-1) > 0.5
    results["pca_first_20_cycles"] = score(first_alarm(pca, args.window), life)

    try:
        cells_index = json.loads((args.raw / "matr_cells.json").read_text())
        dq = delta_q_variance(args.raw, cells_index)
        results["delta_q_variance_at_100"] = {
            "spearman_with_life": float(stats.spearmanr(dq, life).statistic),
            "pearson_log_life": float(stats.pearsonr(dq, np.log10(life)).statistic)}
    except FileNotFoundError:
        pass

    for name, r in results.items():
        print(f"  {name:26s} " + "  ".join(f"{k} {v:.3f}" if isinstance(v, float) else f"{k} {v}"
                                          for k, v in r.items()))
    if args.out:
        args.out.write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
