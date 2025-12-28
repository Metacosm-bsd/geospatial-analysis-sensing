"""
Processing Worker for LiDAR Analysis Pipeline.

This module provides a worker that handles the full LiDAR processing pipeline
including ground classification, height normalization, and tree detection.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    CHMResult,
    GroundClassificationParams,
    GroundClassificationResult,
    HeightNormalizationParams,
    JobResult,
    JobStatus,
    JobType,
    ProcessingResult,
    TreeDetectionParams,
    TreeDetectionResult,
)
from lidar_processing.services.ground_classifier import GroundClassifier
from lidar_processing.services.height_normalizer import HeightNormalizer
from lidar_processing.services.tree_detector import TreeDetector
from lidar_processing.services.tree_metrics import TreeMetricsExtractor

logger = logging.getLogger(__name__)


class ProcessingWorker:
    """
    Worker for processing LiDAR files through the analysis pipeline.

    This worker handles individual processing jobs including:
    - Ground classification (GROUND_CLASSIFY)
    - Height normalization (NORMALIZE_HEIGHT)
    - Tree detection (DETECT_TREES)
    - Full pipeline (FULL_PIPELINE)

    Attributes:
        settings: Application settings.
        ground_classifier: Ground classification service.
        height_normalizer: Height normalization service.
        tree_detector: Tree detection service.
        tree_metrics: Tree metrics extraction service.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the processing worker.

        Args:
            settings: Optional settings instance.
        """
        self.settings = settings or get_settings()
        self.ground_classifier = GroundClassifier(self.settings)
        self.height_normalizer = HeightNormalizer(self.settings)
        self.tree_detector = TreeDetector(self.settings)
        self.tree_metrics = TreeMetricsExtractor(self.settings)

        # Job handlers
        self._handlers: dict[JobType, Callable[..., JobResult]] = {
            JobType.GROUND_CLASSIFY: self._handle_ground_classify,
            JobType.NORMALIZE_HEIGHT: self._handle_normalize_height,
            JobType.DETECT_TREES: self._handle_detect_trees,
            JobType.FULL_PIPELINE: self._handle_full_pipeline,
        }

    def process_job(
        self,
        job_type: JobType,
        file_path: str | Path,
        job_id: str | None = None,
        params: dict[str, Any] | None = None,
        output_dir: str | Path | None = None,
    ) -> JobResult:
        """
        Process a single job.

        Args:
            job_type: Type of processing job.
            file_path: Path to the LAS/LAZ file.
            job_id: Optional job identifier.
            params: Optional job parameters.
            output_dir: Optional directory for output files.

        Returns:
            JobResult with processing results.
        """
        job_id = job_id or str(uuid.uuid4())
        params = params or {}
        file_path = Path(file_path)
        start_time = time.perf_counter()
        queued_at = datetime.utcnow()

        logger.info("Processing job %s (%s): %s", job_id, job_type.value, file_path)

        # Get handler
        handler = self._handlers.get(job_type)
        if not handler:
            return JobResult(
                job_id=job_id,
                status=JobStatus.FAILED,
                job_type=job_type,
                file_path=str(file_path),
                queued_at=queued_at,
                completed_at=datetime.utcnow(),
                processing_time_ms=(time.perf_counter() - start_time) * 1000,
                error=f"Unknown job type: {job_type}",
            )

        try:
            result = handler(
                job_id=job_id,
                file_path=file_path,
                job_type=job_type,
                queued_at=queued_at,
                start_time=start_time,
                params=params,
                output_dir=output_dir,
            )
            return result

        except Exception as e:
            logger.exception("Job %s failed: %s", job_id, e)
            return JobResult(
                job_id=job_id,
                status=JobStatus.FAILED,
                job_type=job_type,
                file_path=str(file_path),
                queued_at=queued_at,
                completed_at=datetime.utcnow(),
                processing_time_ms=(time.perf_counter() - start_time) * 1000,
                error=str(e),
            )

    def _handle_ground_classify(
        self,
        job_id: str,
        file_path: Path,
        job_type: JobType,
        queued_at: datetime,
        start_time: float,
        params: dict[str, Any],
        output_dir: Path | None = None,
    ) -> JobResult:
        """
        Handle ground classification job.

        Args:
            job_id: Job identifier.
            file_path: Path to input file.
            job_type: Job type.
            queued_at: When job was queued.
            start_time: Processing start time.
            params: Job parameters.
            output_dir: Output directory.

        Returns:
            JobResult with classification results.
        """
        # Parse parameters
        classification_params = GroundClassificationParams(
            cell_size=params.get("cell_size", 1.0),
            slope=params.get("slope", 0.15),
            max_window_size=params.get("max_window_size", 33.0),
            initial_distance=params.get("initial_distance", 0.5),
            max_distance=params.get("max_distance", 3.0),
        )

        # Determine output path
        output_path = None
        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{file_path.stem}_classified.las"

        # Perform classification
        result = self.ground_classifier.classify(
            file_path,
            output_path=output_path,
            params=classification_params,
        )

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        # Create processing result
        processing_result = ProcessingResult(
            file_path=str(file_path),
            job_id=job_id,
            ground_classification=result,
            total_processing_time_ms=processing_time_ms,
            success=True,
        )

        return JobResult(
            job_id=job_id,
            status=JobStatus.COMPLETED,
            job_type=job_type,
            file_path=str(file_path),
            queued_at=queued_at,
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
        )

    def _handle_normalize_height(
        self,
        job_id: str,
        file_path: Path,
        job_type: JobType,
        queued_at: datetime,
        start_time: float,
        params: dict[str, Any],
        output_dir: Path | None = None,
    ) -> JobResult:
        """
        Handle height normalization job.

        Args:
            job_id: Job identifier.
            file_path: Path to input file.
            job_type: Job type.
            queued_at: When job was queued.
            start_time: Processing start time.
            params: Job parameters.
            output_dir: Output directory.

        Returns:
            JobResult with normalization results.
        """
        # Parse parameters
        norm_params = HeightNormalizationParams(
            resolution=params.get("resolution", 1.0),
            interpolation_method=params.get("interpolation_method", "idw"),
            idw_power=params.get("idw_power", 2.0),
            search_radius=params.get("search_radius"),
        )

        # Determine output paths
        chm_path = None
        dem_path = None
        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            chm_path = output_dir / f"{file_path.stem}_chm.tif"
            dem_path = output_dir / f"{file_path.stem}_dem.tif"

        # Perform normalization
        result, chm, dem = self.height_normalizer.normalize(
            file_path,
            output_chm_path=chm_path,
            output_dem_path=dem_path,
            params=norm_params,
        )

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        return JobResult(
            job_id=job_id,
            status=JobStatus.COMPLETED,
            job_type=job_type,
            file_path=str(file_path),
            queued_at=queued_at,
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
        )

    def _handle_detect_trees(
        self,
        job_id: str,
        file_path: Path,
        job_type: JobType,
        queued_at: datetime,
        start_time: float,
        params: dict[str, Any],
        output_dir: Path | None = None,
    ) -> JobResult:
        """
        Handle tree detection job.

        Args:
            job_id: Job identifier.
            file_path: Path to input file.
            job_type: Job type.
            queued_at: When job was queued.
            start_time: Processing start time.
            params: Job parameters.
            output_dir: Output directory.

        Returns:
            JobResult with detection results.
        """
        # Parse parameters
        detection_params = TreeDetectionParams(
            min_height=params.get("min_height", 2.0),
            min_distance=params.get("min_distance", 3.0),
            smoothing_sigma=params.get("smoothing_sigma", 1.0),
            resolution=params.get("resolution", 1.0),
        )

        # Perform detection
        result = self.tree_detector.detect(file_path, params=detection_params)

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        # Save tree list if output directory provided
        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            trees_path = output_dir / f"{file_path.stem}_trees.json"

            trees_data = {
                "file_path": str(file_path),
                "trees_detected": result.trees_detected,
                "trees": [t.model_dump() for t in result.trees],
                "params": detection_params.model_dump(),
                "processing_time_ms": processing_time_ms,
            }

            with open(trees_path, "w") as f:
                json.dump(trees_data, f, indent=2)

            logger.info("Saved tree list to: %s", trees_path)

        return JobResult(
            job_id=job_id,
            status=JobStatus.COMPLETED,
            job_type=job_type,
            file_path=str(file_path),
            queued_at=queued_at,
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
        )

    def _handle_full_pipeline(
        self,
        job_id: str,
        file_path: Path,
        job_type: JobType,
        queued_at: datetime,
        start_time: float,
        params: dict[str, Any],
        output_dir: Path | None = None,
    ) -> JobResult:
        """
        Handle full processing pipeline job.

        Runs: Ground Classification -> Height Normalization -> Tree Detection

        Args:
            job_id: Job identifier.
            file_path: Path to input file.
            job_type: Job type.
            queued_at: When job was queued.
            start_time: Processing start time.
            params: Job parameters.
            output_dir: Output directory.

        Returns:
            JobResult with full pipeline results.
        """
        logger.info("Starting full pipeline for: %s", file_path)

        # Set up output directory
        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: Ground Classification
        logger.info("Step 1/3: Ground classification")
        classification_params = GroundClassificationParams(
            cell_size=params.get("cell_size", 1.0),
            slope=params.get("slope", 0.15),
            max_window_size=params.get("max_window_size", 33.0),
        )

        classified_path = None
        if output_dir:
            classified_path = output_dir / f"{file_path.stem}_classified.las"

        ground_result = self.ground_classifier.classify(
            file_path,
            output_path=classified_path,
            params=classification_params,
        )

        # Use classified file for next steps
        processing_file = classified_path if classified_path else file_path

        # Step 2: Height Normalization
        logger.info("Step 2/3: Height normalization")
        resolution = params.get("resolution", 1.0)
        norm_params = HeightNormalizationParams(
            resolution=resolution,
            interpolation_method=params.get("interpolation_method", "idw"),
        )

        chm_path = None
        dem_path = None
        if output_dir:
            chm_path = output_dir / f"{file_path.stem}_chm.tif"
            dem_path = output_dir / f"{file_path.stem}_dem.tif"

        chm_result, chm, dem = self.height_normalizer.normalize(
            processing_file,
            output_chm_path=chm_path,
            output_dem_path=dem_path,
            params=norm_params,
        )

        # Step 3: Tree Detection
        logger.info("Step 3/3: Tree detection")
        detection_params = TreeDetectionParams(
            min_height=params.get("min_height", 2.0),
            min_distance=params.get("min_distance", 3.0),
            smoothing_sigma=params.get("smoothing_sigma", 1.0),
            resolution=resolution,
        )

        tree_result = self.tree_detector.detect(
            processing_file,
            params=detection_params,
            chm=chm,
            chm_metadata=(chm_result.bounds.min_x, chm_result.bounds.min_y, resolution),
        )

        # Save tree list
        if output_dir:
            trees_path = output_dir / f"{file_path.stem}_trees.json"
            trees_data = {
                "file_path": str(file_path),
                "trees_detected": tree_result.trees_detected,
                "trees": [t.model_dump() for t in tree_result.trees],
            }
            with open(trees_path, "w") as f:
                json.dump(trees_data, f, indent=2)

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        # Create complete result
        processing_result = ProcessingResult(
            file_path=str(file_path),
            job_id=job_id,
            ground_classification=ground_result,
            height_normalization=chm_result,
            tree_detection=tree_result,
            total_processing_time_ms=processing_time_ms,
            success=True,
        )

        # Save full result
        if output_dir:
            result_path = output_dir / f"{file_path.stem}_result.json"
            with open(result_path, "w") as f:
                json.dump(processing_result.model_dump(mode="json"), f, indent=2)
            logger.info("Saved full result to: %s", result_path)

        logger.info(
            "Full pipeline complete: %d trees detected in %.1f ms",
            tree_result.trees_detected,
            processing_time_ms,
        )

        return JobResult(
            job_id=job_id,
            status=JobStatus.COMPLETED,
            job_type=job_type,
            file_path=str(file_path),
            queued_at=queued_at,
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
        )

    def get_processing_result(
        self,
        file_path: str | Path,
        params: dict[str, Any] | None = None,
        output_dir: str | Path | None = None,
    ) -> ProcessingResult:
        """
        Run the full processing pipeline and return detailed results.

        This is a convenience method for running the full pipeline
        and getting the ProcessingResult directly instead of JobResult.

        Args:
            file_path: Path to the LAS/LAZ file.
            params: Optional processing parameters.
            output_dir: Optional output directory.

        Returns:
            ProcessingResult with all analysis results.
        """
        file_path = Path(file_path)
        params = params or {}
        start_time = time.perf_counter()

        try:
            # Run ground classification
            classification_params = GroundClassificationParams(
                cell_size=params.get("cell_size", 1.0),
                slope=params.get("slope", 0.15),
                max_window_size=params.get("max_window_size", 33.0),
            )

            classified_path = None
            if output_dir:
                output_dir = Path(output_dir)
                output_dir.mkdir(parents=True, exist_ok=True)
                classified_path = output_dir / f"{file_path.stem}_classified.las"

            ground_result = self.ground_classifier.classify(
                file_path,
                output_path=classified_path,
                params=classification_params,
            )

            processing_file = classified_path if classified_path else file_path

            # Run height normalization
            resolution = params.get("resolution", 1.0)
            norm_params = HeightNormalizationParams(resolution=resolution)

            chm_path = output_dir / f"{file_path.stem}_chm.tif" if output_dir else None
            dem_path = output_dir / f"{file_path.stem}_dem.tif" if output_dir else None

            chm_result, chm, _ = self.height_normalizer.normalize(
                processing_file,
                output_chm_path=chm_path,
                output_dem_path=dem_path,
                params=norm_params,
            )

            # Run tree detection
            detection_params = TreeDetectionParams(
                min_height=params.get("min_height", 2.0),
                min_distance=params.get("min_distance", 3.0),
                smoothing_sigma=params.get("smoothing_sigma", 1.0),
                resolution=resolution,
            )

            tree_result = self.tree_detector.detect(
                processing_file,
                params=detection_params,
                chm=chm,
                chm_metadata=(chm_result.bounds.min_x, chm_result.bounds.min_y, resolution),
            )

            processing_time_ms = (time.perf_counter() - start_time) * 1000

            return ProcessingResult(
                file_path=str(file_path),
                ground_classification=ground_result,
                height_normalization=chm_result,
                tree_detection=tree_result,
                total_processing_time_ms=processing_time_ms,
                success=True,
            )

        except Exception as e:
            logger.exception("Processing failed: %s", e)
            processing_time_ms = (time.perf_counter() - start_time) * 1000

            return ProcessingResult(
                file_path=str(file_path),
                total_processing_time_ms=processing_time_ms,
                success=False,
                error=str(e),
            )
