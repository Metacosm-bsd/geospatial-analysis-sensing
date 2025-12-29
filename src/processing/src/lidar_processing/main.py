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
