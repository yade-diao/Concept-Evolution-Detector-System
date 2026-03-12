"""
CED-FS: Concept Evolution Detection with Feature Selection

A Python library for detecting concept evolution in high-dimensional data streams
using kernel-based density peak clustering (K-r-DPC).
"""

from cedfs.algorithm.ced_fs import CED_FS
from cedfs.algorithm.k_r_dpc import k_r_dpc

__version__ = "1.0.0"
__author__ = "CED-FS Contributors"

__all__ = ["CED_FS", "k_r_dpc"]
