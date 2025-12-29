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


# ============================================================================
# Report Generation Models (Sprint 11-12)
# ============================================================================


class UnitSystem(str, Enum):
    """Unit system for reports."""

    METRIC = "metric"
    IMPERIAL = "imperial"


class ReportFormat(str, Enum):
    """Output format for reports."""

    PDF = "pdf"
    EXCEL = "excel"
    BOTH = "both"


class ReportStatus(str, Enum):
    """Status of report generation."""

    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportOptions(BaseModel):
    """Options for report generation."""

    include_charts: bool = Field(
        default=True,
        description="Include charts and visualizations in the report",
    )
    include_tree_list: bool = Field(
        default=True,
        description="Include detailed tree inventory table",
    )
    include_methodology: bool = Field(
        default=True,
        description="Include methodology notes section",
    )
    include_species_summary: bool = Field(
        default=True,
        description="Include species distribution summary",
    )
    include_stand_summary: bool = Field(
        default=True,
        description="Include stand-level summary if stands are defined",
    )
    units: UnitSystem = Field(
        default=UnitSystem.METRIC,
        description="Unit system for measurements",
    )
    logo_path: str | None = Field(
        default=None,
        description="Path to logo image for report header",
    )
    company_name: str | None = Field(
        default=None,
        description="Company name for report branding",
    )
    prepared_by: str | None = Field(
        default=None,
        description="Name of report preparer",
    )


class ReportResult(BaseModel):
    """Result of report generation."""

    report_id: str = Field(..., description="Unique report identifier")
    analysis_id: str = Field(..., description="Associated analysis ID")
    status: ReportStatus = Field(..., description="Report generation status")
    pdf_path: str | None = Field(
        default=None,
        description="Path to generated PDF file",
    )
    excel_path: str | None = Field(
        default=None,
        description="Path to generated Excel file",
    )
    generated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of report generation",
    )
    generation_time_ms: float | None = Field(
        default=None,
        description="Time taken to generate report in milliseconds",
    )
    file_sizes: dict[str, int] = Field(
        default_factory=dict,
        description="File sizes in bytes for each output file",
    )
    error: str | None = Field(
        default=None,
        description="Error message if generation failed",
    )


class SpeciesMetrics(BaseModel):
    """Aggregated metrics for a species."""

    species_name: str = Field(..., description="Species name or code")
    tree_count: int = Field(..., description="Number of trees")
    percentage: float = Field(..., description="Percentage of total trees")
    mean_height: float = Field(..., description="Mean height in meters")
    mean_dbh: float | None = Field(
        default=None,
        description="Mean DBH in centimeters",
    )
    mean_crown_diameter: float | None = Field(
        default=None,
        description="Mean crown diameter in meters",
    )
    total_basal_area: float | None = Field(
        default=None,
        description="Total basal area in square meters",
    )
    total_biomass: float | None = Field(
        default=None,
        description="Total above-ground biomass in kg",
    )
    total_carbon: float | None = Field(
        default=None,
        description="Total carbon stock in kg (biomass * 0.47)",
    )


class SizeClassDistribution(BaseModel):
    """Distribution of trees by size class."""

    size_class: str = Field(..., description="Size class label (e.g., '10-20cm')")
    min_value: float = Field(..., description="Minimum value for class")
    max_value: float = Field(..., description="Maximum value for class")
    count: int = Field(..., description="Number of trees in class")
    percentage: float = Field(..., description="Percentage of total trees")


class StandMetrics(BaseModel):
    """Metrics for a forest stand."""

    stand_id: str = Field(..., description="Unique stand identifier")
    stand_name: str | None = Field(
        default=None,
        description="Optional stand name",
    )
    area_hectares: float = Field(..., description="Stand area in hectares")
    tree_count: int = Field(..., description="Number of trees in stand")
    stems_per_hectare: float = Field(..., description="Stand density (stems/ha)")
    basal_area_per_hectare: float = Field(
        ...,
        description="Basal area per hectare (m2/ha)",
    )
    mean_height: float = Field(..., description="Mean tree height in meters")
    dominant_height: float | None = Field(
        default=None,
        description="Dominant height (mean of tallest trees) in meters",
    )
    mean_dbh: float | None = Field(
        default=None,
        description="Mean DBH in centimeters",
    )
    quadratic_mean_dbh: float | None = Field(
        default=None,
        description="Quadratic mean DBH in centimeters",
    )
    total_volume: float | None = Field(
        default=None,
        description="Total stem volume in cubic meters",
    )
    volume_per_hectare: float | None = Field(
        default=None,
        description="Volume per hectare (m3/ha)",
    )
    total_biomass: float | None = Field(
        default=None,
        description="Total above-ground biomass in kg",
    )
    biomass_per_hectare: float | None = Field(
        default=None,
        description="Biomass per hectare (kg/ha)",
    )
    total_carbon: float | None = Field(
        default=None,
        description="Total carbon stock in kg",
    )
    carbon_per_hectare: float | None = Field(
        default=None,
        description="Carbon per hectare (kg/ha)",
    )
    species_composition: list[SpeciesMetrics] = Field(
        default_factory=list,
        description="Species composition within the stand",
    )
    dbh_distribution: list[SizeClassDistribution] = Field(
        default_factory=list,
        description="DBH size class distribution",
    )
    height_distribution: list[SizeClassDistribution] = Field(
        default_factory=list,
        description="Height size class distribution",
    )


class ProjectInfo(BaseModel):
    """Project information for report header."""

    project_name: str = Field(..., description="Project name")
    project_id: str | None = Field(
        default=None,
        description="Project identifier",
    )
    client_name: str | None = Field(
        default=None,
        description="Client name",
    )
    location: str | None = Field(
        default=None,
        description="Project location description",
    )
    survey_date: datetime | None = Field(
        default=None,
        description="Date of LiDAR survey",
    )
    analysis_date: datetime = Field(
        default_factory=datetime.utcnow,
        description="Date of analysis",
    )
    total_area_hectares: float | None = Field(
        default=None,
        description="Total project area in hectares",
    )
    coordinate_system: str | None = Field(
        default=None,
        description="Coordinate reference system used",
    )
    notes: str | None = Field(
        default=None,
        description="Additional project notes",
    )


class InventorySummary(BaseModel):
    """Summary statistics for the entire inventory."""

    total_trees: int = Field(..., description="Total number of trees detected")
    total_area_hectares: float = Field(..., description="Total surveyed area")
    stems_per_hectare: float = Field(..., description="Overall stand density")
    mean_height: float = Field(..., description="Mean tree height in meters")
    max_height: float = Field(..., description="Maximum tree height in meters")
    min_height: float = Field(..., description="Minimum tree height in meters")
    std_height: float = Field(..., description="Standard deviation of heights")
    mean_dbh: float | None = Field(
        default=None,
        description="Mean DBH in centimeters",
    )
    total_basal_area: float | None = Field(
        default=None,
        description="Total basal area in square meters",
    )
    basal_area_per_hectare: float | None = Field(
        default=None,
        description="Basal area per hectare (m2/ha)",
    )
    total_volume: float | None = Field(
        default=None,
        description="Total stem volume in cubic meters",
    )
    total_biomass: float | None = Field(
        default=None,
        description="Total above-ground biomass in kg",
    )
    total_carbon: float | None = Field(
        default=None,
        description="Total carbon stock in kg",
    )
    co2_equivalent: float | None = Field(
        default=None,
        description="CO2 equivalent in kg (carbon * 44/12)",
    )
    species_count: int = Field(
        default=0,
        description="Number of unique species identified",
    )


class GenerateReportRequest(BaseModel):
    """Request model for report generation."""

    analysis_id: str = Field(
        ...,
        description="ID of the analysis to generate report for",
    )
    project_info: ProjectInfo = Field(
        ...,
        description="Project information for report header",
    )
    output_format: ReportFormat = Field(
        default=ReportFormat.BOTH,
        description="Output format (pdf, excel, or both)",
    )
    options: ReportOptions = Field(
        default_factory=ReportOptions,
        description="Report generation options",
    )
    output_directory: str | None = Field(
        default=None,
        description="Directory for output files (default: temp directory)",
    )
    stand_boundaries: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional stand boundary polygons as GeoJSON",
    )


# ============================================================================
# Species Classification Models (Sprint 13-14)
# ============================================================================


class TreeFeatures(BaseModel):
    """
    Features extracted from a tree point cloud for species classification.

    These features capture structural and intensity characteristics that
    can distinguish between different tree species.
    """

    # Core height metrics
    height: float = Field(..., description="Maximum tree height in meters")
    height_mean: float | None = Field(
        default=None,
        description="Mean point height in meters",
    )
    height_std: float | None = Field(
        default=None,
        description="Standard deviation of point heights",
    )
    height_percentiles: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0],
        description="Height percentiles: 25, 50, 75, 90, 95",
    )
    height_skewness: float | None = Field(
        default=None,
        description="Skewness of height distribution",
    )
    height_kurtosis: float | None = Field(
        default=None,
        description="Kurtosis of height distribution",
    )

    # Crown shape metrics
    crown_diameter: float = Field(
        ...,
        description="Crown diameter in meters",
    )
    crown_area: float = Field(
        ...,
        description="Crown area in square meters",
    )
    crown_asymmetry: float | None = Field(
        default=None,
        description="Crown shape asymmetry (0=symmetric, 1=max asymmetry)",
    )
    crown_density: float = Field(
        default=0.5,
        description="Point density within crown (points per m2)",
    )
    crown_perimeter: float | None = Field(
        default=None,
        description="Crown perimeter in meters",
    )
    crown_circularity: float | None = Field(
        default=None,
        description="Crown circularity (1.0=perfect circle)",
    )

    # Vertical distribution metrics
    vertical_complexity: float = Field(
        default=0.5,
        description="Vertical structure complexity (0-1 entropy-based)",
    )
    canopy_relief_ratio: float | None = Field(
        default=None,
        description="Canopy relief ratio (mean-min)/(max-min)",
    )
    gap_fraction: float | None = Field(
        default=None,
        description="Fraction of empty height bins",
    )
    layer_count: int | None = Field(
        default=None,
        description="Number of distinct vertical layers",
    )
    crown_base_height: float | None = Field(
        default=None,
        description="Height to crown base in meters",
    )
    crown_length_ratio: float | None = Field(
        default=None,
        description="Crown length relative to total height",
    )

    # Point density patterns
    point_density_upper: float | None = Field(
        default=None,
        description="Fraction of points in upper third",
    )
    point_density_mid: float | None = Field(
        default=None,
        description="Fraction of points in middle third",
    )
    point_density_lower: float | None = Field(
        default=None,
        description="Fraction of points in lower third",
    )
    point_count: int = Field(
        default=0,
        description="Total number of points in tree segment",
    )

    # Intensity statistics (if available)
    intensity_mean: float | None = Field(
        default=None,
        description="Mean point intensity",
    )
    intensity_std: float | None = Field(
        default=None,
        description="Standard deviation of intensity",
    )
    intensity_max: float | None = Field(
        default=None,
        description="Maximum intensity value",
    )
    intensity_percentile_90: float | None = Field(
        default=None,
        description="90th percentile of intensity",
    )

    # Return number distribution (if available)
    first_return_ratio: float | None = Field(
        default=None,
        description="Ratio of first returns to total",
    )
    last_return_ratio: float | None = Field(
        default=None,
        description="Ratio of last returns to total",
    )
    single_return_ratio: float | None = Field(
        default=None,
        description="Ratio of single returns to total",
    )


class SpeciesPrediction(BaseModel):
    """
    Species prediction result for a single tree.

    Includes the predicted species, confidence score, and
    probability distribution across all species classes.
    """

    species_code: str = Field(
        ...,
        description="Predicted species code (e.g., 'PSME' for Douglas-fir)",
    )
    species_name: str = Field(
        ...,
        description="Common name of the predicted species",
    )
    confidence: float = Field(
        ...,
        description="Prediction confidence (0-1)",
        ge=0,
        le=1,
    )
    probabilities: dict[str, float] = Field(
        default_factory=dict,
        description="Probability for each species class",
    )


class ClassificationMetrics(BaseModel):
    """
    Evaluation metrics for species classification model.

    Includes overall accuracy and per-class precision, recall,
    and F1 scores, along with the confusion matrix.
    """

    accuracy: float = Field(
        ...,
        description="Overall classification accuracy (0-1)",
        ge=0,
        le=1,
    )
    precision: dict[str, float] = Field(
        default_factory=dict,
        description="Precision for each species class",
    )
    recall: dict[str, float] = Field(
        default_factory=dict,
        description="Recall for each species class",
    )
    f1_score: dict[str, float] = Field(
        default_factory=dict,
        description="F1 score for each species class",
    )
    confusion_matrix: list[list[int]] = Field(
        default_factory=list,
        description="Confusion matrix as 2D list",
    )
    class_labels: list[str] = Field(
        default_factory=list,
        description="List of class labels in matrix order",
    )


class LabeledTree(BaseModel):
    """
    A tree with known species label for training/evaluation.

    Used for building training datasets and evaluating classifier
    performance.
    """

    tree_id: str = Field(
        ...,
        description="Unique identifier for the tree",
    )
    species_code: str = Field(
        ...,
        description="Known species code (ground truth)",
    )
    features: TreeFeatures = Field(
        ...,
        description="Extracted tree features",
    )
    source: str = Field(
        default="manual",
        description="Source of the label (manual, field, photo, etc.)",
    )
    confidence: float = Field(
        default=1.0,
        description="Confidence in the label (0-1)",
        ge=0,
        le=1,
    )
    notes: str | None = Field(
        default=None,
        description="Additional notes about the tree",
    )


class ClassifySpeciesRequest(BaseModel):
    """Request model for species classification."""

    tree_features: list[TreeFeatures] = Field(
        ...,
        description="List of tree features to classify",
        min_length=1,
    )
    region: str = Field(
        default="pnw",
        description="Geographic region for species lookup",
    )
    use_heuristics: bool = Field(
        default=True,
        description="Use domain heuristics to improve low-confidence predictions",
    )


class ClassifySpeciesResponse(BaseModel):
    """Response model for species classification."""

    predictions: list[SpeciesPrediction] = Field(
        ...,
        description="Species predictions for each tree",
    )
    processing_time_ms: float = Field(
        ...,
        description="Processing time in milliseconds",
    )
    region: str = Field(
        ...,
        description="Region used for classification",
    )
    model_version: str = Field(
        default="1.0.0",
        description="Model version used",
    )


class TrainClassifierRequest(BaseModel):
    """Request model for training a new classifier."""

    training_data: list[LabeledTree] = Field(
        ...,
        description="Labeled training data",
        min_length=10,
    )
    region: str = Field(
        default="pnw",
        description="Geographic region for the model",
    )
    test_size: float = Field(
        default=0.2,
        description="Fraction of data for testing",
        gt=0,
        lt=1,
    )
    n_estimators: int = Field(
        default=100,
        description="Number of trees in the random forest",
        ge=10,
        le=500,
    )
    max_depth: int | None = Field(
        default=15,
        description="Maximum tree depth (None for unlimited)",
    )
    save_model: bool = Field(
        default=True,
        description="Whether to save the trained model",
    )


class TrainClassifierResponse(BaseModel):
    """Response model for classifier training."""

    success: bool = Field(..., description="Whether training succeeded")
    metrics: ClassificationMetrics | None = Field(
        default=None,
        description="Evaluation metrics on test set",
    )
    cross_validation_accuracy: float | None = Field(
        default=None,
        description="Mean cross-validation accuracy",
    )
    model_path: str | None = Field(
        default=None,
        description="Path where model was saved",
    )
    training_time_ms: float = Field(
        ...,
        description="Total training time in milliseconds",
    )
    n_training_samples: int = Field(
        ...,
        description="Number of training samples used",
    )
    n_classes: int = Field(
        ...,
        description="Number of species classes",
    )


class RegionInfo(BaseModel):
    """Information about a supported geographic region."""

    code: str = Field(..., description="Region code (e.g., 'pnw')")
    name: str = Field(..., description="Full region name")
    states: list[str] = Field(..., description="States/areas covered")
    description: str = Field(..., description="Region description")
    species_count: int = Field(..., description="Number of species in region")
    dominant_species: list[str] = Field(
        default_factory=list,
        description="Dominant species codes",
    )


class SpeciesInfo(BaseModel):
    """Information about a tree species."""

    code: str = Field(..., description="Species code (e.g., 'PSME')")
    name: str = Field(..., description="Common name")
    scientific_name: str = Field(..., description="Scientific name")
    category: str = Field(..., description="Category: conifer or deciduous")
