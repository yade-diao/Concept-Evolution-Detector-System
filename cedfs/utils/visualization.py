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
import matplotlib.pyplot as plt


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
    fig, ax = plt.subplots(figsize=(8, 6))
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

    for i, y in enumerate(ys_left):
        ax.text(-0.05, y, f"$C^{{t-1}}_{{{i+1}}}$", ha="right", va="center", fontsize=9)
    for j, y in enumerate(ys_right):
        ax.text(1.05, y, f"$C^{{t}}_{{{j+1}}}$",   ha="left",  va="center", fontsize=9)

    ax.set_title("Cluster Similarity Graph", fontsize=12)
    fig.tight_layout()
    fig.savefig(filepath, dpi=100, bbox_inches="tight")
    plt.close(fig)
