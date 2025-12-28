"""
Unit tests for the Processing Worker.

Tests the job processing pipeline for LiDAR analysis.
"""

from __future__ import annotations

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from pathlib import Path

from lidar_processing.models import (
    GroundClassificationParams,
    GroundClassificationResult,
    HeightNormalizationParams,
    CHMResult,
    Bounds,
    JobResult,
    JobStatus,
    JobType,
    ProcessingResult,
    TreeDetectionParams,
    TreeDetectionResult,
    TreeMetrics,
)
from lidar_processing.workers.processing_worker import ProcessingWorker


class TestProcessingWorkerInitialization:
    """Tests for ProcessingWorker initialization."""

    def test_initialization(self):
        """Test worker initializes correctly."""
        worker = ProcessingWorker()

        assert worker.settings is not None
        assert worker.ground_classifier is not None
        assert worker.height_normalizer is not None
        assert worker.tree_detector is not None
        assert worker.tree_metrics is not None

    def test_handlers_registered(self):
        """Test all handlers are registered."""
        worker = ProcessingWorker()

        assert JobType.GROUND_CLASSIFY in worker._handlers
        assert JobType.NORMALIZE_HEIGHT in worker._handlers
        assert JobType.DETECT_TREES in worker._handlers
        assert JobType.FULL_PIPELINE in worker._handlers


class TestProcessJob:
    """Tests for process_job method."""

    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        return ProcessingWorker()

    def test_process_job_unknown_type(self, worker):
        """Test processing unknown job type."""
        # Create a mock job type not in handlers
        with patch.object(worker, '_handlers', {}):
            result = worker.process_job(
                job_type=JobType.GROUND_CLASSIFY,
                file_path="/path/to/file.las",
            )

        assert result.status == JobStatus.FAILED
        assert "Unknown job type" in result.error

    def test_process_job_generates_job_id(self, worker):
        """Test job ID is generated if not provided."""
        with patch.object(worker, 'ground_classifier') as mock_classifier:
            mock_classifier.classify.return_value = GroundClassificationResult(
                file_path="/path/to/file.las",
                total_points=1000,
                ground_points=600,
                non_ground_points=400,
                ground_percentage=60.0,
                processing_time_ms=100.0,
                params=GroundClassificationParams(),
            )

            result = worker.process_job(
                job_type=JobType.GROUND_CLASSIFY,
                file_path="/path/to/file.las",
            )

        assert result.job_id is not None
        assert len(result.job_id) > 0


class TestGroundClassifyHandler:
    """Tests for ground classification handler."""

    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        return ProcessingWorker()

    def test_handle_ground_classify(self, worker, tmp_path):
        """Test ground classification handling."""
        with patch.object(worker, 'ground_classifier') as mock_classifier:
            mock_classifier.classify.return_value = GroundClassificationResult(
                file_path="/path/to/file.las",
                total_points=1000,
                ground_points=600,
                non_ground_points=400,
                ground_percentage=60.0,
                processing_time_ms=100.0,
                params=GroundClassificationParams(),
            )

            result = worker._handle_ground_classify(
                job_id="test-job",
                file_path=Path("/path/to/file.las"),
                job_type=JobType.GROUND_CLASSIFY,
                queued_at=datetime.utcnow(),
                start_time=0,
                params={"cell_size": 1.0},
                output_dir=tmp_path,
            )

        assert result.status == JobStatus.COMPLETED
        assert result.job_type == JobType.GROUND_CLASSIFY

    def test_handle_ground_classify_with_params(self, worker):
        """Test ground classification with custom parameters."""
        with patch.object(worker, 'ground_classifier') as mock_classifier:
            mock_classifier.classify.return_value = GroundClassificationResult(
                file_path="/path/to/file.las",
                total_points=1000,
                ground_points=600,
                non_ground_points=400,
                ground_percentage=60.0,
                processing_time_ms=100.0,
                params=GroundClassificationParams(cell_size=0.5),
            )

            result = worker._handle_ground_classify(
                job_id="test-job",
                file_path=Path("/path/to/file.las"),
                job_type=JobType.GROUND_CLASSIFY,
                queued_at=datetime.utcnow(),
                start_time=0,
                params={"cell_size": 0.5, "slope": 0.2},
            )

        mock_classifier.classify.assert_called_once()
        call_args = mock_classifier.classify.call_args
        assert call_args.kwargs["params"].cell_size == 0.5


class TestNormalizeHeightHandler:
    """Tests for height normalization handler."""

    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        return ProcessingWorker()

    def test_handle_normalize_height(self, worker, tmp_path):
        """Test height normalization handling."""
        import numpy as np

        bounds = Bounds(
            min_x=0, max_x=100, min_y=0, max_y=100, min_z=0, max_z=50
        )

        with patch.object(worker, 'height_normalizer') as mock_normalizer:
            mock_normalizer.normalize.return_value = (
                CHMResult(
                    file_path="/path/to/file.las",
                    resolution=1.0,
                    bounds=bounds,
                    width=100,
                    height=100,
                    min_height=0.0,
                    max_height=45.0,
                    processing_time_ms=1000.0,
                ),
                np.zeros((100, 100)),
                np.zeros((100, 100)),
            )

            result = worker._handle_normalize_height(
                job_id="test-job",
                file_path=Path("/path/to/file.las"),
                job_type=JobType.NORMALIZE_HEIGHT,
                queued_at=datetime.utcnow(),
                start_time=0,
                params={"resolution": 1.0},
                output_dir=tmp_path,
            )

        assert result.status == JobStatus.COMPLETED
        assert result.job_type == JobType.NORMALIZE_HEIGHT


class TestDetectTreesHandler:
    """Tests for tree detection handler."""

    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        return ProcessingWorker()

    def test_handle_detect_trees(self, worker, tmp_path):
        """Test tree detection handling."""
        trees = [
            TreeMetrics(tree_id=1, x=100.0, y=200.0, height=15.0),
            TreeMetrics(tree_id=2, x=110.0, y=210.0, height=18.0),
        ]

        with patch.object(worker, 'tree_detector') as mock_detector:
            mock_detector.detect.return_value = TreeDetectionResult(
                file_path="/path/to/file.las",
                trees_detected=2,
                trees=trees,
                chm_resolution=1.0,
                params=TreeDetectionParams(),
                processing_time_ms=500.0,
            )

            result = worker._handle_detect_trees(
                job_id="test-job",
                file_path=Path("/path/to/file.las"),
                job_type=JobType.DETECT_TREES,
                queued_at=datetime.utcnow(),
                start_time=0,
                params={"min_height": 2.0},
                output_dir=tmp_path,
            )

        assert result.status == JobStatus.COMPLETED
        assert result.job_type == JobType.DETECT_TREES


class TestFullPipelineHandler:
    """Tests for full pipeline handler."""

    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        return ProcessingWorker()

    def test_handle_full_pipeline(self, worker, tmp_path):
        """Test full pipeline handling."""
        import numpy as np

        bounds = Bounds(
            min_x=0, max_x=100, min_y=0, max_y=100, min_z=0, max_z=50
        )

        with patch.object(worker, 'ground_classifier') as mock_classifier, \
             patch.object(worker, 'height_normalizer') as mock_normalizer, \
             patch.object(worker, 'tree_detector') as mock_detector:

            mock_classifier.classify.return_value = GroundClassificationResult(
                file_path="/path/to/file.las",
                output_path=str(tmp_path / "classified.las"),
                total_points=1000,
                ground_points=600,
                non_ground_points=400,
                ground_percentage=60.0,
                processing_time_ms=100.0,
                params=GroundClassificationParams(),
            )

            mock_normalizer.normalize.return_value = (
                CHMResult(
                    file_path="/path/to/file.las",
                    resolution=1.0,
                    bounds=bounds,
                    width=100,
                    height=100,
                    min_height=0.0,
                    max_height=45.0,
                    processing_time_ms=1000.0,
                ),
                np.zeros((100, 100)),
                np.zeros((100, 100)),
            )

            mock_detector.detect.return_value = TreeDetectionResult(
                file_path="/path/to/file.las",
                trees_detected=10,
                trees=[TreeMetrics(tree_id=i, x=float(i), y=float(i), height=15.0) for i in range(10)],
                chm_resolution=1.0,
                params=TreeDetectionParams(),
                processing_time_ms=500.0,
            )

            result = worker._handle_full_pipeline(
                job_id="test-job",
                file_path=Path("/path/to/file.las"),
                job_type=JobType.FULL_PIPELINE,
                queued_at=datetime.utcnow(),
                start_time=0,
                params={},
                output_dir=tmp_path,
            )

        assert result.status == JobStatus.COMPLETED
        assert result.job_type == JobType.FULL_PIPELINE

        # Verify all steps were called
        mock_classifier.classify.assert_called_once()
        mock_normalizer.normalize.assert_called_once()
        mock_detector.detect.assert_called_once()


class TestGetProcessingResult:
    """Tests for get_processing_result method."""

    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        return ProcessingWorker()

    def test_get_processing_result_success(self, worker, tmp_path):
        """Test getting processing result on success."""
        import numpy as np

        bounds = Bounds(
            min_x=0, max_x=100, min_y=0, max_y=100, min_z=0, max_z=50
        )

        with patch.object(worker, 'ground_classifier') as mock_classifier, \
             patch.object(worker, 'height_normalizer') as mock_normalizer, \
             patch.object(worker, 'tree_detector') as mock_detector:

            mock_classifier.classify.return_value = GroundClassificationResult(
                file_path="/path/to/file.las",
                total_points=1000,
                ground_points=600,
                non_ground_points=400,
                ground_percentage=60.0,
                processing_time_ms=100.0,
                params=GroundClassificationParams(),
            )

            mock_normalizer.normalize.return_value = (
                CHMResult(
                    file_path="/path/to/file.las",
                    resolution=1.0,
                    bounds=bounds,
                    width=100,
                    height=100,
                    min_height=0.0,
                    max_height=45.0,
                    processing_time_ms=1000.0,
                ),
                np.zeros((100, 100)),
                np.zeros((100, 100)),
            )

            mock_detector.detect.return_value = TreeDetectionResult(
                file_path="/path/to/file.las",
                trees_detected=5,
                trees=[TreeMetrics(tree_id=i, x=float(i), y=float(i), height=15.0) for i in range(5)],
                chm_resolution=1.0,
                params=TreeDetectionParams(),
                processing_time_ms=500.0,
            )

            result = worker.get_processing_result(
                file_path="/path/to/file.las",
                output_dir=tmp_path,
            )

        assert result.success is True
        assert result.ground_classification is not None
        assert result.height_normalization is not None
        assert result.tree_detection is not None
        assert result.tree_detection.trees_detected == 5

    def test_get_processing_result_failure(self, worker):
        """Test getting processing result on failure."""
        with patch.object(worker, 'ground_classifier') as mock_classifier:
            mock_classifier.classify.side_effect = Exception("Processing failed")

            result = worker.get_processing_result(
                file_path="/path/to/file.las",
            )

        assert result.success is False
        assert result.error is not None
        assert "Processing failed" in result.error


class TestProcessingResult:
    """Tests for ProcessingResult model."""

    def test_processing_result_creation(self):
        """Test ProcessingResult creation."""
        result = ProcessingResult(
            file_path="/path/to/file.las",
            job_id="test-job",
            total_processing_time_ms=5000.0,
            success=True,
        )

        assert result.file_path == "/path/to/file.las"
        assert result.job_id == "test-job"
        assert result.success is True
        assert result.error is None

    def test_processing_result_with_all_results(self):
        """Test ProcessingResult with all sub-results."""
        ground = GroundClassificationResult(
            file_path="/path/to/file.las",
            total_points=1000,
            ground_points=600,
            non_ground_points=400,
            ground_percentage=60.0,
            processing_time_ms=100.0,
            params=GroundClassificationParams(),
        )

        bounds = Bounds(
            min_x=0, max_x=100, min_y=0, max_y=100, min_z=0, max_z=50
        )
        chm = CHMResult(
            file_path="/path/to/file.las",
            resolution=1.0,
            bounds=bounds,
            width=100,
            height=100,
            min_height=0.0,
            max_height=45.0,
            processing_time_ms=1000.0,
        )

        tree = TreeDetectionResult(
            file_path="/path/to/file.las",
            trees_detected=10,
            trees=[],
            chm_resolution=1.0,
            params=TreeDetectionParams(),
            processing_time_ms=500.0,
        )

        result = ProcessingResult(
            file_path="/path/to/file.las",
            ground_classification=ground,
            height_normalization=chm,
            tree_detection=tree,
            total_processing_time_ms=1600.0,
            success=True,
        )

        assert result.ground_classification.ground_percentage == 60.0
        assert result.height_normalization.max_height == 45.0
        assert result.tree_detection.trees_detected == 10

    def test_processing_result_with_error(self):
        """Test ProcessingResult with error."""
        result = ProcessingResult(
            file_path="/path/to/file.las",
            total_processing_time_ms=100.0,
            success=False,
            error="File not found",
        )

        assert result.success is False
        assert result.error == "File not found"
        assert result.ground_classification is None
