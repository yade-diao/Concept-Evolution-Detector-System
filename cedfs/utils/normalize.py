"""
normalize.py – Feature-space normalization utilities.
"""

import numpy as np


def min_max_normalize(data: np.ndarray) -> np.ndarray:
    """Apply column-wise Min-Max normalization to *data*.

    Each feature (column) is linearly scaled so that its minimum becomes 0 and
    its maximum becomes 1.

    Parameters
    ----------
    data : np.ndarray, shape (n, d)
        Input data matrix; modified **in-place** and also returned.

    Returns
    -------
    np.ndarray
        Normalized data matrix with values in [0, 1].

    Notes
    -----
    Constant columns (where min == max) are left unchanged to avoid
    division by zero.
    """
    col_min = data.min(axis=0)
    col_max = data.max(axis=0)
    denom = col_max - col_min

    # Avoid division by zero for constant columns
    denom = np.where(denom == 0, 1.0, denom)

    return (data - col_min) / denom
