"""
Tests for the LiDAR Processing FastAPI Application.

These tests verify the API endpoints work correctly.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from lidar_processing.config import Settings
from lidar_processing.main import create_app
from lidar_processing.models import (
    Bounds,
    FileInfo,
    LidarMetadata,
    ValidationResult,
    ValidationStatus,
)


@pytest.fixture
def settings() -> Settings:
    """Create test settings."""
    return Settings(
        debug=True,
        redis_host="localhost",
        redis_port=6379,
    )


@pytest.fixture
def app(settings: Settings):
    """Create a test application."""
    return create_app(settings)


@pytest.fixture
def client(app) -> TestClient:
    """Create a test client."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    def test_health_check(self, client: TestClient) -> None:
        """Test basic health check."""
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "timestamp" in data
        assert "redis_connected" in data
        assert "uptime_seconds" in data


class TestValidateEndpoint:
    """Tests for the validation endpoint."""

    @patch("lidar_processing.services.lidar_validator.LidarValidator.validate")
    def test_validate_success(
        self,
        mock_validate: MagicMock,
        client: TestClient,
    ) -> None:
        """Test successful validation."""
        mock_validate.return_value = ValidationResult(
            status=ValidationStatus.VALID,
            file_path="/test/file.las",
            is_valid=True,
            issues=[],
            file_info=FileInfo(
                file_path="/test/file.las",
                file_size_bytes=1024,
                file_size_mb=0.001,
                file_extension=".las",
            ),
        )

        response = client.post(
            "/api/v1/validate",
            json={"file_path": "/test/file.las"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "valid"
        assert data["is_valid"] is True

    @patch("lidar_processing.services.lidar_validator.LidarValidator.validate")
    def test_validate_invalid_file(
        self,
        mock_validate: MagicMock,
        client: TestClient,
    ) -> None:
        """Test validation of invalid file."""
        mock_validate.return_value = ValidationResult(
            status=ValidationStatus.INVALID,
            file_path="/test/bad.las",
            is_valid=False,
            issues=[],
        )

        response = client.post(
            "/api/v1/validate",
            json={"file_path": "/test/bad.las"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "invalid"
        assert data["is_valid"] is False

    @patch("lidar_processing.services.lidar_validator.LidarValidator.validate")
    def test_validate_file_not_found(
        self,
        mock_validate: MagicMock,
        client: TestClient,
    ) -> None:
        """Test validation of non-existent file."""
        mock_validate.side_effect = FileNotFoundError("File not found")

        response = client.post(
            "/api/v1/validate",
            json={"file_path": "/nonexistent/file.las"},
        )

        assert response.status_code == 404

    def test_validate_empty_path(self, client: TestClient) -> None:
        """Test validation with empty file path."""
        response = client.post(
            "/api/v1/validate",
            json={"file_path": ""},
        )

        assert response.status_code == 422

    def test_validate_with_options(
        self,
        client: TestClient,
    ) -> None:
        """Test validation with custom options."""
        with patch(
            "lidar_processing.services.lidar_validator.LidarValidator.validate"
        ) as mock_validate:
            mock_validate.return_value = ValidationResult(
                status=ValidationStatus.VALID,
                file_path="/test/file.las",
                is_valid=True,
                issues=[],
            )

            response = client.post(
                "/api/v1/validate",
                json={
                    "file_path": "/test/file.las",
                    "require_crs": False,
                    "check_point_density": True,
                },
            )

            assert response.status_code == 200
            mock_validate.assert_called_once_with(
                "/test/file.las",
                require_crs=False,
                check_point_density=True,
            )


class TestExtractMetadataEndpoint:
    """Tests for the metadata extraction endpoint."""

    @patch("lidar_processing.services.metadata_extractor.MetadataExtractor.extract")
    def test_extract_metadata_success(
        self,
        mock_extract: MagicMock,
        client: TestClient,
    ) -> None:
        """Test successful metadata extraction."""
        mock_extract.return_value = LidarMetadata(
            file_path="/test/file.las",
            file_info=FileInfo(
                file_path="/test/file.las",
                file_size_bytes=1024 * 1024,
                file_size_mb=1.0,
                file_extension=".las",
            ),
            las_version="1.4",
            point_format_id=6,
            point_count=100000,
            bounds=Bounds(
                min_x=0.0,
                max_x=100.0,
                min_y=0.0,
                max_y=100.0,
                min_z=0.0,
                max_z=50.0,
            ),
            scale=(0.001, 0.001, 0.001),
            offset=(0.0, 0.0, 0.0),
            point_density=10.0,
        )

        response = client.post(
            "/api/v1/extract-metadata",
            json={"file_path": "/test/file.las"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["las_version"] == "1.4"
        assert data["point_count"] == 100000
        assert data["point_density"] == 10.0

    @patch("lidar_processing.services.metadata_extractor.MetadataExtractor.extract")
    def test_extract_metadata_file_not_found(
        self,
        mock_extract: MagicMock,
        client: TestClient,
    ) -> None:
        """Test metadata extraction of non-existent file."""
        mock_extract.side_effect = FileNotFoundError("File not found")

        response = client.post(
            "/api/v1/extract-metadata",
            json={"file_path": "/nonexistent/file.las"},
        )

        assert response.status_code == 404

    @patch("lidar_processing.services.metadata_extractor.MetadataExtractor.extract")
    def test_extract_metadata_with_options(
        self,
        mock_extract: MagicMock,
        client: TestClient,
    ) -> None:
        """Test metadata extraction with custom options."""
        mock_extract.return_value = LidarMetadata(
            file_path="/test/file.las",
            file_info=FileInfo(
                file_path="/test/file.las",
                file_size_bytes=1024,
                file_size_mb=0.001,
                file_extension=".las",
            ),
            las_version="1.4",
            point_format_id=6,
            point_count=100000,
            bounds=Bounds(
                min_x=0.0,
                max_x=100.0,
                min_y=0.0,
                max_y=100.0,
                min_z=0.0,
                max_z=50.0,
            ),
            scale=(0.001, 0.001, 0.001),
            offset=(0.0, 0.0, 0.0),
        )

        response = client.post(
            "/api/v1/extract-metadata",
            json={
                "file_path": "/test/file.las",
                "include_classification_counts": False,
                "include_return_statistics": False,
                "calculate_density": False,
                "sample_size": 10000,
            },
        )

        assert response.status_code == 200
        mock_extract.assert_called_once_with(
            "/test/file.las",
            include_classification_counts=False,
            include_return_statistics=False,
            calculate_density=False,
            sample_size=10000,
        )


class TestQueueEndpoint:
    """Tests for the queue endpoint."""

    def test_queue_job_no_redis(self, client: TestClient) -> None:
        """Test queueing job when Redis is not available."""
        # Redis is not connected in test environment by default
        response = client.post(
            "/api/v1/queue",
            json={
                "file_path": "/test/file.las",
                "job_type": "validate",
            },
        )

        # Should return service unavailable since Redis is not connected
        assert response.status_code == 503


class TestOpenAPISchema:
    """Tests for OpenAPI schema generation."""

    def test_openapi_schema_available(self, client: TestClient) -> None:
        """Test that OpenAPI schema is available."""
        response = client.get("/api/v1/openapi.json")

        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert "info" in data
        assert "paths" in data

    def test_docs_available(self, client: TestClient) -> None:
        """Test that Swagger docs are available."""
        response = client.get("/api/v1/docs")

        assert response.status_code == 200

    def test_redoc_available(self, client: TestClient) -> None:
        """Test that ReDoc is available."""
        response = client.get("/api/v1/redoc")

        assert response.status_code == 200
