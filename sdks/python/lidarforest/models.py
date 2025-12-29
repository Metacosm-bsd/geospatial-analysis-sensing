"""
LiDAR Forest SDK Models
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================


class AnalysisType(str, Enum):
    """Analysis types available."""

    TREE_DETECTION = "TREE_DETECTION"
    SPECIES_CLASSIFICATION = "SPECIES_CLASSIFICATION"
    CARBON_ESTIMATE = "CARBON_ESTIMATE"
    FULL_INVENTORY = "FULL_INVENTORY"


class AnalysisStatus(str, Enum):
    """Analysis status values."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class FileStatus(str, Enum):
    """File status values."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    DELETED = "DELETED"


class ReportType(str, Enum):
    """Report types available."""

    INVENTORY = "INVENTORY"
    CARBON = "CARBON"
    TIMBER_VALUE = "TIMBER_VALUE"
    GROWTH_PROJECTION = "GROWTH_PROJECTION"
    FULL = "FULL"


class ReportFormat(str, Enum):
    """Report output formats."""

    PDF = "PDF"
    EXCEL = "EXCEL"
    CSV = "CSV"
    JSON = "JSON"


class ReportStatus(str, Enum):
    """Report status values."""

    GENERATING = "GENERATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class WebhookEvent(str, Enum):
    """Available webhook events."""

    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    PROJECT_DELETED = "project.deleted"
    FILE_UPLOADED = "file.uploaded"
    FILE_PROCESSED = "file.processed"
    FILE_DELETED = "file.deleted"
    ANALYSIS_STARTED = "analysis.started"
    ANALYSIS_COMPLETED = "analysis.completed"
    ANALYSIS_FAILED = "analysis.failed"
    REPORT_GENERATED = "report.generated"
    REPORT_DOWNLOADED = "report.downloaded"
    MEMBER_INVITED = "member.invited"
    MEMBER_JOINED = "member.joined"
    MEMBER_REMOVED = "member.removed"


# ============================================================================
# Models
# ============================================================================


class Pagination(BaseModel):
    """Pagination information."""

    total: int
    limit: int
    offset: int
    has_more: bool = Field(alias="hasMore")


class Project(BaseModel):
    """Project model."""

    id: str
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    status: str
    metadata: Optional[Dict[str, Any]] = None
    file_count: Optional[int] = Field(None, alias="fileCount")
    analysis_count: Optional[int] = Field(None, alias="analysisCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class File(BaseModel):
    """File model."""

    id: str
    project_id: str = Field(alias="projectId")
    filename: str
    original_filename: Optional[str] = Field(None, alias="originalFilename")
    file_size: Optional[int] = Field(None, alias="fileSize")
    mime_type: Optional[str] = Field(None, alias="mimeType")
    status: FileStatus
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class Analysis(BaseModel):
    """Analysis model."""

    id: str
    project_id: str = Field(alias="projectId")
    name: str
    type: AnalysisType
    status: AnalysisStatus
    progress: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = Field(None, alias="errorMessage")
    created_at: datetime = Field(alias="createdAt")
    started_at: Optional[datetime] = Field(None, alias="startedAt")
    completed_at: Optional[datetime] = Field(None, alias="completedAt")

    class Config:
        populate_by_name = True


class Report(BaseModel):
    """Report model."""

    id: str
    analysis_id: str = Field(alias="analysisId")
    name: str
    type: ReportType
    format: ReportFormat
    status: ReportStatus
    file_size: Optional[int] = Field(None, alias="fileSize")
    options: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(alias="createdAt")
    generated_at: Optional[datetime] = Field(None, alias="generatedAt")
    expires_at: datetime = Field(alias="expiresAt")

    class Config:
        populate_by_name = True


class Tree(BaseModel):
    """Tree model."""

    id: str
    species: Optional[str] = None
    dbh: Optional[float] = None
    height: Optional[float] = None
    crown_diameter: Optional[float] = Field(None, alias="crownDiameter")
    latitude: float
    longitude: float
    confidence: Optional[float] = None
    carbon_stock: Optional[float] = Field(None, alias="carbonStock")

    class Config:
        populate_by_name = True


class Stand(BaseModel):
    """Stand model."""

    id: str
    name: Optional[str] = None
    area_hectares: float = Field(alias="areaHectares")
    tree_count: int = Field(alias="treeCount")
    basal_area: Optional[float] = Field(None, alias="basalArea")
    volume_per_hectare: Optional[float] = Field(None, alias="volumePerHectare")
    dominant_species: Optional[str] = Field(None, alias="dominantSpecies")
    mean_dbh: Optional[float] = Field(None, alias="meanDbh")
    mean_height: Optional[float] = Field(None, alias="meanHeight")
    carbon_stock_per_hectare: Optional[float] = Field(None, alias="carbonStockPerHectare")

    class Config:
        populate_by_name = True


class Webhook(BaseModel):
    """Webhook model."""

    id: str
    url: str
    events: List[str]
    description: Optional[str] = None
    secret: Optional[str] = None
    is_active: bool = Field(alias="isActive")
    last_triggered_at: Optional[datetime] = Field(None, alias="lastTriggeredAt")
    created_at: datetime = Field(alias="createdAt")

    class Config:
        populate_by_name = True


class WebhookDelivery(BaseModel):
    """Webhook delivery model."""

    id: str
    event: str
    status: str
    status_code: Optional[int] = Field(None, alias="statusCode")
    attempts: int
    created_at: datetime = Field(alias="createdAt")
    delivered_at: Optional[datetime] = Field(None, alias="deliveredAt")

    class Config:
        populate_by_name = True


# ============================================================================
# Input Models
# ============================================================================


class CreateProjectInput(BaseModel):
    """Input for creating a project."""

    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class UpdateProjectInput(BaseModel):
    """Input for updating a project."""

    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class UploadUrlInput(BaseModel):
    """Input for getting upload URL."""

    project_id: str = Field(alias="projectId")
    filename: str
    file_size: int = Field(alias="fileSize")
    mime_type: Optional[str] = Field(None, alias="mimeType")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class CreateAnalysisInput(BaseModel):
    """Input for creating an analysis."""

    project_id: str = Field(alias="projectId")
    name: str
    type: AnalysisType
    file_ids: List[str] = Field(alias="fileIds")
    parameters: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class ReportOptions(BaseModel):
    """Options for report generation."""

    include_charts: bool = Field(True, alias="includeCharts")
    include_maps: bool = Field(True, alias="includeMaps")
    include_appendix: bool = Field(False, alias="includeAppendix")
    language: str = "en"
    units: str = "metric"

    class Config:
        populate_by_name = True


class CreateReportInput(BaseModel):
    """Input for creating a report."""

    analysis_id: str = Field(alias="analysisId")
    name: str
    type: ReportType
    format: ReportFormat = ReportFormat.PDF
    options: Optional[ReportOptions] = None

    class Config:
        populate_by_name = True


class CreateWebhookInput(BaseModel):
    """Input for creating a webhook."""

    url: str
    events: List[str]
    description: Optional[str] = None
    headers: Optional[Dict[str, str]] = None


class UpdateWebhookInput(BaseModel):
    """Input for updating a webhook."""

    url: Optional[str] = None
    events: Optional[List[str]] = None
    description: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    is_active: Optional[bool] = Field(None, alias="isActive")

    class Config:
        populate_by_name = True
