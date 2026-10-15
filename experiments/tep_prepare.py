"""Turn the Rieth et al. (2017) Tennessee Eastman release into arrays.

The release is four R workspaces on Harvard Dataverse (doi:10.7910/DVN/6C3JR1,
public domain). Only the two *testing* sets are used: each run is 960 samples
at three-minute intervals (48 hours) and the fault, when there is one, is
switched on after sample 160 (hour 8). That leaves eight hours of normal
operation in every run, which is what lets false alarms be counted before the
fault and detection delay after it.

    python -m experiments.tep_prepare --raw ~/data/tep-rieth --runs 50

writes `tep_testing.npz` next to the raw files:

    normal   float32 (500, 960, 52)    fault-free runs 1..500
    faulty   float32 (20, R, 960, 52)  faults 1..20, runs 1..R
    columns  str (52,)                 xmeas_1..41, xmv_1..11

The faulty workspace is 9.6 M rows, more than pandas can hold in 7 GB, so it
is first cut down by `experiments/tep_cut.R` (see the command there) to
`faulty<R>.f32`; this script reads that.
"""

from __future__ import annotations

import argparse
import gc
from pathlib import Path

import numpy as np

FAULT_FREE_TESTING = "f3031240.RData"   # TEP_FaultFree_Testing.RData
SAMPLES = 960
ONSET = 160                             # last normal sample in a faulty run


def _cube(frame, runs: list[int]) -> np.ndarray:
    frame = frame[frame["simulationRun"].isin(runs)]
    frame = frame.sort_values(["simulationRun", "sample"])
    values = frame.iloc[:, 3:].to_numpy(dtype=np.float32)
    return values.reshape(len(runs), SAMPLES, values.shape[1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path.home() / "data" / "tep-rieth")
    parser.add_argument("--runs", type=int, default=50, help="faulty runs kept per fault")
    args = parser.parse_args()

    import pyreadr

    free = next(iter(pyreadr.read_r(str(args.raw / FAULT_FREE_TESTING)).values()))
    columns = np.array(free.columns[3:], dtype=str)
    normal = _cube(free, list(range(1, 501)))
    del free
    gc.collect()

    raw = np.fromfile(args.raw / f"faulty{args.runs}.f32", dtype="<f4")
    faulty = raw.reshape(20, args.runs, SAMPLES, len(columns))

    out = args.raw / "tep_testing.npz"
    np.savez_compressed(out, normal=normal, faulty=faulty, columns=columns)
    print(f"{out}: normal {normal.shape}, faulty {faulty.shape}")


if __name__ == "__main__":
    main()
