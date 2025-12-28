"""
Unit tests for the Tree Detector service.

Tests tree top detection, watershed segmentation, and tree metric extraction.
"""

from __future__ import annotations

import numpy as np
import pytest
from numpy.testing import assert_array_equal

from lidar_processing.models import (
    TreeDetectionParams,
    TreeDetectionResult,
    TreeMetrics,
)
from lidar_processing.services.tree_detector import TreeDetector


class TestTreeDetectionParams:
    """Tests for TreeDetectionParams model."""

    def test_default_values(self):
        """Test default parameter values."""
        params = TreeDetectionParams()

        assert params.min_height == 2.0
        assert params.min_distance == 3.0
        assert params.smoothing_sigma == 1.0
        assert params.resolution == 1.0

    def test_custom_values(self):
        """Test custom parameter values."""
        params = TreeDetectionParams(
            min_height=5.0,
            min_distance=4.0,
            smoothing_sigma=2.0,
            resolution=0.5,
        )

        assert params.min_height == 5.0
        assert params.min_distance == 4.0
        assert params.smoothing_sigma == 2.0
        assert params.resolution == 0.5

    def test_validation_min_height_positive(self):
        """Test that min_height must be positive."""
        with pytest.raises(ValueError):
            TreeDetectionParams(min_height=0)

        with pytest.raises(ValueError):
            TreeDetectionParams(min_height=-1)

    def test_validation_min_distance_positive(self):
        """Test that min_distance must be positive."""
        with pytest.raises(ValueError):
            TreeDetectionParams(min_distance=0)


class TestTreeDetector:
    """Tests for TreeDetector service."""

    @pytest.fixture
    def detector(self):
        """Create a tree detector instance."""
        return TreeDetector()

    @pytest.fixture
    def single_tree_chm(self):
        """Create CHM with single tree."""
        chm = np.zeros((20, 20))
        # Create a conical tree shape
        for r in range(20):
            for c in range(20):
                dist = np.sqrt((r - 10) ** 2 + (c - 10) ** 2)
                if dist < 5:
                    chm[r, c] = max(0, 15 - dist * 2)
        return chm

    @pytest.fixture
    def multiple_trees_chm(self):
        """Create CHM with multiple trees."""
        chm = np.zeros((30, 30))

        # Tree 1 at (7, 7)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 7) ** 2 + (c - 7) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 12 - dist * 2)

        # Tree 2 at (7, 22)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 7) ** 2 + (c - 22) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 15 - dist * 2)

        # Tree 3 at (22, 15)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 22) ** 2 + (c - 15) ** 2)
                if dist < 5:
                    chm[r, c] = max(chm[r, c], 18 - dist * 2)

        return chm

    def test_detector_initialization(self, detector):
        """Test detector initializes correctly."""
        assert detector.settings is not None
        assert detector.params is not None
        assert detector.ground_classifier is not None
        assert detector.height_normalizer is not None


class TestTreeTopDetection:
    """Tests for tree top detection."""

    @pytest.fixture
    def detector(self):
        """Create detector instance."""
        return TreeDetector()

    def test_find_single_tree_top(self, detector, single_tree_chm):
        """Test finding single tree top."""
        single_tree_chm = np.zeros((20, 20))
        for r in range(20):
            for c in range(20):
                dist = np.sqrt((r - 10) ** 2 + (c - 10) ** 2)
                if dist < 5:
                    single_tree_chm[r, c] = max(0, 15 - dist * 2)

        tree_tops = detector._find_tree_tops(
            single_tree_chm,
            min_height=2.0,
            min_distance=3.0,
            smoothing_sigma=1.0,
            resolution=1.0,
        )

        assert len(tree_tops) == 1
        row, col, height = tree_tops[0]
        assert abs(row - 10) <= 2
        assert abs(col - 10) <= 2
        assert height > 10

    def test_find_multiple_tree_tops(self, detector):
        """Test finding multiple tree tops."""
        chm = np.zeros((30, 30))

        # Tree 1 at (7, 7)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 7) ** 2 + (c - 7) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 12 - dist * 2)

        # Tree 2 at (7, 22)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 7) ** 2 + (c - 22) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 15 - dist * 2)

        # Tree 3 at (22, 15)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 22) ** 2 + (c - 15) ** 2)
                if dist < 5:
                    chm[r, c] = max(chm[r, c], 18 - dist * 2)

        tree_tops = detector._find_tree_tops(
            chm,
            min_height=2.0,
            min_distance=5.0,
            smoothing_sigma=0.5,
            resolution=1.0,
        )

        assert len(tree_tops) >= 2
        assert len(tree_tops) <= 4

    def test_min_height_filter(self, detector):
        """Test minimum height filtering."""
        chm = np.zeros((20, 20))

        # Short tree at (5, 5) - height 3m
        for r in range(20):
            for c in range(20):
                dist = np.sqrt((r - 5) ** 2 + (c - 5) ** 2)
                if dist < 2:
                    chm[r, c] = max(chm[r, c], 3 - dist)

        # Tall tree at (15, 15) - height 10m
        for r in range(20):
            for c in range(20):
                dist = np.sqrt((r - 15) ** 2 + (c - 15) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 10 - dist * 2)

        # With high min_height, only tall tree detected
        tree_tops = detector._find_tree_tops(
            chm,
            min_height=5.0,
            min_distance=3.0,
            smoothing_sigma=0.5,
            resolution=1.0,
        )

        assert len(tree_tops) == 1
        row, col, height = tree_tops[0]
        assert abs(row - 15) <= 2
        assert height > 5

    def test_min_distance_filter(self, detector):
        """Test minimum distance filtering."""
        chm = np.zeros((20, 20))

        # Two close trees
        for r in range(20):
            for c in range(20):
                dist1 = np.sqrt((r - 8) ** 2 + (c - 10) ** 2)
                dist2 = np.sqrt((r - 12) ** 2 + (c - 10) ** 2)
                if dist1 < 3:
                    chm[r, c] = max(chm[r, c], 10 - dist1 * 2)
                if dist2 < 3:
                    chm[r, c] = max(chm[r, c], 8 - dist2 * 2)

        # With large min_distance, only one tree detected
        tree_tops = detector._find_tree_tops(
            chm,
            min_height=2.0,
            min_distance=6.0,
            smoothing_sigma=0.5,
            resolution=1.0,
        )

        # Should prefer taller tree
        assert len(tree_tops) == 1
        assert tree_tops[0][2] >= 8

    def test_empty_chm(self, detector):
        """Test with empty CHM."""
        chm = np.zeros((20, 20))

        tree_tops = detector._find_tree_tops(
            chm,
            min_height=2.0,
            min_distance=3.0,
            smoothing_sigma=1.0,
            resolution=1.0,
        )

        assert len(tree_tops) == 0


class TestWatershedSegmentation:
    """Tests for watershed segmentation."""

    @pytest.fixture
    def detector(self):
        """Create detector instance."""
        return TreeDetector()

    def test_single_tree_segment(self, detector):
        """Test segmentation of single tree."""
        chm = np.zeros((20, 20))
        for r in range(20):
            for c in range(20):
                dist = np.sqrt((r - 10) ** 2 + (c - 10) ** 2)
                if dist < 5:
                    chm[r, c] = 10 - dist

        tree_tops = [(10, 10, 10.0)]

        segments = detector._watershed_segment(chm, tree_tops, min_height=2.0)

        assert segments.shape == (20, 20)
        # Tree crown should be labeled
        assert segments[10, 10] == 1
        # Far corners should not be labeled
        assert segments[0, 0] == 0

    def test_multiple_tree_segments(self, detector):
        """Test segmentation of multiple trees."""
        chm = np.zeros((30, 30))

        # Tree 1 at (8, 8)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 8) ** 2 + (c - 8) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 10 - dist * 2)

        # Tree 2 at (22, 22)
        for r in range(30):
            for c in range(30):
                dist = np.sqrt((r - 22) ** 2 + (c - 22) ** 2)
                if dist < 4:
                    chm[r, c] = max(chm[r, c], 12 - dist * 2)

        tree_tops = [(8, 8, 10.0), (22, 22, 12.0)]

        segments = detector._watershed_segment(chm, tree_tops, min_height=2.0)

        assert segments.shape == (30, 30)
        assert segments[8, 8] == 1
        assert segments[22, 22] == 2
        # Different labels for different trees
        assert segments[8, 8] != segments[22, 22]

    def test_no_tree_tops(self, detector):
        """Test segmentation with no tree tops."""
        chm = np.full((20, 20), 10.0)

        tree_tops = []

        segments = detector._watershed_segment(chm, tree_tops, min_height=2.0)

        assert segments.shape == (20, 20)
        assert np.all(segments == 0)


class TestTreeMetricsExtraction:
    """Tests for tree metrics extraction."""

    @pytest.fixture
    def detector(self):
        """Create detector instance."""
        return TreeDetector()

    def test_extract_single_tree_metrics(self, detector):
        """Test extracting metrics for single tree."""
        chm = np.zeros((20, 20))
        for r in range(20):
            for c in range(20):
                dist = np.sqrt((r - 10) ** 2 + (c - 10) ** 2)
                if dist < 5:
                    chm[r, c] = 15 - dist * 2

        tree_tops = [(10, 10, 15.0)]
        segments = np.zeros((20, 20), dtype=np.int32)
        for r in range(20):
            for c in range(20):
                if chm[r, c] > 0:
                    segments[r, c] = 1

        trees = detector._extract_tree_metrics(
            tree_tops, segments, chm,
            x_min=0.0, y_min=0.0, resolution=1.0
        )

        assert len(trees) == 1
        tree = trees[0]
        assert tree.tree_id == 1
        assert tree.height == 15.0
        assert tree.x == 10.0
        assert tree.y == 10.0
        assert tree.crown_diameter is not None
        assert tree.crown_area is not None

    def test_extract_metrics_with_coordinates(self, detector):
        """Test metrics extraction with offset coordinates."""
        chm = np.zeros((10, 10))
        for r in range(10):
            for c in range(10):
                dist = np.sqrt((r - 5) ** 2 + (c - 5) ** 2)
                if dist < 3:
                    chm[r, c] = 10 - dist * 2

        tree_tops = [(5, 5, 10.0)]
        segments = np.zeros((10, 10), dtype=np.int32)
        for r in range(10):
            for c in range(10):
                if chm[r, c] > 0:
                    segments[r, c] = 1

        trees = detector._extract_tree_metrics(
            tree_tops, segments, chm,
            x_min=1000.0, y_min=2000.0, resolution=0.5
        )

        assert len(trees) == 1
        tree = trees[0]
        # Coordinates should include offset
        assert tree.x == 1000.0 + 5 * 0.5
        assert tree.y == 2000.0 + 5 * 0.5


class TestDBHEstimation:
    """Tests for DBH estimation."""

    @pytest.fixture
    def detector(self):
        """Create detector instance."""
        return TreeDetector()

    def test_estimate_dbh_from_height(self, detector):
        """Test DBH estimation from tree height."""
        # 15m tree
        dbh = detector._estimate_dbh(15.0)

        assert dbh is not None
        assert 10 < dbh < 100  # Reasonable range for 15m tree

    def test_estimate_dbh_short_tree(self, detector):
        """Test DBH estimation for tree below breast height."""
        dbh = detector._estimate_dbh(1.0)

        assert dbh is None

    def test_estimate_dbh_increases_with_height(self, detector):
        """Test that DBH increases with height."""
        dbh_10m = detector._estimate_dbh(10.0)
        dbh_20m = detector._estimate_dbh(20.0)
        dbh_30m = detector._estimate_dbh(30.0)

        assert dbh_10m < dbh_20m < dbh_30m


class TestBiomassEstimation:
    """Tests for biomass estimation."""

    @pytest.fixture
    def detector(self):
        """Create detector instance."""
        return TreeDetector()

    def test_estimate_biomass(self, detector):
        """Test biomass estimation from DBH."""
        biomass = detector._estimate_biomass(30.0)  # 30cm DBH

        assert biomass is not None
        assert biomass > 0

    def test_estimate_biomass_small_tree(self, detector):
        """Test biomass for small DBH."""
        biomass = detector._estimate_biomass(0.5)

        assert biomass is None

    def test_biomass_increases_with_dbh(self, detector):
        """Test that biomass increases with DBH."""
        biomass_20 = detector._estimate_biomass(20.0)
        biomass_40 = detector._estimate_biomass(40.0)
        biomass_60 = detector._estimate_biomass(60.0)

        assert biomass_20 < biomass_40 < biomass_60


class TestTreeDetectionResult:
    """Tests for TreeDetectionResult model."""

    def test_result_creation(self):
        """Test result creation with trees."""
        params = TreeDetectionParams()
        trees = [
            TreeMetrics(tree_id=1, x=100.0, y=200.0, height=15.0),
            TreeMetrics(tree_id=2, x=110.0, y=210.0, height=18.0),
        ]

        result = TreeDetectionResult(
            file_path="/path/to/file.las",
            trees_detected=2,
            trees=trees,
            chm_resolution=1.0,
            params=params,
            processing_time_ms=1000.0,
        )

        assert result.trees_detected == 2
        assert len(result.trees) == 2

    def test_average_height(self):
        """Test average height calculation."""
        params = TreeDetectionParams()
        trees = [
            TreeMetrics(tree_id=1, x=0, y=0, height=10.0),
            TreeMetrics(tree_id=2, x=0, y=0, height=20.0),
            TreeMetrics(tree_id=3, x=0, y=0, height=15.0),
        ]

        result = TreeDetectionResult(
            file_path="/path/to/file.las",
            trees_detected=3,
            trees=trees,
            chm_resolution=1.0,
            params=params,
            processing_time_ms=1000.0,
        )

        assert result.average_height == 15.0

    def test_max_tree_height(self):
        """Test max tree height."""
        params = TreeDetectionParams()
        trees = [
            TreeMetrics(tree_id=1, x=0, y=0, height=10.0),
            TreeMetrics(tree_id=2, x=0, y=0, height=25.0),
            TreeMetrics(tree_id=3, x=0, y=0, height=15.0),
        ]

        result = TreeDetectionResult(
            file_path="/path/to/file.las",
            trees_detected=3,
            trees=trees,
            chm_resolution=1.0,
            params=params,
            processing_time_ms=1000.0,
        )

        assert result.max_tree_height == 25.0

    def test_empty_result(self):
        """Test result with no trees."""
        params = TreeDetectionParams()

        result = TreeDetectionResult(
            file_path="/path/to/file.las",
            trees_detected=0,
            trees=[],
            chm_resolution=1.0,
            params=params,
            processing_time_ms=100.0,
        )

        assert result.average_height is None
        assert result.max_tree_height is None
