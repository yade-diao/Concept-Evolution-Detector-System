# Concept Evolution Detector (CED-FS)

[![Python 3.9+](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Overview

CED-FS (Concept Evolution Detection with Feature Selection) detects and classifies
concept evolution events in high-dimensional data streams.

Given a stream of data segmented by a sliding window, the algorithm identifies how
clusters evolve between windows and labels each transition as one of four event types:

| Event       | Description                                            |
|-------------|--------------------------------------------------------|
| Emerging    | New concept appears (no match in previous window)      |
| Drift       | Concept evolves but remains recognisable               |
| Forgetting  | Past concept disappears                                |
| Stable      | Concept unchanged                                      |

A **Flask + Vue 3 web dashboard** is included for interactive data upload,
parameter tuning, and result visualisation.

---

## Algorithm

### Pipeline

    Input data stream
          |
          v
    Sliding window segmentation
          |
          v
    K-r-DPC clustering (per window)
      +-- K-PCA       : dimensionality reduction via kernel feature space
      +-- KNN / rKNN  : k-nearest neighbours + reverse-KNN graph
      +-- Density Peak: auto-detects cluster count from rho and delta
          |
          v
    Dice similarity matrix (between consecutive windows)
          |
          v
    Event classification -> Emerging / Drift / Forgetting / Stable
          |
          v
    Evaluation: Rand Index, NMI

### K-r-DPC (Kernel Reverse-KNN Density Peak Clustering)

1. **K-PCA** maps samples into a low-dimensional kernel feature space.
2. **KNN graph** is built using a KD-tree (`k = ceil(p * n)`).
3. **rKNN density** `rho_i` is estimated via Gaussian kernel over reverse-KNN distances.
4. **Decision distance** `delta_i` = minimum distance to any point with higher density.
5. **Cluster centres** are points with simultaneously high `rho` and `delta` (adaptive percentile thresholds).
6. **Assignment** propagates labels from centres following the density gradient.

### Supported Kernel Functions

| Code | Kernel         | Formula                                        | Note                          |
|------|----------------|------------------------------------------------|-------------------------------|
| 1    | Gaussian (RBF) | exp( -\|\|x-y\|\|^2 / (2 * sigma^2) )         | Squared distance, fast decay  |
| 2    | Polynomial     | ( x^T * y + 1 )^sigma                          | Captures feature interactions |
| 3    | Linear         | x^T * y                                        | No kernel trick               |
| 4    | Exponential    | exp( -\|\|x-y\|\|   / (2 * sigma^2) )         | Distance (not squared)        |
| 5    | Laplacian      | exp( -\|\|x-y\|\|   / sigma )                 | Slower decay than Gaussian    |

Where `||x-y||` is the Euclidean distance between two samples, and `sigma` controls
how quickly similarity decays with distance.

---

## Running it

```bash
pip install -r requirements.txt
python -m experiments.synthetic_drift          # the run reported below
python -m pytest tests/ -q                     # metrics vs scikit-learn
```

The `.mat` datasets the algorithm was developed against are not in the
repository, so the reported run uses a stream this repository builds: five
windows in which concepts are placed, moved and removed on purpose, so the
answer is known by construction rather than by inspection.

    window 1   A  B          two concepts
    window 2   A  B          unchanged        -> stable
    window 3   A  B  C       C appears        -> emerging
    window 4   A  B' C       B moves partway  -> drift
    window 5   A     C       B is gone        -> forgetting

## Results

`python -m experiments.synthetic_drift` — 300 samples, 8 features, winsize 60,
seed 7, Gaussian kernel, sigma 6.0, p 0.15:

| window | concepts placed | clusters found |
|--------|-----------------|----------------|
| 1 | 2 | 2 |
| 2 | 2 | 2 |
| 3 | 3 | 3 |
| 4 | 3 | 3 |
| 5 | 2 | 2 |

**Cluster count recovered in 5/5 windows. Rand Index 1.0000** against the placed
labels.

Events, per window boundary:

| boundary | by construction | detected |
|----------|-----------------|----------|
| 1 → 2 | stable | stable × 2 |
| 2 → 3 | emerging | **emerging × 1**, drift × 2 |
| 3 → 4 | drift | stable × 3 |
| 4 → 5 | forgetting | **forgetting × 1**, drift × 2 |

Three of the four boundaries are recovered. The fourth is a limitation of the
method rather than a tuning problem, and is worth stating plainly.

### Known limitation: drift and stability are told apart by sample position

Emerging and forgetting are read off the *shape* of the similarity matrix — a
column with no match above the threshold is a new concept, a row with none is a
lost one — and that works.

Telling **drift** from **stable** needs the similarity value itself, and the
Dice coefficient here is computed over sample *indices*:

    S[i, j] = 2 |C_i^{t-1} ∩ C_j^t| / (|C_i^{t-1}| + |C_j^t|)

Windows are disjoint (stride equals window size), so no sample is ever in two of
them, and index i in one window and index i in the next refer to different
points. Two windows whose clusters occupy the same positions therefore score 1.0
however far the concept has moved in feature space — which is what happens at
boundary 3 → 4 above, where cluster B's centre moves from 4.0 to 6.0 and the
boundary is still reported as stable.

Measuring similarity between windows by cluster content — centroid distance, or
distribution overlap — rather than by index would resolve it. That is a change
to the method, not a fix to the code, so it is recorded here rather than made.

---

## Project Structure

    concept-evolution-detector/
    |
    +-- cedfs/                        # Core Python package
    |   +-- algorithm/
    |   |   +-- ced_fs.py             # Main CED-FS algorithm (sliding window + event classification)
    |   |   +-- k_r_dpc.py            # K-r-DPC clustering
    |   |   +-- k_pca.py              # Kernel PCA (dimensionality reduction)
    |   |   +-- kernel.py             # 5 kernel functions
    |   |   +-- knn.py                # KNN + reverse-KNN search
    |   |   \-- density.py            # rKNN density estimation
    |   +-- metrics/
    |   |   +-- rand_index.py         # Rand Index
    |   |   +-- nmi.py                # Normalised Mutual Information
    |   |   \-- performance.py        # NMI from cluster sets
    |   \-- utils/
    |       +-- normalize.py          # Min-Max normalisation
    |       +-- similarity.py         # Dice similarity matrix
    |       \-- visualization.py      # Bipartite graph renderer
    |
    +-- web/                          # Flask web application
    |   +-- app.py                    # REST API + SPA host
    |   \-- static/
    |       +-- dist/                 # Vue production build output
    |       \-- images/               # Runtime-generated PNG plots
    |
    +-- frontend/                     # Vue 3 + Vite source
    |   +-- src/
    |   |   +-- views/                # HomeView, ParametersView, VisualizationView, HelpView
    |   |   +-- components/           # AppSidebar
    |   |   \-- router/               # Client-side routing
    |   \-- vite.config.js
    |
    +-- experiments/
    |   \-- run_experiment.py         # CLI experiment runner
    |
    +-- datasets/
    |   \-- README.md                 # Dataset download instructions
    |
    +-- Dockerfile                    # Multi-stage build (Node -> Python -> runtime)
    +-- docker-compose.yml
    \-- requirements.txt

> Dataset `.mat` files are not included. See [datasets/README.md](datasets/README.md).

---

## License

[MIT](LICENSE)