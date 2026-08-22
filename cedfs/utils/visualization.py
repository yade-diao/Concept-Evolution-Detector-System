"""
visualization.py – Bipartite graph visualization of cluster similarity matrices.

The graph draws clusters from the previous window on the left and clusters from
the current window on the right.  An edge is drawn between past cluster C_i and
current cluster C_j if their similarity is at least the concept-drift threshold
τ (0.5 by default).

Edge color convention
---------------------
* Black  – concept drift  (τ ≤ similarity < 1)
* Red    – no evolution   (similarity == 1)
"""

import numpy as np

# The object API, not pyplot, and the raster canvas explicitly.
#
# Two reasons, both found by running this from a server rather than a script.
# pyplot picks an interactive backend whenever a display is reachable — TkAgg on
# a developer machine — and Tk may only be driven from the main thread: rendering
# from the worker that runs the analysis does not raise, it dumps core and takes
# the process with it. And pyplot keeps a process-wide figure registry plus a
# shared text-parsing cache, so two analyses rendering at once corrupt each
# other; that surfaced as a mathtext parse error on a label that is fine.
#
# Constructing Figure directly touches neither. A figure written to a file needs
# no GUI toolkit and no global registry.
import matplotlib

matplotlib.use("Agg")   # before anything can resolve a default backend

from matplotlib.backends.backend_agg import FigureCanvasAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402


def save_bipartite_graph(
    S: np.ndarray,
    filepath: str,
    drift_threshold: float = 0.5,
) -> None:
    """Render and save a bipartite graph for the similarity matrix *S*.

    Parameters
    ----------
    S : np.ndarray, shape (M, N)
        Cluster similarity matrix (M past clusters × N current clusters).
    filepath : str
        Absolute path where the PNG file will be written.
    drift_threshold : float
        Minimum similarity value τ for which an edge is drawn.
        Default: 0.5.
    """
    S = np.asarray(S)
    M, N = S.shape
    fig = Figure(figsize=(8, 6))
    FigureCanvasAgg(fig)
    ax = fig.subplots()
    span = max(M, N) - 1

    ax.set_xlim(-0.3, 1.3)
    ax.set_ylim(-max(M, N), 1)
    ax.axis("off")

    # Draw edges
    for i in range(M):
        max_val = float(S[i].max())
        for j in np.where(S[i] == max_val)[0]:
            if max_val == 1.0:
                color = "red"
            elif drift_threshold <= max_val < 1.0:
                color = "black"
            else:
                continue
            y_i = -i * span / max(M - 1, 1) if M > 1 else 0
            y_j = -j * span / max(N - 1, 1) if N > 1 else 0
            ax.plot([0, 1], [y_i, y_j], color=color, linewidth=1.8)

    # Node positions
    ys_left  = np.linspace(0, -span, M) if M > 1 else [0]
    ys_right = np.linspace(0, -span, N) if N > 1 else [0]

    ax.scatter([0] * M, ys_left,  s=50, color=(0.85, 0.33, 0.10), zorder=3)
    ax.scatter([1] * N, ys_right, s=50, color=(0.00, 0.45, 0.74), zorder=3)

    # Plain text, not mathtext. "$C^{t-1}_1$" reads better on paper, but
    # rendering it goes through matplotlib's mathtext parser, which keeps parser
    # state in module globals and is not thread-safe in any released version
    # — checked on 3.6.3 and on 3.11.1, both of which fail every render when
    # eight run at once. A label on a node does not need a maths renderer, so the
    # dependency is removed rather than serialised behind a lock.
    for i, y in enumerate(ys_left):
        ax.text(-0.05, y, f"C{i + 1} (t-1)", ha="right", va="center", fontsize=9)
    for j, y in enumerate(ys_right):
        ax.text(1.05, y, f"C{j + 1} (t)", ha="left", va="center", fontsize=9)

    ax.set_title("Cluster Similarity Graph", fontsize=12)
    fig.tight_layout()
    fig.savefig(filepath, dpi=100, bbox_inches="tight")
    fig.clf()
