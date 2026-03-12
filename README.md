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