"""
The bundled benchmarks, addressable by name.

The eight ``.mat`` pairs in ``datasets/bundled`` shipped with a manifest that
nothing read, so every caller re-derived the same three things: which file holds
the features, which holds the labels, and which axis is the sample axis. This
module answers those once.

Loading is deliberately strict about orientation. A benchmark whose feature
matrix arrives transposed clusters 4 434 "samples" of 50 features and reports a
plausible-looking number, so a silent guess is worse than a refusal: the axis is
resolved against the label count and an ambiguous case is raised rather than
picked.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.io import loadmat

from cedfs.utils.normalize import min_max_normalize

BUNDLED_DIR = Path(__file__).resolve().parent.parent / "datasets" / "bundled"
MANIFEST = BUNDLED_DIR / "manifest.json"


@dataclass(frozen=True)
class DatasetInfo:
    """One entry of the manifest: what the pair of files is supposed to contain."""

    slug: str
    name: str
    data_file: str
    label_file: str
    samples: int
    features: int
    classes: int

    @property
    def data_path(self) -> Path:
        return BUNDLED_DIR / self.data_file

    @property
    def label_path(self) -> Path:
        return BUNDLED_DIR / self.label_file


def _read_manifest() -> list[DatasetInfo]:
    if not MANIFEST.exists():
        raise FileNotFoundError(
            f"No dataset manifest at {MANIFEST}. The bundled benchmarks are part "
            "of the repository; see datasets/README.md."
        )
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return [
        DatasetInfo(
            slug=e["slug"],
            name=e["name"],
            data_file=e["dataFile"],
            label_file=e["labelFile"],
            samples=int(e["samples"]),
            features=int(e["features"]),
            classes=int(e["classes"]),
        )
        for e in entries
    ]


def available() -> list[DatasetInfo]:
    """Every bundled benchmark, in manifest order."""
    return _read_manifest()


def describe(slug: str) -> DatasetInfo:
    """The manifest entry for one benchmark."""
    for info in _read_manifest():
        if info.slug == slug:
            return info
    known = ", ".join(i.slug for i in _read_manifest())
    raise KeyError(f"Unknown dataset {slug!r}. Bundled: {known}.")


def _single_array(path: Path) -> np.ndarray:
    """The one data variable in a ``.mat`` file, MATLAB's own keys ignored."""
    contents = loadmat(path)
    keys = [k for k in contents if not k.startswith("__")]
    if len(keys) != 1:
        raise ValueError(f"{path.name} holds {len(keys)} variables ({keys}); expected exactly one.")
    return np.asarray(contents[keys[0]])


def _orient(features: np.ndarray, n_samples: int, source: str) -> np.ndarray:
    """Put the sample axis first, refusing to guess when both axes could be it."""
    rows, cols = features.shape
    if rows == n_samples and cols == n_samples:
        raise ValueError(
            f"{source} is square ({rows}x{cols}) and has as many rows as labels, "
            "so the sample axis cannot be resolved from the shapes alone."
        )
    if rows == n_samples:
        return features
    if cols == n_samples:
        return features.T
    raise ValueError(
        f"{source} has shape {features.shape}, and neither axis matches the "
        f"{n_samples} labels."
    )


def load(slug: str, normalise: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """Load one benchmark as ``(features, labels)``.

    ``features`` is ``(n_samples, n_features)`` and ``labels`` is ``(n_samples,)``.
    Min-max normalisation is applied by default because every caller in this
    repository wants it — the kernel bandwidth is shared across datasets whose
    raw scales differ by orders of magnitude — and because leaving it to the
    caller is how it gets forgotten in one place and not another.
    """
    info = describe(slug)
    for path in (info.data_path, info.label_path):
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing; see datasets/README.md.")

    labels = _single_array(info.label_path).ravel()
    features = _orient(_single_array(info.data_path), labels.size, info.data_file)
    features = features.astype(float, copy=True)

    if features.shape[1] != info.features:
        raise ValueError(
            f"{info.data_file} has {features.shape[1]} features; the manifest says "
            f"{info.features}."
        )

    if normalise:
        features = min_max_normalize(features)
    return features, labels


def load_stacked(slug: str, normalise: bool = True) -> tuple[np.ndarray, int]:
    """The same data in the layout ``CED_FS`` takes: features with the label column
    appended, and the feature count to pass as ``d``."""
    features, labels = load(slug, normalise=normalise)
    stacked = np.hstack([features, labels.reshape(-1, 1).astype(float)])
    return stacked, features.shape[1]
