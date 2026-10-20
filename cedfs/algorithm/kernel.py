"""
kernel.py – Kernel function implementations used by K-PCA.

Supported kernels
-----------------
1 – Gaussian (RBF)
2 – Polynomial
3 – Linear
4 – Exponential
5 – Laplacian
"""

import numpy as np

# Mapping from integer code to human-readable name
KERNEL_NAMES = {
    1: "Gaussian",
    2: "Polynomial",
    3: "Linear",
    4: "Exponential",
    5: "Laplacian",
}


def k_kernel(x: np.ndarray, y: np.ndarray, kernel_choice: int, sigma: float) -> float:
    """Compute the kernel value between two vectors.

    Parameters
    ----------
    x : np.ndarray
        First input vector (1-D).
    y : np.ndarray
        Second input vector (1-D, same length as *x*).
    kernel_choice : int
        Kernel type identifier (1–5).  See module docstring.
    sigma : float
        Kernel bandwidth / polynomial degree parameter.

    Returns
    -------
    float
        Scalar kernel evaluation k(x, y).

    Raises
    ------
    ValueError
        If inputs are not NumPy arrays, have mismatched lengths, or an
        invalid *kernel_choice* is supplied.
    """
    if not (isinstance(x, np.ndarray) and isinstance(y, np.ndarray)):
        raise ValueError("Both inputs must be NumPy arrays.")
    if x.shape[0] != y.shape[0]:
        raise ValueError(
            f"Vector length mismatch: {x.shape[0]} vs {y.shape[0]}."
        )

    x = x.reshape(-1, 1)
    y = y.reshape(-1, 1)

    if kernel_choice == 1:  # Gaussian (RBF)
        return float(np.exp(-np.linalg.norm(x - y) ** 2 / (2 * sigma ** 2)))
    elif kernel_choice == 2:  # Polynomial
        return float(((x.T @ y).item() + 1) ** sigma)
    elif kernel_choice == 3:  # Linear
        return float((x.T @ y).item())
    elif kernel_choice == 4:  # Exponential
        return float(np.exp(-np.linalg.norm(x - y) / (2 * sigma ** 2)))
    elif kernel_choice == 5:  # Laplacian
        return float(np.exp(-np.linalg.norm(x - y) / sigma))
    else:
        raise ValueError(
            f"kernel_choice must be an integer from 1 to 5, got {kernel_choice}."
        )


def kernel_matrix(data: np.ndarray, kernel_choice: int, sigma: float) -> np.ndarray:
    """K[i, j] = k_kernel(data[i], data[j]) for all pairs, computed at once.

    The same five kernels as `k_kernel`, which is kept as the definition and
    for the tests that hold the two together; this is what the algorithm calls,
    because n^2 Python-level calls were most of its running time.
    """
    from scipy.spatial.distance import cdist

    data = np.asarray(data, dtype=float)
    if kernel_choice == 1:
        return np.exp(-cdist(data, data, "sqeuclidean") / (2 * sigma ** 2))
    if kernel_choice == 2:
        return (data @ data.T + 1) ** sigma
    if kernel_choice == 3:
        return data @ data.T
    if kernel_choice == 4:
        return np.exp(-cdist(data, data) / (2 * sigma ** 2))
    if kernel_choice == 5:
        return np.exp(-cdist(data, data) / sigma)
    raise ValueError(f"kernel_choice must be an integer from 1 to 5, got {kernel_choice}.")
