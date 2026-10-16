"""The bundled fleets: industrial feature streams, addressable by name.

`datasets/bundled/fleets/manifest.json` lists them; each is one file of
little-endian int16, (units, samples, variables), with a per-variable `offset`
and `scale` in the manifest: value = offset + scale * code. Sixteen bits per
value keeps three fleets of a hundred units in a few megabytes each, at a
resolution of 1/65 535 of each variable's range — far below the noise of any
of them. The browser reads the same files (frontend/src/datasets/fleets.ts),
so the reference and the port see the same numbers.

Built by `python -m experiments.build_fleets` from the raw releases.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent / "datasets" / "bundled" / "fleets"


def manifest() -> list[dict]:
    return json.loads((ROOT / "manifest.json").read_text())


def describe(slug: str) -> dict:
    for entry in manifest():
        if entry["slug"] == slug:
            return entry
    raise KeyError(f"no bundled fleet {slug!r}; have {[e['slug'] for e in manifest()]}")


def load(slug: str) -> np.ndarray:
    """(units, samples, variables) float64."""
    e = describe(slug)
    codes = np.fromfile(ROOT / e["file"], dtype="<i2").reshape(e["units"], e["samples"], len(e["variables"]))
    return np.asarray(e["offset"]) + np.asarray(e["scale"]) * codes.astype(float)
