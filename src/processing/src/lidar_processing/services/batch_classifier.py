"""
Batch Classification Service.

This module provides efficient batch processing capabilities for
species classification, including progress tracking and async processing.

Sprint 15-16: ML Validation, Calibration, and Feedback Systems
"""

from __future__ import annotations

import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable

import redis

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    BatchProgress,
    BatchResult,
    SpeciesPrediction,
    TreeFeatures,
)
from lidar_processing.services.species_classifier import SpeciesClassifier

logger = logging.getLogger(__name__)


class BatchStatus(str, Enum):
    """Status of a batch classification job."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class BatchJob:
    """
    Internal representation of a batch classification job.

    Attributes:
        job_id: Unique identifier for the job.
        analysis_id: Optional analysis ID this job belongs to.
        total_trees: Total number of trees to classify.
        processed_trees: Number of trees processed so far.
        status: Current job status.
        predictions: List of predictions (populated as processing completes).
        error: Error message if job failed.
        created_at: Job creation timestamp.
        started_at: Processing start timestamp.
        completed_at: Processing completion timestamp.
    """

    job_id: str
    analysis_id: str | None
    total_trees: int
    processed_trees: int = 0
    status: BatchStatus = BatchStatus.QUEUED
    predictions: list[SpeciesPrediction] = field(default_factory=list)
    error: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class BatchClassifier:
    """
    Efficient batch processing for species classification.

    Provides methods for classifying large numbers of trees in batches
    with progress tracking and optional async processing.

    Attributes:
        settings: Application settings.
        classifier: Species classifier instance.
        redis_client: Optional Redis client for job persistence.
    """

    def __init__(
        self,
        classifier: SpeciesClassifier | None = None,
        region: str = "pnw",
        settings: Settings | None = None,
        redis_client: redis.Redis | None = None,
        max_workers: int = 4,
    ) -> None:
        """
        Initialize the batch classifier.

        Args:
            classifier: Optional pre-initialized species classifier.
            region: Geographic region for species classification.
            settings: Optional settings instance.
            redis_client: Optional Redis client for job persistence.
            max_workers: Maximum worker threads for parallel processing.
        """
        self.settings = settings or get_settings()
        self.region = region
        self.redis_client = redis_client
        self.max_workers = max_workers

        # Initialize classifier
        self.classifier = classifier or SpeciesClassifier(region=region, settings=self.settings)

        # In-memory job storage (fallback when Redis unavailable)
        self._jobs: dict[str, BatchJob] = {}

        # Redis key prefixes
        self._jobs_key = "lidar:batch:jobs"
        self._results_key = "lidar:batch:results"

    def classify_batch(
        self,
        trees: list[TreeFeatures],
        batch_size: int = 1000,
        progress_callback: Callable[[int, int], None] | None = None,
        use_heuristics: bool = True,
    ) -> list[SpeciesPrediction]:
        """
        Classify a batch of trees with progress tracking.

        Args:
            trees: List of TreeFeatures to classify.
            batch_size: Number of trees to process in each batch.
            progress_callback: Optional callback(processed, total) for progress updates.
            use_heuristics: Whether to use heuristics for low-confidence predictions.

        Returns:
            List of SpeciesPrediction for each tree.
        """
        if not trees:
            return []

        logger.info("Starting batch classification of %d trees", len(trees))
        start_time = time.time()

        predictions = []
        total = len(trees)

        # Process in batches
        for i in range(0, total, batch_size):
            batch = trees[i:i + batch_size]
            batch_end = min(i + batch_size, total)

            # Classify batch
            if use_heuristics:
                batch_predictions = [
                    self.classifier.predict_with_heuristics(features)
                    for features in batch
                ]
            else:
                batch_predictions = self.classifier.predict(batch)

            predictions.extend(batch_predictions)

            # Report progress
            if progress_callback:
                progress_callback(batch_end, total)

            logger.debug("Processed batch %d-%d of %d", i + 1, batch_end, total)

        elapsed = time.time() - start_time
        logger.info(
            "Batch classification complete: %d trees in %.2fs (%.1f trees/sec)",
            total,
            elapsed,
            total / elapsed if elapsed > 0 else 0,
        )

        return predictions

    def classify_batch_parallel(
        self,
        trees: list[TreeFeatures],
        batch_size: int = 500,
        progress_callback: Callable[[int, int], None] | None = None,
        use_heuristics: bool = True,
    ) -> list[SpeciesPrediction]:
        """
        Classify trees using parallel processing for improved performance.

        Args:
            trees: List of TreeFeatures to classify.
            batch_size: Number of trees per batch.
            progress_callback: Optional callback for progress updates.
            use_heuristics: Whether to use heuristics.

        Returns:
            List of SpeciesPrediction for each tree.
        """
        if not trees:
            return []

        logger.info("Starting parallel batch classification of %d trees", len(trees))
        start_time = time.time()

        total = len(trees)
        batches = [
            (i, trees[i:i + batch_size])
            for i in range(0, total, batch_size)
        ]

        results: dict[int, list[SpeciesPrediction]] = {}
        processed = 0

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_batch = {
                executor.submit(
                    self._process_batch,
                    batch,
                    use_heuristics,
                ): batch_idx
                for batch_idx, batch in batches
            }

            for future in as_completed(future_to_batch):
                batch_idx = future_to_batch[future]
                try:
                    batch_predictions = future.result()
                    results[batch_idx] = batch_predictions
                    processed += len(batch_predictions)

                    if progress_callback:
                        progress_callback(processed, total)

                except Exception as e:
                    logger.error("Batch %d failed: %s", batch_idx, e)
                    # Fill with empty predictions for failed batch
                    batch_size_actual = len(batches[batch_idx // batch_size][1])
                    results[batch_idx] = [
                        self._create_error_prediction()
                        for _ in range(batch_size_actual)
                    ]

        # Reconstruct ordered results
        predictions = []
        for batch_idx in sorted(results.keys()):
            predictions.extend(results[batch_idx])

        elapsed = time.time() - start_time
        logger.info(
            "Parallel batch classification complete: %d trees in %.2fs (%.1f trees/sec)",
            total,
            elapsed,
            total / elapsed if elapsed > 0 else 0,
        )

        return predictions

    def classify_analysis_async(
        self,
        analysis_id: str,
        trees: list[TreeFeatures],
    ) -> str:
        """
        Queue trees for background classification.

        Args:
            analysis_id: ID of the analysis containing these trees.
            trees: List of TreeFeatures to classify.

        Returns:
            Job ID for tracking progress.
        """
        job_id = str(uuid.uuid4())

        job = BatchJob(
            job_id=job_id,
            analysis_id=analysis_id,
            total_trees=len(trees),
        )

        # Store job
        self._store_job(job)

        # Queue for processing
        if self.redis_client:
            try:
                # Store trees for processing
                trees_key = f"{self._jobs_key}:{job_id}:trees"
                for i, tree in enumerate(trees):
                    self.redis_client.rpush(trees_key, tree.model_dump_json())

                # Add to processing queue
                queue_key = f"{self._jobs_key}:queue"
                self.redis_client.rpush(queue_key, job_id)

                logger.info(
                    "Queued async classification job %s with %d trees",
                    job_id,
                    len(trees),
                )

            except Exception as e:
                logger.error("Failed to queue async job: %s", e)
                job.status = BatchStatus.FAILED
                job.error = str(e)
                self._store_job(job)
        else:
            # Process synchronously if Redis not available
            self._process_job_sync(job, trees)

        return job_id

    def get_batch_progress(
        self,
        job_id: str,
    ) -> BatchProgress:
        """
        Get the progress of a batch classification job.

        Args:
            job_id: The job ID to check.

        Returns:
            BatchProgress with current status and progress.

        Raises:
            ValueError: If job is not found.
        """
        job = self._get_job(job_id)

        if job is None:
            raise ValueError(f"Job not found: {job_id}")

        # Calculate progress percentage
        progress_pct = (
            job.processed_trees / job.total_trees * 100
            if job.total_trees > 0
            else 0
        )

        # Calculate elapsed time
        elapsed_seconds = None
        if job.started_at:
            end_time = job.completed_at or datetime.utcnow()
            elapsed_seconds = (end_time - job.started_at).total_seconds()

        # Estimate remaining time
        eta_seconds = None
        if elapsed_seconds and job.processed_trees > 0 and job.status == BatchStatus.PROCESSING:
            rate = job.processed_trees / elapsed_seconds
            remaining = job.total_trees - job.processed_trees
            eta_seconds = remaining / rate if rate > 0 else None

        return BatchProgress(
            job_id=job_id,
            analysis_id=job.analysis_id,
            status=job.status.value,
            total_trees=job.total_trees,
            processed_trees=job.processed_trees,
            progress_percentage=round(progress_pct, 1),
            elapsed_seconds=round(elapsed_seconds, 1) if elapsed_seconds else None,
            eta_seconds=round(eta_seconds, 1) if eta_seconds else None,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error=job.error,
        )

    def get_batch_result(
        self,
        job_id: str,
    ) -> BatchResult | None:
        """
        Get the result of a completed batch classification job.

        Args:
            job_id: The job ID to retrieve results for.

        Returns:
            BatchResult with predictions, or None if not complete.
        """
        job = self._get_job(job_id)

        if job is None:
            return None

        if job.status != BatchStatus.COMPLETED:
            return None

        # Get predictions from Redis if available
        predictions = job.predictions
        if not predictions and self.redis_client:
            try:
                results_key = f"{self._results_key}:{job_id}"
                data = self.redis_client.lrange(results_key, 0, -1)
                predictions = [
                    SpeciesPrediction.model_validate_json(item)
                    for item in data
                ]
            except Exception as e:
                logger.warning("Failed to get results from Redis: %s", e)

        # Calculate summary statistics
        species_counts: dict[str, int] = {}
        confidence_sum = 0.0
        for pred in predictions:
            species_counts[pred.species_code] = species_counts.get(pred.species_code, 0) + 1
            confidence_sum += pred.confidence

        avg_confidence = confidence_sum / len(predictions) if predictions else 0.0

        processing_time = None
        if job.started_at and job.completed_at:
            processing_time = (job.completed_at - job.started_at).total_seconds()

        return BatchResult(
            job_id=job_id,
            analysis_id=job.analysis_id,
            predictions=predictions,
            total_trees=job.total_trees,
            species_distribution=species_counts,
            average_confidence=round(avg_confidence, 4),
            processing_time_seconds=processing_time,
            completed_at=job.completed_at,
        )

    def cancel_job(
        self,
        job_id: str,
    ) -> bool:
        """
        Cancel a queued or running job.

        Args:
            job_id: The job to cancel.

        Returns:
            True if job was cancelled, False otherwise.
        """
        job = self._get_job(job_id)

        if job is None:
            return False

        if job.status in (BatchStatus.COMPLETED, BatchStatus.FAILED):
            return False

        job.status = BatchStatus.CANCELLED
        job.completed_at = datetime.utcnow()
        self._store_job(job)

        logger.info("Cancelled job %s", job_id)
        return True

    def list_jobs(
        self,
        status: BatchStatus | None = None,
        limit: int = 100,
    ) -> list[BatchProgress]:
        """
        List batch classification jobs.

        Args:
            status: Optional filter by status.
            limit: Maximum number of jobs to return.

        Returns:
            List of BatchProgress for matching jobs.
        """
        jobs = list(self._jobs.values())

        if status:
            jobs = [j for j in jobs if j.status == status]

        # Sort by creation time, newest first
        jobs.sort(key=lambda j: j.created_at, reverse=True)

        return [self.get_batch_progress(j.job_id) for j in jobs[:limit]]

    def process_queued_jobs(
        self,
        max_jobs: int = 10,
    ) -> int:
        """
        Process queued jobs (for use by background worker).

        Args:
            max_jobs: Maximum number of jobs to process.

        Returns:
            Number of jobs processed.
        """
        processed = 0

        for _ in range(max_jobs):
            job_id = self._dequeue_job()
            if not job_id:
                break

            job = self._get_job(job_id)
            if job and job.status == BatchStatus.QUEUED:
                self._process_job_from_queue(job)
                processed += 1

        return processed

    def _process_batch(
        self,
        batch: list[TreeFeatures],
        use_heuristics: bool,
    ) -> list[SpeciesPrediction]:
        """Process a single batch of trees."""
        if use_heuristics:
            return [
                self.classifier.predict_with_heuristics(features)
                for features in batch
            ]
        return self.classifier.predict(batch)

    def _process_job_sync(
        self,
        job: BatchJob,
        trees: list[TreeFeatures],
    ) -> None:
        """Process a job synchronously."""
        job.status = BatchStatus.PROCESSING
        job.started_at = datetime.utcnow()
        self._store_job(job)

        try:
            def update_progress(processed: int, total: int) -> None:
                job.processed_trees = processed
                self._store_job(job)

            predictions = self.classify_batch(
                trees,
                progress_callback=update_progress,
            )

            job.predictions = predictions
            job.status = BatchStatus.COMPLETED
            job.processed_trees = len(predictions)
            job.completed_at = datetime.utcnow()

        except Exception as e:
            logger.error("Job %s failed: %s", job.job_id, e)
            job.status = BatchStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.utcnow()

        self._store_job(job)

    def _process_job_from_queue(
        self,
        job: BatchJob,
    ) -> None:
        """Process a queued job, loading trees from Redis."""
        if not self.redis_client:
            job.status = BatchStatus.FAILED
            job.error = "Redis not available"
            self._store_job(job)
            return

        job.status = BatchStatus.PROCESSING
        job.started_at = datetime.utcnow()
        self._store_job(job)

        try:
            # Load trees from Redis
            trees_key = f"{self._jobs_key}:{job.job_id}:trees"
            tree_data = self.redis_client.lrange(trees_key, 0, -1)
            trees = [
                TreeFeatures.model_validate_json(data)
                for data in tree_data
            ]

            # Process
            predictions = self.classify_batch(trees)

            # Store results
            results_key = f"{self._results_key}:{job.job_id}"
            for pred in predictions:
                self.redis_client.rpush(results_key, pred.model_dump_json())

            job.status = BatchStatus.COMPLETED
            job.processed_trees = len(predictions)
            job.completed_at = datetime.utcnow()

            # Cleanup trees data
            self.redis_client.delete(trees_key)

        except Exception as e:
            logger.error("Job %s failed: %s", job.job_id, e)
            job.status = BatchStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.utcnow()

        self._store_job(job)

    def _store_job(self, job: BatchJob) -> None:
        """Store job in memory and Redis."""
        self._jobs[job.job_id] = job

        if self.redis_client:
            try:
                key = f"{self._jobs_key}:{job.job_id}:meta"
                data = {
                    "job_id": job.job_id,
                    "analysis_id": job.analysis_id,
                    "total_trees": job.total_trees,
                    "processed_trees": job.processed_trees,
                    "status": job.status.value,
                    "error": job.error,
                    "created_at": job.created_at.isoformat(),
                    "started_at": job.started_at.isoformat() if job.started_at else None,
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                }
                import json
                self.redis_client.set(key, json.dumps(data))
            except Exception as e:
                logger.warning("Failed to store job in Redis: %s", e)

    def _get_job(self, job_id: str) -> BatchJob | None:
        """Retrieve job from memory or Redis."""
        if job_id in self._jobs:
            return self._jobs[job_id]

        if self.redis_client:
            try:
                key = f"{self._jobs_key}:{job_id}:meta"
                data = self.redis_client.get(key)
                if data:
                    import json
                    job_data = json.loads(data)
                    job = BatchJob(
                        job_id=job_data["job_id"],
                        analysis_id=job_data.get("analysis_id"),
                        total_trees=job_data["total_trees"],
                        processed_trees=job_data.get("processed_trees", 0),
                        status=BatchStatus(job_data["status"]),
                        error=job_data.get("error"),
                        created_at=datetime.fromisoformat(job_data["created_at"]),
                        started_at=(
                            datetime.fromisoformat(job_data["started_at"])
                            if job_data.get("started_at")
                            else None
                        ),
                        completed_at=(
                            datetime.fromisoformat(job_data["completed_at"])
                            if job_data.get("completed_at")
                            else None
                        ),
                    )
                    self._jobs[job_id] = job
                    return job
            except Exception as e:
                logger.warning("Failed to get job from Redis: %s", e)

        return None

    def _dequeue_job(self) -> str | None:
        """Get next job ID from queue."""
        if self.redis_client:
            try:
                queue_key = f"{self._jobs_key}:queue"
                job_id = self.redis_client.lpop(queue_key)
                return job_id.decode() if job_id else None
            except Exception as e:
                logger.warning("Failed to dequeue job: %s", e)

        return None

    def _create_error_prediction(self) -> SpeciesPrediction:
        """Create an error prediction for failed classifications."""
        return SpeciesPrediction(
            species_code="UNKNOWN",
            species_name="Unknown (Error)",
            confidence=0.0,
            probabilities={},
        )
