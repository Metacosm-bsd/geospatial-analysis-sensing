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
    GenerateReportRequest,
    HealthResponse,
    JobResponse,
    JobStatus,
    JobType,
    LidarMetadata,
    QueueJobRequest,
    ReportResult,
    ReportStatus,
    TreeMetrics,
    ValidateRequest,
    ValidationResult,
)
from lidar_processing.services.lidar_validator import LidarValidator
from lidar_processing.services.metadata_extractor import MetadataExtractor
from lidar_processing.services.point_extractor import PointExtractor
from lidar_processing.services.report_generator import ReportGenerator
from lidar_processing.workers.queue_worker import QueueWorker

logger = logging.getLogger(__name__)

# Global state
_start_time: float = 0.0
_redis_client: redis.Redis | None = None
_queue_worker: QueueWorker | None = None
_report_generator: ReportGenerator | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Handles startup and shutdown events.
    """
    global _start_time, _redis_client, _queue_worker, _report_generator

    # Startup
    settings = get_settings()
    configure_logging(settings)

    _start_time = time.time()

    # Initialize report generator
    _report_generator = ReportGenerator(settings)

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
    point_extractor = PointExtractor(settings)

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

    # ========================================================================
    # Point Extraction Endpoint (Sprint 9-10)
    # ========================================================================

    @app.post(
        "/api/v1/extract-points",
        tags=["Viewer"],
        summary="Extract point cloud data",
        description="""
        Extracts point cloud data from a LAS/LAZ file for 3D visualization.

        Supports:
        - LOD (Level of Detail) through downsampling
        - Binary (base64) and JSON output formats
        - Chunked streaming for large files

        Returns point data with coordinates, intensity, classification, and RGB.
        """,
        responses={
            200: {"description": "Points extracted successfully"},
            404: {"description": "File not found"},
            422: {"description": "Invalid request parameters"},
        },
    )
    async def extract_points(
        file_path: str,
        offset: int = 0,
        limit: int = 1_000_000,
        downsample_factor: int = 1,
        format: str = "binary",
        attributes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Extract points from a LiDAR file for 3D viewer."""
        try:
            result = point_extractor.extract_points(
                file_path=file_path,
                offset=offset,
                limit=limit,
                downsample_factor=downsample_factor,
                output_format=format,
                attributes=attributes,
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
    # File Metadata for Viewer Endpoint (Sprint 9-10)
    # ========================================================================

    @app.post(
        "/api/v1/file-metadata",
        tags=["Viewer"],
        summary="Get file metadata for viewer",
        description="""
        Gets point cloud file metadata optimized for 3D viewer initialization.

        Returns:
        - Point count and bounds
        - CRS information
        - Available attributes (intensity, RGB, classification)
        - LOD level information
        """,
        responses={
            200: {"description": "Metadata retrieved successfully"},
            404: {"description": "File not found"},
        },
    )
    async def get_file_metadata_for_viewer(
        file_path: str,
        include_lod_info: bool = True,
    ) -> dict[str, Any]:
        """Get file metadata for viewer initialization."""
        try:
            result = point_extractor.get_file_metadata(
                file_path=file_path,
                include_lod_info=include_lod_info,
            )
            return result

        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )

    # ========================================================================
    # CHM Data Endpoint (Sprint 9-10)
    # ========================================================================

    @app.post(
        "/api/v1/chm",
        tags=["Viewer"],
        summary="Get CHM data",
        description="""
        Retrieves Canopy Height Model (CHM) data for visualization.

        Supports multiple output formats:
        - PNG: Rendered image with colormap
        - Array: Raw height values as 2D array
        - GeoTIFF: Georeferenced raster file
        """,
        responses={
            200: {"description": "CHM data retrieved successfully"},
            404: {"description": "File or CHM not found"},
        },
    )
    async def get_chm_data(
        file_path: str,
        format: str = "png",
        colormap: str = "viridis",
    ) -> dict[str, Any]:
        """Get CHM data for visualization."""
        # CHM generation is handled by the height normalizer service
        # For now, return a placeholder indicating CHM needs to be generated
        try:
            from pathlib import Path

            path = Path(file_path)
            if not path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File not found: {file_path}",
                )

            # Check if CHM file exists alongside the LAS file
            chm_path = path.with_suffix(".chm.tif")
            if not chm_path.exists():
                return {
                    "success": False,
                    "error": "CHM not available",
                    "message": "CHM has not been generated for this file. Run height normalization analysis first.",
                }

            # Return CHM metadata - actual data would be loaded here
            return {
                "success": True,
                "fileId": str(path.stem),
                "width": 0,  # Would be populated from actual CHM
                "height": 0,
                "resolution": 1.0,
                "bounds": {
                    "minX": 0, "maxX": 0,
                    "minY": 0, "maxY": 0,
                    "minZ": 0, "maxZ": 0,
                },
                "noDataValue": -9999,
                "minHeight": 0,
                "maxHeight": 0,
                "format": format,
                "url": str(chm_path),
            }

        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )

    # ========================================================================
    # Report Generation Endpoints (Sprint 11-12)
    # ========================================================================

    @app.post(
        "/api/v1/reports/generate",
        response_model=ReportResult,
        tags=["Reports"],
        summary="Generate forest inventory report",
        description="""
        Generates a professional forest inventory report from analysis results.

        Supports multiple output formats:
        - PDF: Professional formatted report with charts and tables
        - Excel: Multi-sheet workbook with detailed data
        - Both: Generate both PDF and Excel

        Report includes:
        - Executive summary with key metrics
        - Species distribution analysis
        - Height and DBH distributions
        - Stand-level summaries (if boundaries provided)
        - Complete tree inventory table
        - Methodology documentation
        """,
        responses={
            200: {"description": "Report generated successfully"},
            400: {"description": "Invalid request parameters"},
            500: {"description": "Report generation failed"},
        },
    )
    async def generate_report(
        request: GenerateReportRequest,
        tree_data: list[TreeMetrics] | None = None,
    ) -> ReportResult:
        """Generate a forest inventory report."""
        if not _report_generator:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Report generator not initialized",
            )

        # In production, tree_data would be fetched from storage using analysis_id
        # For now, require tree_data to be provided or return an error
        if tree_data is None:
            # Try to fetch from storage (placeholder)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tree data must be provided. In production, this would be fetched from analysis storage.",
            )

        try:
            result = _report_generator.generate_inventory_report(
                analysis_id=request.analysis_id,
                tree_data=tree_data,
                project_info=request.project_info,
                output_format=request.output_format.value,
                options=request.options,
                output_directory=request.output_directory,
                stand_boundaries=request.stand_boundaries,
            )
            return result

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Report generation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Report generation failed: {str(e)}",
            )

    @app.get(
        "/api/v1/reports/{report_id}/status",
        response_model=ReportResult,
        tags=["Reports"],
        summary="Get report generation status",
        description="Returns the status and details of a report generation request.",
        responses={
            200: {"description": "Report status retrieved"},
            404: {"description": "Report not found"},
        },
    )
    async def get_report_status(report_id: str) -> ReportResult:
        """Get the status of a report generation."""
        if not _report_generator:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Report generator not initialized",
            )

        result = _report_generator.get_report_status(report_id)

        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report not found: {report_id}",
            )

        return result

    @app.get(
        "/api/v1/reports/{report_id}/download",
        tags=["Reports"],
        summary="Download generated report",
        description="""
        Downloads a generated report file.

        Specify the format parameter to choose which file to download:
        - pdf: Download the PDF report
        - excel: Download the Excel workbook
        """,
        responses={
            200: {"description": "Report file returned"},
            404: {"description": "Report or file not found"},
        },
    )
    async def download_report(
        report_id: str,
        format: str = "pdf",
    ) -> Any:
        """Download a generated report file."""
        from fastapi.responses import FileResponse

        if not _report_generator:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Report generator not initialized",
            )

        result = _report_generator.get_report_status(report_id)

        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report not found: {report_id}",
            )

        if result.status != ReportStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Report is not ready. Status: {result.status.value}",
            )

        # Get the appropriate file path
        if format.lower() == "pdf":
            file_path = result.pdf_path
            media_type = "application/pdf"
            filename = f"report_{report_id}.pdf"
        elif format.lower() in ("excel", "xlsx"):
            file_path = result.excel_path
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = f"report_{report_id}.xlsx"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid format: {format}. Use 'pdf' or 'excel'.",
            )

        if file_path is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No {format} file available for this report",
            )

        from pathlib import Path
        if not Path(file_path).exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report file not found on disk: {file_path}",
            )

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename,
        )

    @app.post(
        "/api/v1/reports/generate-direct",
        response_model=ReportResult,
        tags=["Reports"],
        summary="Generate report with inline tree data",
        description="""
        Generates a report with tree data provided directly in the request body.

        This is useful for testing or when tree data is not stored in the system.
        For production use with stored analysis results, use the /reports/generate endpoint.
        """,
        responses={
            200: {"description": "Report generated successfully"},
            400: {"description": "Invalid request parameters"},
            500: {"description": "Report generation failed"},
        },
    )
    async def generate_report_direct(
        analysis_id: str,
        project_name: str,
        tree_data: list[TreeMetrics],
        output_format: str = "both",
        client_name: str | None = None,
        location: str | None = None,
        output_directory: str | None = None,
        include_charts: bool = True,
        include_tree_list: bool = True,
        include_methodology: bool = True,
    ) -> ReportResult:
        """Generate a report with tree data provided directly."""
        from lidar_processing.models import ProjectInfo, ReportOptions, UnitSystem

        if not _report_generator:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Report generator not initialized",
            )

        if not tree_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tree data cannot be empty",
            )

        try:
            project_info = ProjectInfo(
                project_name=project_name,
                client_name=client_name,
                location=location,
            )

            options = ReportOptions(
                include_charts=include_charts,
                include_tree_list=include_tree_list,
                include_methodology=include_methodology,
                units=UnitSystem.METRIC,
            )

            result = _report_generator.generate_inventory_report(
                analysis_id=analysis_id,
                tree_data=tree_data,
                project_info=project_info,
                output_format=output_format,
                options=options,
                output_directory=output_directory,
            )
            return result

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Report generation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Report generation failed: {str(e)}",
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
