"""
Record what the Python reference answers on the bundled benchmarks, so the
browser port can be held to it.

The algorithm exists twice: once in ``cedfs/``, which the experiments and the
paper's numbers come from, and once in TypeScript, which is what actually runs
when someone uses the tool. Two implementations of one method drift, and the way
they drift is silent — both return a plausible number of clusters and nobody is
told which one is right.

**Only answers are written here, never inputs.** Both sides read the same
``.mat`` files, so the port is asked exactly the question the reference answered.
An earlier version of this script serialised its inputs at ten decimal places
and computed the expected values from the full-precision originals; the gap was
1e-10 in the inputs, the polynomial kernel raised it to the sigma, and no correct
port could have closed it. Inputs live in ``datasets/bundled``; this file holds
numbers the port has to reproduce.

Regenerate deliberately, never to make a failing test pass::

    python -m tests.generate_reference_answers

A diff here is a change in the method. A test failing against an unchanged file
is a bug in the port.
"""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

import numpy as np

from cedfs import CED_FS
from cedfs.algorithm.k_pca import k_pca
from cedfs.algorithm.kernel import k_kernel
from cedfs.datasets import available, load
from cedfs.metrics.rand_index import rand_index
from cedfs.utils.similarity import cluster_similarity_matrix

OUT = Path(__file__).resolve().parent.parent / "frontend" / "tests" / "reference"

PARAMETERS = {"kernelType": 1, "sigma": 6.0, "p": 0.05,
              "windowSize": 50, "similarityThreshold": 0.5}

#: Enough of each stream to exercise the port on real data without turning the
#: test suite into a benchmark run. Four windows means three boundaries, so
#: every event type still has a chance to appear.
WINDOWS = 4

#: gisette is 1 000 samples, and the port's eigendecomposition is a Jacobi sweep
#: over an n x n matrix — a minute per window in the browser against nine seconds
#: in NumPy. It is recorded so it can be checked deliberately, and the test that
#: reads it is opt-in.
SLOW = {"gisette"}


def _round(values, places=10):
    array = np.asarray(values, dtype=float)
    return [round(float(v), places) for v in array.ravel()]


def kernel_cases() -> list[dict]:
    """Every kernel, on two rows of a real benchmark.

    Kernel 3 is linear and kernel 2 is polynomial, so vectors whose dot product
    happened to be zero would make several of the five agree by accident. Two
    rows of glioma are neither orthogonal nor equal.
    """
    features, _ = load("glioma")
    start, end = 0, 6
    x = features[0, start:end]
    y = features[1, start:end]
    return [
        {"dataset": "glioma", "rowA": 0, "rowB": 1, "columnStart": start, "columnEnd": end,
         "kernelType": k, "sigma": sigma,
         "expected": round(float(k_kernel(x, y, k, sigma)), 12)}
        for k in (1, 2, 3, 4, 5)
        for sigma in (2.0, 6.0)
    ]


def kpca_case() -> dict:
    """Distances after projection, not the projection itself.

    A sign flip per component, or a rotation inside a degenerate eigenspace, is
    free to differ between LAPACK and the port's Jacobi rotation, and neither
    changes a distance. Pinning coordinates would fail on a correct port;
    pinning distances pins what the rest of the algorithm actually reads.
    """
    features, _ = load("glioma")
    samples, start, end = 12, 0, 8
    block = np.ascontiguousarray(features[:samples, start:end])
    reduced = k_pca(block, PARAMETERS["sigma"], PARAMETERS["kernelType"], 4)
    distances = [
        float(np.linalg.norm(reduced[i] - reduced[j]))
        for i in range(reduced.shape[0])
        for j in range(i + 1, reduced.shape[0])
    ]
    return {"dataset": "glioma", "sampleLimit": samples,
            "columnStart": start, "columnEnd": end,
            "kernelType": PARAMETERS["kernelType"], "sigma": PARAMETERS["sigma"],
            "targetDim": 4, "expectedDistances": _round(distances, 8)}


def rand_index_cases() -> list[dict]:
    """Labellings are integers, so these can be written down exactly."""
    rng = np.random.default_rng(5)
    cases = []
    for size, groups in ((20, 3), (35, 5), (12, 2)):
        a = rng.integers(1, groups + 1, size=size)
        b = rng.integers(1, groups + 1, size=size)
        cases.append({"a": [int(v) for v in a], "b": [int(v) for v in b],
                      "expected": round(float(rand_index(a, b)), 12)})
    same = [1, 1, 2, 2, 3, 3]
    cases.append({"a": same, "b": list(same), "expected": 1.0})

    # A real labelling against itself shifted, which is where a Rand Index that
    # confuses "same cluster" with "same label" goes wrong.
    _, labels = load("glioma")
    rolled = np.roll(labels, 7)
    cases.append({"a": [int(v) for v in labels], "b": [int(v) for v in rolled],
                  "expected": round(float(rand_index(labels, rolled)), 12)})
    return cases


def similarity_case() -> dict:
    past = [1, 1, 1, 2, 2, 3]
    current = [1, 1, 2, 2, 2, 3]
    matrix = cluster_similarity_matrix(past, 3, current, 3)
    return {"past": past, "pastCount": 3, "current": current, "currentCount": 3,
            "expected": [[round(float(v), 12) for v in row] for row in matrix]}


def _run(slug: str, feature_limit: int, window_size: int) -> dict:
    """CED-FS over the first ``feature_limit`` columns of one benchmark.

    Truncating the stream is how a bounded run is expressed: ``CED_FS`` derives
    its window count from the feature count it is handed, so a shorter stream is
    a shorter run of exactly the same code — not a special case in the reference
    that the port would have to imitate.
    """
    features, labels = load(slug)
    block = np.ascontiguousarray(features[:, :feature_limit])
    X = np.hstack([block, labels.reshape(-1, 1).astype(float)])

    started = time.time()
    with tempfile.TemporaryDirectory() as figures:
        best_ri, events, cluster_counts, _ = CED_FS(
            X, d=block.shape[1], winsize=window_size,
            image_dir=figures, algorithm_params=PARAMETERS)
    elapsed = time.time() - started

    print(f"  {slug:9s} {block.shape[0]:5d} x {feature_limit:5d} "
          f"-> {len(cluster_counts)} windows, k={cluster_counts}, {elapsed:.1f}s")

    return {
        "slug": slug,
        "featureLimit": feature_limit,
        "windowSize": window_size,
        "slow": slug in SLOW,
        "expectedWindows": len(cluster_counts),
        "expectedClusterCounts": [int(c) for c in cluster_counts],
        "expectedEvents": {name: [int(v) for v in values] for name, values in events.items()},
        "expectedBestRandIndex": round(float(best_ri), 10),
    }


def benchmark_cases() -> list[dict]:
    window = PARAMETERS["windowSize"]
    cases = []
    for info in available():
        # gisette is recorded over fewer windows: at a minute a window in the
        # port, four would make even the opt-in run untenable.
        windows = 2 if info.slug in SLOW else WINDOWS
        cases.append(_run(info.slug, windows * window, window))

    # Two lengths that are not whole numbers of windows, because the window
    # count is a round() and Python rounds halves to even. 125 / 50 is 2.5 and
    # rounds down to 2; 175 / 50 is 3.5 and rounds up to 4, whose last window
    # then absorbs the trailing 25 columns. JavaScript's Math.round breaks both
    # halves upwards and would report 3 and 4.
    cases.append(_run("glioma", 125, window))
    cases.append(_run("glioma", 175, window))
    return cases


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print("recording reference answers")
    answers = {
        "note": "Generated by tests/generate_reference_answers.py. Do not edit by hand.",
        "parameters": PARAMETERS,
        "kernels": kernel_cases(),
        "kpca": kpca_case(),
        "randIndex": rand_index_cases(),
        "similarity": similarity_case(),
        "benchmarks": benchmark_cases(),
    }
    path = OUT / "answers.json"
    path.write_text(json.dumps(answers, indent=1), encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
