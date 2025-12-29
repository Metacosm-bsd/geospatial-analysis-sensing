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
    BatchClassifyRequest,
    BatchProgress,
    BatchResult,
    ClassifySpeciesRequest,
    ClassifySpeciesResponse,
    CorrectionRecord,
    CorrectionStats,
    ErrorResponse,
    ExtractMetadataRequest,
    GenerateReportRequest,
    HealthResponse,
    JobResponse,
    JobStatus,
    JobType,
    LabeledTree,
    LidarMetadata,
    QueueJobRequest,
    RecordCorrectionRequest,
    RegionInfo,
    ReportResult,
    ReportStatus,
    SpeciesInfo as SpeciesInfoModel,
    TrainClassifierRequest,
    TrainClassifierResponse,
    TreeMetrics,
    ValidateModelRequest,
    ValidateRequest,
    ValidationReport,
    ValidationResult,
)
from lidar_processing.services.batch_classifier import BatchClassifier
from lidar_processing.services.confidence_calibrator import ConfidenceCalibrator
from lidar_processing.services.feedback_collector import FeedbackCollector
from lidar_processing.services.lidar_validator import LidarValidator
from lidar_processing.services.metadata_extractor import MetadataExtractor
from lidar_processing.services.model_validator import ModelValidator
from lidar_processing.services.point_extractor import PointExtractor
from lidar_processing.services.report_generator import ReportGenerator
from lidar_processing.services.species_classifier import SpeciesClassifier
from lidar_processing.services.species_config import (
    REGION_METADATA,
    SPECIES_BY_REGION,
    get_all_regions,
    get_region_metadata,
    get_species_for_region,
)
from lidar_processing.workers.queue_worker import QueueWorker
from lidar_processing.services.allometric_equations import (
    AllometricEquations,
    SPECIES_ALLOMETRY,
    TreeEstimates,
)
from lidar_processing.services.stand_delineator import (
    StandDelineator,
    ClusteringMethod,
)
from lidar_processing.services.fia_report_generator import FIAReportGenerator
from lidar_processing.services.spatial_exporter import SpatialExporter, ExportFormat
from lidar_processing.services.carbon_stock_estimator import (
    CarbonStockEstimator,
    CarbonProtocol,
    UncertaintyMethod,
)
from lidar_processing.services.carbon_report_generator import (
    CarbonReportGenerator,
    CarbonReportConfig,
)

logger = logging.getLogger(__name__)

# Global state
_start_time: float = 0.0
_redis_client: redis.Redis | None = None
_queue_worker: QueueWorker | None = None
_report_generator: ReportGenerator | None = None
_species_classifiers: dict[str, SpeciesClassifier] = {}
_model_validators: dict[str, ModelValidator] = {}
_confidence_calibrators: dict[str, ConfidenceCalibrator] = {}
_feedback_collector: FeedbackCollector | None = None
_batch_classifiers: dict[str, BatchClassifier] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Handles startup and shutdown events.
    """
    global _start_time, _redis_client, _queue_worker, _report_generator, _feedback_collector

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

    # Initialize feedback collector (Sprint 15-16)
    _feedback_collector = FeedbackCollector(settings=settings, redis_client=_redis_client)

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

    # ========================================================================
    # Species Classification Endpoints (Sprint 13-14)
    # ========================================================================

    def _get_classifier(region: str) -> SpeciesClassifier:
        """Get or create a species classifier for the given region."""
        if region not in _species_classifiers:
            try:
                _species_classifiers[region] = SpeciesClassifier(region=region)
                logger.info("Initialized species classifier for region: %s", region)
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e),
                )
        return _species_classifiers[region]

    @app.post(
        "/api/v1/classify-species",
        response_model=ClassifySpeciesResponse,
        tags=["Species Classification"],
        summary="Classify tree species",
        description="""
        Predicts species for trees based on their extracted features.

        Uses a Random Forest classifier trained on LiDAR-derived structural
        features to predict the most likely species for each tree.

        Returns predictions with confidence scores and probability
        distributions across all species classes for the specified region.
        """,
        responses={
            200: {"description": "Species predictions returned successfully"},
            400: {"description": "Invalid region or request parameters"},
            422: {"description": "Validation error in request body"},
        },
    )
    async def classify_species(
        request: ClassifySpeciesRequest,
    ) -> ClassifySpeciesResponse:
        """Classify tree species from features."""
        start_time = time.time()

        try:
            classifier = _get_classifier(request.region)

            # Classify trees
            if request.use_heuristics:
                predictions = [
                    classifier.predict_with_heuristics(features)
                    for features in request.tree_features
                ]
            else:
                predictions = classifier.predict(request.tree_features)

            processing_time = (time.time() - start_time) * 1000

            return ClassifySpeciesResponse(
                predictions=predictions,
                processing_time_ms=round(processing_time, 2),
                region=request.region,
                model_version="1.0.0",
            )

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Species classification failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Classification failed: {str(e)}",
            )

    @app.post(
        "/api/v1/train-classifier",
        response_model=TrainClassifierResponse,
        tags=["Species Classification"],
        summary="Train a new species classifier (admin)",
        description="""
        Trains a new Random Forest species classification model from
        labeled training data.

        This endpoint is intended for administrators and requires
        a minimum of 10 labeled samples. The trained model is saved
        and automatically loaded for future classification requests.

        Training includes:
        - 5-fold cross-validation for performance estimation
        - Stratified train/test split
        - Automatic feature scaling
        - Model persistence
        """,
        responses={
            200: {"description": "Model trained successfully"},
            400: {"description": "Invalid training data or parameters"},
            422: {"description": "Validation error in request body"},
        },
    )
    async def train_classifier(
        request: TrainClassifierRequest,
    ) -> TrainClassifierResponse:
        """Train a new species classification model."""
        start_time = time.time()

        try:
            from lidar_processing.services.training_pipeline import TrainingPipeline

            pipeline = TrainingPipeline(region=request.region)

            # Prepare data
            X_train, X_test, y_train, y_test = pipeline.prepare_training_set(
                request.training_data,
                test_size=request.test_size,
            )

            # Cross-validation
            cv_results = pipeline.cross_validate(
                X_train,
                y_train,
                model_params={
                    "n_estimators": request.n_estimators,
                    "max_depth": request.max_depth,
                },
            )

            # Train model
            model_params = {
                "n_estimators": request.n_estimators,
                "max_depth": request.max_depth,
                "min_samples_split": 5,
            }
            pipeline.train_model(X_train, y_train, model_params)

            # Evaluate
            metrics = pipeline.evaluate_model(X_test, y_test)

            # Save model if requested
            model_path = None
            if request.save_model:
                model_path = f"models/species_classifier_{request.region}.joblib"
                pipeline.save_model(model_path)

                # Update the cached classifier
                _species_classifiers[request.region] = SpeciesClassifier(
                    model_path=model_path,
                    region=request.region,
                )

            processing_time = (time.time() - start_time) * 1000

            return TrainClassifierResponse(
                success=True,
                metrics=metrics,
                cross_validation_accuracy=cv_results["accuracy"]["mean"],
                model_path=model_path,
                training_time_ms=round(processing_time, 2),
                n_training_samples=len(request.training_data),
                n_classes=len(pipeline._label_encoder.classes_),
            )

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Model training failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Training failed: {str(e)}",
            )

    @app.get(
        "/api/v1/species/regions",
        response_model=list[RegionInfo],
        tags=["Species Classification"],
        summary="List supported regions",
        description="""
        Returns a list of all supported geographic regions for species
        classification, along with metadata about each region.
        """,
        responses={
            200: {"description": "List of regions returned successfully"},
        },
    )
    async def list_regions() -> list[RegionInfo]:
        """List all supported regions."""
        regions = []

        for region_code in get_all_regions():
            metadata = get_region_metadata(region_code)
            species_dict = get_species_for_region(region_code)

            regions.append(
                RegionInfo(
                    code=region_code,
                    name=metadata["name"],
                    states=metadata["states"],
                    description=metadata["description"],
                    species_count=len(species_dict),
                    dominant_species=metadata.get("dominant_species", []),
                )
            )

        return regions

    @app.get(
        "/api/v1/species/{region}",
        response_model=list[SpeciesInfoModel],
        tags=["Species Classification"],
        summary="Get species for a region",
        description="""
        Returns a list of all tree species supported for classification
        in the specified geographic region.

        Each species includes its code, common name, scientific name,
        and category (conifer or deciduous).
        """,
        responses={
            200: {"description": "Species list returned successfully"},
            404: {"description": "Region not found"},
        },
    )
    async def get_species_by_region(region: str) -> list[SpeciesInfoModel]:
        """Get species for a specific region."""
        try:
            species_dict = get_species_for_region(region.lower())

            return [
                SpeciesInfoModel(
                    code=info.code,
                    name=info.name,
                    scientific_name=info.scientific_name,
                    category=info.category,
                )
                for info in species_dict.values()
            ]

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )

    @app.get(
        "/api/v1/classifier/{region}/info",
        tags=["Species Classification"],
        summary="Get classifier information",
        description="""
        Returns information about the species classifier for a region,
        including supported species, feature importance rankings, and
        model status.
        """,
        responses={
            200: {"description": "Classifier info returned successfully"},
            400: {"description": "Invalid region"},
        },
    )
    async def get_classifier_info(region: str) -> dict[str, Any]:
        """Get information about a region's classifier."""
        try:
            classifier = _get_classifier(region.lower())

            return {
                "region": region.lower(),
                "is_trained": classifier.is_trained,
                "n_classes": classifier.n_classes,
                "supported_species": classifier.get_supported_species(),
                "feature_importances": (
                    classifier.get_feature_importances()
                    if classifier.is_trained
                    else None
                ),
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    # ========================================================================
    # Model Validation Endpoints (Sprint 15-16)
    # ========================================================================

    def _get_model_validator(region: str) -> ModelValidator:
        """Get or create a model validator for the given region."""
        if region not in _model_validators:
            _model_validators[region] = ModelValidator(settings)
        return _model_validators[region]

    def _get_batch_classifier(region: str) -> BatchClassifier:
        """Get or create a batch classifier for the given region."""
        if region not in _batch_classifiers:
            classifier = _get_classifier(region)
            _batch_classifiers[region] = BatchClassifier(
                classifier=classifier,
                region=region,
                settings=settings,
                redis_client=_redis_client,
            )
        return _batch_classifiers[region]

    @app.post(
        "/api/v1/classifier/validate",
        response_model=ValidationReport,
        tags=["Model Validation"],
        summary="Run validation on test set",
        description="""
        Runs comprehensive validation on a species classification model
        using provided labeled test data.

        Returns detailed metrics including:
        - Overall accuracy
        - Per-class precision, recall, and F1 scores
        - Confusion matrix
        - Actionable recommendations for improvement
        """,
        responses={
            200: {"description": "Validation completed successfully"},
            400: {"description": "Invalid request parameters"},
        },
    )
    async def validate_model(
        request: ValidateModelRequest,
    ) -> ValidationReport:
        """Run validation on a species classification model."""
        try:
            classifier = _get_classifier(request.region.lower())
            validator = _get_model_validator(request.region.lower())

            report = validator.validate_model(
                model=classifier,
                test_data=request.test_data,
            )

            return report

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Model validation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Validation failed: {str(e)}",
            )

    @app.get(
        "/api/v1/classifier/{region}/metrics",
        tags=["Model Validation"],
        summary="Get current model metrics",
        description="""
        Returns the current performance metrics for a region's classifier,
        including calibration information and uncertainty estimates.
        """,
        responses={
            200: {"description": "Metrics returned successfully"},
            400: {"description": "Invalid region"},
        },
    )
    async def get_model_metrics(region: str) -> dict[str, Any]:
        """Get current model metrics for a region."""
        try:
            classifier = _get_classifier(region.lower())

            # Get basic model info
            model_info = {
                "region": region.lower(),
                "is_trained": classifier.is_trained,
                "n_classes": classifier.n_classes,
                "supported_species": classifier.get_supported_species(),
            }

            # Add feature importances if available
            if classifier.is_trained:
                model_info["feature_importances"] = classifier.get_feature_importances()

            return model_info

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    # ========================================================================
    # Feedback Collection Endpoints (Sprint 15-16)
    # ========================================================================

    @app.post(
        "/api/v1/feedback/correction",
        response_model=CorrectionRecord,
        tags=["Feedback"],
        summary="Record user correction",
        description="""
        Records a user's correction to a species prediction.

        These corrections are accumulated for potential model retraining
        and are used to identify which species are most often misclassified.
        """,
        responses={
            200: {"description": "Correction recorded successfully"},
            400: {"description": "Invalid request parameters"},
        },
    )
    async def record_correction(
        request: RecordCorrectionRequest,
        user_id: str = "anonymous",
    ) -> CorrectionRecord:
        """Record a user correction to a species prediction."""
        if not _feedback_collector:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Feedback collector not initialized",
            )

        try:
            record = _feedback_collector.record_correction(
                tree_id=request.tree_id,
                predicted=request.predicted_species,
                corrected=request.corrected_species,
                user_id=user_id,
                analysis_id=request.analysis_id,
                confidence_was=request.confidence_was,
                notes=request.notes,
            )

            return record

        except Exception as e:
            logger.exception("Failed to record correction: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to record correction: {str(e)}",
            )

    @app.get(
        "/api/v1/feedback/statistics",
        response_model=CorrectionStats,
        tags=["Feedback"],
        summary="Get correction statistics",
        description="""
        Returns statistics about accumulated corrections, including:
        - Total corrections recorded
        - Most frequently confused species pairs
        - Corrections by user
        - Recent trend
        """,
        responses={
            200: {"description": "Statistics returned successfully"},
        },
    )
    async def get_correction_statistics() -> CorrectionStats:
        """Get statistics about accumulated corrections."""
        if not _feedback_collector:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Feedback collector not initialized",
            )

        try:
            stats = _feedback_collector.calculate_correction_statistics()
            return stats

        except Exception as e:
            logger.exception("Failed to get correction statistics: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get statistics: {str(e)}",
            )

    @app.get(
        "/api/v1/feedback/export",
        tags=["Feedback"],
        summary="Export corrections",
        description="""
        Exports accumulated corrections in the specified format
        for external training or analysis.
        """,
        responses={
            200: {"description": "Corrections exported successfully"},
            400: {"description": "Invalid format"},
        },
    )
    async def export_corrections(
        format: str = "csv",
    ) -> Any:
        """Export corrections for external training."""
        from fastapi.responses import Response

        if not _feedback_collector:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Feedback collector not initialized",
            )

        try:
            data = _feedback_collector.export_corrections(format=format)

            if format.lower() == "csv":
                media_type = "text/csv"
                filename = "corrections.csv"
            else:
                media_type = "application/json"
                filename = "corrections.json"

            return Response(
                content=data,
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    # ========================================================================
    # Batch Classification Endpoints (Sprint 15-16)
    # ========================================================================

    @app.post(
        "/api/v1/classify-batch",
        tags=["Batch Classification"],
        summary="Batch classification with progress",
        description="""
        Classifies multiple trees in batches with progress tracking.

        For synchronous processing, returns predictions directly.
        For async processing (async_processing=true), returns a job ID
        that can be used to check progress and retrieve results.
        """,
        responses={
            200: {"description": "Classification completed or job queued"},
            400: {"description": "Invalid request parameters"},
        },
    )
    async def classify_batch(
        request: BatchClassifyRequest,
    ) -> dict[str, Any]:
        """Classify trees in batches."""
        try:
            batch_classifier = _get_batch_classifier(request.region.lower())

            if request.async_processing:
                # Async processing - return job ID
                if not request.analysis_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="analysis_id is required for async processing",
                    )

                job_id = batch_classifier.classify_analysis_async(
                    analysis_id=request.analysis_id,
                    trees=request.tree_features,
                )

                return {
                    "job_id": job_id,
                    "status": "queued",
                    "total_trees": len(request.tree_features),
                    "async": True,
                }

            else:
                # Synchronous processing
                start_time = time.time()

                predictions = batch_classifier.classify_batch(
                    trees=request.tree_features,
                    batch_size=request.batch_size,
                    use_heuristics=request.use_heuristics,
                )

                processing_time = (time.time() - start_time) * 1000

                # Calculate summary statistics
                species_counts: dict[str, int] = {}
                confidence_sum = 0.0
                for pred in predictions:
                    species_counts[pred.species_code] = species_counts.get(pred.species_code, 0) + 1
                    confidence_sum += pred.confidence

                avg_confidence = confidence_sum / len(predictions) if predictions else 0.0

                return {
                    "predictions": [p.model_dump() for p in predictions],
                    "total_trees": len(predictions),
                    "species_distribution": species_counts,
                    "average_confidence": round(avg_confidence, 4),
                    "processing_time_ms": round(processing_time, 2),
                    "async": False,
                }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Batch classification failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Classification failed: {str(e)}",
            )

    @app.get(
        "/api/v1/classify-batch/{job_id}/progress",
        response_model=BatchProgress,
        tags=["Batch Classification"],
        summary="Get batch job progress",
        description="Returns the progress of an async batch classification job.",
        responses={
            200: {"description": "Progress returned successfully"},
            404: {"description": "Job not found"},
        },
    )
    async def get_batch_progress(
        job_id: str,
        region: str = "pnw",
    ) -> BatchProgress:
        """Get progress of a batch classification job."""
        try:
            batch_classifier = _get_batch_classifier(region.lower())
            progress = batch_classifier.get_batch_progress(job_id)
            return progress

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )

    @app.get(
        "/api/v1/classify-batch/{job_id}/result",
        response_model=BatchResult,
        tags=["Batch Classification"],
        summary="Get batch job result",
        description="Returns the result of a completed batch classification job.",
        responses={
            200: {"description": "Result returned successfully"},
            404: {"description": "Job not found or not complete"},
        },
    )
    async def get_batch_result(
        job_id: str,
        region: str = "pnw",
    ) -> BatchResult:
        """Get result of a completed batch classification job."""
        try:
            batch_classifier = _get_batch_classifier(region.lower())
            result = batch_classifier.get_batch_result(job_id)

            if result is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job {job_id} not found or not yet complete",
                )

            return result

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )

    # ========================================================================
    # DBH & Volume Estimation Endpoints (Sprint 17-18)
    # ========================================================================

    # Initialize allometric equations service
    allometric_service = AllometricEquations(region="pnw")

    @app.post(
        "/api/v1/estimate-dbh",
        tags=["Volume Estimation"],
        summary="Estimate DBH from height and crown",
        description="""
        Estimates Diameter at Breast Height (DBH) from tree height
        and optionally crown diameter using species-specific allometric equations.

        Returns DBH estimate in centimeters with a confidence score.
        """,
        responses={
            200: {"description": "DBH estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_dbh(
        height_m: float,
        crown_diameter_m: float | None = None,
        species_code: str | None = None,
        method: str = "combined",
    ) -> dict[str, Any]:
        """Estimate DBH from height and crown diameter."""
        try:
            dbh, confidence = allometric_service.estimate_dbh(
                height_m=height_m,
                crown_diameter_m=crown_diameter_m,
                species_code=species_code,
                method=method,
            )

            return {
                "dbh_cm": round(dbh, 1),
                "confidence": round(confidence, 3),
                "height_m": height_m,
                "crown_diameter_m": crown_diameter_m,
                "species_code": species_code,
                "method": method,
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/estimate-volume",
        tags=["Volume Estimation"],
        summary="Estimate tree volume",
        description="""
        Calculates tree volume using FIA (Forest Inventory and Analysis)
        equations based on DBH and height.

        Returns:
        - Total stem volume in cubic meters
        - Merchantable volume (to 4" top)
        - Board feet (Scribner rule)
        - Cords
        """,
        responses={
            200: {"description": "Volume estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_volume(
        dbh_cm: float,
        height_m: float,
        species_code: str | None = None,
    ) -> dict[str, Any]:
        """Estimate tree volume from DBH and height."""
        try:
            result = allometric_service.calculate_volume_fia(
                dbh_cm=dbh_cm,
                height_m=height_m,
                species_code=species_code,
            )

            return {
                "dbh_cm": dbh_cm,
                "height_m": height_m,
                "species_code": species_code,
                "total_volume_m3": result.total_volume_m3,
                "merchantable_volume_m3": result.merchantable_volume_m3,
                "board_feet": result.board_feet,
                "cords": result.cords,
                "method": result.method,
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/estimate-biomass",
        tags=["Volume Estimation"],
        summary="Estimate tree biomass and carbon",
        description="""
        Calculates tree biomass using Jenkins et al. (2003) allometric
        equations based on DBH.

        Returns:
        - Above-ground biomass in kilograms
        - Biomass components (stem, branch, foliage, roots)
        - Carbon content (biomass × 0.47)
        - CO2 equivalent (carbon × 44/12)
        """,
        responses={
            200: {"description": "Biomass estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_biomass(
        dbh_cm: float,
        species_code: str | None = None,
        include_roots: bool = True,
    ) -> dict[str, Any]:
        """Estimate tree biomass from DBH."""
        try:
            result = allometric_service.calculate_biomass_jenkins(
                dbh_cm=dbh_cm,
                species_code=species_code,
                include_roots=include_roots,
            )

            return {
                "dbh_cm": dbh_cm,
                "species_code": species_code,
                "aboveground_biomass_kg": result.aboveground_biomass_kg,
                "stem_biomass_kg": result.stem_biomass_kg,
                "branch_biomass_kg": result.branch_biomass_kg,
                "foliage_biomass_kg": result.foliage_biomass_kg,
                "root_biomass_kg": result.root_biomass_kg,
                "carbon_kg": result.carbon_kg,
                "co2_equivalent_kg": result.co2_equivalent_kg,
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/estimate-tree",
        tags=["Volume Estimation"],
        summary="Complete tree estimation",
        description="""
        Provides complete tree estimates from available measurements,
        including DBH, volume, biomass, and carbon.

        This is the primary endpoint for calculating all tree metrics
        from LiDAR-derived height and crown diameter.
        """,
        responses={
            200: {"description": "Tree estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_tree_complete(
        tree_id: str,
        height_m: float,
        crown_diameter_m: float | None = None,
        species_code: str | None = None,
        dbh_cm: float | None = None,
    ) -> dict[str, Any]:
        """Calculate complete tree estimates."""
        try:
            result = allometric_service.estimate_tree_complete(
                tree_id=tree_id,
                height_m=height_m,
                crown_diameter_m=crown_diameter_m,
                species_code=species_code,
                dbh_cm=dbh_cm,
            )

            return {
                "tree_id": result.tree_id,
                "species_code": result.species_code,
                "dbh_cm": result.dbh_cm,
                "height_m": result.height_m,
                "crown_diameter_m": result.crown_diameter_m,
                "basal_area_m2": result.basal_area_m2,
                "confidence": result.confidence,
                "volume": {
                    "total_m3": result.volume.total_volume_m3,
                    "merchantable_m3": result.volume.merchantable_volume_m3,
                    "board_feet": result.volume.board_feet,
                    "cords": result.volume.cords,
                },
                "biomass": {
                    "aboveground_kg": result.biomass.aboveground_biomass_kg,
                    "stem_kg": result.biomass.stem_biomass_kg,
                    "branch_kg": result.biomass.branch_biomass_kg,
                    "foliage_kg": result.biomass.foliage_biomass_kg,
                    "root_kg": result.biomass.root_biomass_kg,
                    "carbon_kg": result.biomass.carbon_kg,
                    "co2_equivalent_kg": result.biomass.co2_equivalent_kg,
                },
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/estimate-batch",
        tags=["Volume Estimation"],
        summary="Batch tree estimation",
        description="""
        Calculates estimates for multiple trees in a single request.

        Input should be a list of tree dictionaries with at minimum
        'height' field. Optional fields: 'crown_diameter', 'species_code', 'tree_id'.
        """,
        responses={
            200: {"description": "Batch estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_batch(
        trees: list[dict[str, Any]],
        height_field: str = "height",
        crown_field: str = "crown_diameter",
        species_field: str = "species_code",
        id_field: str = "tree_id",
    ) -> dict[str, Any]:
        """Calculate estimates for a batch of trees."""
        try:
            start_time = time.time()

            results = allometric_service.estimate_batch(
                trees=trees,
                height_field=height_field,
                crown_field=crown_field,
                species_field=species_field,
                id_field=id_field,
            )

            processing_time = (time.time() - start_time) * 1000

            # Convert results to dict format
            tree_results = []
            for r in results:
                tree_results.append({
                    "tree_id": r.tree_id,
                    "species_code": r.species_code,
                    "dbh_cm": r.dbh_cm,
                    "height_m": r.height_m,
                    "crown_diameter_m": r.crown_diameter_m,
                    "basal_area_m2": r.basal_area_m2,
                    "volume_m3": r.volume.total_volume_m3,
                    "biomass_kg": r.biomass.aboveground_biomass_kg,
                    "carbon_kg": r.biomass.carbon_kg,
                    "co2_kg": r.biomass.co2_equivalent_kg,
                    "confidence": r.confidence,
                })

            return {
                "trees": tree_results,
                "count": len(tree_results),
                "processing_time_ms": round(processing_time, 2),
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/estimate-stand",
        tags=["Volume Estimation"],
        summary="Calculate stand-level totals",
        description="""
        Calculates stand-level summary statistics from individual tree estimates.

        Returns per-hectare values for:
        - Stems, basal area, volume, biomass, carbon, CO2
        - Mean and dominant heights
        - Mean and quadratic mean DBH
        """,
        responses={
            200: {"description": "Stand totals calculated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_stand(
        trees: list[dict[str, Any]],
        area_hectares: float,
        height_field: str = "height",
        crown_field: str = "crown_diameter",
        species_field: str = "species_code",
        id_field: str = "tree_id",
    ) -> dict[str, Any]:
        """Calculate stand-level summary from trees."""
        try:
            # First estimate all trees
            tree_estimates = allometric_service.estimate_batch(
                trees=trees,
                height_field=height_field,
                crown_field=crown_field,
                species_field=species_field,
                id_field=id_field,
            )

            # Then calculate stand totals
            stand_totals = allometric_service.calculate_stand_totals(
                trees=tree_estimates,
                area_hectares=area_hectares,
            )

            return stand_totals

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.get(
        "/api/v1/allometry/species",
        tags=["Volume Estimation"],
        summary="Get available species allometry",
        description="""
        Returns a list of all species with allometric equations available,
        including their codes, common names, and wood types.
        """,
        responses={
            200: {"description": "Species list returned successfully"},
        },
    )
    async def get_allometry_species() -> list[dict[str, str]]:
        """Get list of species with allometric equations."""
        return allometric_service.get_available_species()

    @app.get(
        "/api/v1/allometry/species/{species_code}",
        tags=["Volume Estimation"],
        summary="Get species allometry details",
        description="""
        Returns detailed allometric equation coefficients for a specific species,
        including height-DBH, crown-DBH, volume, and biomass relationships.
        """,
        responses={
            200: {"description": "Species allometry returned successfully"},
            404: {"description": "Species not found"},
        },
    )
    async def get_species_allometry(species_code: str) -> dict[str, Any]:
        """Get allometric coefficients for a species."""
        species_code = species_code.upper()

        if species_code not in SPECIES_ALLOMETRY:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Species not found: {species_code}. Use default equations.",
            )

        allometry = SPECIES_ALLOMETRY[species_code]

        return {
            "species_code": allometry.species_code,
            "common_name": allometry.common_name,
            "scientific_name": allometry.scientific_name,
            "wood_type": allometry.wood_type.value,
            "regions": allometry.regions,
            "equations": {
                "height_dbh": {
                    "description": "DBH = a * H^b",
                    "a": allometry.height_dbh_a,
                    "b": allometry.height_dbh_b,
                },
                "crown_dbh": {
                    "description": "Crown = a * DBH^b",
                    "a": allometry.crown_dbh_a,
                    "b": allometry.crown_dbh_b,
                },
                "volume": {
                    "description": "V = a * DBH^b * H^c",
                    "a": allometry.volume_a,
                    "b": allometry.volume_b,
                    "c": allometry.volume_c,
                },
                "biomass": {
                    "description": "ln(biomass) = a + b * ln(DBH)",
                    "a": allometry.biomass_a,
                    "b": allometry.biomass_b,
                },
            },
            "properties": {
                "bark_factor": allometry.bark_factor,
                "wood_density_kg_m3": allometry.wood_density,
                "form_factor": allometry.form_factor,
            },
        }

    # ========================================================================
    # Stand Delineation Endpoints (Sprint 21-24)
    # ========================================================================

    # Initialize stand delineator and spatial exporter
    stand_delineator = StandDelineator()
    spatial_exporter = SpatialExporter()
    fia_report_generator = FIAReportGenerator()

    @app.post(
        "/api/v1/stands/delineate",
        tags=["Stand Delineation"],
        summary="Delineate forest stands",
        description="""
        Automatically delineates forest stands from tree data using
        clustering algorithms.

        Supported methods:
        - dbscan: Density-based spatial clustering (recommended)
        - kmeans: K-means clustering with specified number of stands
        - grid: Grid-based delineation with specified cell size
        - attribute: Clustering based on tree attributes (height, species)

        Returns stand boundaries, summaries, and tree assignments.
        """,
        responses={
            200: {"description": "Stands delineated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def delineate_stands(
        trees: list[dict[str, Any]],
        method: str = "dbscan",
        min_trees: int = 5,
        eps: float = 20.0,
        n_clusters: int | None = None,
        grid_size: float = 50.0,
        attribute_weights: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Delineate forest stands from tree data."""
        try:
            start_time = time.time()

            # Parse clustering method
            try:
                clustering_method = ClusteringMethod(method.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid method: {method}. Use: dbscan, kmeans, grid, attribute",
                )

            # Run delineation
            result = stand_delineator.delineate(
                trees=trees,
                method=clustering_method,
                min_trees=min_trees,
                eps=eps,
                n_clusters=n_clusters,
                grid_size=grid_size,
                attribute_weights=attribute_weights,
            )

            processing_time = (time.time() - start_time) * 1000

            # Convert result to dict
            stands_data = []
            for stand in result.stands:
                stands_data.append({
                    "stand_id": stand.stand_id,
                    "tree_count": stand.tree_count,
                    "area_hectares": stand.area_hectares,
                    "summary": {
                        "stems_per_hectare": stand.summary.stems_per_hectare,
                        "basal_area_m2_ha": stand.summary.basal_area_m2_ha,
                        "volume_m3_ha": stand.summary.volume_m3_ha,
                        "biomass_kg_ha": stand.summary.biomass_kg_ha,
                        "carbon_kg_ha": stand.summary.carbon_kg_ha,
                        "mean_height_m": stand.summary.mean_height_m,
                        "dominant_height_m": stand.summary.dominant_height_m,
                        "mean_dbh_cm": stand.summary.mean_dbh_cm,
                        "qmd_cm": stand.summary.qmd_cm,
                        "sdi": stand.summary.sdi,
                        "stand_type": stand.summary.stand_type,
                        "dominant_species": stand.summary.dominant_species,
                    },
                    "boundary": {
                        "type": "Polygon",
                        "coordinates": stand.boundary.coordinates,
                    } if stand.boundary else None,
                    "centroid": stand.centroid,
                })

            return {
                "stands": stands_data,
                "total_stands": result.total_stands,
                "total_trees": result.total_trees,
                "unassigned_trees": result.unassigned_trees,
                "method": result.method,
                "processing_time_ms": round(processing_time, 2),
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Stand delineation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Delineation failed: {str(e)}",
            )

    @app.post(
        "/api/v1/stands/summary",
        tags=["Stand Delineation"],
        summary="Calculate stand summary",
        description="""
        Calculates summary statistics for a stand from tree data.

        Returns per-hectare metrics, species composition, size class
        distribution, and stand classification.
        """,
        responses={
            200: {"description": "Summary calculated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def calculate_stand_summary(
        trees: list[dict[str, Any]],
        area_hectares: float,
        stand_id: str = "stand_1",
    ) -> dict[str, Any]:
        """Calculate summary for a stand."""
        try:
            summary = stand_delineator.calculate_stand_summary(
                trees=trees,
                area_hectares=area_hectares,
            )

            return {
                "stand_id": stand_id,
                "area_hectares": area_hectares,
                "tree_count": len(trees),
                "stems_per_hectare": summary.stems_per_hectare,
                "basal_area_m2_ha": summary.basal_area_m2_ha,
                "volume_m3_ha": summary.volume_m3_ha,
                "biomass_kg_ha": summary.biomass_kg_ha,
                "carbon_kg_ha": summary.carbon_kg_ha,
                "co2_kg_ha": summary.co2_kg_ha,
                "mean_height_m": summary.mean_height_m,
                "dominant_height_m": summary.dominant_height_m,
                "mean_dbh_cm": summary.mean_dbh_cm,
                "qmd_cm": summary.qmd_cm,
                "sdi": summary.sdi,
                "stand_type": summary.stand_type,
                "size_class": summary.size_class,
                "dominant_species": summary.dominant_species,
                "species_composition": summary.species_composition,
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    # ========================================================================
    # FIA Report Endpoints (Sprint 21-24)
    # ========================================================================

    @app.post(
        "/api/v1/fia/generate",
        tags=["FIA Reports"],
        summary="Generate FIA-compliant report",
        description="""
        Generates a Forest Inventory and Analysis (FIA) compliant report
        from tree data.

        Report includes:
        - Tree records with FIA species codes
        - Plot-level summaries
        - Species summary tables
        - Size class distributions
        - All measurements in imperial units (FIA standard)
        """,
        responses={
            200: {"description": "Report generated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def generate_fia_report(
        trees: list[dict[str, Any]],
        plot_id: str = "PLOT001",
        state_code: str = "41",
        county_code: str = "001",
        plot_area_acres: float = 0.25,
    ) -> dict[str, Any]:
        """Generate FIA-compliant report."""
        try:
            start_time = time.time()

            report = fia_report_generator.generate_report(
                trees=trees,
                plot_id=plot_id,
                state_code=state_code,
                county_code=county_code,
                plot_area_acres=plot_area_acres,
            )

            processing_time = (time.time() - start_time) * 1000

            # Convert to dict format
            tree_records = []
            for tree in report.tree_records:
                tree_records.append({
                    "tree_id": tree.tree_id,
                    "fia_species_code": tree.fia_species_code,
                    "species_common": tree.species_common,
                    "dbh_inches": tree.dbh_inches,
                    "height_feet": tree.height_feet,
                    "crown_ratio": tree.crown_ratio,
                    "status_code": tree.status_code,
                    "damage_code": tree.damage_code,
                    "volume_cuft": tree.volume_cuft,
                    "biomass_lb": tree.biomass_lb,
                })

            species_summary = []
            for sp in report.species_summary:
                species_summary.append({
                    "fia_species_code": sp.fia_species_code,
                    "species_common": sp.species_common,
                    "tree_count": sp.tree_count,
                    "basal_area_sqft_ac": sp.basal_area_sqft_ac,
                    "volume_cuft_ac": sp.volume_cuft_ac,
                    "biomass_lb_ac": sp.biomass_lb_ac,
                    "mean_dbh_inches": sp.mean_dbh_inches,
                    "mean_height_feet": sp.mean_height_feet,
                })

            return {
                "plot_id": report.plot_record.plot_id,
                "state_code": report.plot_record.state_code,
                "county_code": report.plot_record.county_code,
                "plot_area_acres": report.plot_record.plot_area_acres,
                "total_trees": report.plot_record.total_trees,
                "trees_per_acre": report.plot_record.trees_per_acre,
                "basal_area_sqft_ac": report.plot_record.basal_area_sqft_ac,
                "volume_cuft_ac": report.plot_record.volume_cuft_ac,
                "biomass_lb_ac": report.plot_record.biomass_lb_ac,
                "tree_records": tree_records,
                "species_summary": species_summary,
                "size_class_distribution": report.size_class_distribution,
                "generated_at": report.generated_at.isoformat(),
                "processing_time_ms": round(processing_time, 2),
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("FIA report generation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Report generation failed: {str(e)}",
            )

    @app.get(
        "/api/v1/fia/species-codes",
        tags=["FIA Reports"],
        summary="Get FIA species codes",
        description="""
        Returns mapping of internal species codes to FIA species codes
        and common names.
        """,
        responses={
            200: {"description": "Species codes returned successfully"},
        },
    )
    async def get_fia_species_codes() -> dict[str, Any]:
        """Get FIA species code mapping."""
        return {
            "species_codes": fia_report_generator.get_species_codes(),
            "description": "Mapping from internal species codes to FIA numeric codes",
        }

    # ========================================================================
    # Spatial Export Endpoints (Sprint 21-24)
    # ========================================================================

    @app.post(
        "/api/v1/export/trees",
        tags=["Spatial Export"],
        summary="Export trees to spatial format",
        description="""
        Exports tree data to various spatial formats.

        Supported formats:
        - geojson: GeoJSON FeatureCollection
        - shapefile: Zipped Shapefile (.shp, .shx, .dbf, .prj)
        - kml: KML for Google Earth
        - csv: CSV with WKT geometry

        Trees are exported as point features with all attributes.
        """,
        responses={
            200: {"description": "Export successful"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def export_trees(
        trees: list[dict[str, Any]],
        format: str = "geojson",
        crs: str = "EPSG:4326",
        output_path: str | None = None,
    ) -> Any:
        """Export trees to spatial format."""
        from fastapi.responses import Response, FileResponse

        try:
            # Parse format
            try:
                export_format = ExportFormat(format.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid format: {format}. Use: geojson, shapefile, kml, csv",
                )

            result = spatial_exporter.export_trees(
                trees=trees,
                format=export_format,
                crs=crs,
                output_path=output_path,
            )

            if result.file_path and export_format == ExportFormat.SHAPEFILE:
                # Return zipped shapefile
                return FileResponse(
                    path=result.file_path,
                    media_type="application/zip",
                    filename=f"trees_export.zip",
                )
            elif result.data:
                # Return data directly
                if export_format == ExportFormat.GEOJSON:
                    return JSONResponse(content=result.data)
                elif export_format == ExportFormat.KML:
                    return Response(
                        content=result.data,
                        media_type="application/vnd.google-earth.kml+xml",
                        headers={"Content-Disposition": 'attachment; filename="trees.kml"'},
                    )
                elif export_format == ExportFormat.CSV:
                    return Response(
                        content=result.data,
                        media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="trees.csv"'},
                    )
            else:
                return {"success": True, "file_path": result.file_path}

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Tree export failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Export failed: {str(e)}",
            )

    @app.post(
        "/api/v1/export/stands",
        tags=["Spatial Export"],
        summary="Export stands to spatial format",
        description="""
        Exports stand boundaries to various spatial formats.

        Supported formats:
        - geojson: GeoJSON FeatureCollection
        - shapefile: Zipped Shapefile (.shp, .shx, .dbf, .prj)
        - kml: KML for Google Earth
        - csv: CSV with WKT geometry

        Stands are exported as polygon features with summary attributes.
        """,
        responses={
            200: {"description": "Export successful"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def export_stands(
        stands: list[dict[str, Any]],
        format: str = "geojson",
        crs: str = "EPSG:4326",
        output_path: str | None = None,
    ) -> Any:
        """Export stands to spatial format."""
        from fastapi.responses import Response, FileResponse

        try:
            # Parse format
            try:
                export_format = ExportFormat(format.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid format: {format}. Use: geojson, shapefile, kml, csv",
                )

            result = spatial_exporter.export_stands(
                stands=stands,
                format=export_format,
                crs=crs,
                output_path=output_path,
            )

            if result.file_path and export_format == ExportFormat.SHAPEFILE:
                # Return zipped shapefile
                return FileResponse(
                    path=result.file_path,
                    media_type="application/zip",
                    filename=f"stands_export.zip",
                )
            elif result.data:
                # Return data directly
                if export_format == ExportFormat.GEOJSON:
                    return JSONResponse(content=result.data)
                elif export_format == ExportFormat.KML:
                    return Response(
                        content=result.data,
                        media_type="application/vnd.google-earth.kml+xml",
                        headers={"Content-Disposition": 'attachment; filename="stands.kml"'},
                    )
                elif export_format == ExportFormat.CSV:
                    return Response(
                        content=result.data,
                        media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="stands.csv"'},
                    )
            else:
                return {"success": True, "file_path": result.file_path}

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Stand export failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Export failed: {str(e)}",
            )

    @app.get(
        "/api/v1/export/formats",
        tags=["Spatial Export"],
        summary="Get supported export formats",
        description="Returns list of supported export formats and their descriptions.",
        responses={
            200: {"description": "Formats returned successfully"},
        },
    )
    async def get_export_formats() -> dict[str, Any]:
        """Get supported export formats."""
        return {
            "formats": [
                {
                    "name": "geojson",
                    "description": "GeoJSON FeatureCollection - widely supported web format",
                    "extension": ".geojson",
                    "mime_type": "application/geo+json",
                },
                {
                    "name": "shapefile",
                    "description": "ESRI Shapefile - industry standard GIS format (zipped)",
                    "extension": ".zip",
                    "mime_type": "application/zip",
                },
                {
                    "name": "kml",
                    "description": "Keyhole Markup Language - for Google Earth",
                    "extension": ".kml",
                    "mime_type": "application/vnd.google-earth.kml+xml",
                },
                {
                    "name": "csv",
                    "description": "CSV with WKT geometry - for spreadsheets and databases",
                    "extension": ".csv",
                    "mime_type": "text/csv",
                },
            ],
        }

    # ========================================================================
    # Carbon Stock Estimation Endpoints (Sprint 25-30)
    # ========================================================================

    # Initialize carbon estimators for each protocol
    carbon_estimators = {
        CarbonProtocol.VCS: CarbonStockEstimator(CarbonProtocol.VCS),
        CarbonProtocol.CAR: CarbonStockEstimator(CarbonProtocol.CAR),
        CarbonProtocol.ACR: CarbonStockEstimator(CarbonProtocol.ACR),
        CarbonProtocol.FIA: CarbonStockEstimator(CarbonProtocol.FIA),
    }
    carbon_report_generator = CarbonReportGenerator()

    @app.post(
        "/api/v1/carbon/estimate-tree",
        tags=["Carbon Stock"],
        summary="Estimate carbon for a single tree",
        description="""
        Estimates carbon stock for a single tree using protocol-specific
        methodologies (VCS, CAR, ACR, FIA).

        Returns biomass, carbon, and CO2 equivalent with uncertainty estimates.
        """,
        responses={
            200: {"description": "Tree carbon estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_tree_carbon(
        tree_id: str,
        dbh_cm: float,
        height_m: float,
        species_code: str | None = None,
        aboveground_biomass_kg: float | None = None,
        protocol: str = "vcs",
    ) -> dict[str, Any]:
        """Estimate carbon for a single tree."""
        try:
            # Parse protocol
            try:
                carbon_protocol = CarbonProtocol(protocol.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid protocol: {protocol}. Use: vcs, car, acr, fia",
                )

            estimator = carbon_estimators[carbon_protocol]
            estimate = estimator.estimate_tree_carbon(
                tree_id=tree_id,
                dbh_cm=dbh_cm,
                height_m=height_m,
                species_code=species_code,
                aboveground_biomass_kg=aboveground_biomass_kg,
            )

            return {
                "tree_id": estimate.tree_id,
                "species_code": estimate.species_code,
                "dbh_cm": estimate.dbh_cm,
                "height_m": estimate.height_m,
                "protocol": estimate.protocol.value,
                "equation_source": estimate.equation_source,
                "aboveground_biomass_kg": {
                    "value": estimate.aboveground_biomass_kg.value,
                    "uncertainty_pct": estimate.aboveground_biomass_kg.uncertainty_pct,
                    "lower_bound": estimate.aboveground_biomass_kg.lower_bound,
                    "upper_bound": estimate.aboveground_biomass_kg.upper_bound,
                },
                "belowground_biomass_kg": {
                    "value": estimate.belowground_biomass_kg.value,
                    "uncertainty_pct": estimate.belowground_biomass_kg.uncertainty_pct,
                    "lower_bound": estimate.belowground_biomass_kg.lower_bound,
                    "upper_bound": estimate.belowground_biomass_kg.upper_bound,
                },
                "total_biomass_kg": {
                    "value": estimate.total_biomass_kg.value,
                    "uncertainty_pct": estimate.total_biomass_kg.uncertainty_pct,
                    "lower_bound": estimate.total_biomass_kg.lower_bound,
                    "upper_bound": estimate.total_biomass_kg.upper_bound,
                },
                "carbon_kg": {
                    "value": estimate.carbon_kg.value,
                    "uncertainty_pct": estimate.carbon_kg.uncertainty_pct,
                    "lower_bound": estimate.carbon_kg.lower_bound,
                    "upper_bound": estimate.carbon_kg.upper_bound,
                },
                "co2e_kg": {
                    "value": estimate.co2e_kg.value,
                    "uncertainty_pct": estimate.co2e_kg.uncertainty_pct,
                    "lower_bound": estimate.co2e_kg.lower_bound,
                    "upper_bound": estimate.co2e_kg.upper_bound,
                },
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/carbon/estimate-project",
        tags=["Carbon Stock"],
        summary="Estimate carbon stock for a project",
        description="""
        Estimates total carbon stock for a project from tree data.

        Calculates carbon by pool (above-ground, below-ground) with
        protocol-specific methodologies and uncertainty propagation.

        Returns total carbon, CO2 equivalent, and breakdown by pool.
        """,
        responses={
            200: {"description": "Project carbon estimated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def estimate_project_carbon(
        trees: list[dict[str, Any]],
        area_hectares: float,
        project_id: str = "PROJECT001",
        analysis_id: str = "ANALYSIS001",
        protocol: str = "vcs",
    ) -> dict[str, Any]:
        """Estimate carbon stock for a project."""
        try:
            start_time = time.time()

            # Parse protocol
            try:
                carbon_protocol = CarbonProtocol(protocol.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid protocol: {protocol}. Use: vcs, car, acr, fia",
                )

            estimator = carbon_estimators[carbon_protocol]
            result = estimator.estimate_project_carbon(
                trees=trees,
                area_hectares=area_hectares,
                project_id=project_id,
                analysis_id=analysis_id,
            )

            processing_time = (time.time() - start_time) * 1000

            # Convert pools to dict
            pools_data = {}
            for pool_type, pool in result.pools.items():
                pools_data[pool_type.value] = {
                    "carbon_tonnes": pool.carbon_tonnes.value,
                    "co2e_tonnes": pool.co2e_tonnes.value,
                    "uncertainty_pct": pool.carbon_tonnes.uncertainty_pct,
                    "carbon_density_t_ha": pool.carbon_density_t_ha,
                }

            return {
                "project_id": result.project_id,
                "analysis_id": result.analysis_id,
                "protocol": result.protocol.value,
                "methodology_version": result.methodology_version,
                "audit_id": result.audit_id,
                "total_carbon_tonnes": {
                    "value": result.total_carbon_tonnes.value,
                    "uncertainty_pct": result.total_carbon_tonnes.uncertainty_pct,
                    "lower_bound": result.total_carbon_tonnes.lower_bound,
                    "upper_bound": result.total_carbon_tonnes.upper_bound,
                },
                "total_co2e_tonnes": {
                    "value": result.total_co2e_tonnes.value,
                    "uncertainty_pct": result.total_co2e_tonnes.uncertainty_pct,
                    "lower_bound": result.total_co2e_tonnes.lower_bound,
                    "upper_bound": result.total_co2e_tonnes.upper_bound,
                },
                "pools": pools_data,
                "area_hectares": result.area_hectares,
                "tree_count": result.tree_count,
                "calculation_date": result.calculation_date.isoformat(),
                "processing_time_ms": round(processing_time, 2),
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Project carbon estimation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Carbon estimation failed: {str(e)}",
            )

    @app.post(
        "/api/v1/carbon/credits",
        tags=["Carbon Stock"],
        summary="Calculate carbon credits",
        description="""
        Calculates potential carbon credits from CO2 equivalent tonnes.

        Applies protocol-specific conservative deductions and provides
        estimated value ranges based on current market prices.
        """,
        responses={
            200: {"description": "Credits calculated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def calculate_carbon_credits(
        co2e_tonnes: float,
        registry: str = "vcs",
    ) -> dict[str, Any]:
        """Calculate carbon credits from CO2e."""
        try:
            # Parse registry
            try:
                carbon_protocol = CarbonProtocol(registry.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid registry: {registry}. Use: vcs, car, acr, fia",
                )

            estimator = carbon_estimators[carbon_protocol]
            return estimator.calculate_carbon_credits(co2e_tonnes, carbon_protocol)

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    @app.post(
        "/api/v1/carbon/report",
        tags=["Carbon Stock"],
        summary="Generate carbon stock report",
        description="""
        Generates a comprehensive carbon stock report in PDF and/or Excel format.

        Report includes:
        - Executive summary with totals and uncertainty
        - Carbon pools breakdown
        - Carbon credits potential
        - Methodology documentation
        - Audit trail
        """,
        responses={
            200: {"description": "Report generated successfully"},
            400: {"description": "Invalid parameters"},
        },
    )
    async def generate_carbon_report(
        trees: list[dict[str, Any]],
        area_hectares: float,
        project_id: str = "PROJECT001",
        analysis_id: str = "ANALYSIS001",
        protocol: str = "vcs",
        output_format: str = "both",
        include_credits: bool = True,
    ) -> dict[str, Any]:
        """Generate carbon stock report."""
        try:
            start_time = time.time()

            # Parse protocol
            try:
                carbon_protocol = CarbonProtocol(protocol.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid protocol: {protocol}. Use: vcs, car, acr, fia",
                )

            # Estimate carbon
            estimator = carbon_estimators[carbon_protocol]
            carbon_stock = estimator.estimate_project_carbon(
                trees=trees,
                area_hectares=area_hectares,
                project_id=project_id,
                analysis_id=analysis_id,
            )

            # Calculate credits if requested
            credits = None
            if include_credits:
                credits = estimator.calculate_carbon_credits(
                    carbon_stock.total_co2e_tonnes.value,
                    carbon_protocol,
                )

            # Generate report
            config = CarbonReportConfig(include_credits=include_credits)
            report = carbon_report_generator.generate_report(
                carbon_stock=carbon_stock,
                credits=credits,
                config=config,
                output_format=output_format,
            )

            processing_time = (time.time() - start_time) * 1000

            return {
                **carbon_report_generator.generate_summary_dict(report),
                "processing_time_ms": round(processing_time, 2),
            }

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            logger.exception("Carbon report generation failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Report generation failed: {str(e)}",
            )

    @app.get(
        "/api/v1/carbon/protocols",
        tags=["Carbon Stock"],
        summary="Get supported carbon protocols",
        description="Returns list of supported carbon accounting protocols.",
        responses={
            200: {"description": "Protocols returned successfully"},
        },
    )
    async def get_carbon_protocols() -> dict[str, Any]:
        """Get supported carbon protocols."""
        return {
            "protocols": [
                {
                    "name": "vcs",
                    "full_name": "Verified Carbon Standard (Verra)",
                    "description": "International standard for voluntary carbon markets",
                    "carbon_fraction": 0.47,
                    "conservative_deduction": "15%",
                    "methodology": "VM0010",
                },
                {
                    "name": "car",
                    "full_name": "Climate Action Reserve",
                    "description": "North American carbon offset program",
                    "carbon_fraction": 0.50,
                    "conservative_deduction": "20%",
                    "methodology": "CAR Forest Protocol",
                },
                {
                    "name": "acr",
                    "full_name": "American Carbon Registry",
                    "description": "US-based voluntary carbon registry",
                    "carbon_fraction": 0.47,
                    "conservative_deduction": "18%",
                    "methodology": "ACR Methodology",
                },
                {
                    "name": "fia",
                    "full_name": "Forest Inventory and Analysis",
                    "description": "USFS standard (no deduction, reference only)",
                    "carbon_fraction": 0.47,
                    "conservative_deduction": "0%",
                    "methodology": "FIA/Jenkins 2003",
                },
            ],
        }

    @app.get(
        "/api/v1/carbon/audit/{audit_id}",
        tags=["Carbon Stock"],
        summary="Get audit trail for carbon calculation",
        description="""
        Retrieves the audit trail for a specific carbon calculation.

        Audit trail includes all inputs, outputs, methodology used,
        and uncertainty information for verification purposes.
        """,
        responses={
            200: {"description": "Audit trail returned successfully"},
            404: {"description": "Audit record not found"},
        },
    )
    async def get_carbon_audit(audit_id: str) -> dict[str, Any]:
        """Get audit trail for a carbon calculation."""
        # Search all estimators for the audit record
        for protocol, estimator in carbon_estimators.items():
            for record in estimator.get_audit_records():
                if record.audit_id == audit_id:
                    return {
                        "audit_id": record.audit_id,
                        "calculation_type": record.calculation_type,
                        "timestamp": record.timestamp.isoformat(),
                        "protocol": record.protocol.value,
                        "methodology_version": record.methodology_version,
                        "uncertainty_method": record.uncertainty_method.value,
                        "uncertainty_pct": record.uncertainty_pct,
                        "equation_sources": record.equation_sources,
                        "input_data": record.input_data,
                        "output_data": record.output_data,
                        "system_version": record.system_version,
                    }

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit record not found: {audit_id}",
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
