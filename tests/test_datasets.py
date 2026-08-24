"""
The bundled benchmarks load as the manifest says they do.

These are cheap consistency checks rather than a test of the science: if the
manifest and the files disagree, every number produced from them is measured
against the wrong description.
"""

import numpy as np
import pytest

from cedfs import datasets


def test_every_manifest_entry_has_its_files():
    for info in datasets.available():
        assert info.data_path.exists(), info.data_file
        assert info.label_path.exists(), info.label_file


def test_the_manifest_describes_what_loads():
    """Shape and class count, for the two smallest sets — enough to catch a
    manifest that has drifted from the files without reading 22 MB of matrices."""
    for slug in ("glioma", "mll"):
        info = datasets.describe(slug)
        features, labels = datasets.load(slug)
        assert features.shape == (info.samples, info.features)
        assert labels.shape == (info.samples,)
        assert len(set(labels.tolist())) == info.classes


def test_normalisation_is_on_by_default_and_can_be_turned_off():
    scaled, _ = datasets.load("glioma")
    assert scaled.min() >= 0.0 and scaled.max() <= 1.0

    raw, _ = datasets.load("glioma", normalise=False)
    assert raw.max() > 1.0


def test_stacked_is_the_layout_ced_fs_takes():
    stacked, d = datasets.load_stacked("glioma")
    features, labels = datasets.load("glioma")
    assert stacked.shape == (features.shape[0], d + 1)
    assert np.array_equal(stacked[:, d], labels.astype(float))


def test_an_unknown_slug_names_the_ones_that_exist():
    with pytest.raises(KeyError, match="glioma"):
        datasets.describe("not-a-dataset")


def test_a_transposed_matrix_is_turned_the_right_way_round():
    """The failure this prevents is silent: a transposed benchmark clusters
    features as though they were samples and still returns a number."""
    upright = datasets._orient(np.zeros((50, 4434)), 50, "test")
    assert upright.shape == (50, 4434)
    turned = datasets._orient(np.zeros((4434, 50)), 50, "test")
    assert turned.shape == (50, 4434)


def test_an_axis_that_matches_nothing_is_refused_rather_than_guessed():
    with pytest.raises(ValueError, match="neither axis"):
        datasets._orient(np.zeros((7, 9)), 50, "test")
