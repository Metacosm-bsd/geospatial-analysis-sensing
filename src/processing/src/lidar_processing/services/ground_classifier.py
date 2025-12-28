"""
Ground Point Classification Service.

This module implements the Progressive Morphological Filter (PMF) algorithm
for classifying ground and non-ground points in LiDAR point clouds.
The algorithm is based on Zhang et al. (2003) with optimizations for efficiency.

Reference:
    Zhang, K., Chen, S., Whitman, D., Shyu, M., Yan, J., Zhang, C. (2003).
    A progressive morphological filter for removing nonground measurements
    from airborne LIDAR data. IEEE Transactions on Geoscience and Remote Sensing.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

import laspy
import numpy as np
from scipy import ndimage

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    GroundClassificationParams,
    GroundClassificationResult,
)

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# ASPRS Classification code for ground
GROUND_CLASS = 2
# ASPRS Classification code for unclassified
UNCLASSIFIED_CLASS = 1


class GroundClassifier:
    """
    Ground point classifier using Progressive Morphological Filter (PMF).

    This classifier identifies ground points in LiDAR data by applying
    a series of morphological opening operations with progressively
    increasing window sizes. Points that remain close to the resulting
    surface are classified as ground.

    Attributes:
        settings: Application settings.
        params: Ground classification parameters.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        params: GroundClassificationParams | None = None,
    ) -> None:
        """
        Initialize the ground classifier.

        Args:
            settings: Optional settings instance.
            params: Optional classification parameters.
        """
        self.settings = settings or get_settings()
        self.params = params or GroundClassificationParams()

    def classify(
        self,
        file_path: str | Path,
        output_path: str | Path | None = None,
        params: GroundClassificationParams | None = None,
    ) -> GroundClassificationResult:
        """
        Classify ground and non-ground points in a LAS file.

        Args:
            file_path: Path to the input LAS/LAZ file.
            output_path: Optional path to save classified LAS file.
            params: Optional parameters to override defaults.

        Returns:
            GroundClassificationResult with classification statistics.

        Raises:
            FileNotFoundError: If input file does not exist.
            ValueError: If file cannot be processed.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"LAS file not found: {file_path}")

        params = params or self.params
        start_time = time.perf_counter()

        logger.info("Starting ground classification for: %s", file_path)

        # Read the LAS file
        las = laspy.read(str(file_path))
        points_x = np.array(las.x)
        points_y = np.array(las.y)
        points_z = np.array(las.z)

        total_points = len(points_x)
        logger.info("Loaded %d points", total_points)

        # Perform PMF classification
        ground_mask = self._pmf_classify(
            points_x, points_y, points_z, params
        )

        ground_count = int(np.sum(ground_mask))
        non_ground_count = total_points - ground_count

        logger.info(
            "Classification complete: %d ground, %d non-ground",
            ground_count,
            non_ground_count,
        )

        # Update classification in LAS file
        classification = np.array(las.classification)
        classification[ground_mask] = GROUND_CLASS
        classification[~ground_mask] = UNCLASSIFIED_CLASS
        las.classification = classification

        # Save if output path is specified
        output_path_str = None
        if output_path:
            output_path = Path(output_path)
            las.write(str(output_path))
            output_path_str = str(output_path)
            logger.info("Saved classified file to: %s", output_path)

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        return GroundClassificationResult(
            file_path=str(file_path),
            output_path=output_path_str,
            total_points=total_points,
            ground_points=ground_count,
            non_ground_points=non_ground_count,
            ground_percentage=round(100.0 * ground_count / total_points, 2),
            processing_time_ms=processing_time_ms,
            params=params,
        )

    def classify_points(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        params: GroundClassificationParams | None = None,
    ) -> NDArray[np.bool_]:
        """
        Classify ground points from point arrays.

        This method can be used for in-memory processing without file I/O.

        Args:
            x: X coordinates array.
            y: Y coordinates array.
            z: Z coordinates array (elevations).
            params: Optional classification parameters.

        Returns:
            Boolean mask where True indicates ground points.
        """
        params = params or self.params
        return self._pmf_classify(x, y, z, params)

    def _pmf_classify(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        params: GroundClassificationParams,
    ) -> NDArray[np.bool_]:
        """
        Apply Progressive Morphological Filter for ground classification.

        The algorithm works by:
        1. Creating a minimum surface grid from the point cloud
        2. Applying morphological opening with increasing window sizes
        3. Points close to the smoothed surface are classified as ground

        Args:
            x: X coordinates array.
            y: Y coordinates array.
            z: Z coordinates array.
            params: Classification parameters.

        Returns:
            Boolean mask where True indicates ground points.
        """
        cell_size = params.cell_size
        slope = params.slope
        max_window_size = params.max_window_size
        initial_distance = params.initial_distance
        max_distance = params.max_distance

        # Calculate grid dimensions
        x_min, x_max = float(np.min(x)), float(np.max(x))
        y_min, y_max = float(np.min(y)), float(np.max(y))

        cols = int(np.ceil((x_max - x_min) / cell_size)) + 1
        rows = int(np.ceil((y_max - y_min) / cell_size)) + 1

        logger.debug("Grid size: %d x %d cells", cols, rows)

        # Create initial minimum surface
        min_surface = self._create_min_surface(
            x, y, z, x_min, y_min, cell_size, rows, cols
        )

        # Calculate point grid indices
        col_idx = np.floor((x - x_min) / cell_size).astype(np.int32)
        row_idx = np.floor((y - y_min) / cell_size).astype(np.int32)

        # Clip to valid range
        col_idx = np.clip(col_idx, 0, cols - 1)
        row_idx = np.clip(row_idx, 0, rows - 1)

        # Progressive morphological filtering
        window_sizes = self._calculate_window_sizes(cell_size, max_window_size)

        # Start with all points as potential ground
        ground_mask = np.ones(len(x), dtype=bool)

        for i, window_size in enumerate(window_sizes):
            # Calculate height threshold for this iteration
            if i == 0:
                height_threshold = initial_distance
            else:
                # Increase threshold based on window size and slope
                height_threshold = min(
                    initial_distance + slope * window_size * cell_size,
                    max_distance,
                )

            # Apply morphological opening to the surface
            kernel_size = int(window_size)
            if kernel_size % 2 == 0:
                kernel_size += 1  # Ensure odd size

            opened_surface = ndimage.grey_opening(
                min_surface,
                size=(kernel_size, kernel_size),
            )

            # Get surface elevations at point locations
            surface_z = opened_surface[row_idx, col_idx]

            # Points above threshold are non-ground
            height_diff = z - surface_z
            non_ground = height_diff > height_threshold
            ground_mask &= ~non_ground

            logger.debug(
                "Window %d (size=%d): removed %d points",
                i + 1,
                window_size,
                int(np.sum(non_ground)),
            )

            # Update minimum surface with only ground points
            min_surface = self._create_min_surface(
                x[ground_mask],
                y[ground_mask],
                z[ground_mask],
                x_min,
                y_min,
                cell_size,
                rows,
                cols,
            )

        return ground_mask

    def _create_min_surface(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        x_min: float,
        y_min: float,
        cell_size: float,
        rows: int,
        cols: int,
    ) -> NDArray[np.float64]:
        """
        Create a minimum elevation surface grid from point cloud.

        Args:
            x: X coordinates.
            y: Y coordinates.
            z: Z coordinates (elevations).
            x_min: Minimum X extent.
            y_min: Minimum Y extent.
            cell_size: Grid cell size.
            rows: Number of grid rows.
            cols: Number of grid columns.

        Returns:
            2D array with minimum elevations per cell.
        """
        # Initialize with a large value
        surface = np.full((rows, cols), np.inf)

        if len(x) == 0:
            return surface

        # Calculate grid indices
        col_idx = np.floor((x - x_min) / cell_size).astype(np.int32)
        row_idx = np.floor((y - y_min) / cell_size).astype(np.int32)

        # Clip to valid range
        col_idx = np.clip(col_idx, 0, cols - 1)
        row_idx = np.clip(row_idx, 0, rows - 1)

        # Find minimum Z for each cell
        # Using a loop for correctness with multiple points per cell
        for i in range(len(x)):
            r, c = row_idx[i], col_idx[i]
            if z[i] < surface[r, c]:
                surface[r, c] = z[i]

        # Fill empty cells with interpolated values
        surface = self._fill_empty_cells(surface)

        return surface

    def _fill_empty_cells(
        self,
        surface: NDArray[np.float64],
    ) -> NDArray[np.float64]:
        """
        Fill empty cells in the surface using nearest neighbor interpolation.

        Args:
            surface: Surface with inf values for empty cells.

        Returns:
            Surface with empty cells filled.
        """
        empty_mask = np.isinf(surface)

        if not np.any(empty_mask):
            return surface

        # Use distance transform to find nearest filled cell
        from scipy.ndimage import distance_transform_edt

        filled = surface.copy()
        filled[empty_mask] = 0

        # Get indices of nearest valid cell
        _, indices = distance_transform_edt(
            empty_mask, return_distances=True, return_indices=True
        )

        # Fill empty cells with nearest neighbor values
        surface[empty_mask] = surface[indices[0][empty_mask], indices[1][empty_mask]]

        # Handle case where all cells were empty
        if np.any(np.isinf(surface)):
            surface[np.isinf(surface)] = np.nanmin(surface[~np.isinf(surface)])

        return surface

    def _calculate_window_sizes(
        self,
        cell_size: float,
        max_window_size: float,
    ) -> list[int]:
        """
        Calculate progressive window sizes for morphological filtering.

        Window sizes increase exponentially to efficiently process
        features at different scales.

        Args:
            cell_size: Grid cell size.
            max_window_size: Maximum window size in meters.

        Returns:
            List of window sizes in cells.
        """
        max_window_cells = int(np.ceil(max_window_size / cell_size))

        # Generate exponentially increasing window sizes
        window_sizes = []
        size = 3  # Start with 3x3 window

        while size <= max_window_cells:
            window_sizes.append(size)
            size = int(size * 2) + 1  # Exponential growth, keep odd

        # Ensure max window is included
        if not window_sizes or window_sizes[-1] < max_window_cells:
            window_sizes.append(max_window_cells)

        return window_sizes

    def get_ground_points(
        self,
        las: laspy.LasData,
    ) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
        """
        Extract ground points from an already classified LAS file.

        Args:
            las: LAS data object with classification.

        Returns:
            Tuple of (x, y, z) arrays for ground points only.
        """
        ground_mask = np.array(las.classification) == GROUND_CLASS

        return (
            np.array(las.x)[ground_mask],
            np.array(las.y)[ground_mask],
            np.array(las.z)[ground_mask],
        )
