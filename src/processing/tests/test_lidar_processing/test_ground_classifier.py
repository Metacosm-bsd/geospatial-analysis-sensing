"""
Unit tests for the Ground Classifier service.

Tests the Progressive Morphological Filter (PMF) algorithm for
ground point classification.
"""

from __future__ import annotations

import numpy as np
import pytest
from numpy.testing import assert_array_equal

from lidar_processing.models import GroundClassificationParams
from lidar_processing.services.ground_classifier import (
    GroundClassifier,
    GROUND_CLASS,
    UNCLASSIFIED_CLASS,
)


class TestGroundClassificationParams:
    """Tests for GroundClassificationParams model."""

    def test_default_values(self):
        """Test default parameter values."""
        params = GroundClassificationParams()

        assert params.cell_size == 1.0
        assert params.slope == 0.15
        assert params.max_window_size == 33.0
        assert params.initial_distance == 0.5
        assert params.max_distance == 3.0

    def test_custom_values(self):
        """Test custom parameter values."""
        params = GroundClassificationParams(
            cell_size=0.5,
            slope=0.2,
            max_window_size=25.0,
            initial_distance=0.3,
            max_distance=2.5,
        )

        assert params.cell_size == 0.5
        assert params.slope == 0.2
        assert params.max_window_size == 25.0

    def test_validation_cell_size_positive(self):
        """Test that cell_size must be positive."""
        with pytest.raises(ValueError):
            GroundClassificationParams(cell_size=0)

        with pytest.raises(ValueError):
            GroundClassificationParams(cell_size=-1)

    def test_validation_slope_range(self):
        """Test that slope must be between 0 and 1."""
        with pytest.raises(ValueError):
            GroundClassificationParams(slope=-0.1)

        with pytest.raises(ValueError):
            GroundClassificationParams(slope=1.5)


class TestGroundClassifier:
    """Tests for GroundClassifier service."""

    @pytest.fixture
    def classifier(self):
        """Create a ground classifier instance."""
        return GroundClassifier()

    @pytest.fixture
    def flat_ground_points(self):
        """Create synthetic flat ground point cloud."""
        # Create a 10x10 meter flat ground
        x = np.random.uniform(0, 10, 100)
        y = np.random.uniform(0, 10, 100)
        z = np.random.uniform(0, 0.1, 100)  # Slight variation
        return x, y, z

    @pytest.fixture
    def ground_with_trees(self):
        """Create synthetic ground with tree points."""
        np.random.seed(42)

        # Ground points (lower elevation, more points)
        ground_x = np.random.uniform(0, 20, 200)
        ground_y = np.random.uniform(0, 20, 200)
        ground_z = np.random.uniform(0, 0.2, 200)

        # Tree points (higher elevation, clustered)
        tree_x = np.random.uniform(5, 15, 50)
        tree_y = np.random.uniform(5, 15, 50)
        tree_z = np.random.uniform(5, 15, 50)

        x = np.concatenate([ground_x, tree_x])
        y = np.concatenate([ground_y, tree_y])
        z = np.concatenate([ground_z, tree_z])

        # Expected mask: True for ground (first 200), False for trees (last 50)
        expected_ground = np.concatenate([
            np.ones(200, dtype=bool),
            np.zeros(50, dtype=bool),
        ])

        return x, y, z, expected_ground

    def test_classifier_initialization(self, classifier):
        """Test classifier initializes correctly."""
        assert classifier.settings is not None
        assert classifier.params is not None

    def test_classifier_with_custom_params(self):
        """Test classifier with custom parameters."""
        params = GroundClassificationParams(cell_size=0.5)
        classifier = GroundClassifier(params=params)

        assert classifier.params.cell_size == 0.5

    def test_classify_points_flat_ground(self, classifier, flat_ground_points):
        """Test classification on flat ground (all should be ground)."""
        x, y, z = flat_ground_points

        ground_mask = classifier.classify_points(x, y, z)

        # Most points on flat ground should be classified as ground
        ground_percentage = np.sum(ground_mask) / len(ground_mask)
        assert ground_percentage > 0.8

    def test_classify_points_with_trees(self, classifier, ground_with_trees):
        """Test classification separates ground from trees."""
        x, y, z, expected_ground = ground_with_trees

        ground_mask = classifier.classify_points(x, y, z)

        # Check that most ground points are identified
        ground_indices = expected_ground
        ground_correct = np.sum(ground_mask[ground_indices])
        ground_accuracy = ground_correct / np.sum(ground_indices)
        assert ground_accuracy > 0.7, f"Ground accuracy: {ground_accuracy}"

        # Check that most tree points are not classified as ground
        tree_indices = ~expected_ground
        tree_not_ground = np.sum(~ground_mask[tree_indices])
        tree_accuracy = tree_not_ground / np.sum(tree_indices)
        assert tree_accuracy > 0.6, f"Tree accuracy: {tree_accuracy}"

    def test_classify_points_empty_input(self, classifier):
        """Test classification with empty input arrays."""
        x = np.array([])
        y = np.array([])
        z = np.array([])

        ground_mask = classifier.classify_points(x, y, z)

        assert len(ground_mask) == 0

    def test_classify_points_single_point(self, classifier):
        """Test classification with single point."""
        x = np.array([0.0])
        y = np.array([0.0])
        z = np.array([0.0])

        ground_mask = classifier.classify_points(x, y, z)

        assert len(ground_mask) == 1
        assert ground_mask[0]  # Single low point should be ground

    def test_create_min_surface(self, classifier):
        """Test minimum surface creation."""
        x = np.array([0.5, 1.5, 0.5, 1.5])
        y = np.array([0.5, 0.5, 1.5, 1.5])
        z = np.array([1.0, 2.0, 3.0, 4.0])

        surface = classifier._create_min_surface(
            x, y, z,
            x_min=0.0, y_min=0.0,
            cell_size=1.0, rows=2, cols=2
        )

        assert surface.shape == (2, 2)
        assert surface[0, 0] == 1.0  # First cell gets z=1.0
        assert surface[0, 1] == 2.0  # Second cell gets z=2.0

    def test_calculate_window_sizes(self, classifier):
        """Test window size calculation."""
        window_sizes = classifier._calculate_window_sizes(
            cell_size=1.0,
            max_window_size=33.0
        )

        # Should start at 3 and grow exponentially
        assert window_sizes[0] == 3
        assert window_sizes[-1] >= 33

        # All sizes should be odd
        for size in window_sizes:
            assert size % 2 == 1

    def test_fill_empty_cells(self, classifier):
        """Test filling empty cells in surface."""
        surface = np.array([
            [1.0, np.inf, 2.0],
            [np.inf, np.inf, np.inf],
            [3.0, np.inf, 4.0],
        ])

        filled = classifier._fill_empty_cells(surface)

        # No more infinite values
        assert not np.any(np.isinf(filled))

        # Original values preserved
        assert filled[0, 0] == 1.0
        assert filled[0, 2] == 2.0
        assert filled[2, 0] == 3.0
        assert filled[2, 2] == 4.0


class TestGroundClassificationResult:
    """Tests for GroundClassificationResult model."""

    def test_result_creation(self):
        """Test result model creation."""
        from lidar_processing.models import GroundClassificationResult

        params = GroundClassificationParams()
        result = GroundClassificationResult(
            file_path="/path/to/file.las",
            output_path="/path/to/output.las",
            total_points=1000,
            ground_points=600,
            non_ground_points=400,
            ground_percentage=60.0,
            processing_time_ms=100.0,
            params=params,
        )

        assert result.total_points == 1000
        assert result.ground_points == 600
        assert result.ground_percentage == 60.0

    def test_result_without_output_path(self):
        """Test result with no output file."""
        from lidar_processing.models import GroundClassificationResult

        params = GroundClassificationParams()
        result = GroundClassificationResult(
            file_path="/path/to/file.las",
            total_points=1000,
            ground_points=600,
            non_ground_points=400,
            ground_percentage=60.0,
            processing_time_ms=100.0,
            params=params,
        )

        assert result.output_path is None


class TestPMFAlgorithm:
    """Tests for PMF algorithm behavior."""

    @pytest.fixture
    def classifier(self):
        """Create classifier with specific params for testing."""
        params = GroundClassificationParams(
            cell_size=1.0,
            slope=0.1,
            max_window_size=10.0,
            initial_distance=0.3,
            max_distance=2.0,
        )
        return GroundClassifier(params=params)

    def test_sloped_terrain(self, classifier):
        """Test classification on sloped terrain."""
        np.random.seed(42)

        # Create sloped ground (elevation increases with x)
        x = np.random.uniform(0, 20, 100)
        y = np.random.uniform(0, 20, 100)
        z = x * 0.1 + np.random.uniform(-0.1, 0.1, 100)  # 10% slope

        ground_mask = classifier.classify_points(x, y, z)

        # Most points on smooth slope should be ground
        ground_percentage = np.sum(ground_mask) / len(ground_mask)
        assert ground_percentage > 0.7

    def test_steep_objects_filtered(self, classifier):
        """Test that steep objects are filtered out."""
        np.random.seed(42)

        # Ground points
        ground_x = np.random.uniform(0, 10, 50)
        ground_y = np.random.uniform(0, 10, 50)
        ground_z = np.zeros(50)

        # Steep wall (should be filtered)
        wall_x = np.full(20, 5.0)
        wall_y = np.random.uniform(0, 10, 20)
        wall_z = np.linspace(0, 5, 20)

        x = np.concatenate([ground_x, wall_x])
        y = np.concatenate([ground_y, wall_y])
        z = np.concatenate([ground_z, wall_z])

        ground_mask = classifier.classify_points(x, y, z)

        # Most ground points should be classified as ground
        ground_correct = np.sum(ground_mask[:50])
        assert ground_correct > 40

        # High wall points should not be ground
        wall_high = z[50:] > 2.0
        wall_not_ground = np.sum(~ground_mask[50:][wall_high])
        assert wall_not_ground > np.sum(wall_high) * 0.5

    def test_parameter_sensitivity(self):
        """Test that different parameters affect results."""
        np.random.seed(42)

        # Create ground with some above-ground points
        x = np.random.uniform(0, 10, 100)
        y = np.random.uniform(0, 10, 100)
        z = np.concatenate([
            np.random.uniform(0, 0.5, 80),
            np.random.uniform(1.0, 2.0, 20),
        ])

        # Lenient parameters
        lenient = GroundClassifier(params=GroundClassificationParams(
            max_distance=5.0,
            initial_distance=1.0,
        ))

        # Strict parameters
        strict = GroundClassifier(params=GroundClassificationParams(
            max_distance=1.0,
            initial_distance=0.2,
        ))

        lenient_mask = lenient.classify_points(x, y, z)
        strict_mask = strict.classify_points(x, y, z)

        # Lenient should classify more points as ground
        lenient_count = np.sum(lenient_mask)
        strict_count = np.sum(strict_mask)

        assert lenient_count >= strict_count
