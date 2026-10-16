"""Build datasets/bundled/fleets from the raw Tennessee Eastman and C-MAPSS files.

    python -m experiments.build_fleets

Needs ~/data/tep-rieth/tep_testing.npz (experiments/tep_prepare.py) and
~/data/cmapss/train_FD001.txt. Each fleet is quantised to int16 per variable
(see cedfs/fleets.py).
"""

from __future__ import annotations

import json

import numpy as np

from cedfs.fleets import ROOT
from experiments.cmapss_fleet import load as load_cmapss
from experiments.tep_fleet import DATA as TEP

TEP_SAMPLES = 480                       # the first 24 hours; the fault starts after 160


def quantise(cube: np.ndarray):
    lo, hi = cube.min((0, 1)), cube.max((0, 1))
    scale = np.where(hi > lo, (hi - lo) / 65535, 1.0)
    codes = np.round((cube - lo) / scale - 32768).astype("<i2")
    offset = lo + 32768 * scale
    return codes, offset, scale


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    entries = []
    data = np.load(TEP)
    columns = [str(c) for c in data["columns"]]
    for fault, title, why in [
        (5, "Tennessee Eastman · condenser cooling water step",
         "A step in the condenser cooling-water inlet temperature. The control loop compensates "
         "and the plant's operating point returns close to normal, so a monitor fitted on normal "
         "operation (PCA T²/SPE) sees it in 24% of faulty windows; the faulty runs still group "
         "apart from their peers, through the condenser cooling-water flow (xmv_11)."),
        (11, "Tennessee Eastman · reactor cooling water, random variation",
         "Random variation in the reactor cooling-water inlet temperature. The faulty runs do not "
         "move in level, they become noisier, through the reactor cooling-water flow (xmv_10); "
         "they form a group only when each run is summarised by its spread."),
    ]:
        cube = np.concatenate([data["normal"][:80], data["faulty"][fault - 1, :20]])[:, :TEP_SAMPLES]
        codes, offset, scale = quantise(cube.astype(float))
        file = f"tep_fault{fault:02d}.i16"
        codes.tofile(ROOT / file)
        entries.append({
            "slug": f"tep-fault-{fault}", "title": title, "why": why, "file": file,
            "units": 100, "samples": TEP_SAMPLES, "variables": columns,
            "offset": offset.tolist(), "scale": scale.tolist(),
            "unitNames": [f"normal {i + 1}" for i in range(80)] + [f"fault {i + 1}" for i in range(20)],
            "sampleMinutes": 3, "window": 20, "monitor": "clustering", "alpha": 0.001,
            "truth": {"faultyUnits": list(range(80, 100)), "onsetSample": 160},
            "source": "Rieth, Amsel, Tran & Cook (2017), Harvard Dataverse doi:10.7910/DVN/6C3JR1, "
                      "public domain; testing runs 1-80 fault-free, 1-20 of the fault, first 24 h",
        })
    cube, lives = load_cmapss("FD001")
    codes, offset, scale = quantise(cube)
    codes.tofile(ROOT / "cmapss_fd001.i16")
    entries.append({
        "slug": "cmapss-fd001", "title": "C-MAPSS FD001 · turbofan engines degrading",
        "why": "A hundred simulated engines, each run to failure; aligned at the first cycle and cut "
               "at the shortest life. They degrade gradually and differ from each other almost as "
               "much as a failing engine drifts, so each is compared with its own first 30 cycles "
               "and scored against the fleet.",
        "file": "cmapss_fd001.i16", "units": len(cube), "samples": cube.shape[1],
        "variables": [f"sensor {i}" for i in range(1, 22)],
        "offset": offset.tolist(), "scale": scale.tolist(),
        "unitNames": [f"engine {i + 1}" for i in range(len(cube))],
        "sampleMinutes": None, "sampleUnit": "cycle", "window": 5, "monitor": "deviation",
        "baseline": 30, "m": 8, "level": 0.01,
        "truth": {"lifeCycles": lives.tolist()},
        "source": "Saxena, Goebel, Simon & Eklund (2008), NASA Prognostics Center of Excellence, "
                  "train_FD001",
    })
    (ROOT / "manifest.json").write_text(json.dumps(entries, indent=1))
    for e in entries:
        print(e["slug"], (ROOT / e["file"]).stat().st_size // 1024, "KiB")


if __name__ == "__main__":
    main()
