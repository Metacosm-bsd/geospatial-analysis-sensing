"""
LiDAR Processing Services.

This module exposes the core services for LiDAR file processing.
"""

from lidar_processing.services.lidar_validator import LidarValidator
from lidar_processing.services.metadata_extractor import MetadataExtractor
from lidar_processing.services.ground_classifier import GroundClassifier
from lidar_processing.services.height_normalizer import HeightNormalizer
from lidar_processing.services.tree_detector import TreeDetector
from lidar_processing.services.tree_metrics import TreeMetricsExtractor, SpeciesGroup
from lidar_processing.services.point_extractor import PointExtractor

# Report Generation Services (Sprint 11-12)
from lidar_processing.services.chart_generator import ChartGenerator
from lidar_processing.services.stand_analyzer import StandAnalyzer
from lidar_processing.services.pdf_generator import PDFGenerator
from lidar_processing.services.excel_generator import ExcelGenerator
from lidar_processing.services.report_generator import ReportGenerator, generate_report

# Species Classification Services (Sprint 13-14)
from lidar_processing.services.species_classifier import SpeciesClassifier
from lidar_processing.services.feature_extractor import TreeFeatureExtractor
from lidar_processing.services.training_pipeline import TrainingPipeline, create_synthetic_training_data
from lidar_processing.services.species_config import (
    SPECIES_BY_REGION,
    REGION_METADATA,
    SpeciesInfo,
    get_species_for_region,
    get_species_info,
    get_region_metadata,
    get_all_regions,
    get_species_codes_for_region,
)

# ML Validation, Calibration, and Feedback Services (Sprint 15-16)
from lidar_processing.services.model_validator import ModelValidator
from lidar_processing.services.confidence_calibrator import ConfidenceCalibrator, CalibratedModel
from lidar_processing.services.feedback_collector import FeedbackCollector
from lidar_processing.services.batch_classifier import BatchClassifier, BatchStatus, BatchJob

# DBH & Volume Estimation Services (Sprint 17-18)
from lidar_processing.services.allometric_equations import (
    AllometricEquations,
    SpeciesAllometry,
    SPECIES_ALLOMETRY,
    VolumeResult,
    BiomassResult,
    TreeEstimates,
    WoodType,
    RegionCode,
)

__all__ = [
    # Core Processing Services
    "LidarValidator",
    "MetadataExtractor",
    "GroundClassifier",
    "HeightNormalizer",
    "TreeDetector",
    "TreeMetricsExtractor",
    "SpeciesGroup",
    "PointExtractor",
    # Report Generation Services
    "ChartGenerator",
    "StandAnalyzer",
    "PDFGenerator",
    "ExcelGenerator",
    "ReportGenerator",
    "generate_report",
    # Species Classification Services
    "SpeciesClassifier",
    "TreeFeatureExtractor",
    "TrainingPipeline",
    "create_synthetic_training_data",
    "SPECIES_BY_REGION",
    "REGION_METADATA",
    "SpeciesInfo",
    "get_species_for_region",
    "get_species_info",
    "get_region_metadata",
    "get_all_regions",
    "get_species_codes_for_region",
    # ML Validation, Calibration, and Feedback Services
    "ModelValidator",
    "ConfidenceCalibrator",
    "CalibratedModel",
    "FeedbackCollector",
    "BatchClassifier",
    "BatchStatus",
    "BatchJob",
    # DBH & Volume Estimation Services
    "AllometricEquations",
    "SpeciesAllometry",
    "SPECIES_ALLOMETRY",
    "VolumeResult",
    "BiomassResult",
    "TreeEstimates",
    "WoodType",
    "RegionCode",
]
