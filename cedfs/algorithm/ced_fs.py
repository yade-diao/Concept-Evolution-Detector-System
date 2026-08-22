"""
ced_fs.py – Main Concept Evolution Detection with Feature Selection (CED-FS)
algorithm.

Overview
--------
The algorithm processes a high-dimensional data stream through a sliding window.
For each consecutive pair of windows it computes a cluster-similarity matrix and
classifies concept evolution events into four categories:

* **Emerging concept** – a new cluster in the current window has no match in the
  previous window (similarity < threshold).
* **Concept drift**    – a cluster has evolved but is still recognisable
  (``threshold ≤ similarity < 1``).
* **Concept forgetting** – a cluster from the previous window has disappeared.
* **No evolution**       – clusters remain identical (similarity == 1).

Usage
-----
>>> from cedfs import CED_FS
>>> ri, events, cluster_nums, image_files = CED_FS(X, d=100, winsize=50)
"""

import logging
import os
import uuid

import numpy as np

from cedfs.algorithm.k_r_dpc import k_r_dpc
from cedfs.utils.similarity import cluster_similarity_matrix
from cedfs.utils.visualization import save_bipartite_graph
from cedfs.metrics.rand_index import rand_index

logger = logging.getLogger(__name__)

# Default algorithm parameters
_DEFAULT_PARAMS = {
    "kernelType": 1,
    "sigma": 6.0,
    "p": 0.05,
    "similarityThreshold": 0.5,
}


def CED_FS(
    X: np.ndarray,
    d: int,
    winsize: int,
    algorithm_params: dict = None,
    image_dir: str = None,
    progress_callback=None,
):
    """Run the CED-FS algorithm on a labelled data stream.

    Parameters
    ----------
    X : np.ndarray, shape (n_samples, d + 1)
        Data matrix where the first *d* columns are features and the last
        column contains integer class labels.
    d : int
        Number of feature dimensions (columns) in *X*.
    winsize : int
        Sliding-window size (number of feature columns per window).
    algorithm_params : dict, optional
        Override any of the default algorithm parameters:

        * ``kernelType``          (int,   default 1)   – kernel function code.
        * ``sigma``               (float, default 6.0) – kernel bandwidth.
        * ``p``                   (float, default 0.05) – KNN fraction.
        * ``similarityThreshold`` (float, default 0.5) – concept-drift threshold τ.

    image_dir : str, optional
        Directory where similarity-graph PNG files are saved.  When *None*,
        images are written to ``"static/images"`` (Flask integration default).
    progress_callback : callable, optional
        Called after each window as ``progress_callback(window_num, total_windows)``
        so callers can track real-time progress.

    Returns
    -------
    ri : float
        Best (maximum) Rand Index achieved across all windows.
    events : dict
        Dictionary with lists of per-window counts for each event type:
        ``"emerging"``, ``"drift"``, ``"forgetting"``, ``"stable"``.
    cluster_nums : list of int
        Number of clusters found in each window.
    image_files : list of str
        Filenames of the generated similarity-graph images.
    """
    # Resolve parameters
    params = {**_DEFAULT_PARAMS, **(algorithm_params or {})}
    tau = float(params["similarityThreshold"])
    kernel_type = int(params["kernelType"])
    sigma = float(params["sigma"])
    p = float(params["p"])

    if image_dir is None:
        image_dir = "static/images"
    os.makedirs(image_dir, exist_ok=True)

    label = X[:, d]
    # Windows segment the stream, so they are counted over samples (rows). This
    # once read X.shape[1] — the feature count — and sliced columns below, which
    # made a "window" a subset of the features shared by every sample rather than
    # a stretch of the stream. On a 100-feature set with winsize=50 that gave two
    # windows and plausible-looking output, so the substitution was invisible; on
    # a stream whose feature count is below the window size it gave zero windows
    # and an empty result.
    n_samples = X.shape[0]
    n_windows = max(1, n_samples // winsize)
    remainder = n_samples % winsize

    ri_values: list[float] = []
    cluster_nums: list[int] = []
    image_files: list[str] = []

    events = {
        "emerging":   [],
        "drift":      [],
        "forgetting": [],
        "stable":     [],
    }

    past_cluster = past_k = None

    for i in range(1, n_windows + 1):
        start = (i - 1) * winsize
        # A trailing part-window is folded into the last one when it is at least
        # half a window, and dropped when it is not: too few samples cluster into
        # noise, and the events read off that clustering are noise too.
        if i == n_windows and remainder >= winsize / 2:
            end = n_samples
        else:
            end = i * winsize

        # Features only. The label column is X[:, d], and a column-sliced window
        # whose range reached it handed the labels to the clustering as a feature.
        window = X[start:end, :d]
        window_label = label[start:end]

        current_cluster, _, current_k = k_r_dpc(
            window,
            image_dir=None,          # decision graphs are optional; skip here
            kernel_type=kernel_type,
            sigma=sigma,
            p=p,
        )
        cluster_nums.append(current_k)

        if past_cluster is not None:
            # Compute similarity matrix S[past_k × current_k]
            S = cluster_similarity_matrix(past_cluster, past_k,
                                          current_cluster, current_k)

            # Save bipartite-graph image
            img_fname = f"{uuid.uuid4().hex[:12]}.png"
            save_bipartite_graph(S, os.path.join(image_dir, img_fname))
            image_files.append(img_fname)

            # Classify events from rows (past → current)
            n_emerging = n_drift = n_forget = n_stable = 0
            for row in range(S.shape[0]):
                max_sim = float(S[row].max())
                if max_sim == 1.0:
                    n_stable += 1
                elif tau <= max_sim < 1.0:
                    n_drift += 1
                else:
                    n_forget += 1

            # Emerging: current clusters with no match in past
            for col in range(S.shape[1]):
                if float(S[:, col].max()) < tau:
                    n_emerging += 1

            events["emerging"].append(n_emerging)
            events["drift"].append(n_drift)
            events["forgetting"].append(n_forget)
            events["stable"].append(n_stable)

            logger.debug(
                "Window %d/%d  k=%d  emerging=%d  drift=%d  forget=%d  stable=%d",
                i, n_windows, current_k,
                n_emerging, n_drift, n_forget, n_stable,
            )

        # Against this window's labels. Comparing the window's clustering with
        # every label in the stream compared two vectors that were only the same
        # length because the window was a column slice.
        ri = rand_index(current_cluster, window_label)
        ri_values.append(ri)

        past_cluster = current_cluster
        past_k = current_k

        if progress_callback is not None:
            progress_callback(i, n_windows)

    best_ri = max(ri_values) if ri_values else 0.0
    logger.info("CED-FS completed. Best RI=%.4f over %d windows.", best_ri, n_windows)
    return best_ri, events, cluster_nums, image_files
