"""
Tests for the LiDAR Validator Service.

These tests verify the validation logic for LAS/LAZ files.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from lidar_processing.config import Settings
from lidar_processing.models import ValidationSeverity, ValidationStatus
from lidar_processing.services.lidar_validator import LidarValidator


@pytest.fixture
def settings() -> Settings:
    """Create test settings."""
    return Settings(
        max_file_size_mb=100,
        require_crs=True,
        min_point_count=100,
        supported_versions=["1.2", "1.3", "1.4"],
        supported_point_formats=[0, 1, 2, 3, 6, 7, 8],
    )


@pytest.fixture
def validator(settings: Settings) -> LidarValidator:
    """Create a validator instance with test settings."""
    return LidarValidator(settings)


class TestLidarValidatorBasicChecks:
    """Tests for basic file validation checks."""

    def test_file_not_found(self, validator: LidarValidator) -> None:
        """Test validation of non-existent file."""
        result = validator.validate("/nonexistent/file.las")

        assert result.status == ValidationStatus.INVALID
        assert result.is_valid is False
        assert len(result.issues) == 1
        assert result.issues[0].code == "FILE_NOT_FOUND"
        assert result.issues[0].severity == ValidationSeverity.ERROR

    def test_invalid_extension(
        self,
        validator: LidarValidator,
        tmp_path: Path,
    ) -> None:
        """Test validation of file with invalid extension."""
        # Create a file with wrong extension
        test_file = tmp_path / "test.txt"
        test_file.write_text("dummy content")

        result = validator.validate(str(test_file))

        assert result.status == ValidationStatus.INVALID
        assert result.is_valid is False
        assert any(i.code == "INVALID_EXTENSION" for i in result.issues)

    def test_file_too_large(
        self,
        settings: Settings,
        tmp_path: Path,
    ) -> None:
        """Test validation of file exceeding size limit."""
        # Create validator with very small size limit
        settings.max_file_size_mb = 0.001  # 1KB
        validator = LidarValidator(settings)

        # Create a file larger than limit
        test_file = tmp_path / "large.las"
        test_file.write_bytes(b"x" * 2000)  # 2KB

        result = validator.validate(str(test_file))

        assert result.status == ValidationStatus.INVALID
        assert any(i.code == "FILE_TOO_LARGE" for i in result.issues)

    def test_file_info_populated(
        self,
        validator: LidarValidator,
        tmp_path: Path,
    ) -> None:
        """Test that file info is populated even for invalid files."""
        test_file = tmp_path / "test.las"
        test_file.write_bytes(b"dummy content")

        result = validator.validate(str(test_file))

        assert result.file_info is not None
        assert result.file_info.file_path == str(test_file)
        assert result.file_info.file_size_bytes > 0
        assert result.file_info.file_extension == ".las"


class TestLidarValidatorLasValidation:
    """Tests for LAS file content validation."""

    @pytest.fixture
    def mock_las_header(self) -> MagicMock:
        """Create a mock LAS header."""
        header = MagicMock()
        header.version.major = 1
        header.version.minor = 4
        header.point_format.id = 6
        header.point_count = 1000
        header.mins = np.array([0.0, 0.0, 0.0])
        header.maxs = np.array([100.0, 100.0, 50.0])
        header.scales = np.array([0.001, 0.001, 0.001])
        header.vlrs = []
        return header

    @patch("laspy.open")
    def test_valid_las_file(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation of a valid LAS file."""
        # Create test file
        test_file = tmp_path / "valid.las"
        test_file.write_bytes(b"dummy content")

        # Setup mock
        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        # Override CRS requirement for this test
        result = validator.validate(str(test_file), require_crs=False)

        assert result.is_valid is True
        assert result.error_count == 0

    @patch("laspy.open")
    def test_unsupported_version(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation of unsupported LAS version."""
        test_file = tmp_path / "old_version.las"
        test_file.write_bytes(b"dummy content")

        # Set unsupported version
        mock_las_header.version.major = 1
        mock_las_header.version.minor = 0

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=False)

        assert any(i.code == "UNSUPPORTED_VERSION" for i in result.issues)

    @patch("laspy.open")
    def test_unsupported_point_format(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation of unsupported point format."""
        test_file = tmp_path / "bad_format.las"
        test_file.write_bytes(b"dummy content")

        # Set unsupported point format
        mock_las_header.point_format.id = 99

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=False)

        assert any(i.code == "UNSUPPORTED_POINT_FORMAT" for i in result.issues)

    @patch("laspy.open")
    def test_insufficient_points(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation of file with too few points."""
        test_file = tmp_path / "few_points.las"
        test_file.write_bytes(b"dummy content")

        # Set low point count
        mock_las_header.point_count = 10

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=False)

        assert any(i.code == "INSUFFICIENT_POINTS" for i in result.issues)

    @patch("laspy.open")
    def test_missing_crs_required(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation when CRS is required but missing."""
        test_file = tmp_path / "no_crs.las"
        test_file.write_bytes(b"dummy content")

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=True)

        assert any(i.code == "MISSING_CRS" for i in result.issues)
        assert any(
            i.code == "MISSING_CRS" and i.severity == ValidationSeverity.ERROR
            for i in result.issues
        )

    @patch("laspy.open")
    def test_missing_crs_not_required(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation when CRS is optional and missing."""
        test_file = tmp_path / "no_crs.las"
        test_file.write_bytes(b"dummy content")

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=False)

        # Should be warning, not error
        crs_issues = [i for i in result.issues if i.code == "MISSING_CRS"]
        if crs_issues:
            assert all(i.severity == ValidationSeverity.WARNING for i in crs_issues)

    @patch("laspy.open")
    def test_inverted_bounds(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation of inverted bounds."""
        test_file = tmp_path / "inverted_bounds.las"
        test_file.write_bytes(b"dummy content")

        # Set inverted X bounds
        mock_las_header.mins = np.array([100.0, 0.0, 0.0])
        mock_las_header.maxs = np.array([0.0, 100.0, 50.0])

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=False)

        assert any(i.code == "INVERTED_BOUNDS" for i in result.issues)

    @patch("laspy.open")
    def test_zero_scale(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        mock_las_header: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test validation of zero scale factors."""
        test_file = tmp_path / "zero_scale.las"
        test_file.write_bytes(b"dummy content")

        # Set zero scale
        mock_las_header.scales = np.array([0.0, 0.001, 0.001])

        mock_las_file = MagicMock()
        mock_las_file.header = mock_las_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.validate(str(test_file), require_crs=False)

        assert any(i.code == "ZERO_SCALE" for i in result.issues)


class TestLidarValidatorQuickCheck:
    """Tests for the quick_check method."""

    def test_quick_check_nonexistent(self, validator: LidarValidator) -> None:
        """Test quick check of non-existent file."""
        result = validator.quick_check("/nonexistent/file.las")
        assert result is False

    def test_quick_check_wrong_extension(
        self,
        validator: LidarValidator,
        tmp_path: Path,
    ) -> None:
        """Test quick check of file with wrong extension."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("dummy")

        result = validator.quick_check(str(test_file))
        assert result is False

    @patch("laspy.open")
    def test_quick_check_valid(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        tmp_path: Path,
    ) -> None:
        """Test quick check of valid file."""
        test_file = tmp_path / "valid.las"
        test_file.write_bytes(b"dummy content")

        mock_header = MagicMock()
        mock_header.point_count = 1000

        mock_las_file = MagicMock()
        mock_las_file.header = mock_header
        mock_las_file.__enter__ = MagicMock(return_value=mock_las_file)
        mock_las_file.__exit__ = MagicMock(return_value=False)
        mock_laspy_open.return_value = mock_las_file

        result = validator.quick_check(str(test_file))
        assert result is True

    @patch("laspy.open")
    def test_quick_check_corrupt(
        self,
        mock_laspy_open: MagicMock,
        validator: LidarValidator,
        tmp_path: Path,
    ) -> None:
        """Test quick check of corrupt file."""
        test_file = tmp_path / "corrupt.las"
        test_file.write_bytes(b"corrupt data")

        mock_laspy_open.side_effect = Exception("Failed to read")

        result = validator.quick_check(str(test_file))
        assert result is False
