"""
k_pca.py – Kernel Principal Component Analysis (K-PCA) for dimensionality
reduction.

The implementation follows the standard K-PCA algorithm:
1. Build the kernel (Gram) matrix using any supported kernel function.
2. Center the kernel matrix in feature space.
3. Solve the eigenvalue problem and project data onto the top eigenvectors.
"""

import numpy as np
from cedfs.algorithm.kernel import k_kernel


def k_pca(
    data: np.ndarray,
    sigma: float,
    kernel_choice: int,
    target_dim: int,
) -> np.ndarray:
    """Apply Kernel PCA to *data* and return the low-dimensional representation.

    Parameters
    ----------
    data : np.ndarray, shape (n, d)
        Input data matrix (*n* samples, *d* features).
    sigma : float
        Kernel bandwidth parameter (or polynomial degree for kernel 2).
    kernel_choice : int
        Kernel type (1–5).  See :mod:`cedfs.algorithm.kernel`.
    target_dim : int
        Number of principal components to keep.

    Returns
    -------
    transformed : np.ndarray, shape (n, target_dim)
        Data projected onto the top *target_dim* kernel principal components.
        Always real-valued.
    """
    n, d = data.shape

    if target_dim > d:
        import warnings
        warnings.warn(
            "target_dim exceeds the feature count; no dimensionality reduction occurs.",
            UserWarning,
        )

    # Build the kernel (Gram) matrix
    K = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            K[i, j] = k_kernel(data[i], data[j], kernel_choice, sigma)

    # Center the kernel matrix in the implicit feature space
    ones = np.ones((n, n)) / n
    K_centered = K - ones @ K - K @ ones + ones @ K @ ones

    # Eigendecomposition (symmetric matrix → use eigh for numerical stability)
    eigenvalues, eigenvectors = np.linalg.eigh(K_centered)

    # Sort by descending eigenvalue
    order = np.argsort(eigenvalues)[::-1]
    eigenvectors = eigenvectors[:, order]

    # Normalize eigenvectors
    norms = np.sqrt(np.sum(np.abs(eigenvectors) ** 2, axis=0))
    eigenvectors = eigenvectors / norms[np.newaxis, :]

    # Project onto top components
    V = eigenvectors[:, :target_dim]
    transformed = K_centered @ V

    # Guarantee real output
    if np.iscomplexobj(transformed):
        transformed = np.real(transformed)

    return transformed
