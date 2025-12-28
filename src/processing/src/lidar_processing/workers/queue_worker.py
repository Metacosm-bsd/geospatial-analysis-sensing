"""
Queue Worker for LiDAR Processing Jobs.

This module provides a Redis-based queue worker that listens for
file processing jobs and executes validation/metadata extraction.
Results are stored in Redis and optionally sent to a callback URL.
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import time
import uuid
from datetime import datetime
from typing import Any, Callable

import httpx
import redis

from lidar_processing.config import Settings, configure_logging, get_settings
from lidar_processing.models import (
    GroundClassificationParams,
    HeightNormalizationParams,
    JobResult,
    JobStatus,
    JobType,
    LidarMetadata,
    ProcessingResult,
    TreeDetectionParams,
    ValidationResult,
)
from lidar_processing.services.lidar_validator import LidarValidator
from lidar_processing.services.metadata_extractor import MetadataExtractor
from lidar_processing.workers.processing_worker import ProcessingWorker

logger = logging.getLogger(__name__)


class QueueWorker:
    """
    Redis-based queue worker for LiDAR processing jobs.

    Listens on a Redis queue for incoming jobs and processes them
    using the LidarValidator and MetadataExtractor services. Results
    are stored in Redis and optionally sent to a callback URL.

    Attributes:
        settings: Application settings.
        redis_client: Redis client connection.
        validator: LiDAR file validator service.
        extractor: Metadata extractor service.
        running: Flag indicating if the worker is running.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the queue worker.

        Args:
            settings: Optional settings instance. Uses cached settings if not provided.
        """
        self.settings = settings or get_settings()
        self.redis_client: redis.Redis | None = None
        self.validator = LidarValidator(self.settings)
        self.extractor = MetadataExtractor(self.settings)
        self.processing_worker = ProcessingWorker(self.settings)
        self.running = False
        self._http_client: httpx.Client | None = None

        # Job handlers
        self._handlers: dict[JobType, Callable[..., JobResult]] = {
            JobType.VALIDATE: self._handle_validate,
            JobType.EXTRACT_METADATA: self._handle_extract_metadata,
            JobType.VALIDATE_AND_EXTRACT: self._handle_validate_and_extract,
            JobType.GROUND_CLASSIFY: self._handle_ground_classify,
            JobType.NORMALIZE_HEIGHT: self._handle_normalize_height,
            JobType.DETECT_TREES: self._handle_detect_trees,
            JobType.FULL_PIPELINE: self._handle_full_pipeline,
        }

    def connect(self) -> None:
        """
        Establish connection to Redis.

        Raises:
            redis.ConnectionError: If connection fails.
        """
        logger.info(
            "Connecting to Redis at %s:%d",
            self.settings.redis_host,
            self.settings.redis_port,
        )

        self.redis_client = redis.Redis(
            host=self.settings.redis_host,
            port=self.settings.redis_port,
            db=self.settings.redis_db,
            password=self.settings.redis_password,
            ssl=self.settings.redis_ssl,
            decode_responses=False,  # We handle encoding ourselves
        )

        # Test connection
        self.redis_client.ping()
        logger.info("Successfully connected to Redis")

        # Initialize HTTP client for callbacks
        self._http_client = httpx.Client(
            timeout=self.settings.callback_timeout,
            follow_redirects=True,
        )

    def disconnect(self) -> None:
        """Close connections to Redis and HTTP client."""
        if self.redis_client:
            self.redis_client.close()
            self.redis_client = None
            logger.info("Disconnected from Redis")

        if self._http_client:
            self._http_client.close()
            self._http_client = None

    def run(self) -> None:
        """
        Start the worker main loop.

        Listens on the Redis queue for incoming jobs and processes them.
        Continues running until stopped via signal or error.
        """
        if not self.redis_client:
            self.connect()

        self.running = True
        logger.info(
            "Worker started, listening on queue: %s",
            self.settings.queue_name,
        )

        while self.running:
            try:
                # Block waiting for job with 5 second timeout
                result = self.redis_client.blpop(
                    self.settings.queue_name,
                    timeout=5,
                )

                if result is None:
                    continue

                _, job_bytes = result
                self._process_job(job_bytes)

            except redis.ConnectionError as e:
                logger.error("Lost connection to Redis: %s", e)
                if self.running:
                    logger.info("Attempting to reconnect...")
                    time.sleep(5)
                    try:
                        self.connect()
                    except Exception as reconnect_error:
                        logger.error("Reconnection failed: %s", reconnect_error)
                        time.sleep(10)

            except Exception as e:
                logger.exception("Error in worker loop: %s", e)
                time.sleep(1)

    def stop(self) -> None:
        """Signal the worker to stop gracefully."""
        self.running = False
        logger.info("Worker stopping...")

    def _process_job(self, job_bytes: bytes) -> None:
        """
        Process a single job from the queue.

        Args:
            job_bytes: Raw job data from Redis.
        """
        start_time = time.perf_counter()

        try:
            job_data = json.loads(job_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.error("Failed to decode job data: %s", e)
            return

        job_id = job_data.get("job_id", str(uuid.uuid4()))
        logger.info("Processing job: %s", job_id)

        try:
            job_type = JobType(job_data.get("job_type", "validate"))
            file_path = job_data.get("file_path")
            callback_url = job_data.get("callback_url")
            queued_at = job_data.get("queued_at", datetime.utcnow().isoformat())

            if not file_path:
                raise ValueError("Missing required field: file_path")

            # Get the handler for this job type
            handler = self._handlers.get(job_type)
            if not handler:
                raise ValueError(f"Unknown job type: {job_type}")

            # Execute the job
            job_result = handler(
                job_id=job_id,
                file_path=file_path,
                job_type=job_type,
                queued_at=queued_at,
                start_time=start_time,
                params=job_data.get("params", {}),
            )

        except Exception as e:
            logger.exception("Job %s failed: %s", job_id, e)

            processing_time_ms = (time.perf_counter() - start_time) * 1000

            job_result = JobResult(
                job_id=job_id,
                status=JobStatus.FAILED,
                job_type=JobType(job_data.get("job_type", "validate")),
                file_path=job_data.get("file_path", "unknown"),
                queued_at=datetime.fromisoformat(job_data.get("queued_at", datetime.utcnow().isoformat())),
                completed_at=datetime.utcnow(),
                processing_time_ms=processing_time_ms,
                error=str(e),
            )

        # Store result in Redis
        self._store_result(job_id, job_result)

        # Send callback if configured
        callback_url = job_data.get("callback_url")
        if callback_url:
            self._send_callback(callback_url, job_result)

        logger.info(
            "Job %s completed with status: %s (%.1f ms)",
            job_id,
            job_result.status.value,
            job_result.processing_time_ms,
        )

    def _handle_validate(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle a validation job.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with validation results.
        """
        validation_result = self.validator.validate(
            file_path,
            require_crs=params.get("require_crs"),
            check_point_density=params.get("check_point_density", False),
        )

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        status = JobStatus.COMPLETED if validation_result.is_valid else JobStatus.COMPLETED

        return JobResult(
            job_id=job_id,
            status=status,
            job_type=job_type,
            file_path=file_path,
            queued_at=datetime.fromisoformat(queued_at),
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
            validation_result=validation_result,
        )

    def _handle_extract_metadata(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle a metadata extraction job.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with extracted metadata.
        """
        metadata = self.extractor.extract(
            file_path,
            include_classification_counts=params.get("include_classification_counts", True),
            include_return_statistics=params.get("include_return_statistics", True),
            calculate_density=params.get("calculate_density", True),
            sample_size=params.get("sample_size"),
        )

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        return JobResult(
            job_id=job_id,
            status=JobStatus.COMPLETED,
            job_type=job_type,
            file_path=file_path,
            queued_at=datetime.fromisoformat(queued_at),
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
            metadata=metadata,
        )

    def _handle_validate_and_extract(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle a combined validation and extraction job.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with both validation and metadata.
        """
        # First validate
        validation_result = self.validator.validate(
            file_path,
            require_crs=params.get("require_crs"),
            check_point_density=params.get("check_point_density", False),
        )

        metadata: LidarMetadata | None = None

        # Only extract metadata if validation passed
        if validation_result.is_valid:
            metadata = self.extractor.extract(
                file_path,
                include_classification_counts=params.get("include_classification_counts", True),
                include_return_statistics=params.get("include_return_statistics", True),
                calculate_density=params.get("calculate_density", True),
                sample_size=params.get("sample_size"),
            )

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        return JobResult(
            job_id=job_id,
            status=JobStatus.COMPLETED,
            job_type=job_type,
            file_path=file_path,
            queued_at=datetime.fromisoformat(queued_at),
            completed_at=datetime.utcnow(),
            processing_time_ms=processing_time_ms,
            validation_result=validation_result,
            metadata=metadata,
        )

    def _handle_ground_classify(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle ground classification job.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with classification results.
        """
        return self.processing_worker.process_job(
            job_type=job_type,
            file_path=file_path,
            job_id=job_id,
            params=params,
            output_dir=params.get("output_dir"),
        )

    def _handle_normalize_height(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle height normalization job.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with normalization results.
        """
        return self.processing_worker.process_job(
            job_type=job_type,
            file_path=file_path,
            job_id=job_id,
            params=params,
            output_dir=params.get("output_dir"),
        )

    def _handle_detect_trees(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle tree detection job.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with tree detection results.
        """
        return self.processing_worker.process_job(
            job_type=job_type,
            file_path=file_path,
            job_id=job_id,
            params=params,
            output_dir=params.get("output_dir"),
        )

    def _handle_full_pipeline(
        self,
        job_id: str,
        file_path: str,
        job_type: JobType,
        queued_at: str,
        start_time: float,
        params: dict[str, Any],
    ) -> JobResult:
        """
        Handle full processing pipeline job.

        Runs ground classification, height normalization, and tree detection.

        Args:
            job_id: Unique job identifier.
            file_path: Path to the LAS/LAZ file.
            job_type: Type of job.
            queued_at: When the job was queued.
            start_time: Processing start time.
            params: Additional parameters.

        Returns:
            JobResult with full pipeline results.
        """
        return self.processing_worker.process_job(
            job_type=job_type,
            file_path=file_path,
            job_id=job_id,
            params=params,
            output_dir=params.get("output_dir"),
        )

    def _store_result(self, job_id: str, result: JobResult) -> None:
        """
        Store job result in Redis.

        Args:
            job_id: Job identifier.
            result: Job result to store.
        """
        if not self.redis_client:
            logger.warning("Cannot store result: Redis not connected")
            return

        result_key = f"{self.settings.result_queue_prefix}{job_id}"

        try:
            result_json = result.model_dump_json()
            self.redis_client.set(
                result_key,
                result_json,
                ex=self.settings.result_ttl,
            )
            logger.debug("Stored result for job %s", job_id)

        except Exception as e:
            logger.error("Failed to store result for job %s: %s", job_id, e)

    def _send_callback(self, callback_url: str, result: JobResult) -> None:
        """
        Send job result to callback URL.

        Args:
            callback_url: URL to POST results to.
            result: Job result to send.
        """
        if not self._http_client:
            logger.warning("Cannot send callback: HTTP client not initialized")
            return

        for attempt in range(self.settings.callback_retries):
            try:
                response = self._http_client.post(
                    callback_url,
                    json=result.model_dump(mode="json"),
                    headers={"Content-Type": "application/json"},
                )

                if response.is_success:
                    logger.info(
                        "Callback sent to %s (status: %d)",
                        callback_url,
                        response.status_code,
                    )
                    return
                else:
                    logger.warning(
                        "Callback failed (attempt %d/%d): %d %s",
                        attempt + 1,
                        self.settings.callback_retries,
                        response.status_code,
                        response.text[:100],
                    )

            except Exception as e:
                logger.warning(
                    "Callback error (attempt %d/%d): %s",
                    attempt + 1,
                    self.settings.callback_retries,
                    e,
                )

            # Wait before retry
            if attempt < self.settings.callback_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff

        logger.error(
            "Failed to send callback to %s after %d attempts",
            callback_url,
            self.settings.callback_retries,
        )

    def queue_job(
        self,
        file_path: str,
        job_type: JobType = JobType.VALIDATE,
        callback_url: str | None = None,
        priority: int = 0,
        params: dict[str, Any] | None = None,
    ) -> str:
        """
        Queue a new job for processing.

        This method can be used to programmatically add jobs to the queue.

        Args:
            file_path: Path to the LAS/LAZ file.
            job_type: Type of processing job.
            callback_url: Optional URL to POST results.
            priority: Job priority (not currently implemented).
            params: Additional job parameters.

        Returns:
            Job ID for tracking.
        """
        if not self.redis_client:
            raise RuntimeError("Not connected to Redis")

        job_id = str(uuid.uuid4())

        job_data = {
            "job_id": job_id,
            "file_path": file_path,
            "job_type": job_type.value,
            "callback_url": callback_url,
            "priority": priority,
            "params": params or {},
            "queued_at": datetime.utcnow().isoformat(),
        }

        self.redis_client.rpush(
            self.settings.queue_name,
            json.dumps(job_data),
        )

        logger.info("Queued job %s for file: %s", job_id, file_path)

        return job_id

    def get_result(self, job_id: str) -> JobResult | None:
        """
        Get the result of a completed job.

        Args:
            job_id: Job identifier.

        Returns:
            JobResult if found, None otherwise.
        """
        if not self.redis_client:
            raise RuntimeError("Not connected to Redis")

        result_key = f"{self.settings.result_queue_prefix}{job_id}"

        try:
            result_data = self.redis_client.get(result_key)

            if result_data:
                return JobResult.model_validate_json(result_data)

            return None

        except Exception as e:
            logger.error("Failed to get result for job %s: %s", job_id, e)
            return None


def setup_signal_handlers(worker: QueueWorker) -> None:
    """
    Set up signal handlers for graceful shutdown.

    Args:
        worker: The worker instance to stop on signal.
    """

    def signal_handler(signum: int, frame: Any) -> None:
        logger.info("Received signal %d, shutting down...", signum)
        worker.stop()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


def main() -> int:
    """
    Main entry point for the queue worker.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    configure_logging()

    worker = QueueWorker()
    setup_signal_handlers(worker)

    try:
        worker.connect()
        worker.run()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception:
        logger.exception("Worker failed with error")
        return 1
    finally:
        worker.disconnect()

    return 0


if __name__ == "__main__":
    sys.exit(main())
