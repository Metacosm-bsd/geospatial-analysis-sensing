"""
LiDAR Metadata Extraction Service.

This module provides services for extracting comprehensive metadata
from LAS/LAZ files including bounds, point density, classification
counts, and return statistics.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

import laspy
import numpy as np
from numpy.typing import NDArray

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    ASPRS_CLASSIFICATION_NAMES,
    Bounds,
    ClassificationCount,
    FileInfo,
    LidarMetadata,
    ReturnStatistics,
    get_classification_name,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class MetadataExtractor:
    """
    Service for extracting metadata from LiDAR files.

    Extracts comprehensive metadata including:
    - File information (size, path, extension)
    - LAS header data (version, point format, scales, offsets)
    - Spatial bounds and calculated area
    - Point density (points per square meter)
    - Classification breakdown with counts and percentages
    - Return number statistics
    - CRS information (WKT and EPSG if available)
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the metadata extractor with settings.

        Args:
            settings: Optional settings instance. Uses cached settings if not provided.
        """
        self.settings = settings or get_settings()

    def extract(
        self,
        file_path: str | Path,
        *,
        include_classification_counts: bool = True,
        include_return_statistics: bool = True,
        calculate_density: bool = True,
        sample_size: int | None = None,
    ) -> LidarMetadata:
        """
        Extract metadata from a LAS/LAZ file.

        Args:
            file_path: Path to the LAS/LAZ file.
            include_classification_counts: Whether to count points by classification.
            include_return_statistics: Whether to calculate return number statistics.
            calculate_density: Whether to calculate point density.
            sample_size: Optional sample size for large files. If None, uses all points.

        Returns:
            LidarMetadata with extracted information.

        Raises:
            FileNotFoundError: If the file does not exist.
            ValueError: If the file format is not supported.
        """
        start_time = time.perf_counter()

        file_path = Path(file_path)
        logger.info("Extracting metadata from: %s", file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        if file_path.suffix.lower() not in self.settings.allowed_extensions:
            raise ValueError(f"Unsupported file format: {file_path.suffix}")

        # Get file info
        file_size = file_path.stat().st_size
        file_info = FileInfo(
            file_path=str(file_path),
            file_size_bytes=file_size,
            file_size_mb=round(file_size / (1024 * 1024), 2),
            file_extension=file_path.suffix.lower(),
        )

        # Open and read the file
        with laspy.open(str(file_path)) as las_file:
            header = las_file.header

            # Extract header information
            las_version = f"{header.version.major}.{header.version.minor}"
            point_format_id = header.point_format.id
            point_count = header.point_count

            # Extract bounds
            bounds = Bounds(
                min_x=float(header.mins[0]),
                max_x=float(header.maxs[0]),
                min_y=float(header.mins[1]),
                max_y=float(header.maxs[1]),
                min_z=float(header.mins[2]),
                max_z=float(header.maxs[2]),
            )

            # Extract scale and offset
            scale = tuple(float(s) for s in header.scales)
            offset = tuple(float(o) for o in header.offsets)

            # Extract CRS
            crs_wkt, crs_epsg = self._extract_crs(las_file)

            # Extract creation date and generating software
            creation_date = self._extract_creation_date(header)
            generating_software = self._extract_generating_software(header)

            # Calculate area and density
            area_sq_meters = bounds.area_2d
            point_density: float | None = None

            if calculate_density and area_sq_meters > 0:
                point_density = point_count / area_sq_meters

            # For classification and return stats, we need to read point data
            classification_counts: list[ClassificationCount] = []
            return_statistics: list[ReturnStatistics] = []

            if include_classification_counts or include_return_statistics:
                classification_counts, return_statistics = self._extract_point_statistics(
                    las_file,
                    include_classification_counts=include_classification_counts,
                    include_return_statistics=include_return_statistics,
                    sample_size=sample_size,
                )

        extraction_time_ms = (time.perf_counter() - start_time) * 1000

        metadata = LidarMetadata(
            file_path=str(file_path),
            file_info=file_info,
            las_version=las_version,
            point_format_id=point_format_id,
            point_count=point_count,
            crs_wkt=crs_wkt,
            crs_epsg=crs_epsg,
            bounds=bounds,
            scale=scale,  # type: ignore
            offset=offset,  # type: ignore
            point_density=round(point_density, 2) if point_density else None,
            area_sq_meters=round(area_sq_meters, 2) if area_sq_meters else None,
            classification_counts=classification_counts,
            return_statistics=return_statistics,
            creation_date=creation_date,
            generating_software=generating_software,
            extracted_at=datetime.utcnow(),
            extraction_time_ms=round(extraction_time_ms, 2),
        )

        logger.info(
            "Extracted metadata: %d points, %.2f pts/m2, %.1f ms",
            point_count,
            point_density or 0,
            extraction_time_ms,
        )

        return metadata

    def _extract_crs(self, las_file: laspy.LasReader) -> tuple[str | None, int | None]:
        """
        Extract CRS information from VLRs.

        Args:
            las_file: Open LAS file reader.

        Returns:
            Tuple of (WKT string, EPSG code).
        """
        crs_wkt: str | None = None
        crs_epsg: int | None = None

        for vlr in las_file.header.vlrs:
            # WKT CRS (record ID 2112)
            if vlr.record_id == 2112:
                try:
                    if hasattr(vlr, "string"):
                        crs_wkt = vlr.string
                    else:
                        crs_wkt = vlr.record_data.decode("utf-8").rstrip("\x00")
                except (AttributeError, UnicodeDecodeError) as e:
                    logger.warning("Failed to decode WKT CRS: %s", e)

            # GeoTIFF GeoKeyDirectory (record ID 34735)
            if vlr.record_id == 34735:
                crs_epsg = self._extract_epsg_from_geotiff(vlr)

        # Try to extract EPSG from WKT if we have it
        if crs_wkt and not crs_epsg:
            crs_epsg = self._extract_epsg_from_wkt(crs_wkt)

        return crs_wkt, crs_epsg

    def _extract_epsg_from_geotiff(self, vlr: laspy.VLR) -> int | None:
        """
        Extract EPSG code from GeoTIFF VLR.

        Args:
            vlr: GeoTIFF VLR.

        Returns:
            EPSG code if found, None otherwise.
        """
        try:
            data = vlr.record_data
            if len(data) < 8:
                return None

            # GeoKeyDirectory structure
            # First 4 shorts: key_directory_version, key_revision, minor_revision, number_of_keys
            # Then each key: key_id, tiff_tag_location, count, value_offset

            num_shorts = len(data) // 2
            if num_shorts < 4:
                return None

            keys = np.frombuffer(data, dtype=np.uint16)
            num_keys = keys[3] if len(keys) > 3 else 0

            # Look for ProjectedCSTypeGeoKey (3072) or GeographicTypeGeoKey (2048)
            for i in range(4, min(4 + num_keys * 4, len(keys)), 4):
                if len(keys) <= i + 3:
                    break

                key_id = keys[i]
                tiff_tag = keys[i + 1]
                value = keys[i + 3]

                # Key 3072 = ProjectedCSTypeGeoKey
                # Key 2048 = GeographicTypeGeoKey
                if key_id in (3072, 2048) and tiff_tag == 0:
                    return int(value)

            return None

        except Exception as e:
            logger.warning("Failed to extract EPSG from GeoTIFF VLR: %s", e)
            return None

    def _extract_epsg_from_wkt(self, wkt: str) -> int | None:
        """
        Extract EPSG code from WKT string.

        Args:
            wkt: WKT CRS string.

        Returns:
            EPSG code if found, None otherwise.
        """
        import re

        # Look for AUTHORITY["EPSG","<code>"]
        pattern = r'AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]'
        matches = re.findall(pattern, wkt, re.IGNORECASE)

        if matches:
            # Return the last match (usually the most specific)
            return int(matches[-1])

        # Also try ID["EPSG",<code>] format (WKT2)
        pattern2 = r'ID\s*\[\s*"EPSG"\s*,\s*(\d+)\s*\]'
        matches2 = re.findall(pattern2, wkt, re.IGNORECASE)

        if matches2:
            return int(matches2[-1])

        return None

    def _extract_creation_date(self, header: laspy.LasHeader) -> str | None:
        """
        Extract file creation date from header.

        Args:
            header: LAS file header.

        Returns:
            Creation date string or None.
        """
        try:
            day = header.creation_date.day if hasattr(header, "creation_date") else None
            year = header.creation_date.year if hasattr(header, "creation_date") else None

            if day is not None and year is not None:
                # Convert day of year to date
                from datetime import datetime, timedelta

                base_date = datetime(year, 1, 1)
                actual_date = base_date + timedelta(days=day - 1)
                return actual_date.strftime("%Y-%m-%d")

        except (AttributeError, ValueError, TypeError):
            pass

        return None

    def _extract_generating_software(self, header: laspy.LasHeader) -> str | None:
        """
        Extract generating software from header.

        Args:
            header: LAS file header.

        Returns:
            Software name or None.
        """
        try:
            if hasattr(header, "generating_software"):
                software = header.generating_software
                if isinstance(software, bytes):
                    software = software.decode("utf-8", errors="ignore")
                return software.strip("\x00").strip() or None
        except (AttributeError, ValueError, TypeError):
            pass

        return None

    def _extract_point_statistics(
        self,
        las_file: laspy.LasReader,
        *,
        include_classification_counts: bool,
        include_return_statistics: bool,
        sample_size: int | None,
    ) -> tuple[list[ClassificationCount], list[ReturnStatistics]]:
        """
        Extract classification and return statistics from point data.

        Args:
            las_file: Open LAS file reader.
            include_classification_counts: Whether to count classifications.
            include_return_statistics: Whether to count returns.
            sample_size: Optional sample size for large files.

        Returns:
            Tuple of (classification counts, return statistics).
        """
        classification_counts: list[ClassificationCount] = []
        return_statistics: list[ReturnStatistics] = []

        point_count = las_file.header.point_count

        # Determine if we should sample
        should_sample = sample_size is not None and sample_size < point_count

        if should_sample:
            logger.info(
                "Sampling %d of %d points for statistics",
                sample_size,
                point_count,
            )

        # Read points in chunks for memory efficiency
        classifications: list[NDArray[np.uint8]] = []
        return_numbers: list[NDArray[np.uint8]] = []

        points_read = 0
        chunk_size = 1_000_000  # 1 million points at a time

        for chunk in las_file.chunk_iterator(chunk_size):
            if include_classification_counts and hasattr(chunk, "classification"):
                classifications.append(np.array(chunk.classification, dtype=np.uint8))

            if include_return_statistics and hasattr(chunk, "return_number"):
                return_numbers.append(np.array(chunk.return_number, dtype=np.uint8))

            points_read += len(chunk)

            if should_sample and points_read >= sample_size:
                break

        # Calculate classification counts
        if include_classification_counts and classifications:
            all_classifications = np.concatenate(classifications)

            if should_sample and sample_size:
                # Adjust for sampling
                scale_factor = point_count / len(all_classifications)
            else:
                scale_factor = 1.0

            classification_counts = self._calculate_classification_counts(
                all_classifications,
                point_count,
                scale_factor,
            )

        # Calculate return statistics
        if include_return_statistics and return_numbers:
            all_returns = np.concatenate(return_numbers)

            if should_sample and sample_size:
                scale_factor = point_count / len(all_returns)
            else:
                scale_factor = 1.0

            return_statistics = self._calculate_return_statistics(
                all_returns,
                point_count,
                scale_factor,
            )

        return classification_counts, return_statistics

    def _calculate_classification_counts(
        self,
        classifications: NDArray[np.uint8],
        total_points: int,
        scale_factor: float,
    ) -> list[ClassificationCount]:
        """
        Calculate point counts per classification.

        Args:
            classifications: Array of classification values.
            total_points: Total point count for percentage calculation.
            scale_factor: Scale factor for sampled data.

        Returns:
            List of ClassificationCount objects.
        """
        unique, counts = np.unique(classifications, return_counts=True)

        results: list[ClassificationCount] = []

        for code, count in zip(unique, counts):
            adjusted_count = int(count * scale_factor)
            percentage = (adjusted_count / total_points) * 100 if total_points > 0 else 0

            results.append(
                ClassificationCount(
                    code=int(code),
                    name=get_classification_name(int(code)),
                    count=adjusted_count,
                    percentage=round(percentage, 2),
                )
            )

        # Sort by count descending
        results.sort(key=lambda x: x.count, reverse=True)

        return results

    def _calculate_return_statistics(
        self,
        return_numbers: NDArray[np.uint8],
        total_points: int,
        scale_factor: float,
    ) -> list[ReturnStatistics]:
        """
        Calculate point counts per return number.

        Args:
            return_numbers: Array of return number values.
            total_points: Total point count for percentage calculation.
            scale_factor: Scale factor for sampled data.

        Returns:
            List of ReturnStatistics objects.
        """
        unique, counts = np.unique(return_numbers, return_counts=True)

        results: list[ReturnStatistics] = []

        for return_num, count in zip(unique, counts):
            if return_num == 0:
                continue  # Skip invalid return number

            adjusted_count = int(count * scale_factor)
            percentage = (adjusted_count / total_points) * 100 if total_points > 0 else 0

            results.append(
                ReturnStatistics(
                    return_number=int(return_num),
                    count=adjusted_count,
                    percentage=round(percentage, 2),
                )
            )

        # Sort by return number
        results.sort(key=lambda x: x.return_number)

        return results

    def get_quick_info(self, file_path: str | Path) -> dict:
        """
        Get basic file information without full extraction.

        This is a faster operation that only reads the header.

        Args:
            file_path: Path to the LAS/LAZ file.

        Returns:
            Dictionary with basic file info.
        """
        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with laspy.open(str(file_path)) as las_file:
            header = las_file.header

            return {
                "file_path": str(file_path),
                "file_size_mb": round(file_path.stat().st_size / (1024 * 1024), 2),
                "las_version": f"{header.version.major}.{header.version.minor}",
                "point_format": header.point_format.id,
                "point_count": header.point_count,
                "bounds": {
                    "min_x": float(header.mins[0]),
                    "max_x": float(header.maxs[0]),
                    "min_y": float(header.mins[1]),
                    "max_y": float(header.maxs[1]),
                    "min_z": float(header.mins[2]),
                    "max_z": float(header.maxs[2]),
                },
            }
