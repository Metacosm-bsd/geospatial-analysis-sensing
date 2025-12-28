"""
Redis job worker for LiDAR processing pipeline.

This module provides the main entry point for the Redis-based job worker
that processes LiDAR analysis tasks asynchronously.
"""

from __future__ import annotations

import json
import logging
import signal
import sys
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable

import redis

from processing.pipelines.tree_detection import detect_trees
from processing.pipelines.ground_classification import classify_ground
from processing.pipelines.chm_generation import generate_chm

logger = logging.getLogger(__name__)


class JobType(str, Enum):
    """Enumeration of supported job types."""

    TREE_DETECTION = "tree_detection"
    GROUND_CLASSIFICATION = "ground_classification"
    CHM_GENERATION = "chm_generation"


@dataclass
class JobConfig:
    """Configuration for the job worker."""

    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    queue_name: str = "lidar:jobs"
    result_prefix: str = "lidar:results:"
    worker_timeout: int = 300


class Worker:
    """
    Redis-based job worker for processing LiDAR analysis tasks.

    The worker listens on a Redis queue for incoming jobs and dispatches
    them to the appropriate processing pipeline based on job type.

    Attributes:
        config: Worker configuration settings.
        redis_client: Redis client connection.
        handlers: Mapping of job types to handler functions.
        running: Flag indicating if the worker is running.
    """

    def __init__(self, config: JobConfig | None = None) -> None:
        """
        Initialize the worker with the given configuration.

        Args:
            config: Worker configuration. Uses defaults if not provided.
        """
        self.config = config or JobConfig()
        self.redis_client: redis.Redis[bytes] | None = None
        self.handlers: dict[JobType, Callable[..., dict[str, Any]]] = {
            JobType.TREE_DETECTION: self._handle_tree_detection,
            JobType.GROUND_CLASSIFICATION: self._handle_ground_classification,
            JobType.CHM_GENERATION: self._handle_chm_generation,
        }
        self.running = False

    def connect(self) -> None:
        """
        Establish connection to Redis.

        Raises:
            redis.ConnectionError: If connection to Redis fails.
        """
        self.redis_client = redis.Redis(
            host=self.config.redis_host,
            port=self.config.redis_port,
            db=self.config.redis_db,
        )
        self.redis_client.ping()
        logger.info(
            "Connected to Redis at %s:%d",
            self.config.redis_host,
            self.config.redis_port,
        )

    def disconnect(self) -> None:
        """Close connection to Redis."""
        if self.redis_client:
            self.redis_client.close()
            self.redis_client = None
            logger.info("Disconnected from Redis")

    def _handle_tree_detection(
        self,
        input_path: str,
        output_path: str,
        **params: Any,
    ) -> dict[str, Any]:
        """
        Handle tree detection job.

        Args:
            input_path: Path to input LAS/LAZ file.
            output_path: Path for output results.
            **params: Additional parameters for tree detection.

        Returns:
            Dictionary containing detection results and metadata.
        """
        trees = detect_trees(input_path, output_path, **params)
        return {
            "status": "completed",
            "tree_count": len(trees),
            "output_path": output_path,
        }

    def _handle_ground_classification(
        self,
        input_path: str,
        output_path: str,
        **params: Any,
    ) -> dict[str, Any]:
        """
        Handle ground classification job.

        Args:
            input_path: Path to input LAS/LAZ file.
            output_path: Path for output classified file.
            **params: Additional parameters for ground classification.

        Returns:
            Dictionary containing classification results and metadata.
        """
        stats = classify_ground(input_path, output_path, **params)
        return {
            "status": "completed",
            "output_path": output_path,
            "statistics": stats,
        }

    def _handle_chm_generation(
        self,
        input_path: str,
        output_path: str,
        **params: Any,
    ) -> dict[str, Any]:
        """
        Handle canopy height model generation job.

        Args:
            input_path: Path to input LAS/LAZ file.
            output_path: Path for output CHM raster.
            **params: Additional parameters for CHM generation.

        Returns:
            Dictionary containing CHM generation results and metadata.
        """
        metadata = generate_chm(input_path, output_path, **params)
        return {
            "status": "completed",
            "output_path": output_path,
            "metadata": metadata,
        }

    def process_job(self, job_data: dict[str, Any]) -> dict[str, Any]:
        """
        Process a single job.

        Args:
            job_data: Job specification including type and parameters.

        Returns:
            Dictionary containing job results.

        Raises:
            ValueError: If job type is unknown.
            Exception: If job processing fails.
        """
        job_type = JobType(job_data.get("type"))
        handler = self.handlers.get(job_type)

        if handler is None:
            raise ValueError(f"Unknown job type: {job_type}")

        params = job_data.get("params", {})
        return handler(**params)

    def run(self) -> None:
        """
        Start the worker main loop.

        Listens on the Redis queue for incoming jobs and processes them.
        Continues running until stopped via signal or error.
        """
        if self.redis_client is None:
            self.connect()

        self.running = True
        logger.info("Worker started, listening on queue: %s", self.config.queue_name)

        while self.running:
            try:
                # Block waiting for job with timeout
                result = self.redis_client.blpop(
                    self.config.queue_name,
                    timeout=5,
                )

                if result is None:
                    continue

                _, job_bytes = result
                job_data = json.loads(job_bytes.decode("utf-8"))
                job_id = job_data.get("id", "unknown")

                logger.info("Processing job: %s", job_id)

                try:
                    result_data = self.process_job(job_data)
                    result_data["job_id"] = job_id
                except Exception as e:
                    logger.exception("Job %s failed", job_id)
                    result_data = {
                        "job_id": job_id,
                        "status": "failed",
                        "error": str(e),
                    }

                # Store result in Redis
                result_key = f"{self.config.result_prefix}{job_id}"
                self.redis_client.set(
                    result_key,
                    json.dumps(result_data),
                    ex=3600,  # Expire after 1 hour
                )

            except redis.ConnectionError:
                logger.error("Lost connection to Redis, attempting reconnect...")
                self.connect()

    def stop(self) -> None:
        """Signal the worker to stop gracefully."""
        self.running = False
        logger.info("Worker stopping...")


def setup_signal_handlers(worker: Worker) -> None:
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
    Main entry point for the worker.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    worker = Worker()
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
