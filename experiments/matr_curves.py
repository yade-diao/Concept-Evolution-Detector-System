"""Each cell's discharge curve Q(V), per cycle, binned by voltage.

The per-cycle summaries (capacity, resistance, temperature) barely move in the
first hundred cycles; the early signal Severson et al. found is in the *shape*
of the discharge curve — their ΔQ_{100-10}(V). This extracts that shape for
the fleet monitor: the interpolated discharge capacity curve `Qdlin` (1000
points on a fixed voltage grid, 3.6 V down to 2.0 V) of every cycle 2..H,
averaged into `--bins` voltage bands, so each band is one variable of the
feature stream.

    python -m experiments.matr_curves --bins 25

writes `matr_curves.npz`: `q` (cells, cycles, bins), in the cell order of
`matr_summaries.npz`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from experiments.matr_prepare import FILES


def main() -> None:
    import h5py

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path.home() / "data" / "matr")
    parser.add_argument("--bins", type=int, default=25)
    args = parser.parse_args()
    cells = json.loads((args.raw / "matr_cells.json").read_text())
    horizon = np.load(args.raw / "matr_summaries.npz")["x"].shape[1]
    out = np.zeros((len(cells), horizon, args.bins))
    files = {}
    for k, (b, i) in enumerate(cells):
        f = files.setdefault(b, h5py.File(args.raw / FILES[b - 1], "r"))
        cycles = f[f["batch"]["cycles"][i, 0]]
        for c in range(horizon):                                # cycles 2..H+1 are rows 1..H
            q = np.ravel(f[cycles["Qdlin"][c + 1, 0]][()])
            out[k, c] = q[: q.size // args.bins * args.bins].reshape(args.bins, -1).mean(1)
    for f in files.values():
        f.close()
    np.savez_compressed(args.raw / "matr_curves.npz", q=out)
    print(f"q {out.shape}")


if __name__ == "__main__":
    main()
