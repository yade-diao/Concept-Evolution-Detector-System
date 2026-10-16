"""Per-cycle summaries of the Severson et al. (2019) battery fleet.

Severson, Attia, Jin, Perkins, Jiang, Yang, Chen, Aykol, Herring, Fraggedakis,
Bazant, Harris, Chueh & Braatz, "Data-driven prediction of battery cycle life
before capacity degradation", *Nature Energy* 4, 2019; data from the Toyota
Research Institute platform (data.matr.io). 124 commercial LFP/graphite cells
(A123 APR18650M1A, 1.1 Ah), cycled to failure under 72 fast-charging protocols
and a common 4C discharge — real experiments, not a simulation.

Only the per-cycle summaries are read (internal resistance, charge and
discharge capacity, average/min/max can temperature, charge time), straight
from the MATLAB v7.3 files with h5py, so the 8 GB of in-cycle curves are never
loaded.

The published processing (the authors' BuildPkl notebooks) drops cells that
never reached end of life or had faulty channels and joins cells whose test
continued in a later batch. Rather than copy a list of cell names, this script
derives both from the data and prints what it found:

* life = first cycle whose discharge capacity reaches 0.88 Ah (80% of 1.1 Ah;
  batches 1 and 3 stop on it, so the test is "at most 0.8805"), compared with
  the file's own `cycle_life`; a cell that stopped a hair above the threshold
  (last capacity within 0.885 Ah) takes the file's `cycle_life`; a cell whose
  test ended far above it never reached end of life and is dropped, as in the
  paper;
* a batch-2 cell continues a batch-1 cell when its first discharge capacity
  matches that cell's last within 1% and the batch-1 cell had not reached end
  of life; the summaries are then concatenated.

    python -m experiments.matr_prepare --raw ~/data/matr

writes `matr_summaries.npz`: `x` (cells, cycles, 7) for the first `--cycles`
cycles (cycle 1 is dropped — its summaries are unreliable in these files), the
variable names, `life`, `policy` and `batch`; and `matr_cells.json`, each kept
cell's (batch, index) in the raw files, for reading in-cycle curves later.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

FILES = ["batch_20170512.mat", "batch_20170630.mat", "batch_20180412.mat"]
FIELDS = ["IR", "QCharge", "QDischarge", "Tavg", "Tmin", "Tmax", "chargetime"]
END_OF_LIFE = 0.8805          # 0.88 Ah; batches 1 and 3 stop exactly on it


def read_batch(path: Path):
    import h5py

    cells = []
    with h5py.File(path, "r") as f:
        batch = f["batch"]
        for i in range(batch["summary"].shape[0]):
            summary = f[batch["summary"][i, 0]]
            values = np.stack([np.ravel(summary[k][()]) for k in FIELDS], axis=1)
            given = float(np.ravel(f[batch["cycle_life"][i, 0]][()])[0])
            policy = f[batch["policy_readable"][i, 0]][()].tobytes()[::2].decode()
            cells.append({"x": values, "given_life": given, "policy": policy, "index": i})
    return cells


def life_of(x: np.ndarray) -> int | None:
    below = np.flatnonzero(x[1:, FIELDS.index("QDischarge")] < END_OF_LIFE)
    return int(below[0]) + 2 if below.size else None          # cycles are 1-based


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path.home() / "data" / "matr")
    parser.add_argument("--cycles", type=int, default=None,
                        help="keep this many cycles from cycle 2 (default: the shortest life)")
    args = parser.parse_args()

    batches = [read_batch(args.raw / name) for name in FILES]
    qd = FIELDS.index("QDischarge")

    # Continuations: a batch-1 cell short of end of life whose last capacity
    # matches a batch-2 cell's first.
    used = set()
    for a in batches[0]:
        if life_of(a["x"]) is not None:
            continue
        last = np.nanmedian(a["x"][-5:, qd])
        for j, b in enumerate(batches[1]):
            first = np.nanmedian(b["x"][1:6, qd])
            if j not in used and abs(first - last) / last < 0.01:
                print(f"  joined: batch-1 cell ({a['policy']}) continues as batch-2 cell {j} "
                      f"({b['policy']}), {last:.4f} -> {first:.4f} Ah")
                a["x"] = np.vstack([a["x"], b["x"][1:]])
                used.add(j)
                break
    batches[1] = [b for j, b in enumerate(batches[1]) if j not in used]

    cells, dropped = [], 0
    for k, batch in enumerate(batches, start=1):
        for c in batch:
            life = life_of(c["x"])
            near_end = c["x"][-1, FIELDS.index("QDischarge")] <= 0.885
            if life is None and near_end and np.isfinite(c["given_life"]) and c["given_life"] > 0:
                # Stopped a hair above the threshold (0.8806-0.881 Ah): the
                # authors' own cycle_life is the label.
                life = int(c["given_life"])
            if life is None:
                dropped += 1
                continue
            cells.append({**c, "life": life, "batch": k})
    print(f"{len(cells)} cells reach end of life, {dropped} dropped")
    agree = np.array([abs(c["life"] - c["given_life"]) <= 2 for c in cells if c["given_life"] > 0])
    print(f"derived life within 2 cycles of the file's cycle_life for {agree.sum()} / {agree.size}")

    horizon = args.cycles or min(c["life"] for c in cells) - 1
    x = np.stack([c["x"][1:1 + horizon] for c in cells])
    np.savez_compressed(args.raw / "matr_summaries.npz", x=x, variables=np.array(FIELDS),
                        life=np.array([c["life"] for c in cells]),
                        policy=np.array([c["policy"] for c in cells]),
                        batch=np.array([c["batch"] for c in cells]))
    import json
    (args.raw / "matr_cells.json").write_text(json.dumps([[c["batch"], c["index"]] for c in cells]))
    lives = np.array([c["life"] for c in cells])
    print(f"x {x.shape}: cycles 2..{horizon + 1}; life {lives.min()}..{lives.max()}, "
          f"median {int(np.median(lives))}; {len(set(c['policy'] for c in cells))} policies")


if __name__ == "__main__":
    main()
