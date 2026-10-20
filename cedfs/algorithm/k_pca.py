"""
k_pca.py – Kernel Principal Component Analysis (K-PCA) for dimensionality
reduction.

The implementation follows the standard K-PCA algorithm:
1. Build the kernel (Gram) matrix using any supported kernel function.
2. Center the kernel matrix in feature space.
3. Solve the eigenvalue problem and project data onto the top eigenvectors.
"""

import numpy as np
from cedfs.algorithm.kernel import kernel_matrix


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
    K = kernel_matrix(data, kernel_choice, sigma)

    # Center the kernel matrix in the implicit feature space
    # Double centring, K - 1K - K1 + 1K1 with 1 the averaging matrix, written as
    # row and column means: the same matrix without three n x n products.
    K_centered = K - K.mean(0, keepdims=True) - K.mean(1, keepdims=True) + K.mean()

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


def landmark_indices(n: int, m: int, seed: int = 0) -> np.ndarray:
    """m of range(n) without replacement, sorted - the same m in Python and TypeScript.

    NumPy's generator cannot be reproduced in the browser, so the landmarks
    are drawn with mulberry32 (a 32-bit generator that is a few lines in any
    language) driving a partial Fisher-Yates shuffle. The index drawn at step
    i is i + floor(x (n - i) / 2^32) for a 32-bit x: an integer below 2^53
    while n < 2^21, so a double computes it exactly and both ports agree bit
    for bit (frontend/src/cedfs/kpca.ts, `landmarkIndices`).
    """
    m = min(int(m), n)
    mask = 0xFFFFFFFF
    state = seed & mask
    perm = list(range(n))
    for i in range(m):
        state = (state + 0x6D2B79F5) & mask
        t = ((state ^ (state >> 15)) * (state | 1)) & mask
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & mask)) & mask) ^ t
        x = (t ^ (t >> 14)) & mask
        j = i + ((x * (n - i)) >> 32)
        perm[i], perm[j] = perm[j], perm[i]
    return np.sort(np.asarray(perm[:m], dtype=int))


def k_pca_nystrom(data: np.ndarray, sigma: float, kernel_choice: int, target_dim: int,
                  landmarks: int = 500, seed: int = 0) -> np.ndarray:
    """`k_pca` through a Nystrom approximation of the kernel, for large n.

    Williams & Seeger, "Using the Nystrom method to speed up kernel machines",
    NIPS 2001: with m landmark points chosen at random, K is approximated by
    K_nm K_mm^-1 K_mn = F F^T with F = K_nm U_m Lambda_m^(-1/2). Centring F's
    columns centres the approximate kernel, and the eigenpairs of F F^T come
    from the SVD of the n x m matrix F, at O(n m^2) instead of O(n^3). The
    projection keeps the original's eigenvalue weighting: the scores are
    lambda v = U s^2, as `K_c @ V` is in `k_pca`. At most m components exist,
    so target_dim is capped at m. With m >= n this is `k_pca` up to rounding.
    """
    from cedfs.algorithm.kernel import kernel_matrix
    from scipy.spatial.distance import cdist

    data = np.asarray(data, dtype=float)
    n = data.shape[0]
    idx = landmark_indices(n, landmarks, seed)
    k_mm = kernel_matrix(data[idx], kernel_choice, sigma)
    if kernel_choice == 1:
        k_nm = np.exp(-cdist(data, data[idx], "sqeuclidean") / (2 * sigma ** 2))
    elif kernel_choice == 4:
        k_nm = np.exp(-cdist(data, data[idx]) / (2 * sigma ** 2))
    elif kernel_choice == 5:
        k_nm = np.exp(-cdist(data, data[idx]) / sigma)
    elif kernel_choice == 2:
        k_nm = (data @ data[idx].T + 1) ** sigma
    else:
        k_nm = data @ data[idx].T
    lam, u = np.linalg.eigh(k_mm)
    keep = lam > lam.max() * 1e-10
    f = k_nm @ (u[:, keep] / np.sqrt(lam[keep]))
    f -= f.mean(0)
    left, sv, _ = np.linalg.svd(f, full_matrices=False)
    dim = min(int(target_dim), sv.size)
    return left[:, :dim] * (sv[:dim] ** 2)
