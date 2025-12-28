"""
Canopy Height Model (CHM) generation pipeline.

This module provides functionality for generating Canopy Height Models
from LiDAR point cloud data by subtracting ground elevation from
surface elevation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from processing.utils.las_reader import read_las_file, LasData

logger = logging.getLogger(__name__)


@dataclass
class ChmMetadata:
    """Metadata for generated CHM."""

    width: int
    height: int
    resolution: float
    min_height: float
    max_height: float
    mean_height: float
    crs: str | None
    bounds: tuple[float, float, float, float]


def generate_chm(
    input_path: str | Path,
    output_path: str | Path,
    *,
    resolution: float = 1.0,
    interpolation: str = "idw",
    smoothing: float = 0.0,
    pit_fill: bool = True,
) -> dict[str, Any]:
    """
    Generate a Canopy Height Model from LiDAR point cloud.

    Creates a raster representing vegetation height above ground by
    subtracting a digital terrain model (DTM) from a digital surface
    model (DSM).

    Args:
        input_path: Path to input LAS/LAZ file (should be ground-classified).
        output_path: Path for output CHM raster (GeoTIFF).
        resolution: Output raster resolution in meters.
        interpolation: Interpolation method ('idw', 'tin', 'kriging').
        smoothing: Smoothing kernel size (0 for no smoothing).
        pit_fill: Whether to fill pits in the resulting CHM.

    Returns:
        Dictionary containing CHM metadata and statistics.

    Raises:
        FileNotFoundError: If input file does not exist.
        ValueError: If interpolation method is not supported.

    Example:
        >>> metadata = generate_chm(
        ...     "classified.las",
        ...     "chm.tif",
        ...     resolution=0.5,
        ... )
        >>> print(f"CHM range: {metadata['min_height']:.1f} - {metadata['max_height']:.1f} m")
    """
    input_path = Path(input_path)
    output_path = Path(output_path)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    if interpolation not in ("idw", "tin", "kriging"):
        raise ValueError(f"Unsupported interpolation method: {interpolation}")

    logger.info("Starting CHM generation from %s", input_path)

    # Read LAS file
    las_data = read_las_file(input_path)

    # Generate DTM from ground points
    dtm, bounds = _generate_dtm(
        las_data,
        resolution=resolution,
        interpolation=interpolation,
    )

    # Generate DSM from all first returns
    dsm = _generate_dsm(
        las_data,
        resolution=resolution,
        interpolation=interpolation,
        bounds=bounds,
    )

    # Calculate CHM
    chm = dsm - dtm

    # Post-processing
    if pit_fill:
        chm = _fill_pits(chm)

    if smoothing > 0:
        chm = _smooth_chm(chm, kernel_size=smoothing)

    # Clip negative values
    chm = np.maximum(chm, 0)

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    crs = _get_crs_from_las(las_data)
    _write_raster(chm, output_path, resolution, bounds, crs)

    # Compute metadata
    valid_mask = chm > 0
    metadata = {
        "width": chm.shape[1],
        "height": chm.shape[0],
        "resolution": resolution,
        "min_height": float(np.min(chm[valid_mask])) if valid_mask.any() else 0.0,
        "max_height": float(np.max(chm)),
        "mean_height": float(np.mean(chm[valid_mask])) if valid_mask.any() else 0.0,
        "bounds": bounds,
        "crs": crs,
        "interpolation": interpolation,
        "pit_filled": pit_fill,
        "smoothing": smoothing,
    }

    logger.info(
        "CHM generated: %dx%d, height range %.1f-%.1f m",
        metadata["width"],
        metadata["height"],
        metadata["min_height"],
        metadata["max_height"],
    )

    return metadata


def _generate_dtm(
    las_data: LasData,
    *,
    resolution: float,
    interpolation: str,
) -> tuple[NDArray[np.float32], tuple[float, float, float, float]]:
    """
    Generate Digital Terrain Model from ground points.

    Args:
        las_data: Input LAS data with ground classification.
        resolution: Output resolution in meters.
        interpolation: Interpolation method.

    Returns:
        Tuple of (DTM array, bounds as (minx, miny, maxx, maxy)).
    """
    # TODO: Implement DTM generation
    logger.debug("Generating DTM at %f m resolution", resolution)

    # Placeholder
    bounds = (0.0, 0.0, 100.0, 100.0)
    width = int((bounds[2] - bounds[0]) / resolution)
    height = int((bounds[3] - bounds[1]) / resolution)
    dtm = np.zeros((height, width), dtype=np.float32)

    return dtm, bounds


def _generate_dsm(
    las_data: LasData,
    *,
    resolution: float,
    interpolation: str,
    bounds: tuple[float, float, float, float],
) -> NDArray[np.float32]:
    """
    Generate Digital Surface Model from first returns.

    Args:
        las_data: Input LAS data.
        resolution: Output resolution in meters.
        interpolation: Interpolation method.
        bounds: Spatial bounds to match DTM.

    Returns:
        DSM array.
    """
    # TODO: Implement DSM generation
    logger.debug("Generating DSM at %f m resolution", resolution)

    width = int((bounds[2] - bounds[0]) / resolution)
    height = int((bounds[3] - bounds[1]) / resolution)
    dsm = np.zeros((height, width), dtype=np.float32)

    return dsm


def _fill_pits(chm: NDArray[np.float32]) -> NDArray[np.float32]:
    """
    Fill pits (local minima) in the CHM.

    Args:
        chm: Input CHM array.

    Returns:
        CHM with pits filled.
    """
    # TODO: Implement pit filling
    logger.debug("Filling pits in CHM")
    return chm


def _smooth_chm(
    chm: NDArray[np.float32],
    *,
    kernel_size: float,
) -> NDArray[np.float32]:
    """
    Apply Gaussian smoothing to CHM.

    Args:
        chm: Input CHM array.
        kernel_size: Size of smoothing kernel.

    Returns:
        Smoothed CHM.
    """
    # TODO: Implement smoothing
    logger.debug("Smoothing CHM with kernel size %f", kernel_size)
    return chm


def _get_crs_from_las(las_data: LasData) -> str | None:
    """
    Extract CRS from LAS data.

    Args:
        las_data: Input LAS data.

    Returns:
        CRS string (WKT or EPSG code) or None if not available.
    """
    # TODO: Extract CRS from LAS header
    return las_data.crs


def _write_raster(
    data: NDArray[np.float32],
    output_path: Path,
    resolution: float,
    bounds: tuple[float, float, float, float],
    crs: str | None,
) -> None:
    """
    Write raster data to GeoTIFF.

    Args:
        data: Raster data array.
        output_path: Output file path.
        resolution: Pixel resolution.
        bounds: Spatial bounds.
        crs: Coordinate reference system.
    """
    # TODO: Implement GeoTIFF writing with rasterio
    logger.debug("Writing raster to %s", output_path)

    # Placeholder: just write dimensions to file
    output_path.write_text(
        f"CHM: {data.shape[1]}x{data.shape[0]} @ {resolution}m\n"
        f"Bounds: {bounds}\n"
        f"CRS: {crs}\n"
    )
