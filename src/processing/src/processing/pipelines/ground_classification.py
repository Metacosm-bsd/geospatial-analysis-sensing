"""
Ground classification pipeline for LiDAR point cloud data.

This module provides functionality for classifying ground points in
LiDAR point cloud data using progressive morphological filtering and
other ground classification algorithms.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from processing.utils.las_reader import read_las_file, write_las_file, LasData

logger = logging.getLogger(__name__)


@dataclass
class ClassificationStats:
    """Statistics from ground classification."""

    total_points: int
    ground_points: int
    non_ground_points: int
    processing_time_seconds: float


def classify_ground(
    input_path: str | Path,
    output_path: str | Path,
    *,
    cell_size: float = 1.0,
    max_window_size: float = 33.0,
    slope_threshold: float = 0.15,
    elevation_threshold: float = 0.5,
    algorithm: str = "pmf",
) -> dict[str, Any]:
    """
    Classify ground points in a LiDAR point cloud.

    Uses Progressive Morphological Filtering (PMF) or other algorithms
    to separate ground points from non-ground points (vegetation, buildings, etc.).

    Args:
        input_path: Path to input LAS/LAZ file.
        output_path: Path for output classified LAS/LAZ file.
        cell_size: Cell size for ground classification in meters.
        max_window_size: Maximum window size for morphological operations.
        slope_threshold: Slope threshold for ground classification.
        elevation_threshold: Elevation threshold in meters.
        algorithm: Classification algorithm ('pmf', 'csf', 'smrf').

    Returns:
        Dictionary containing classification statistics and metadata.

    Raises:
        FileNotFoundError: If input file does not exist.
        ValueError: If algorithm is not supported.

    Example:
        >>> stats = classify_ground(
        ...     "input.las",
        ...     "classified.las",
        ...     algorithm="pmf",
        ... )
        >>> print(f"Ground points: {stats['ground_points']}")
    """
    input_path = Path(input_path)
    output_path = Path(output_path)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    logger.info("Starting ground classification on %s", input_path)

    # Read input file
    las_data = read_las_file(input_path)

    # Run classification
    if algorithm == "pmf":
        classification = _classify_pmf(
            las_data,
            cell_size=cell_size,
            max_window_size=max_window_size,
            slope_threshold=slope_threshold,
            elevation_threshold=elevation_threshold,
        )
    elif algorithm == "csf":
        classification = _classify_csf(las_data)
    elif algorithm == "smrf":
        classification = _classify_smrf(
            las_data,
            cell_size=cell_size,
            slope_threshold=slope_threshold,
        )
    else:
        raise ValueError(f"Unsupported algorithm: {algorithm}")

    # Apply classification to LAS data
    las_data = _apply_classification(las_data, classification)

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_las_file(las_data, output_path)

    # Compute statistics
    ground_count = int(np.sum(classification == 2))  # Class 2 = Ground
    total_count = len(classification)

    stats = {
        "total_points": total_count,
        "ground_points": ground_count,
        "non_ground_points": total_count - ground_count,
        "ground_percentage": (ground_count / total_count * 100) if total_count else 0,
        "algorithm": algorithm,
    }

    logger.info(
        "Classification complete: %d ground points (%.1f%%)",
        ground_count,
        stats["ground_percentage"],
    )

    return stats


def _classify_pmf(
    las_data: LasData,
    *,
    cell_size: float,
    max_window_size: float,
    slope_threshold: float,
    elevation_threshold: float,
) -> NDArray[np.uint8]:
    """
    Classify ground using Progressive Morphological Filtering.

    Args:
        las_data: Input LAS data.
        cell_size: Cell size for the filtering.
        max_window_size: Maximum window size.
        slope_threshold: Slope threshold.
        elevation_threshold: Elevation threshold.

    Returns:
        Array of classification values (2=ground, 1=unclassified).
    """
    # TODO: Implement PMF algorithm
    logger.debug(
        "PMF classification: cell_size=%f, max_window=%f",
        cell_size,
        max_window_size,
    )

    # Placeholder: return all points as unclassified
    num_points = len(las_data.x) if las_data.x is not None else 0
    return np.ones(num_points, dtype=np.uint8)


def _classify_csf(las_data: LasData) -> NDArray[np.uint8]:
    """
    Classify ground using Cloth Simulation Filtering.

    Args:
        las_data: Input LAS data.

    Returns:
        Array of classification values.
    """
    # TODO: Implement CSF algorithm
    logger.debug("CSF classification")

    num_points = len(las_data.x) if las_data.x is not None else 0
    return np.ones(num_points, dtype=np.uint8)


def _classify_smrf(
    las_data: LasData,
    *,
    cell_size: float,
    slope_threshold: float,
) -> NDArray[np.uint8]:
    """
    Classify ground using Simple Morphological Filtering.

    Args:
        las_data: Input LAS data.
        cell_size: Cell size for filtering.
        slope_threshold: Slope threshold.

    Returns:
        Array of classification values.
    """
    # TODO: Implement SMRF algorithm
    logger.debug("SMRF classification: cell_size=%f", cell_size)

    num_points = len(las_data.x) if las_data.x is not None else 0
    return np.ones(num_points, dtype=np.uint8)


def _apply_classification(
    las_data: LasData,
    classification: NDArray[np.uint8],
) -> LasData:
    """
    Apply classification values to LAS data.

    Args:
        las_data: Input LAS data.
        classification: Classification array.

    Returns:
        Updated LAS data with classification values.
    """
    # TODO: Update las_data with classification
    las_data.classification = classification
    return las_data
