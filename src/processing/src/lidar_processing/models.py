"""
Pydantic models for LiDAR Processing Service.

This module defines all request/response models and data structures
used throughout the LiDAR processing microservice.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ValidationStatus(str, Enum):
    """Enumeration of validation result statuses."""

    VALID = "valid"
    INVALID = "invalid"
    WARNING = "warning"


class ValidationSeverity(str, Enum):
    """Severity level for validation issues."""

    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class JobStatus(str, Enum):
    """Status of a processing job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    """Types of processing jobs."""

    VALIDATE = "validate"
    EXTRACT_METADATA = "extract_metadata"
    VALIDATE_AND_EXTRACT = "validate_and_extract"
    GROUND_CLASSIFY = "ground_classify"
    NORMALIZE_HEIGHT = "normalize_height"
    DETECT_TREES = "detect_trees"
    FULL_PIPELINE = "full_pipeline"


# ============================================================================
# Request Models
# ============================================================================


class FilePathRequest(BaseModel):
    """Request model for file path-based operations."""

    file_path: str = Field(
        ...,
        description="Absolute path to the LAS/LAZ file",
        examples=["/data/uploads/forest_scan.las"],
    )

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, v: str) -> str:
        """Validate file path format."""
        if not v or not v.strip():
            raise ValueError("File path cannot be empty")
        return v.strip()


class ValidateRequest(FilePathRequest):
    """Request model for file validation."""

    require_crs: bool = Field(
        default=True,
        description="Whether to require a valid CRS",
    )
    check_point_density: bool = Field(
        default=False,
        description="Calculate and validate point density",
    )


class ExtractMetadataRequest(FilePathRequest):
    """Request model for metadata extraction."""

    include_classification_counts: bool = Field(
        default=True,
        description="Include point counts by classification",
    )
    include_return_statistics: bool = Field(
        default=True,
        description="Include return number statistics",
    )
    calculate_density: bool = Field(
        default=True,
        description="Calculate point density per square meter",
    )
    sample_size: int | None = Field(
        default=None,
        description="Sample size for large files (None = all points)",
        ge=1000,
    )


class QueueJobRequest(BaseModel):
    """Request model for queueing a processing job."""

    file_path: str = Field(
        ...,
        description="Path to the LAS/LAZ file",
    )
    job_type: JobType = Field(
        ...,
        description="Type of processing job",
    )
    callback_url: str | None = Field(
        default=None,
        description="URL to POST results when processing completes",
    )
    priority: int = Field(
        default=0,
        description="Job priority (higher = more urgent)",
        ge=0,
        le=10,
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata to include with job",
    )


# ============================================================================
# Response Models
# ============================================================================


class ValidationIssue(BaseModel):
    """A single validation issue or warning."""

    code: str = Field(
        ...,
        description="Issue code for programmatic handling",
        examples=["MISSING_CRS", "INVALID_POINT_FORMAT"],
    )
    message: str = Field(
        ...,
        description="Human-readable description of the issue",
    )
    severity: ValidationSeverity = Field(
        ...,
        description="Severity level of the issue",
    )
    field: str | None = Field(
        default=None,
        description="Field or attribute the issue relates to",
    )
    details: dict[str, Any] | None = Field(
        default=None,
        description="Additional details about the issue",
    )


class ValidationResult(BaseModel):
    """Result of file validation."""

    status: ValidationStatus = Field(
        ...,
        description="Overall validation status",
    )
    file_path: str = Field(
        ...,
        description="Path to the validated file",
    )
    is_valid: bool = Field(
        ...,
        description="Whether the file passed validation",
    )
    issues: list[ValidationIssue] = Field(
        default_factory=list,
        description="List of validation issues found",
    )
    file_info: FileInfo | None = Field(
        default=None,
        description="Basic file information if readable",
    )
    validated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of validation",
    )

    @property
    def error_count(self) -> int:
        """Count of error-level issues."""
        return sum(1 for i in self.issues if i.severity == ValidationSeverity.ERROR)

    @property
    def warning_count(self) -> int:
        """Count of warning-level issues."""
        return sum(1 for i in self.issues if i.severity == ValidationSeverity.WARNING)


class FileInfo(BaseModel):
    """Basic file information."""

    file_path: str = Field(..., description="Path to the file")
    file_size_bytes: int = Field(..., description="File size in bytes")
    file_size_mb: float = Field(..., description="File size in megabytes")
    file_extension: str = Field(..., description="File extension")


class Bounds(BaseModel):
    """Spatial bounds of a point cloud."""

    min_x: float = Field(..., description="Minimum X coordinate")
    max_x: float = Field(..., description="Maximum X coordinate")
    min_y: float = Field(..., description="Minimum Y coordinate")
    max_y: float = Field(..., description="Maximum Y coordinate")
    min_z: float = Field(..., description="Minimum Z coordinate (elevation)")
    max_z: float = Field(..., description="Maximum Z coordinate (elevation)")

    @property
    def width(self) -> float:
        """Width in X dimension."""
        return self.max_x - self.min_x

    @property
    def height(self) -> float:
        """Height in Y dimension."""
        return self.max_y - self.min_y

    @property
    def depth(self) -> float:
        """Depth in Z dimension."""
        return self.max_z - self.min_z

    @property
    def area_2d(self) -> float:
        """2D area (width * height)."""
        return self.width * self.height


class ClassificationCount(BaseModel):
    """Point count for a classification code."""

    code: int = Field(..., description="ASPRS classification code")
    name: str = Field(..., description="Classification name")
    count: int = Field(..., description="Number of points")
    percentage: float = Field(..., description="Percentage of total points")


class ReturnStatistics(BaseModel):
    """Statistics for point returns."""

    return_number: int = Field(..., description="Return number (1 = first, etc.)")
    count: int = Field(..., description="Number of points")
    percentage: float = Field(..., description="Percentage of total points")


class LidarMetadata(BaseModel):
    """Complete metadata extracted from a LiDAR file."""

    file_path: str = Field(..., description="Path to the file")
    file_info: FileInfo = Field(..., description="Basic file information")

    # LAS Header Information
    las_version: str = Field(..., description="LAS format version (e.g., '1.4')")
    point_format_id: int = Field(..., description="Point data format ID (0-10)")
    point_count: int = Field(..., description="Total number of points")

    # Coordinate Reference System
    crs_wkt: str | None = Field(
        default=None, description="Coordinate reference system in WKT format"
    )
    crs_epsg: int | None = Field(default=None, description="EPSG code if available")

    # Spatial Information
    bounds: Bounds = Field(..., description="Spatial bounds of point cloud")
    scale: tuple[float, float, float] = Field(
        ..., description="Scale factors (x, y, z)"
    )
    offset: tuple[float, float, float] = Field(
        ..., description="Offset values (x, y, z)"
    )

    # Point Density
    point_density: float | None = Field(
        default=None, description="Points per square meter"
    )
    area_sq_meters: float | None = Field(
        default=None, description="2D area in square meters"
    )

    # Classification Breakdown
    classification_counts: list[ClassificationCount] = Field(
        default_factory=list, description="Point counts by classification"
    )

    # Return Statistics
    return_statistics: list[ReturnStatistics] = Field(
        default_factory=list, description="Point counts by return number"
    )

    # Additional Header Fields
    creation_date: str | None = Field(
        default=None, description="File creation date from header"
    )
    generating_software: str | None = Field(
        default=None, description="Software that generated the file"
    )

    # Processing Metadata
    extracted_at: datetime = Field(
        default_factory=datetime.utcnow, description="Timestamp of extraction"
    )
    extraction_time_ms: float | None = Field(
        default=None, description="Time taken to extract metadata"
    )


class JobResponse(BaseModel):
    """Response when a job is queued."""

    job_id: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Current job status")
    job_type: JobType = Field(..., description="Type of job")
    file_path: str = Field(..., description="File being processed")
    queued_at: datetime = Field(
        default_factory=datetime.utcnow, description="When the job was queued"
    )
    estimated_time_seconds: int | None = Field(
        default=None, description="Estimated processing time"
    )


class JobResult(BaseModel):
    """Result of a completed job."""

    job_id: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Final job status")
    job_type: JobType = Field(..., description="Type of job")
    file_path: str = Field(..., description="File that was processed")
    queued_at: datetime = Field(..., description="When the job was queued")
    completed_at: datetime = Field(
        default_factory=datetime.utcnow, description="When the job completed"
    )
    processing_time_ms: float = Field(..., description="Processing time in ms")
    validation_result: ValidationResult | None = Field(
        default=None, description="Validation result if applicable"
    )
    metadata: LidarMetadata | None = Field(
        default=None, description="Extracted metadata if applicable"
    )
    error: str | None = Field(default=None, description="Error message if failed")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Current timestamp"
    )
    redis_connected: bool = Field(..., description="Redis connection status")
    uptime_seconds: float = Field(..., description="Service uptime in seconds")


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: dict[str, Any] | None = Field(
        default=None, description="Additional error details"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Error timestamp"
    )


# ============================================================================
# LiDAR Processing Parameter Models
# ============================================================================


class GroundClassificationParams(BaseModel):
    """Parameters for ground point classification."""

    cell_size: float = Field(
        default=1.0,
        description="Cell size for morphological operations in meters",
        gt=0,
    )
    slope: float = Field(
        default=0.15,
        description="Maximum slope threshold (height change per unit distance)",
        ge=0,
        le=1.0,
    )
    max_window_size: float = Field(
        default=33.0,
        description="Maximum window size for morphological filter in meters",
        gt=0,
    )
    initial_distance: float = Field(
        default=0.5,
        description="Initial height threshold for ground points",
        gt=0,
    )
    max_distance: float = Field(
        default=3.0,
        description="Maximum height threshold for ground points",
        gt=0,
    )


class TreeDetectionParams(BaseModel):
    """Parameters for individual tree detection."""

    min_height: float = Field(
        default=2.0,
        description="Minimum tree height to detect in meters",
        gt=0,
    )
    min_distance: float = Field(
        default=3.0,
        description="Minimum distance between detected tree tops in meters",
        gt=0,
    )
    smoothing_sigma: float = Field(
        default=1.0,
        description="Gaussian smoothing sigma for CHM before detection",
        ge=0,
    )
    resolution: float = Field(
        default=1.0,
        description="CHM resolution in meters",
        gt=0,
    )


class HeightNormalizationParams(BaseModel):
    """Parameters for height normalization and CHM generation."""

    resolution: float = Field(
        default=1.0,
        description="Output raster resolution in meters",
        gt=0,
    )
    interpolation_method: str = Field(
        default="idw",
        description="Interpolation method for DEM: 'idw' or 'tin'",
    )
    idw_power: float = Field(
        default=2.0,
        description="Power parameter for IDW interpolation",
        gt=0,
    )
    search_radius: float | None = Field(
        default=None,
        description="Search radius for IDW interpolation in meters (None = auto)",
    )


# ============================================================================
# LiDAR Processing Result Models
# ============================================================================


class GroundClassificationResult(BaseModel):
    """Result of ground point classification."""

    file_path: str = Field(..., description="Path to the input LAS file")
    output_path: str | None = Field(
        default=None, description="Path to output LAS file with classification"
    )
    total_points: int = Field(..., description="Total number of points processed")
    ground_points: int = Field(..., description="Number of points classified as ground")
    non_ground_points: int = Field(
        ..., description="Number of points classified as non-ground"
    )
    ground_percentage: float = Field(
        ..., description="Percentage of points classified as ground"
    )
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    params: GroundClassificationParams = Field(
        ..., description="Parameters used for classification"
    )


class CHMResult(BaseModel):
    """Result of CHM (Canopy Height Model) generation."""

    file_path: str = Field(..., description="Path to the input LAS file")
    chm_path: str | None = Field(default=None, description="Path to output CHM raster")
    dem_path: str | None = Field(default=None, description="Path to output DEM raster")
    resolution: float = Field(..., description="Output raster resolution in meters")
    bounds: Bounds = Field(..., description="Spatial bounds of the output raster")
    width: int = Field(..., description="Raster width in pixels")
    height: int = Field(..., description="Raster height in pixels")
    min_height: float = Field(..., description="Minimum normalized height value")
    max_height: float = Field(..., description="Maximum normalized height value")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class TreeMetrics(BaseModel):
    """Metrics for an individual detected tree."""

    tree_id: int = Field(..., description="Unique tree identifier")
    x: float = Field(..., description="Tree top X coordinate")
    y: float = Field(..., description="Tree top Y coordinate")
    height: float = Field(..., description="Tree height in meters")
    crown_diameter: float | None = Field(
        default=None, description="Crown diameter in meters"
    )
    crown_area: float | None = Field(
        default=None, description="Crown area in square meters"
    )
    crown_base_height: float | None = Field(
        default=None, description="Crown base height in meters"
    )
    dbh_estimated: float | None = Field(
        default=None, description="Estimated DBH in centimeters (from allometry)"
    )
    biomass_estimated: float | None = Field(
        default=None, description="Estimated above-ground biomass in kg"
    )
    point_count: int | None = Field(
        default=None, description="Number of points in tree segment"
    )


class TreeDetectionResult(BaseModel):
    """Result of tree detection processing."""

    file_path: str = Field(..., description="Path to the input LAS file")
    trees_detected: int = Field(..., description="Number of trees detected")
    trees: list[TreeMetrics] = Field(
        default_factory=list, description="List of detected trees with metrics"
    )
    chm_resolution: float = Field(..., description="CHM resolution used for detection")
    params: TreeDetectionParams = Field(
        ..., description="Parameters used for detection"
    )
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")

    @property
    def average_height(self) -> float | None:
        """Calculate average tree height."""
        if not self.trees:
            return None
        return sum(t.height for t in self.trees) / len(self.trees)

    @property
    def max_tree_height(self) -> float | None:
        """Get maximum tree height."""
        if not self.trees:
            return None
        return max(t.height for t in self.trees)


class ProcessingResult(BaseModel):
    """Combined result from full LiDAR processing pipeline."""

    file_path: str = Field(..., description="Path to the input LAS file")
    job_id: str | None = Field(default=None, description="Associated job ID")
    ground_classification: GroundClassificationResult | None = Field(
        default=None, description="Ground classification results"
    )
    height_normalization: CHMResult | None = Field(
        default=None, description="Height normalization/CHM results"
    )
    tree_detection: TreeDetectionResult | None = Field(
        default=None, description="Tree detection results"
    )
    total_processing_time_ms: float = Field(
        ..., description="Total processing time in milliseconds"
    )
    completed_at: datetime = Field(
        default_factory=datetime.utcnow, description="Processing completion timestamp"
    )
    success: bool = Field(default=True, description="Whether processing succeeded")
    error: str | None = Field(default=None, description="Error message if failed")


# ============================================================================
# ASPRS Classification Codes
# ============================================================================

ASPRS_CLASSIFICATION_NAMES: dict[int, str] = {
    0: "Created, never classified",
    1: "Unclassified",
    2: "Ground",
    3: "Low Vegetation",
    4: "Medium Vegetation",
    5: "High Vegetation",
    6: "Building",
    7: "Low Point (noise)",
    8: "Reserved",
    9: "Water",
    10: "Rail",
    11: "Road Surface",
    12: "Reserved",
    13: "Wire - Guard (Shield)",
    14: "Wire - Conductor (Phase)",
    15: "Transmission Tower",
    16: "Wire-structure Connector",
    17: "Bridge Deck",
    18: "High Noise",
    # 19-63 are reserved
    # 64-255 are user definable
}


def get_classification_name(code: int) -> str:
    """
    Get human-readable name for an ASPRS classification code.

    Args:
        code: ASPRS classification code (0-255).

    Returns:
        Human-readable classification name.
    """
    if code in ASPRS_CLASSIFICATION_NAMES:
        return ASPRS_CLASSIFICATION_NAMES[code]
    elif 19 <= code <= 63:
        return f"Reserved ({code})"
    elif 64 <= code <= 255:
        return f"User Defined ({code})"
    else:
        return f"Unknown ({code})"
