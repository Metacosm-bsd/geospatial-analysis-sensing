"""
Individual Tree Detection Service.

This module implements tree detection from Canopy Height Models (CHM)
using local maximum detection for tree tops and watershed segmentation
for crown delineation.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

import laspy
import numpy as np
from scipy import ndimage
from scipy.ndimage import label, maximum_filter

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    TreeDetectionParams,
    TreeDetectionResult,
    TreeMetrics,
)
from lidar_processing.services.ground_classifier import GroundClassifier, GROUND_CLASS
from lidar_processing.services.height_normalizer import HeightNormalizer

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class TreeDetector:
    """
    Individual tree detector using watershed segmentation.

    This detector identifies individual trees from a Canopy Height Model
    by finding local maxima (tree tops) and using watershed segmentation
    to delineate crown boundaries.

    Attributes:
        settings: Application settings.
        params: Detection parameters.
        ground_classifier: Ground classification service.
        height_normalizer: Height normalization service.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        params: TreeDetectionParams | None = None,
    ) -> None:
        """
        Initialize the tree detector.

        Args:
            settings: Optional settings instance.
            params: Optional detection parameters.
        """
        self.settings = settings or get_settings()
        self.params = params or TreeDetectionParams()
        self.ground_classifier = GroundClassifier(settings)
        self.height_normalizer = HeightNormalizer(settings)

    def detect(
        self,
        file_path: str | Path,
        params: TreeDetectionParams | None = None,
        chm: NDArray[np.float64] | None = None,
        chm_metadata: tuple[float, float, float] | None = None,
    ) -> TreeDetectionResult:
        """
        Detect individual trees from a LAS file.

        Args:
            file_path: Path to the LAS/LAZ file (should be ground-classified).
            params: Optional parameters to override defaults.
            chm: Pre-computed CHM array (optional).
            chm_metadata: Tuple of (x_min, y_min, resolution) if CHM provided.

        Returns:
            TreeDetectionResult with detected trees.

        Raises:
            FileNotFoundError: If input file does not exist.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"LAS file not found: {file_path}")

        params = params or self.params
        start_time = time.perf_counter()

        logger.info("Starting tree detection for: %s", file_path)

        # Generate CHM if not provided
        if chm is None:
            logger.info("Generating CHM for tree detection")
            chm_result, chm, _ = self.height_normalizer.normalize(
                file_path,
                params=self.height_normalizer.params.__class__(
                    resolution=params.resolution
                ),
            )
            x_min = chm_result.bounds.min_x
            y_min = chm_result.bounds.min_y
            resolution = params.resolution
        else:
            if chm_metadata is None:
                raise ValueError("chm_metadata required when providing CHM")
            x_min, y_min, resolution = chm_metadata

        # Detect tree tops
        tree_tops = self._find_tree_tops(
            chm,
            min_height=params.min_height,
            min_distance=params.min_distance,
            smoothing_sigma=params.smoothing_sigma,
            resolution=resolution,
        )

        logger.info("Found %d potential tree tops", len(tree_tops))

        # Perform watershed segmentation
        segments = self._watershed_segment(chm, tree_tops, params.min_height)

        # Extract tree metrics
        trees = self._extract_tree_metrics(
            tree_tops, segments, chm, x_min, y_min, resolution
        )

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        logger.info(
            "Detected %d trees in %.1f ms",
            len(trees),
            processing_time_ms,
        )

        return TreeDetectionResult(
            file_path=str(file_path),
            trees_detected=len(trees),
            trees=trees,
            chm_resolution=resolution,
            params=params,
            processing_time_ms=processing_time_ms,
        )

    def detect_from_chm(
        self,
        chm: NDArray[np.float64],
        x_min: float,
        y_min: float,
        resolution: float,
        params: TreeDetectionParams | None = None,
    ) -> list[TreeMetrics]:
        """
        Detect trees directly from a CHM array.

        Args:
            chm: Canopy Height Model array.
            x_min: Minimum X coordinate of CHM.
            y_min: Minimum Y coordinate of CHM.
            resolution: CHM resolution in meters.
            params: Optional detection parameters.

        Returns:
            List of TreeMetrics for detected trees.
        """
        params = params or self.params

        # Detect tree tops
        tree_tops = self._find_tree_tops(
            chm,
            min_height=params.min_height,
            min_distance=params.min_distance,
            smoothing_sigma=params.smoothing_sigma,
            resolution=resolution,
        )

        # Perform watershed segmentation
        segments = self._watershed_segment(chm, tree_tops, params.min_height)

        # Extract tree metrics
        trees = self._extract_tree_metrics(
            tree_tops, segments, chm, x_min, y_min, resolution
        )

        return trees

    def _find_tree_tops(
        self,
        chm: NDArray[np.float64],
        min_height: float,
        min_distance: float,
        smoothing_sigma: float,
        resolution: float,
    ) -> list[tuple[int, int, float]]:
        """
        Find tree tops as local maxima in CHM.

        Args:
            chm: Canopy Height Model array.
            min_height: Minimum height threshold.
            min_distance: Minimum distance between tree tops.
            smoothing_sigma: Gaussian smoothing sigma.
            resolution: CHM resolution.

        Returns:
            List of (row, col, height) tuples for tree tops.
        """
        # Apply Gaussian smoothing to reduce noise
        if smoothing_sigma > 0:
            smoothed_chm = ndimage.gaussian_filter(chm, sigma=smoothing_sigma)
        else:
            smoothed_chm = chm.copy()

        # Calculate window size for local maximum filter
        window_size = max(3, int(np.ceil(min_distance / resolution)))
        if window_size % 2 == 0:
            window_size += 1  # Ensure odd size

        # Find local maxima
        local_max = maximum_filter(smoothed_chm, size=window_size)
        is_maximum = (smoothed_chm == local_max) & (chm >= min_height)

        # Get coordinates of maxima
        max_rows, max_cols = np.where(is_maximum)

        # Filter to ensure minimum distance
        tree_tops = []
        heights = chm[max_rows, max_cols]

        # Sort by height (tallest first) for priority
        sorted_indices = np.argsort(-heights)

        for idx in sorted_indices:
            row, col = max_rows[idx], max_cols[idx]
            height = heights[idx]

            # Check distance to existing tree tops
            too_close = False
            for existing_row, existing_col, _ in tree_tops:
                dist = np.sqrt(
                    ((row - existing_row) * resolution) ** 2 +
                    ((col - existing_col) * resolution) ** 2
                )
                if dist < min_distance:
                    too_close = True
                    break

            if not too_close:
                tree_tops.append((row, col, float(height)))

        logger.debug("Found %d tree tops after distance filtering", len(tree_tops))

        return tree_tops

    def _watershed_segment(
        self,
        chm: NDArray[np.float64],
        tree_tops: list[tuple[int, int, float]],
        min_height: float,
    ) -> NDArray[np.int32]:
        """
        Perform watershed segmentation to delineate tree crowns.

        Args:
            chm: Canopy Height Model array.
            tree_tops: List of tree top locations.
            min_height: Minimum height threshold.

        Returns:
            Labeled array where each tree has a unique ID.
        """
        if len(tree_tops) == 0:
            return np.zeros(chm.shape, dtype=np.int32)

        # Create marker array
        markers = np.zeros(chm.shape, dtype=np.int32)
        for i, (row, col, _) in enumerate(tree_tops, start=1):
            markers[row, col] = i

        # Create mask for vegetation (above minimum height)
        vegetation_mask = chm >= min_height

        # Invert CHM for watershed (we want to "fill" from peaks)
        inverted_chm = -chm

        # Apply watershed
        from scipy.ndimage import watershed_ift

        # Prepare for watershed
        # Convert to integer for watershed_ift
        scaled_chm = ((inverted_chm - inverted_chm.min()) * 1000).astype(np.int32)

        try:
            # Use watershed from scipy.ndimage
            segments = watershed_ift(scaled_chm, markers)
        except Exception as e:
            logger.warning("watershed_ift failed, using simple region growing: %s", e)
            segments = self._simple_region_grow(markers, chm, min_height)

        # Apply vegetation mask
        segments[~vegetation_mask] = 0

        return segments

    def _simple_region_grow(
        self,
        markers: NDArray[np.int32],
        chm: NDArray[np.float64],
        min_height: float,
    ) -> NDArray[np.int32]:
        """
        Simple region growing as fallback for watershed.

        Args:
            markers: Initial marker array.
            chm: Canopy Height Model.
            min_height: Minimum height threshold.

        Returns:
            Labeled segment array.
        """
        segments = markers.copy()
        rows, cols = chm.shape

        # Iteratively grow regions
        for _ in range(max(rows, cols)):
            new_segments = segments.copy()
            changed = False

            for r in range(1, rows - 1):
                for c in range(1, cols - 1):
                    if segments[r, c] == 0 and chm[r, c] >= min_height:
                        # Check neighbors
                        neighbors = [
                            segments[r - 1, c],
                            segments[r + 1, c],
                            segments[r, c - 1],
                            segments[r, c + 1],
                        ]
                        labeled_neighbors = [n for n in neighbors if n > 0]

                        if labeled_neighbors:
                            # Assign to most common neighbor
                            new_segments[r, c] = max(set(labeled_neighbors),
                                                      key=labeled_neighbors.count)
                            changed = True

            segments = new_segments
            if not changed:
                break

        return segments

    def _extract_tree_metrics(
        self,
        tree_tops: list[tuple[int, int, float]],
        segments: NDArray[np.int32],
        chm: NDArray[np.float64],
        x_min: float,
        y_min: float,
        resolution: float,
    ) -> list[TreeMetrics]:
        """
        Extract metrics for each detected tree.

        Args:
            tree_tops: List of tree top locations.
            segments: Labeled segment array.
            chm: Canopy Height Model.
            x_min: Minimum X coordinate.
            y_min: Minimum Y coordinate.
            resolution: CHM resolution.

        Returns:
            List of TreeMetrics for each tree.
        """
        trees = []

        for i, (row, col, height) in enumerate(tree_tops, start=1):
            # Calculate geographic coordinates
            x = x_min + col * resolution
            y = y_min + row * resolution

            # Get segment mask for this tree
            segment_mask = segments == i

            # Calculate crown metrics
            crown_pixels = np.sum(segment_mask)
            crown_area = crown_pixels * (resolution ** 2)

            # Estimate crown diameter (assuming circular crown)
            crown_diameter = 2 * np.sqrt(crown_area / np.pi) if crown_area > 0 else None

            # Get crown heights for crown base estimation
            crown_heights = chm[segment_mask]
            if len(crown_heights) > 0:
                # Crown base is approximately at lower percentile
                crown_base_height = float(np.percentile(crown_heights, 10))
            else:
                crown_base_height = None

            # Estimate DBH from height using general allometric equation
            # This is a simplified relationship - species-specific equations are more accurate
            dbh_estimated = self._estimate_dbh(height)

            # Estimate biomass (simplified equation)
            biomass_estimated = self._estimate_biomass(dbh_estimated) if dbh_estimated else None

            tree = TreeMetrics(
                tree_id=i,
                x=round(x, 3),
                y=round(y, 3),
                height=round(height, 2),
                crown_diameter=round(crown_diameter, 2) if crown_diameter else None,
                crown_area=round(crown_area, 2) if crown_area > 0 else None,
                crown_base_height=round(crown_base_height, 2) if crown_base_height else None,
                dbh_estimated=round(dbh_estimated, 1) if dbh_estimated else None,
                biomass_estimated=round(biomass_estimated, 2) if biomass_estimated else None,
                point_count=int(crown_pixels),
            )

            trees.append(tree)

        return trees

    def _estimate_dbh(self, height: float) -> float | None:
        """
        Estimate DBH from tree height using allometric equation.

        Uses a generalized height-DBH relationship. Species-specific
        equations should be used for more accurate estimates.

        Args:
            height: Tree height in meters.

        Returns:
            Estimated DBH in centimeters, or None if height too small.
        """
        if height < 1.3:  # Below breast height
            return None

        # Generalized allometric equation: DBH = a * H^b
        # These coefficients are approximate for mixed conifer/hardwood
        # Reference values - adjust for specific species
        a = 2.5
        b = 1.1

        dbh = a * (height ** b)

        # Sanity check
        if dbh < 1 or dbh > 300:
            return None

        return dbh

    def _estimate_biomass(self, dbh: float) -> float | None:
        """
        Estimate above-ground biomass from DBH.

        Uses a generalized allometric equation. Species-specific
        equations should be used for more accurate carbon calculations.

        Args:
            dbh: Diameter at breast height in centimeters.

        Returns:
            Estimated above-ground biomass in kilograms.
        """
        if dbh is None or dbh < 1:
            return None

        # Generalized biomass equation: Biomass = a * DBH^b
        # This is a simplified pan-tropical/temperate equation
        # For accurate results, use Jenkins et al. (2003) or regional equations
        a = 0.1
        b = 2.4

        biomass = a * (dbh ** b)

        return biomass

    def get_segment_array(
        self,
        file_path: str | Path,
        params: TreeDetectionParams | None = None,
    ) -> tuple[NDArray[np.int32], NDArray[np.float64], float, float, float]:
        """
        Get the segmentation array for visualization/analysis.

        Args:
            file_path: Path to the LAS file.
            params: Optional detection parameters.

        Returns:
            Tuple of (segments, chm, x_min, y_min, resolution).
        """
        params = params or self.params

        # Generate CHM
        chm_result, chm, _ = self.height_normalizer.normalize(
            file_path,
            params=self.height_normalizer.params.__class__(
                resolution=params.resolution
            ),
        )

        x_min = chm_result.bounds.min_x
        y_min = chm_result.bounds.min_y

        # Detect tree tops
        tree_tops = self._find_tree_tops(
            chm,
            min_height=params.min_height,
            min_distance=params.min_distance,
            smoothing_sigma=params.smoothing_sigma,
            resolution=params.resolution,
        )

        # Perform watershed segmentation
        segments = self._watershed_segment(chm, tree_tops, params.min_height)

        return segments, chm, x_min, y_min, params.resolution
