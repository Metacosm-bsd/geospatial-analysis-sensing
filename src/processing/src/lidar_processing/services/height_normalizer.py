"""
Height Normalization Service.

This module provides height normalization for LiDAR point clouds,
generating Digital Elevation Models (DEM) from ground points and
Canopy Height Models (CHM) representing vegetation heights above ground.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

import laspy
import numpy as np
from scipy import ndimage
from scipy.spatial import Delaunay

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    Bounds,
    CHMResult,
    HeightNormalizationParams,
)
from lidar_processing.services.ground_classifier import GROUND_CLASS

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Try to import rasterio for GeoTIFF export
try:
    import rasterio
    from rasterio.transform import from_bounds
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False
    logger.debug("rasterio not available, GeoTIFF export disabled")


class HeightNormalizer:
    """
    Height normalization and CHM generation service.

    This service creates Digital Elevation Models (DEM) from ground points
    using IDW or TIN interpolation, then normalizes all point heights
    to represent height above ground. It can also generate Canopy Height
    Model rasters.

    Attributes:
        settings: Application settings.
        params: Normalization parameters.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        params: HeightNormalizationParams | None = None,
    ) -> None:
        """
        Initialize the height normalizer.

        Args:
            settings: Optional settings instance.
            params: Optional normalization parameters.
        """
        self.settings = settings or get_settings()
        self.params = params or HeightNormalizationParams()

    def normalize(
        self,
        file_path: str | Path,
        output_chm_path: str | Path | None = None,
        output_dem_path: str | Path | None = None,
        params: HeightNormalizationParams | None = None,
    ) -> tuple[CHMResult, NDArray[np.float64], NDArray[np.float64]]:
        """
        Normalize point cloud heights and generate CHM.

        Args:
            file_path: Path to the classified LAS/LAZ file.
            output_chm_path: Optional path to save CHM raster.
            output_dem_path: Optional path to save DEM raster.
            params: Optional parameters to override defaults.

        Returns:
            Tuple of (CHMResult, chm_array, dem_array).

        Raises:
            FileNotFoundError: If input file does not exist.
            ValueError: If no ground points found.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"LAS file not found: {file_path}")

        params = params or self.params
        start_time = time.perf_counter()

        logger.info("Starting height normalization for: %s", file_path)

        # Read the LAS file
        las = laspy.read(str(file_path))
        x = np.array(las.x)
        y = np.array(las.y)
        z = np.array(las.z)
        classification = np.array(las.classification)

        # Get ground points
        ground_mask = classification == GROUND_CLASS
        ground_x = x[ground_mask]
        ground_y = y[ground_mask]
        ground_z = z[ground_mask]

        if len(ground_x) < 3:
            raise ValueError(
                f"Insufficient ground points for interpolation: {len(ground_x)}"
            )

        logger.info(
            "Found %d ground points out of %d total",
            len(ground_x),
            len(x),
        )

        # Calculate grid dimensions
        resolution = params.resolution
        x_min, x_max = float(np.min(x)), float(np.max(x))
        y_min, y_max = float(np.min(y)), float(np.max(y))

        cols = int(np.ceil((x_max - x_min) / resolution)) + 1
        rows = int(np.ceil((y_max - y_min) / resolution)) + 1

        logger.info(
            "Creating %d x %d raster (%.1fm resolution)",
            cols,
            rows,
            resolution,
        )

        # Create DEM from ground points
        if params.interpolation_method.lower() == "tin":
            dem = self._interpolate_tin(
                ground_x, ground_y, ground_z,
                x_min, y_min, resolution, rows, cols,
            )
        else:  # Default to IDW
            dem = self._interpolate_idw(
                ground_x, ground_y, ground_z,
                x_min, y_min, resolution, rows, cols,
                power=params.idw_power,
                search_radius=params.search_radius,
            )

        # Create CHM (maximum height per cell above ground)
        chm = self._create_chm(
            x, y, z,
            x_min, y_min, resolution, rows, cols,
            dem,
        )

        # Save rasters if paths provided
        chm_path_str = None
        dem_path_str = None
        bounds = Bounds(
            min_x=x_min,
            max_x=x_max,
            min_y=y_min,
            max_y=y_max,
            min_z=float(np.nanmin(dem)),
            max_z=float(np.nanmax(chm)),
        )

        if output_dem_path:
            output_dem_path = Path(output_dem_path)
            self._save_raster(
                dem, output_dem_path, x_min, y_min, resolution, rows, cols
            )
            dem_path_str = str(output_dem_path)
            logger.info("Saved DEM to: %s", output_dem_path)

        if output_chm_path:
            output_chm_path = Path(output_chm_path)
            self._save_raster(
                chm, output_chm_path, x_min, y_min, resolution, rows, cols
            )
            chm_path_str = str(output_chm_path)
            logger.info("Saved CHM to: %s", output_chm_path)

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        # Calculate height statistics (ignoring NaN)
        valid_chm = chm[~np.isnan(chm)]
        min_height = float(np.min(valid_chm)) if len(valid_chm) > 0 else 0.0
        max_height = float(np.max(valid_chm)) if len(valid_chm) > 0 else 0.0

        result = CHMResult(
            file_path=str(file_path),
            chm_path=chm_path_str,
            dem_path=dem_path_str,
            resolution=resolution,
            bounds=bounds,
            width=cols,
            height=rows,
            min_height=min_height,
            max_height=max_height,
            processing_time_ms=processing_time_ms,
        )

        return result, chm, dem

    def normalize_points(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        ground_x: NDArray[np.float64],
        ground_y: NDArray[np.float64],
        ground_z: NDArray[np.float64],
        params: HeightNormalizationParams | None = None,
    ) -> NDArray[np.float64]:
        """
        Normalize point heights to height above ground.

        Args:
            x: X coordinates of all points.
            y: Y coordinates of all points.
            z: Z coordinates (elevations) of all points.
            ground_x: X coordinates of ground points.
            ground_y: Y coordinates of ground points.
            ground_z: Z coordinates of ground points.
            params: Optional normalization parameters.

        Returns:
            Array of normalized heights (height above ground).
        """
        params = params or self.params

        # Calculate grid dimensions
        resolution = params.resolution
        x_min, x_max = float(np.min(x)), float(np.max(x))
        y_min, y_max = float(np.min(y)), float(np.max(y))

        cols = int(np.ceil((x_max - x_min) / resolution)) + 1
        rows = int(np.ceil((y_max - y_min) / resolution)) + 1

        # Create DEM
        if params.interpolation_method.lower() == "tin":
            dem = self._interpolate_tin(
                ground_x, ground_y, ground_z,
                x_min, y_min, resolution, rows, cols,
            )
        else:
            dem = self._interpolate_idw(
                ground_x, ground_y, ground_z,
                x_min, y_min, resolution, rows, cols,
                power=params.idw_power,
                search_radius=params.search_radius,
            )

        # Get ground elevation for each point
        col_idx = np.floor((x - x_min) / resolution).astype(np.int32)
        row_idx = np.floor((y - y_min) / resolution).astype(np.int32)
        col_idx = np.clip(col_idx, 0, cols - 1)
        row_idx = np.clip(row_idx, 0, rows - 1)

        ground_elevation = dem[row_idx, col_idx]

        # Normalize heights
        normalized_z = z - ground_elevation

        return normalized_z

    def _interpolate_idw(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        x_min: float,
        y_min: float,
        resolution: float,
        rows: int,
        cols: int,
        power: float = 2.0,
        search_radius: float | None = None,
    ) -> NDArray[np.float64]:
        """
        Interpolate ground surface using Inverse Distance Weighting.

        Args:
            x: X coordinates of ground points.
            y: Y coordinates of ground points.
            z: Z coordinates of ground points.
            x_min: Minimum X extent.
            y_min: Minimum Y extent.
            resolution: Grid cell size.
            rows: Number of grid rows.
            cols: Number of grid columns.
            power: IDW power parameter.
            search_radius: Search radius for neighbors (None = auto).

        Returns:
            2D array of interpolated elevations.
        """
        logger.debug("Interpolating DEM using IDW (power=%.1f)", power)

        # Auto-calculate search radius if not provided
        if search_radius is None:
            # Use 3x the average point spacing
            area = (cols * resolution) * (rows * resolution)
            point_density = len(x) / area if area > 0 else 1
            avg_spacing = 1.0 / np.sqrt(point_density) if point_density > 0 else 1.0
            search_radius = max(3.0 * avg_spacing, resolution * 3)

        # Create grid coordinates
        grid_x = np.linspace(x_min, x_min + (cols - 1) * resolution, cols)
        grid_y = np.linspace(y_min, y_min + (rows - 1) * resolution, rows)
        grid_xx, grid_yy = np.meshgrid(grid_x, grid_y)

        # Initialize output
        dem = np.full((rows, cols), np.nan)

        # Process in chunks for efficiency
        chunk_size = 100
        for r_start in range(0, rows, chunk_size):
            r_end = min(r_start + chunk_size, rows)
            for c_start in range(0, cols, chunk_size):
                c_end = min(c_start + chunk_size, cols)

                # Get grid points for this chunk
                chunk_x = grid_xx[r_start:r_end, c_start:c_end].ravel()
                chunk_y = grid_yy[r_start:r_end, c_start:c_end].ravel()

                # Find points within search radius
                for i, (px, py) in enumerate(zip(chunk_x, chunk_y)):
                    distances = np.sqrt((x - px) ** 2 + (y - py) ** 2)
                    within_radius = distances <= search_radius

                    if np.sum(within_radius) > 0:
                        d = distances[within_radius]
                        zv = z[within_radius]

                        # Avoid division by zero
                        d = np.maximum(d, 1e-10)

                        # IDW weights
                        weights = 1.0 / (d ** power)
                        weights_sum = np.sum(weights)

                        if weights_sum > 0:
                            interpolated = np.sum(weights * zv) / weights_sum
                            r_idx = r_start + i // (c_end - c_start)
                            c_idx = c_start + i % (c_end - c_start)
                            dem[r_idx, c_idx] = interpolated

        # Fill remaining NaN values
        dem = self._fill_nan_values(dem)

        return dem

    def _interpolate_tin(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        x_min: float,
        y_min: float,
        resolution: float,
        rows: int,
        cols: int,
    ) -> NDArray[np.float64]:
        """
        Interpolate ground surface using TIN (Triangulated Irregular Network).

        Uses Delaunay triangulation and linear interpolation within triangles.

        Args:
            x: X coordinates of ground points.
            y: Y coordinates of ground points.
            z: Z coordinates of ground points.
            x_min: Minimum X extent.
            y_min: Minimum Y extent.
            resolution: Grid cell size.
            rows: Number of grid rows.
            cols: Number of grid columns.

        Returns:
            2D array of interpolated elevations.
        """
        logger.debug("Interpolating DEM using TIN")

        # Create Delaunay triangulation
        points = np.column_stack([x, y])

        try:
            tri = Delaunay(points)
        except Exception as e:
            logger.warning("TIN creation failed, falling back to IDW: %s", e)
            return self._interpolate_idw(
                x, y, z, x_min, y_min, resolution, rows, cols
            )

        # Create grid coordinates
        grid_x = np.linspace(x_min, x_min + (cols - 1) * resolution, cols)
        grid_y = np.linspace(y_min, y_min + (rows - 1) * resolution, rows)
        grid_xx, grid_yy = np.meshgrid(grid_x, grid_y)

        # Find which triangle each grid point is in
        grid_points = np.column_stack([grid_xx.ravel(), grid_yy.ravel()])
        simplex_indices = tri.find_simplex(grid_points)

        # Initialize output
        dem = np.full((rows, cols), np.nan)

        # Interpolate within triangles
        for i, simplex_idx in enumerate(simplex_indices):
            if simplex_idx >= 0:
                # Get triangle vertices
                triangle = tri.simplices[simplex_idx]
                p1, p2, p3 = points[triangle]
                z1, z2, z3 = z[triangle]

                # Grid point
                gp = grid_points[i]

                # Barycentric interpolation
                interpolated_z = self._barycentric_interpolate(
                    gp, p1, p2, p3, z1, z2, z3
                )

                r_idx = i // cols
                c_idx = i % cols
                dem[r_idx, c_idx] = interpolated_z

        # Fill remaining NaN values
        dem = self._fill_nan_values(dem)

        return dem

    def _barycentric_interpolate(
        self,
        p: NDArray[np.float64],
        p1: NDArray[np.float64],
        p2: NDArray[np.float64],
        p3: NDArray[np.float64],
        z1: float,
        z2: float,
        z3: float,
    ) -> float:
        """
        Interpolate z value using barycentric coordinates.

        Args:
            p: Query point (x, y).
            p1, p2, p3: Triangle vertices.
            z1, z2, z3: Z values at vertices.

        Returns:
            Interpolated z value.
        """
        # Calculate barycentric coordinates
        v0 = p3 - p1
        v1 = p2 - p1
        v2 = p - p1

        dot00 = np.dot(v0, v0)
        dot01 = np.dot(v0, v1)
        dot02 = np.dot(v0, v2)
        dot11 = np.dot(v1, v1)
        dot12 = np.dot(v1, v2)

        denom = dot00 * dot11 - dot01 * dot01
        if abs(denom) < 1e-10:
            return (z1 + z2 + z3) / 3.0

        u = (dot11 * dot02 - dot01 * dot12) / denom
        v = (dot00 * dot12 - dot01 * dot02) / denom

        # Interpolate
        return z1 + u * (z3 - z1) + v * (z2 - z1)

    def _create_chm(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
        x_min: float,
        y_min: float,
        resolution: float,
        rows: int,
        cols: int,
        dem: NDArray[np.float64],
    ) -> NDArray[np.float64]:
        """
        Create Canopy Height Model from normalized heights.

        Args:
            x: X coordinates of all points.
            y: Y coordinates of all points.
            z: Z coordinates of all points.
            x_min: Minimum X extent.
            y_min: Minimum Y extent.
            resolution: Grid cell size.
            rows: Number of grid rows.
            cols: Number of grid columns.
            dem: Digital Elevation Model.

        Returns:
            2D array of canopy heights above ground.
        """
        # Calculate grid indices
        col_idx = np.floor((x - x_min) / resolution).astype(np.int32)
        row_idx = np.floor((y - y_min) / resolution).astype(np.int32)
        col_idx = np.clip(col_idx, 0, cols - 1)
        row_idx = np.clip(row_idx, 0, rows - 1)

        # Get ground elevation for each point
        ground_elevation = dem[row_idx, col_idx]

        # Normalize heights
        normalized_z = z - ground_elevation

        # Initialize CHM with zeros
        chm = np.zeros((rows, cols))

        # Find maximum height per cell
        for i in range(len(x)):
            r, c = row_idx[i], col_idx[i]
            if normalized_z[i] > chm[r, c]:
                chm[r, c] = normalized_z[i]

        # Apply slight smoothing to reduce noise
        chm = ndimage.gaussian_filter(chm, sigma=0.5)

        # Clip negative values (below ground)
        chm = np.maximum(chm, 0)

        return chm

    def _fill_nan_values(
        self,
        array: NDArray[np.float64],
    ) -> NDArray[np.float64]:
        """
        Fill NaN values using nearest neighbor interpolation.

        Args:
            array: Array with NaN values.

        Returns:
            Array with NaN values filled.
        """
        nan_mask = np.isnan(array)

        if not np.any(nan_mask):
            return array

        # Use distance transform to find nearest valid cell
        from scipy.ndimage import distance_transform_edt

        filled = array.copy()
        filled[nan_mask] = 0

        _, indices = distance_transform_edt(
            nan_mask, return_distances=True, return_indices=True
        )

        array[nan_mask] = array[indices[0][nan_mask], indices[1][nan_mask]]

        # Handle case where all values were NaN
        if np.any(np.isnan(array)):
            array[np.isnan(array)] = 0.0

        return array

    def _save_raster(
        self,
        data: NDArray[np.float64],
        output_path: Path,
        x_min: float,
        y_min: float,
        resolution: float,
        rows: int,
        cols: int,
    ) -> None:
        """
        Save raster data to file.

        Uses rasterio for GeoTIFF if available, otherwise saves as numpy array.

        Args:
            data: 2D array to save.
            output_path: Output file path.
            x_min: Minimum X extent.
            y_min: Minimum Y extent.
            resolution: Grid cell size.
            rows: Number of rows.
            cols: Number of columns.
        """
        if HAS_RASTERIO and output_path.suffix.lower() in [".tif", ".tiff"]:
            # Calculate transform
            x_max = x_min + cols * resolution
            y_max = y_min + rows * resolution
            transform = from_bounds(x_min, y_min, x_max, y_max, cols, rows)

            # Write GeoTIFF
            with rasterio.open(
                str(output_path),
                "w",
                driver="GTiff",
                height=rows,
                width=cols,
                count=1,
                dtype=data.dtype,
                transform=transform,
            ) as dst:
                dst.write(data, 1)
        else:
            # Save as numpy array
            if output_path.suffix.lower() != ".npy":
                output_path = output_path.with_suffix(".npy")
            np.save(str(output_path), data)

    def get_chm_array(
        self,
        file_path: str | Path,
        resolution: float = 1.0,
    ) -> tuple[NDArray[np.float64], float, float, float]:
        """
        Generate and return CHM array without saving to file.

        Args:
            file_path: Path to the classified LAS file.
            resolution: CHM resolution in meters.

        Returns:
            Tuple of (chm_array, x_min, y_min, resolution).
        """
        params = HeightNormalizationParams(resolution=resolution)
        _, chm, _ = self.normalize(file_path, params=params)

        las = laspy.read(str(file_path))
        x_min = float(np.min(las.x))
        y_min = float(np.min(las.y))

        return chm, x_min, y_min, resolution
