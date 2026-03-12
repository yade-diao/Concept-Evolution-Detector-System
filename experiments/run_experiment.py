"""
run_experiment.py – Command-line experiment runner for CED-FS.

Usage
-----
python experiments/run_experiment.py \\
    --data  datasets/glioma.mat \\
    --label datasets/glioma_label.mat \\
    --window-size 50 \\
    --sigma 6 \\
    --p 0.05 \\
    --kernel 1 \\
    --threshold 0.5
"""

import argparse
import sys
import os
import time

import numpy as np
from scipy.io import loadmat

# Allow running from the project root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cedfs import CED_FS
from cedfs.utils.normalize import min_max_normalize


# ─────────────────────────────────────────────────
def load_mat_auto(path: str) -> np.ndarray:
    """Load the first non-system variable from a .mat file."""
    mat = loadmat(path, struct_as_record=False, squeeze_me=True)
    keys = [k for k in mat if not k.startswith("__")]
    if not keys:
        raise ValueError(f"No data variables found in {path}")
    arr = np.array(mat[keys[0]])
    return arr.reshape(arr.shape[0], -1) if arr.ndim == 1 else arr


def run(args):
    print(f"\n{'─'*56}")
    print(f"  CED-FS Experiment")
    print(f"{'─'*56}")
    print(f"  Data : {args.data}")
    print(f"  Label: {args.label}")
    print(f"  Window size : {args.window_size}")
    print(f"  Kernel type : {args.kernel}")
    print(f"  σ  = {args.sigma}   p = {args.p}   τ = {args.threshold}")
    print(f"{'─'*56}\n")

    # Load data
    data   = load_mat_auto(args.data)
    labels = load_mat_auto(args.label)
    if labels.ndim == 1:
        labels = labels.reshape(-1, 1)

    # Align shapes
    if data.shape[0] != labels.shape[0]:
        if data.shape[1] == labels.shape[0]:
            data = data.T
        else:
            n = min(data.shape[0], labels.shape[0])
            data, labels = data[:n], labels[:n]
            print(f"  [warn] Row count mismatch – truncated to {n} samples.")

    data_dim = data.shape[1]
    data = min_max_normalize(data.copy())
    X = np.hstack((data, labels[:, :1]))

    params = {
        "kernelType": args.kernel,
        "sigma":      args.sigma,
        "p":          args.p,
        "similarityThreshold": args.threshold,
    }

    t0 = time.perf_counter()
    best_ri, events, cluster_nums, _ = CED_FS(
        X,
        d=data_dim,
        winsize=args.window_size,
        algorithm_params=params,
    )
    elapsed = time.perf_counter() - t0

    # ── Results ──────────────────────────────────────
    print(f"\n{'─'*56}")
    print(f"  Results")
    print(f"{'─'*56}")
    print(f"  Best Rand Index    : {best_ri:.4f}")
    print(f"  Windows processed  : {len(cluster_nums)}")
    print(f"  Clusters per window: {cluster_nums}")
    sum_e = sum(events.get("emerging",   []))
    sum_d = sum(events.get("drift",      []))
    sum_f = sum(events.get("forgetting", []))
    sum_s = sum(events.get("stable",     []))
    print(f"  Emerging concepts  : {sum_e}")
    print(f"  Concept drift      : {sum_d}")
    print(f"  Concept forgetting : {sum_f}")
    print(f"  Stable             : {sum_s}")
    print(f"  Execution time     : {elapsed:.2f} s")
    print(f"{'─'*56}\n")


def main():
    parser = argparse.ArgumentParser(
        description="CED-FS command-line experiment runner."
    )
    parser.add_argument("--data",        required=True,  help="Path to data .mat file.")
    parser.add_argument("--label",       required=True,  help="Path to label .mat file.")
    parser.add_argument("--window-size", type=int,   default=50,   help="Sliding window size.")
    parser.add_argument("--kernel",      type=int,   default=1,    help="Kernel type (1–5).")
    parser.add_argument("--sigma",       type=float, default=6.0,  help="Kernel bandwidth σ.")
    parser.add_argument("--p",           type=float, default=0.05, help="KNN fraction p.")
    parser.add_argument("--threshold",   type=float, default=0.5,  help="Similarity threshold τ.")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
