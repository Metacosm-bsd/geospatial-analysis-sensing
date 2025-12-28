"""
Tests for the LiDAR Metadata Extractor Service.

These tests verify metadata extraction from LAS/LAZ files.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from lidar_processing.config import Settings
from lidar_processing.models import get_classification_name
from lidar_processing.services.metadata_extractor import MetadataExtractor


@pytest.fixture
def settings() -> Settings:
    """Create test settings."""
    return Settings(
        max_file_size_mb=100,
    )


@pytest.fixture
def extractor(settings: Settings) -> MetadataExtractor:
    """Create an extractor instance with test settings."""
    return MetadataExtractor(settings)


class TestMetadataExtractorBasicChecks:
    """Tests for basic metadata extraction checks."""

    def test_file_not_found(self, extractor: MetadataExtractor) -> None:
        """Test extraction from non-existent file."""
        with pytest.raises(FileNotFoundError):
            extractor.extract("/nonexistent/file.las")

    def test_invalid_extension(
        self,
        extractor: MetadataExtractor,
        tmp_path: Path,
    ) -> None:
        """Test extraction from file with invalid extension."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("dummy content")

        with pytest.raises(ValueError, match="Unsupported file format"):
            extractor.extract(str(test_file))


class TestMetadataExtraction:
    """Tests for metadata extraction functionality."""

    @pytest.fixture
    def mock_las_header(self) -> MagicMock:
        """Create a mock LAS header."""
        header = MagicMock()
        header.version.major = 1
        header.version.minor = 4
        header.point_format.id = 6
        header.point_count = 10000
        header.mins = np.array([500000.0, 4000000.0, 100.0])
        header.maxs = np.array([500100.0, 4000100.0, 150.0])
        header.scales = np.array([0.001, 0.001, 0.001])
        header.offsets = np.array([500000.0, 4000000.0, 0.0])
        header.vlrs = []
        header.creation_date = MagicMock(day=180, year=2024)
        header.generating_software = b"TestSoftware\x00"
        return header

    @patch("laspy.open")
    def test_basic_metadata_extraction(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test extraction of basic metadata."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=False,
            include_return_statistics=False,
        )

        assert metadata.las_version == "1.4"
        assert metadata.point_format_id == 6
        assert metadata.point_count == 10000
        assert metadata.bounds.min_x == 500000.0
        assert metadata.bounds.max_x == 500100.0
        assert metadata.bounds.min_y == 4000000.0
        assert metadata.bounds.max_y == 4000100.0
        assert metadata.bounds.min_z == 100.0
        assert metadata.bounds.max_z == 150.0

    @patch("laspy.open")
    def test_point_density_calculation(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test point density calculation."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=False,
            include_return_statistics=False,
            calculate_density=True,
        )

        # Area is 100m x 100m = 10000 m2
        # 10000 points / 10000 m2 = 1.0 pts/m2
        assert metadata.point_density == 1.0
        assert metadata.area_sq_meters == 10000.0

    @patch("laspy.open")
    def test_bounds_properties(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test bounds calculated properties."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=False,
            include_return_statistics=False,
        )

        assert metadata.bounds.width == 100.0
        assert metadata.bounds.height == 100.0
        assert metadata.bounds.depth == 50.0
        assert metadata.bounds.area_2d == 10000.0

    @patch("laspy.open")
    def test_file_info_extraction(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test file info extraction."""
        test_file = tmp_path / "test.laz"
        test_file.write_bytes(b"x" * 1024 * 512)  # 512KB

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=False,
            include_return_statistics=False,
        )

        assert metadata.file_info.file_extension == ".laz"
        assert metadata.file_info.file_size_bytes == 1024 * 512
        assert metadata.file_info.file_size_mb == 0.5

    @patch("laspy.open")
    def test_classification_counts(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test classification count extraction."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        # Create mock chunk with classification data
        mock_chunk = MagicMock()
        mock_chunk.classification = np.array([2, 2, 2, 5, 5, 6, 6, 6, 6, 1], dtype=np.uint8)
        mock_chunk.__len__ = MagicMock(return_value=10)

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.header.point_count = 10
        mock_las_file.chunk_iterator = MagicMock(return_value=iter([mock_chunk]))
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=True,
            include_return_statistics=False,
        )

        # Verify classification counts
        assert len(metadata.classification_counts) > 0

        # Find specific classifications
        class_map = {c.code: c for c in metadata.classification_counts}

        if 2 in class_map:  # Ground
            assert class_map[2].count == 3
            assert class_map[2].name == "Ground"

        if 5 in class_map:  # High Vegetation
            assert class_map[5].count == 2
            assert class_map[5].name == "High Vegetation"

        if 6 in class_map:  # Building
            assert class_map[6].count == 4
            assert class_map[6].name == "Building"

    @patch("laspy.open")
    def test_return_statistics(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test return statistics extraction."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        # Create mock chunk with return data
        mock_chunk = MagicMock()
        mock_chunk.return_number = np.array([1, 1, 1, 1, 1, 2, 2, 2, 3, 3], dtype=np.uint8)
        mock_chunk.classification = np.array([2] * 10, dtype=np.uint8)
        mock_chunk.__len__ = MagicMock(return_value=10)

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.header.point_count = 10
        mock_las_file.chunk_iterator = MagicMock(return_value=iter([mock_chunk]))
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=False,
            include_return_statistics=True,
        )

        # Verify return statistics
        assert len(metadata.return_statistics) > 0

        return_map = {r.return_number: r for r in metadata.return_statistics}

        if 1 in return_map:  # First returns
            assert return_map[1].count == 5
            assert return_map[1].percentage == 50.0

        if 2 in return_map:  # Second returns
            assert return_map[2].count == 3
            assert return_map[2].percentage == 30.0

        if 3 in return_map:  # Third returns
            assert return_map[3].count == 2
            assert return_map[3].percentage == 20.0

    @patch("laspy.open")
    def test_extraction_timing(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test that extraction time is recorded."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        metadata = extractor.extract(
            str(test_file),
            include_classification_counts=False,
            include_return_statistics=False,
        )

        assert metadata.extraction_time_ms is not None
        assert metadata.extraction_time_ms >= 0


class TestQuickInfo:
    """Tests for the get_quick_info method."""

    @patch("laspy.open")
    def test_quick_info(
        self,
        mock_laspy_open: MagicMock,
        extractor: MetadataExtractor,
        tmp_path: Path,
    ) -> None:
        """Test quick info extraction."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"x" * 1024)

        mock_header = MagicMock()
        mock_header.version.major = 1
        mock_header.version.minor = 4
        mock_header.point_format.id = 6
        mock_header.point_count = 5000
        mock_header.mins = np.array([0.0, 0.0, 0.0])
        mock_header.maxs = np.array([100.0, 100.0, 50.0])

        mock_las_file = MagicMock()
        mock_las_file.header = mock_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        info = extractor.get_quick_info(str(test_file))

        assert info["las_version"] == "1.4"
        assert info["point_format"] == 6
        assert info["point_count"] == 5000
        assert "bounds" in info

    def test_quick_info_file_not_found(
        self,
        extractor: MetadataExtractor,
    ) -> None:
        """Test quick info on non-existent file."""
        with pytest.raises(FileNotFoundError):
            extractor.get_quick_info("/nonexistent/file.las")


class TestClassificationNames:
    """Tests for ASPRS classification name lookup."""

    def test_standard_classifications(self) -> None:
        """Test standard ASPRS classification names."""
        assert get_classification_name(0) == "Created, never classified"
        assert get_classification_name(1) == "Unclassified"
        assert get_classification_name(2) == "Ground"
        assert get_classification_name(3) == "Low Vegetation"
        assert get_classification_name(4) == "Medium Vegetation"
        assert get_classification_name(5) == "High Vegetation"
        assert get_classification_name(6) == "Building"
        assert get_classification_name(7) == "Low Point (noise)"
        assert get_classification_name(9) == "Water"
        assert get_classification_name(17) == "Bridge Deck"

    def test_reserved_classifications(self) -> None:
        """Test reserved classification names."""
        assert "Reserved" in get_classification_name(19)
        assert "Reserved" in get_classification_name(50)

    def test_user_defined_classifications(self) -> None:
        """Test user-defined classification names."""
        assert "User Defined" in get_classification_name(64)
        assert "User Defined" in get_classification_name(200)
        assert "User Defined" in get_classification_name(255)
