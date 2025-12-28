"""
FastAPI Application for LiDAR Processing Service.

This module provides the main FastAPI application with endpoints
for validating LiDAR files and extracting metadata.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

import redis
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from lidar_processing import __version__
from lidar_processing.config import Settings, configure_logging, get_settings
from lidar_processing.models import (
    ErrorResponse,
    ExtractMetadataRequest,
    HealthResponse,
    JobResponse,
    JobStatus,
    JobType,
    LidarMetadata,
    QueueJobRequest,
    ValidateRequest,
    ValidationResult,
)
from lidar_processing.services.lidar_validator import LidarValidator
from lidar_processing.services.metadata_extractor import MetadataExtractor
from lidar_processing.workers.queue_worker import QueueWorker

logger = logging.getLogger(__name__)

# Global state
_start_time: float = 0.0
_redis_client: redis.Redis | None = None
_queue_worker: QueueWorker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Handles startup and shutdown events.
    """
    global _start_time, _redis_client, _queue_worker

    # Startup
    settings = get_settings()
    configure_logging(settings)

    _start_time = time.time()

    # Initialize Redis connection
    try:
        _redis_client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password,
            ssl=settings.redis_ssl,
        )
        _redis_client.ping()
        logger.info("Connected to Redis")
    except redis.ConnectionError as e:
        logger.warning("Failed to connect to Redis: %s", e)
        _redis_client = None

    # Initialize queue worker (for programmatic job queuing)
    if _redis_client:
        _queue_worker = QueueWorker(settings)
        _queue_worker.redis_client = _redis_client

    logger.info("LiDAR Processing Service started (version %s)", __version__)

    yield

    # Shutdown
    if _redis_client:
        _redis_client.close()
        logger.info("Disconnected from Redis")


def create_app(settings: Settings | None = None) -> FastAPI:
    """
    Create and configure the FastAPI application.

    Args:
        settings: Optional settings instance.

    Returns:
        Configured FastAPI application.
    """
    if settings is None:
        settings = get_settings()

    app = FastAPI(
        title="LiDAR Processing Service",
        description="Microservice for validating and extracting metadata from LiDAR files",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/v1/docs",
        redoc_url="/api/v1/redoc",
        openapi_url="/api/v1/openapi.json",
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register exception handlers
    app.add_exception_handler(Exception, global_exception_handler)

    # Register routes
    _register_routes(app, settings)

    return app


async def global_exception_handler(request: Any, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unhandled errors.

    Args:
        request: The incoming request.
        exc: The exception that was raised.

    Returns:
        JSON error response.
    """
    logger.exception("Unhandled exception: %s", exc)

    error_response = ErrorResponse(
        error="internal_error",
        message="An unexpected error occurred",
        details={"type": type(exc).__name__} if get_settings().debug else None,
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response.model_dump(mode="json"),
    )


def _register_routes(app: FastAPI, settings: Settings) -> None:
    """
    Register all API routes.

    Args:
        app: FastAPI application.
        settings: Application settings.
    """
    # Initialize services
    validator = LidarValidator(settings)
    extractor = MetadataExtractor(settings)

    # ========================================================================
    # Health Check Endpoint
    # ========================================================================

    @app.get(
        "/api/v1/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Health check endpoint",
        description="Returns the service health status and Redis connection state.",
    )
    async def health_check() -> HealthResponse:
        """Check service health."""
        redis_connected = False

        if _redis_client:
            try:
                _redis_client.ping()
                redis_connected = True
            except redis.ConnectionError:
                redis_connected = False

        uptime_seconds = time.time() - _start_time

        return HealthResponse(
            status="healthy",
            version=__version__,
            timestamp=datetime.utcnow(),
            redis_connected=redis_connected,
            uptime_seconds=round(uptime_seconds, 2),
        )

    # ========================================================================
    # Validation Endpoint
    # ========================================================================

    @app.post(
        "/api/v1/validate",
        response_model=ValidationResult,
        tags=["Validation"],
        summary="Validate a LiDAR file",
        description="""
        Validates a LAS/LAZ file by checking:
        - File existence and extension
        - File size limits
        - LAS version compatibility
        - Point data format
        - Coordinate reference system
        - Spatial bounds validity
        - Scale factors

        Returns detailed validation results with any issues found.
        """,
        responses={
            200: {"description": "Validation completed (file may be valid or invalid)"},
            404: {"description": "File not found"},
            422: {"description": "Invalid request parameters"},
        },
    )
    async def validate_file(request: ValidateRequest) -> ValidationResult:
        """Validate a LiDAR file."""
        try:
            result = validator.validate(
                request.file_path,
                require_crs=request.require_crs,
                check_point_density=request.check_point_density,
            )
            return result

        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )

    # ========================================================================
    # Metadata Extraction Endpoint
    # ========================================================================

    @app.post(
        "/api/v1/extract-metadata",
        response_model=LidarMetadata,
        tags=["Metadata"],
        summary="Extract metadata from a LiDAR file",
        description="""
        Extracts comprehensive metadata from a LAS/LAZ file including:
        - File information (size, extension)
        - LAS header data (version, point format)
        - Spatial bounds (min/max x, y, z)
        - Coordinate reference system (WKT and EPSG)
        - Point density (points per square meter)
        - Classification breakdown with counts
        - Return number statistics
        """,
        responses={
            200: {"description": "Metadata extracted successfully"},
            404: {"description": "File not found"},
            422: {"description": "Invalid request or unsupported file format"},
        },
    )
    async def extract_metadata(request: ExtractMetadataRequest) -> LidarMetadata:
        """Extract metadata from a LiDAR file."""
        try:
            metadata = extractor.extract(
                request.file_path,
                include_classification_counts=request.include_classification_counts,
                include_return_statistics=request.include_return_statistics,
                calculate_density=request.calculate_density,
                sample_size=request.sample_size,
            )
            return metadata

        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )

    # ========================================================================
    # Queue Job Endpoint
    # ========================================================================

    @app.post(
        "/api/v1/queue",
        response_model=JobResponse,
        tags=["Queue"],
        summary="Queue a processing job",
        description="""
        Queues a file processing job for asynchronous execution.

        The job will be processed by a worker and results stored in Redis.
        If a callback URL is provided, results will be POSTed there when complete.

        Job types:
        - `validate`: Validate the file only
        - `extract_metadata`: Extract metadata only
        - `validate_and_extract`: Validate first, then extract metadata if valid
        """,
        responses={
            200: {"description": "Job queued successfully"},
            503: {"description": "Redis not available"},
        },
    )
    async def queue_job(request: QueueJobRequest) -> JobResponse:
        """Queue a processing job."""
        if not _queue_worker or not _redis_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Queue service not available (Redis not connected)",
            )

        try:
            job_id = _queue_worker.queue_job(
                file_path=request.file_path,
                job_type=request.job_type,
                callback_url=request.callback_url,
                priority=request.priority,
                params=request.metadata,
            )

            return JobResponse(
                job_id=job_id,
                status=JobStatus.PENDING,
                job_type=request.job_type,
                file_path=request.file_path,
                queued_at=datetime.utcnow(),
                estimated_time_seconds=30,  # Rough estimate
            )

        except Exception as e:
            logger.exception("Failed to queue job: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to queue job: {str(e)}",
            )

    # ========================================================================
    # Job Status Endpoint
    # ========================================================================

    @app.get(
        "/api/v1/jobs/{job_id}",
        tags=["Queue"],
        summary="Get job status/result",
        description="Get the status or result of a queued job.",
        responses={
            200: {"description": "Job found"},
            404: {"description": "Job not found"},
            503: {"description": "Redis not available"},
        },
    )
    async def get_job_status(job_id: str) -> dict[str, Any]:
        """Get the status or result of a job."""
        if not _queue_worker or not _redis_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Queue service not available (Redis not connected)",
            )

        result = _queue_worker.get_result(job_id)

        if result:
            return result.model_dump(mode="json")

        # Job might still be pending
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job not found: {job_id}. It may still be pending or expired.",
        )


# Create the application instance
app = create_app()


def main() -> None:
    """
    Run the application with uvicorn.

    This is the entry point for running the service directly.
    """
    import uvicorn

    settings = get_settings()

    uvicorn.run(
        "lidar_processing.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        workers=settings.api_workers,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
