"""
setup.py – Packaging configuration for concept-evolution-detector.

Install in development mode with:
    pip install -e .
"""

from setuptools import setup, find_packages

setup(
    name="concept-evolution-detector",
    version="1.0.0",
    description=(
        "CED-FS: Concept Evolution Detection with Feature Selection "
        "for high-dimensional data streams."
    ),
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    python_requires=">=3.9",
    packages=find_packages(exclude=["web", "tests*"]),
    install_requires=[
        "numpy>=1.24",
        "scipy>=1.10",
        "scikit-learn>=1.3",
        "matplotlib>=3.7",
        "flask>=3.0",
        "flask-cors>=4.0",
    ],
    extras_require={
        "dev": ["pytest", "black", "ruff"],
    },
    entry_points={
        "console_scripts": [
            "cedfs=experiments.run_experiment:main",
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
)
