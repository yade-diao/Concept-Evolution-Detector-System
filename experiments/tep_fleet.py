"""A fleet of Tennessee Eastman runs, watched as a feature stream.

The fleet is a fixed set of simulation runs — mostly fault-free, some with
fault f — observed together, three-minute sample by three-minute sample. A row
is a run; a column is one process variable at one sample time, ordered by time,
so a window of `hour` samples is literally the next hour of the plant. The fault
is switched on after sample 160 in every faulty run, so the right answer is
known: one group of runs for the first eight windows, and, for a fault that
shows, a second group from window 9.

Two detectors look at the same fleet:

* **CED-FS**, unchanged: K-R-DPC per window, Dice overlap between windows.
  A run is flagged in a window when it is outside that window's largest
  cluster. It sees nothing but the fleet — no fault-free history, no training.
* **PCA with Hotelling T² and SPE**, the standard process-monitoring baseline
  (Chiang, Russell & Braatz 2001), fitted on 100 *separate* fault-free runs at
  99% control limits. A run is flagged in a window when more than half of its
  samples in that window exceed either limit.

Both are scored per run per window: the false-alarm rate over the eight
pre-fault windows and the detection rate over the forty after.

    python -m experiments.tep_fleet --faults 1 2 4 6 7 --normal 80 --faulty 20
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy import stats
from sklearn.metrics import adjusted_rand_score

from cedfs.evaluation import event_counts
from cedfs.fleet import monitor as fleet_monitor

ONSET = 160
SAMPLES = 960
DATA = Path.home() / "data" / "tep-rieth" / "tep_testing.npz"


def fleet(data, fault: int, n_normal: int, n_faulty: int):
    """(runs, samples, variables) and a mask of which runs carry the fault."""
    runs = np.concatenate([data["normal"][:n_normal], data["faulty"][fault - 1, :n_faulty]])
    return runs, np.r_[np.zeros(n_normal, bool), np.ones(n_faulty, bool)]


def pca_monitor(reference: np.ndarray, alpha: float = 0.01, variance: float = 0.9):
    """Fit PCA on fault-free samples; return a function giving T² and SPE alarms."""
    X = reference.reshape(-1, reference.shape[-1]).astype(float)
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1.0
    Z = (X - mu) / sd
    eigval, eigvec = np.linalg.eigh(np.cov(Z, rowvar=False))
    eigval, eigvec = eigval[::-1], eigvec[:, ::-1]
    a = int(np.searchsorted(np.cumsum(eigval) / eigval.sum(), variance) + 1)
    P, lam = eigvec[:, :a], eigval[:a]
    n = Z.shape[0]
    t2_lim = a * (n - 1) * (n + 1) / (n * (n - a)) * stats.f.ppf(1 - alpha, a, n - a)
    # SPE limit from the empirical quantile of the reference residuals:
    # the Jackson-Mudholkar approximation assumes normal residuals, which the
    # TEP residuals are not, and over-alarms by a factor of several.
    resid = Z - Z @ P @ P.T
    spe_lim = np.quantile((resid ** 2).sum(1), 1 - alpha)

    def alarms(runs: np.ndarray) -> np.ndarray:
        Zr = (runs.astype(float) - mu) / sd
        T = Zr @ P
        t2 = (T ** 2 / lam).sum(-1)
        spe = ((Zr - T @ P.T) ** 2).sum(-1)
        return (t2 > t2_lim) | (spe > spe_lim)               # (runs, samples)

    return alarms, a


def rates(flags, faulty, onset_window):
    """False-alarm rate before the fault, detection rate after, per run-window."""
    pre, post = flags[:, :onset_window], flags[:, onset_window:]
    far = float(pre.mean())
    fdr = float(post[faulty].mean()) if faulty.any() else float("nan")
    post_far = float(post[~faulty].mean())
    first = [int(np.argmax(row)) if row.any() else None for row in post[faulty]]
    delays = [f for f in first if f is not None]
    return {"far_pre": far, "detection": fdr, "far_post_normal": post_far,
            "median_delay_windows": float(np.median(delays)) if delays else None}


def run(fault, data, n_normal, n_faulty, hour, params, monitor, gate=None, screen_alpha=None,
        represent="columns", roughness=False):
    runs, faulty = fleet(data, fault, n_normal, n_faulty)
    onset_w = ONSET // hour
    watched = fleet_monitor(runs, hour, params, screen_alpha=screen_alpha, gate=gate,
                            represent=represent, roughness=roughness)
    clusterings, counts, flags, chosen = (watched.clusterings, watched.cluster_counts,
                                          watched.flags, watched.variables)
    picked = np.bincount([v for w in chosen[onset_w:] for v in w], minlength=runs.shape[-1])
    truth = [np.zeros_like(faulty) if w < onset_w else faulty for w in range(len(counts))]
    ari = [adjusted_rand_score(t, c) for t, c in zip(truth, clusterings)]
    pre_events = event_counts(clusterings[:onset_w], counts[:onset_w])

    sample_alarms = monitor(runs)
    pca_flags = sample_alarms.reshape(len(runs), -1, hour).mean(-1) > 0.5

    return {
        "fault": fault,
        "clusters_pre": counts[:onset_w],
        "clusters_post": counts[onset_w:],
        "events_pre_onset": pre_events,
        "ari_post_mean": float(np.mean(ari[onset_w:])),
        "variables_post": {str(data["columns"][v]): int(picked[v])
                           for v in np.argsort(picked)[::-1][:5] if picked[v]},
        "ced_fs": rates(flags, faulty, onset_w),
        # Two consecutive windows, the oldest of the Western Electric run rules:
        # a false selection rarely repeats, a fault does.
        "ced_fs_two_in_a_row": rates(flags & np.c_[np.zeros(len(flags), bool), flags[:, :-1]],
                                     faulty, onset_w),
        "pca": rates(pca_flags, faulty, onset_w),
    }


def _run_one(job):
    fault, args, params = job
    data = np.load(args.data)
    monitor, _ = pca_monitor(data["normal"][400:500])
    return run(fault, data, args.normal, args.faulty, args.hour, params, monitor, args.gate,
               args.screen, args.represent, args.roughness)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--faults", type=int, nargs="+", default=list(range(1, 21)))
    parser.add_argument("--normal", type=int, default=80)
    parser.add_argument("--faulty", type=int, default=20)
    parser.add_argument("--hour", type=int, default=20, help="samples per window")
    parser.add_argument("--sigma", type=float, default=6.0)
    parser.add_argument("--p", type=float, default=0.05)
    parser.add_argument("--gate", type=float, help="significance level for the one-cluster test")
    parser.add_argument("--screen", type=float, help="family-wise level for variable screening")
    parser.add_argument("--represent", choices=["columns", "summaries"], default="columns")
    parser.add_argument("--roughness", action="store_true",
                        help="also screen the spread of first differences")
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    data = np.load(args.data)
    # The monitor's fault-free reference is runs 401-500, never part of a fleet.
    monitor, n_pc = pca_monitor(data["normal"][400:500])
    params = {"kernel_type": 1, "sigma": args.sigma, "p": args.p}

    print(f"fleet: {args.normal} normal + {args.faulty} faulty runs, window = "
          f"{args.hour} samples ({args.hour * 3} min), PCA keeps {n_pc} components")
    print(f"{'fault':>5}  {'CED-FS FAR':>10} {'det':>5} {'ARI':>5}   {'2-row FAR':>9} {'det':>5}   "
          f"{'PCA FAR':>7} {'det':>5}   pre-onset events")
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(args.jobs) as pool:
        results = list(pool.map(_run_one, [(f, args, params) for f in args.faults]))
    for r in results:
        f = r["fault"]
        c, p, e = r["ced_fs"], r["pca"], r["events_pre_onset"]
        c2 = r["ced_fs_two_in_a_row"]
        print(f"{f:>5}  {c['far_pre']:>10.3f} {c['detection']:>5.2f} {r['ari_post_mean']:>5.2f}"
              f"   {c2['far_pre']:>9.3f} {c2['detection']:>5.2f}"
              f"   {p['far_pre']:>7.3f} {p['detection']:>5.2f}   "
              f"S{e['stable']} D{e['drift']} E{e['emerging']} F{e['forgetting']}   "
              + " ".join(list(r["variables_post"])[:3]))
    if args.out:
        args.out.write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
