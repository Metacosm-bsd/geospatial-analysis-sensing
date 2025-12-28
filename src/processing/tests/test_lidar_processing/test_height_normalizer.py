"""
Unit tests for the Height Normalizer service.

Tests DEM generation, height normalization, and CHM creation.
"""

from __future__ import annotations

import numpy as np
import pytest
from numpy.testing import assert_array_almost_equal

from lidar_processing.models import (
    Bounds,
    CHMResult,
    HeightNormalizationParams,
)
from lidar_processing.services.height_normalizer import HeightNormalizer


class TestHeightNormalizationParams:
    """Tests for HeightNormalizationParams model."""

    def test_default_values(self):
        """Test default parameter values."""
        params = HeightNormalizationParams()

        assert params.resolution == 1.0
        assert params.interpolation_method == "idw"
        assert params.idw_power == 2.0
        assert params.search_radius is None

    def test_custom_values(self):
        """Test custom parameter values."""
        params = HeightNormalizationParams(
            resolution=0.5,
            interpolation_method="tin",
            idw_power=3.0,
            search_radius=10.0,
        )

        assert params.resolution == 0.5
        assert params.interpolation_method == "tin"
        assert params.idw_power == 3.0
        assert params.search_radius == 10.0

    def test_validation_resolution_positive(self):
        """Test that resolution must be positive."""
        with pytest.raises(ValueError):
            HeightNormalizationParams(resolution=0)

        with pytest.raises(ValueError):
            HeightNormalizationParams(resolution=-1)


class TestHeightNormalizer:
    """Tests for HeightNormalizer service."""

    @pytest.fixture
    def normalizer(self):
        """Create a height normalizer instance."""
        return HeightNormalizer()

    @pytest.fixture
    def flat_ground_points(self):
        """Create synthetic flat ground points."""
        np.random.seed(42)
        n_points = 100

        ground_x = np.random.uniform(0, 10, n_points)
        ground_y = np.random.uniform(0, 10, n_points)
        ground_z = np.full(n_points, 100.0)  # Flat at 100m

        return ground_x, ground_y, ground_z

    @pytest.fixture
    def sloped_ground_points(self):
        """Create synthetic sloped ground points."""
        np.random.seed(42)
        n_points = 100

        ground_x = np.random.uniform(0, 10, n_points)
        ground_y = np.random.uniform(0, 10, n_points)
        ground_z = 100.0 + ground_x * 0.1  # 10% slope in x direction

        return ground_x, ground_y, ground_z

    def test_normalizer_initialization(self, normalizer):
        """Test normalizer initializes correctly."""
        assert normalizer.settings is not None
        assert normalizer.params is not None

    def test_normalizer_with_custom_params(self):
        """Test normalizer with custom parameters."""
        params = HeightNormalizationParams(resolution=0.5)
        normalizer = HeightNormalizer(params=params)

        assert normalizer.params.resolution == 0.5


class TestIDWInterpolation:
    """Tests for IDW interpolation method."""

    @pytest.fixture
    def normalizer(self):
        """Create normalizer instance."""
        return HeightNormalizer()

    def test_idw_single_point(self, normalizer):
        """Test IDW with single point."""
        x = np.array([5.0])
        y = np.array([5.0])
        z = np.array([100.0])

        dem = normalizer._interpolate_idw(
            x, y, z,
            x_min=0.0, y_min=0.0,
            resolution=1.0, rows=10, cols=10,
            search_radius=20.0,
        )

        assert dem.shape == (10, 10)
        # Center should be close to 100
        assert abs(dem[5, 5] - 100.0) < 10.0

    def test_idw_multiple_points(self, normalizer):
        """Test IDW with multiple points."""
        x = np.array([0.5, 9.5, 0.5, 9.5])
        y = np.array([0.5, 0.5, 9.5, 9.5])
        z = np.array([100.0, 100.0, 100.0, 100.0])

        dem = normalizer._interpolate_idw(
            x, y, z,
            x_min=0.0, y_min=0.0,
            resolution=1.0, rows=10, cols=10,
            search_radius=20.0,
        )

        assert dem.shape == (10, 10)
        # All values should be approximately 100
        assert np.allclose(dem, 100.0, atol=5.0)

    def test_idw_gradient(self, normalizer):
        """Test IDW preserves gradient."""
        x = np.array([0.5, 4.5, 9.5])
        y = np.array([5.0, 5.0, 5.0])
        z = np.array([0.0, 50.0, 100.0])

        dem = normalizer._interpolate_idw(
            x, y, z,
            x_min=0.0, y_min=0.0,
            resolution=1.0, rows=10, cols=10,
            search_radius=20.0,
        )

        # Values should generally increase from left to right
        row_5 = dem[5, :]
        assert row_5[0] < row_5[5] < row_5[9]


class TestTINInterpolation:
    """Tests for TIN interpolation method."""

    @pytest.fixture
    def normalizer(self):
        """Create normalizer instance."""
        return HeightNormalizer()

    def test_tin_triangular_points(self, normalizer):
        """Test TIN with triangular point arrangement."""
        x = np.array([0.0, 10.0, 5.0])
        y = np.array([0.0, 0.0, 10.0])
        z = np.array([100.0, 100.0, 100.0])

        dem = normalizer._interpolate_tin(
            x, y, z,
            x_min=0.0, y_min=0.0,
            resolution=1.0, rows=11, cols=11,
        )

        assert dem.shape == (11, 11)
        # Inside triangle should be 100
        assert abs(dem[3, 5] - 100.0) < 1.0

    def test_barycentric_interpolate(self, normalizer):
        """Test barycentric interpolation."""
        # Triangle with known values
        p1 = np.array([0.0, 0.0])
        p2 = np.array([10.0, 0.0])
        p3 = np.array([5.0, 10.0])
        z1, z2, z3 = 0.0, 10.0, 5.0

        # Centroid should have average value
        centroid = np.array([5.0, 10/3])
        result = normalizer._barycentric_interpolate(
            centroid, p1, p2, p3, z1, z2, z3
        )

        expected = (z1 + z2 + z3) / 3
        assert abs(result - expected) < 0.5


class TestCHMGeneration:
    """Tests for CHM generation."""

    @pytest.fixture
    def normalizer(self):
        """Create normalizer instance."""
        return HeightNormalizer()

    def test_create_chm_flat_canopy(self, normalizer):
        """Test CHM creation with flat canopy."""
        np.random.seed(42)

        x = np.random.uniform(0, 10, 100)
        y = np.random.uniform(0, 10, 100)
        z = np.random.uniform(95, 105, 100)  # Canopy at ~100m

        # DEM at 90m
        dem = np.full((10, 10), 90.0)

        chm = normalizer._create_chm(
            x, y, z,
            x_min=0.0, y_min=0.0,
            resolution=1.0, rows=10, cols=10,
            dem=dem,
        )

        assert chm.shape == (10, 10)
        # CHM values should be approximately 5-15m (100-90)
        valid_chm = chm[chm > 0]
        assert np.mean(valid_chm) > 5.0
        assert np.mean(valid_chm) < 20.0

    def test_create_chm_with_gaps(self, normalizer):
        """Test CHM handles gaps in canopy."""
        # Only points in corners
        x = np.array([0.5, 9.5])
        y = np.array([0.5, 9.5])
        z = np.array([110.0, 110.0])

        dem = np.full((10, 10), 100.0)

        chm = normalizer._create_chm(
            x, y, z,
            x_min=0.0, y_min=0.0,
            resolution=1.0, rows=10, cols=10,
            dem=dem,
        )

        # Corners should have height ~10m, center should be 0
        assert chm[0, 0] > 5.0
        assert chm[5, 5] == 0.0


class TestNormalizePoints:
    """Tests for point normalization."""

    @pytest.fixture
    def normalizer(self):
        """Create normalizer instance."""
        return HeightNormalizer()

    def test_normalize_flat_ground(self, normalizer):
        """Test normalization on flat ground."""
        # All points at same elevation as ground
        x = np.array([1.0, 5.0, 9.0])
        y = np.array([5.0, 5.0, 5.0])
        z = np.array([100.0, 100.0, 100.0])

        ground_x = x.copy()
        ground_y = y.copy()
        ground_z = z.copy()

        normalized = normalizer.normalize_points(
            x, y, z, ground_x, ground_y, ground_z
        )

        # All points should be at ~0 height
        assert np.allclose(normalized, 0.0, atol=1.0)

    def test_normalize_above_ground(self, normalizer):
        """Test normalization for points above ground."""
        x = np.array([5.0])
        y = np.array([5.0])
        z = np.array([120.0])

        ground_x = np.array([0.0, 10.0, 0.0, 10.0])
        ground_y = np.array([0.0, 0.0, 10.0, 10.0])
        ground_z = np.array([100.0, 100.0, 100.0, 100.0])

        normalized = normalizer.normalize_points(
            x, y, z, ground_x, ground_y, ground_z
        )

        # Point at 120m should be ~20m above 100m ground
        assert abs(normalized[0] - 20.0) < 5.0


class TestCHMResult:
    """Tests for CHMResult model."""

    def test_result_creation(self):
        """Test CHMResult creation."""
        bounds = Bounds(
            min_x=0.0, max_x=100.0,
            min_y=0.0, max_y=100.0,
            min_z=0.0, max_z=50.0,
        )

        result = CHMResult(
            file_path="/path/to/file.las",
            chm_path="/path/to/chm.tif",
            dem_path="/path/to/dem.tif",
            resolution=1.0,
            bounds=bounds,
            width=100,
            height=100,
            min_height=0.0,
            max_height=45.0,
            processing_time_ms=1000.0,
        )

        assert result.file_path == "/path/to/file.las"
        assert result.resolution == 1.0
        assert result.max_height == 45.0

    def test_result_without_output_paths(self):
        """Test CHMResult without output paths."""
        bounds = Bounds(
            min_x=0.0, max_x=100.0,
            min_y=0.0, max_y=100.0,
            min_z=0.0, max_z=50.0,
        )

        result = CHMResult(
            file_path="/path/to/file.las",
            resolution=1.0,
            bounds=bounds,
            width=100,
            height=100,
            min_height=0.0,
            max_height=45.0,
            processing_time_ms=1000.0,
        )

        assert result.chm_path is None
        assert result.dem_path is None


class TestFillNaNValues:
    """Tests for NaN filling."""

    @pytest.fixture
    def normalizer(self):
        """Create normalizer instance."""
        return HeightNormalizer()

    def test_fill_single_nan(self, normalizer):
        """Test filling single NaN value."""
        array = np.array([
            [1.0, 2.0, 3.0],
            [4.0, np.nan, 6.0],
            [7.0, 8.0, 9.0],
        ])

        filled = normalizer._fill_nan_values(array)

        assert not np.any(np.isnan(filled))
        # Center value should be filled from nearest neighbor
        assert filled[1, 1] in [2.0, 4.0, 6.0, 8.0]

    def test_fill_multiple_nans(self, normalizer):
        """Test filling multiple NaN values."""
        array = np.array([
            [1.0, np.nan, np.nan],
            [np.nan, np.nan, np.nan],
            [np.nan, np.nan, 9.0],
        ])

        filled = normalizer._fill_nan_values(array)

        assert not np.any(np.isnan(filled))
        # All values should be filled

    def test_no_nans(self, normalizer):
        """Test array without NaNs unchanged."""
        array = np.array([
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0],
            [7.0, 8.0, 9.0],
        ])

        filled = normalizer._fill_nan_values(array.copy())

        assert_array_almost_equal(filled, array)
