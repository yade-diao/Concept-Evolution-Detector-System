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
    target_dim: int, scaling: str = "eigenvalue") -> np.ndarray:
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
    if scaling == "eigenvalue":
        # K_c v = lambda v: each axis weighted by its eigenvalue. This is what
        # the MATLAB original does (k_pca.m, Y = kI * X_KPCA) and the default.
        transformed = K_centered @ V
    elif scaling == "sqrt":
        # The textbook projection (Schoelkopf et al. 1998): sqrt(lambda) v.
        # An eigenvalue grows with the size of the group its axis separates,
        # so eigenvalue weighting shrinks the axes of small groups twice over.
        lam = np.clip(eigenvalues[order][:target_dim].real, 0.0, None)
        transformed = V * np.sqrt(lam)[np.newaxis, :]
    else:
        raise ValueError(f"scaling must be 'eigenvalue' or 'sqrt', not {scaling!r}")

    # Guarantee real output
    if np.iscomplexobj(transformed):
        transformed = np.real(transformed)

    return transformed
