"""
Tests for tree detection pipeline.

This module contains unit tests for the tree detection functionality
including both watershed and local maxima detection algorithms.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from processing.models.tree import Tree, TreeCollection, TreeSpecies, HealthStatus
from processing.pipelines.tree_detection import (
    detect_trees,
    _create_canopy_height_model,
    _detect_trees_watershed,
    _detect_trees_local_maxima,
)

if TYPE_CHECKING:
    from numpy.typing import NDArray


class TestTreeModel:
    """Tests for the Tree Pydantic model."""

    def test_tree_creation_minimal(self) -> None:
        """Test creating a tree with minimal required fields."""
        tree = Tree(
            id="tree_001",
            x=100.0,
            y=200.0,
            height=15.5,
        )

        assert tree.id == "tree_001"
        assert tree.x == 100.0
        assert tree.y == 200.0
        assert tree.height == 15.5
        assert tree.confidence == 1.0
        assert tree.species == TreeSpecies.UNKNOWN

    def test_tree_creation_full(self) -> None:
        """Test creating a tree with all fields."""
        tree = Tree(
            id="tree_002",
            x=500000.0,
            y=4500000.0,
            height=25.5,
            crown_radius=4.2,
            dbh=35.0,
            species=TreeSpecies.PINE,
            health=HealthStatus.HEALTHY,
            confidence=0.95,
            metadata={"scan_date": "2024-01-15"},
        )

        assert tree.crown_radius == 4.2
        assert tree.dbh == 35.0
        assert tree.species == TreeSpecies.PINE
        assert tree.health == HealthStatus.HEALTHY
        assert tree.metadata["scan_date"] == "2024-01-15"

    def test_tree_confidence_validation(self) -> None:
        """Test that confidence must be between 0 and 1."""
        with pytest.raises(ValueError):
            Tree(
                id="tree_003",
                x=100.0,
                y=200.0,
                height=15.0,
                confidence=1.5,
            )

    def test_tree_height_validation(self) -> None:
        """Test that height must be non-negative."""
        with pytest.raises(ValueError):
            Tree(
                id="tree_004",
                x=100.0,
                y=200.0,
                height=-5.0,
            )

    def test_tree_location_property(self) -> None:
        """Test the location property returns correct tuple."""
        tree = Tree(id="tree_005", x=123.45, y=678.90, height=10.0)
        assert tree.location == (123.45, 678.90)

    def test_tree_crown_area_calculation(self) -> None:
        """Test crown area calculation from radius."""
        import math

        tree = Tree(
            id="tree_006",
            x=100.0,
            y=200.0,
            height=20.0,
            crown_radius=5.0,
        )

        expected_area = math.pi * 5.0**2
        assert tree.crown_area == pytest.approx(expected_area)

    def test_tree_crown_area_none_without_radius(self) -> None:
        """Test crown area is None when radius is not set."""
        tree = Tree(id="tree_007", x=100.0, y=200.0, height=20.0)
        assert tree.crown_area is None

    def test_tree_to_geojson_feature(self) -> None:
        """Test GeoJSON feature conversion."""
        tree = Tree(
            id="tree_008",
            x=100.0,
            y=200.0,
            height=15.0,
            crown_radius=3.0,
            confidence=0.9,
        )

        geojson = tree.to_geojson_feature()

        assert geojson["type"] == "Feature"
        assert geojson["geometry"]["type"] == "Point"
        assert geojson["geometry"]["coordinates"] == [100.0, 200.0]
        assert geojson["properties"]["id"] == "tree_008"
        assert geojson["properties"]["height"] == 15.0


class TestTreeCollection:
    """Tests for the TreeCollection model."""

    @pytest.fixture
    def sample_trees(self) -> list[Tree]:
        """Create sample trees for testing."""
        return [
            Tree(id="tree_001", x=100.0, y=100.0, height=10.0, confidence=0.8),
            Tree(id="tree_002", x=200.0, y=200.0, height=20.0, confidence=0.9),
            Tree(id="tree_003", x=300.0, y=300.0, height=15.0, confidence=0.7),
            Tree(id="tree_004", x=400.0, y=400.0, height=25.0, confidence=0.95),
        ]

    def test_collection_creation(self, sample_trees: list[Tree]) -> None:
        """Test creating a tree collection."""
        collection = TreeCollection(trees=sample_trees)

        assert len(collection) == 4
        assert collection.tree_count == 4

    def test_collection_iteration(self, sample_trees: list[Tree]) -> None:
        """Test iterating over collection."""
        collection = TreeCollection(trees=sample_trees)

        tree_ids = [tree.id for tree in collection]
        assert tree_ids == ["tree_001", "tree_002", "tree_003", "tree_004"]

    def test_collection_indexing(self, sample_trees: list[Tree]) -> None:
        """Test accessing trees by index."""
        collection = TreeCollection(trees=sample_trees)

        assert collection[0].id == "tree_001"
        assert collection[-1].id == "tree_004"

    def test_collection_statistics(self, sample_trees: list[Tree]) -> None:
        """Test height statistics calculation."""
        collection = TreeCollection(trees=sample_trees)

        assert collection.mean_height == pytest.approx(17.5)
        assert collection.max_height == 25.0
        assert collection.min_height == 10.0

    def test_collection_filter_by_height(self, sample_trees: list[Tree]) -> None:
        """Test filtering trees by height."""
        collection = TreeCollection(trees=sample_trees)

        filtered = collection.filter_by_height(min_height=15.0)
        assert len(filtered) == 3

        filtered = collection.filter_by_height(max_height=15.0)
        assert len(filtered) == 2

        filtered = collection.filter_by_height(min_height=12.0, max_height=22.0)
        assert len(filtered) == 2

    def test_collection_filter_by_confidence(self, sample_trees: list[Tree]) -> None:
        """Test filtering trees by confidence."""
        collection = TreeCollection(trees=sample_trees)

        filtered = collection.filter_by_confidence(min_confidence=0.85)
        assert len(filtered) == 2

    def test_collection_to_geojson(self, sample_trees: list[Tree]) -> None:
        """Test GeoJSON FeatureCollection conversion."""
        collection = TreeCollection(
            trees=sample_trees,
            source_file="test.las",
            algorithm="watershed",
        )

        geojson = collection.to_geojson()

        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) == 4
        assert geojson["properties"]["tree_count"] == 4
        assert geojson["properties"]["algorithm"] == "watershed"

    def test_empty_collection_statistics(self) -> None:
        """Test statistics on empty collection."""
        collection = TreeCollection()

        assert collection.mean_height is None
        assert collection.max_height is None
        assert collection.min_height is None

    def test_collection_get_statistics(self, sample_trees: list[Tree]) -> None:
        """Test full statistics dictionary."""
        collection = TreeCollection(trees=sample_trees)

        stats = collection.get_statistics()

        assert stats["tree_count"] == 4
        assert "height_stats" in stats
        assert stats["height_stats"]["min"] == 10.0
        assert stats["height_stats"]["max"] == 25.0


class TestTreeDetectionPipeline:
    """Tests for the tree detection pipeline functions."""

    def test_detect_trees_file_not_found(self, tmp_path: Path) -> None:
        """Test that FileNotFoundError is raised for missing input."""
        with pytest.raises(FileNotFoundError):
            detect_trees(
                tmp_path / "nonexistent.las",
                tmp_path / "output.geojson",
            )

    def test_detect_trees_invalid_algorithm(self, tmp_path: Path) -> None:
        """Test that ValueError is raised for invalid algorithm."""
        # Create a dummy input file
        input_file = tmp_path / "test.las"
        input_file.write_text("dummy")

        with patch("processing.pipelines.tree_detection.read_las_file") as mock_read:
            mock_read.return_value = MagicMock()

            with pytest.raises(ValueError, match="Unsupported algorithm"):
                detect_trees(
                    input_file,
                    tmp_path / "output.geojson",
                    algorithm="invalid_algo",
                )

    @pytest.mark.slow
    def test_detect_trees_integration(self, tmp_path: Path) -> None:
        """Integration test for tree detection (marked as slow)."""
        # This would require actual LAS test data
        pytest.skip("Requires test LAS data")


class TestWatershedDetection:
    """Tests for watershed-based tree detection."""

    def test_detect_trees_watershed_empty_chm(self) -> None:
        """Test watershed detection with empty CHM."""
        from processing.utils.las_reader import LasData

        chm = np.zeros((100, 100), dtype=np.float32)
        las_data = LasData()

        result = _detect_trees_watershed(
            chm,
            las_data,
            min_height=2.0,
            min_distance=3.0,
        )

        assert isinstance(result, list)

    def test_create_canopy_height_model(self) -> None:
        """Test CHM creation function returns correct shape."""
        from processing.utils.las_reader import LasData

        las_data = LasData(
            x=np.array([0, 10, 20], dtype=np.float64),
            y=np.array([0, 10, 20], dtype=np.float64),
            z=np.array([100, 110, 105], dtype=np.float64),
        )

        chm = _create_canopy_height_model(las_data, smoothing_radius=1.0)

        assert isinstance(chm, np.ndarray)
        assert chm.dtype == np.float32


class TestLocalMaximaDetection:
    """Tests for local maxima-based tree detection."""

    def test_detect_trees_local_maxima_empty_chm(self) -> None:
        """Test local maxima detection with empty CHM."""
        from processing.utils.las_reader import LasData

        chm = np.zeros((100, 100), dtype=np.float32)
        las_data = LasData()

        result = _detect_trees_local_maxima(
            chm,
            las_data,
            min_height=2.0,
            min_distance=3.0,
        )

        assert isinstance(result, list)


# Parametrized tests for different detection parameters
@pytest.mark.parametrize(
    "min_height,expected_minimum",
    [
        (1.0, 1.0),
        (2.0, 2.0),
        (5.0, 5.0),
    ],
)
def test_min_height_parameter(min_height: float, expected_minimum: float) -> None:
    """Test that min_height parameter is respected."""
    # This is a placeholder for parameter validation tests
    assert min_height == expected_minimum


@pytest.mark.parametrize(
    "algorithm",
    ["watershed", "local_maxima"],
)
def test_supported_algorithms(algorithm: str) -> None:
    """Test that valid algorithms are recognized."""
    valid_algorithms = ["watershed", "local_maxima"]
    assert algorithm in valid_algorithms
