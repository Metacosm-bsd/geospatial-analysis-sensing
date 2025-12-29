"""
Point Extractor Service for 3D Viewer.

This module provides services for extracting point cloud data
for streaming to 3D viewers, including LOD (Level of Detail)
support and efficient binary encoding.
"""

from __future__ import annotations

import base64
import logging
import struct
import time
from pathlib import Path
from typing import Any

import laspy
import numpy as np
from numpy.typing import NDArray

from lidar_processing.config import Settings, get_settings

logger = logging.getLogger(__name__)


# Point data struct format (little-endian):
# x, y, z: 3 floats (12 bytes)
# intensity: 1 unsigned short (2 bytes)
# classification: 1 unsigned byte (1 byte)
# r, g, b: 3 unsigned bytes (3 bytes)
# Total: 18 bytes per point
POINT_STRUCT_FORMAT = "<fffHBBBB"
BYTES_PER_POINT = 18


class PointExtractor:
    """
    Service for extracting point cloud data for 3D visualization.

    Supports:
    - LOD (Level of Detail) through decimation
    - Binary and JSON output formats
    - Chunked streaming for large files
    - Efficient memory management
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the point extractor with settings.

        Args:
            settings: Optional settings instance. Uses cached settings if not provided.
        """
        self.settings = settings or get_settings()

    def extract_points(
        self,
        file_path: str | Path,
        offset: int = 0,
        limit: int = 1_000_000,
        downsample_factor: int = 1,
        output_format: str = "binary",
        attributes: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Extract points from a LAS/LAZ file.

        Args:
            file_path: Path to the LAS/LAZ file.
            offset: Starting point index (after downsampling).
            limit: Maximum number of points to return.
            downsample_factor: Decimation factor (1=all, 4=every 4th, 16=every 16th).
            output_format: Output format ("binary" or "json").
            attributes: List of attributes to include. Defaults to all available.

        Returns:
            Dictionary with extracted point data.

        Raises:
            FileNotFoundError: If the file does not exist.
            ValueError: If parameters are invalid.
        """
        start_time = time.perf_counter()

        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        if downsample_factor < 1:
            raise ValueError("downsample_factor must be >= 1")

        if limit < 1:
            raise ValueError("limit must be >= 1")

        if offset < 0:
            raise ValueError("offset must be >= 0")

        logger.info(
            "Extracting points from %s (offset=%d, limit=%d, downsample=%d, format=%s)",
            file_path,
            offset,
            limit,
            downsample_factor,
            output_format,
        )

        with laspy.open(str(file_path)) as las_file:
            header = las_file.header
            total_points = header.point_count

            # Calculate effective total points after downsampling
            effective_total = total_points // downsample_factor

            # Check if we're past the end
            if offset >= effective_total:
                return {
                    "success": True,
                    "count": 0,
                    "format": output_format,
                    "points": [] if output_format == "json" else None,
                    "binaryData": None if output_format == "json" else "",
                    "bytesPerPoint": BYTES_PER_POINT,
                    "hasMore": False,
                    "totalPoints": effective_total,
                }

            # Read points
            points_data = self._read_points(
                las_file,
                offset * downsample_factor,
                limit,
                downsample_factor,
                header,
            )

            # Determine if there are more points
            has_more = offset + len(points_data["x"]) < effective_total

            # Format output
            if output_format == "binary":
                result = self._format_binary(points_data)
            else:
                result = self._format_json(points_data)

            extraction_time = (time.perf_counter() - start_time) * 1000
            logger.info(
                "Extracted %d points in %.2f ms",
                len(points_data["x"]),
                extraction_time,
            )

            return {
                "success": True,
                "count": len(points_data["x"]),
                "format": output_format,
                "points": result if output_format == "json" else None,
                "binaryData": result if output_format == "binary" else None,
                "bytesPerPoint": BYTES_PER_POINT,
                "hasMore": has_more,
                "totalPoints": effective_total,
            }

    def _read_points(
        self,
        las_file: laspy.LasReader,
        raw_offset: int,
        limit: int,
        downsample_factor: int,
        header: laspy.LasHeader,
    ) -> dict[str, NDArray]:
        """
        Read points from the LAS file with downsampling.

        Args:
            las_file: Open LAS file reader.
            raw_offset: Raw starting point index (before downsampling).
            limit: Maximum points to read (after downsampling).
            downsample_factor: Decimation factor.
            header: LAS file header.

        Returns:
            Dictionary with numpy arrays for each attribute.
        """
        # Calculate how many raw points we need to read
        raw_limit = limit * downsample_factor

        # Read all points first (laspy doesn't support seeking by offset directly)
        # For large files, we should use chunked reading
        chunk_size = 1_000_000
        all_x = []
        all_y = []
        all_z = []
        all_intensity = []
        all_classification = []
        all_r = []
        all_g = []
        all_b = []

        points_read = 0
        points_collected = 0

        for chunk in las_file.chunk_iterator(chunk_size):
            chunk_len = len(chunk)

            # Check if we've reached the raw offset
            if points_read + chunk_len <= raw_offset:
                points_read += chunk_len
                continue

            # Determine which points in this chunk to use
            chunk_start = max(0, raw_offset - points_read)
            chunk_end = min(chunk_len, chunk_start + (raw_limit - points_collected * downsample_factor))

            if chunk_start >= chunk_len:
                points_read += chunk_len
                continue

            # Apply downsampling: take every nth point
            indices = np.arange(chunk_start, chunk_end, downsample_factor)

            if len(indices) == 0:
                points_read += chunk_len
                continue

            # Extract coordinates (convert to actual values)
            x = chunk.x[indices]
            y = chunk.y[indices]
            z = chunk.z[indices]

            all_x.append(np.array(x, dtype=np.float32))
            all_y.append(np.array(y, dtype=np.float32))
            all_z.append(np.array(z, dtype=np.float32))

            # Extract intensity
            if hasattr(chunk, "intensity"):
                all_intensity.append(np.array(chunk.intensity[indices], dtype=np.uint16))
            else:
                all_intensity.append(np.zeros(len(indices), dtype=np.uint16))

            # Extract classification
            if hasattr(chunk, "classification"):
                all_classification.append(np.array(chunk.classification[indices], dtype=np.uint8))
            else:
                all_classification.append(np.zeros(len(indices), dtype=np.uint8))

            # Extract RGB (if available)
            if hasattr(chunk, "red") and hasattr(chunk, "green") and hasattr(chunk, "blue"):
                # RGB values are typically 16-bit, scale to 8-bit
                r = np.array(chunk.red[indices], dtype=np.uint16)
                g = np.array(chunk.green[indices], dtype=np.uint16)
                b = np.array(chunk.blue[indices], dtype=np.uint16)

                # Check if 16-bit (values > 255)
                if np.max(r) > 255 or np.max(g) > 255 or np.max(b) > 255:
                    r = (r / 256).astype(np.uint8)
                    g = (g / 256).astype(np.uint8)
                    b = (b / 256).astype(np.uint8)
                else:
                    r = r.astype(np.uint8)
                    g = g.astype(np.uint8)
                    b = b.astype(np.uint8)

                all_r.append(r)
                all_g.append(g)
                all_b.append(b)
            else:
                # Generate colors from height or classification
                all_r.append(np.full(len(indices), 128, dtype=np.uint8))
                all_g.append(np.full(len(indices), 128, dtype=np.uint8))
                all_b.append(np.full(len(indices), 128, dtype=np.uint8))

            points_collected += len(indices)
            points_read += chunk_len

            if points_collected >= limit:
                break

        # Concatenate all arrays
        if not all_x:
            return {
                "x": np.array([], dtype=np.float32),
                "y": np.array([], dtype=np.float32),
                "z": np.array([], dtype=np.float32),
                "intensity": np.array([], dtype=np.uint16),
                "classification": np.array([], dtype=np.uint8),
                "r": np.array([], dtype=np.uint8),
                "g": np.array([], dtype=np.uint8),
                "b": np.array([], dtype=np.uint8),
            }

        return {
            "x": np.concatenate(all_x)[:limit],
            "y": np.concatenate(all_y)[:limit],
            "z": np.concatenate(all_z)[:limit],
            "intensity": np.concatenate(all_intensity)[:limit],
            "classification": np.concatenate(all_classification)[:limit],
            "r": np.concatenate(all_r)[:limit],
            "g": np.concatenate(all_g)[:limit],
            "b": np.concatenate(all_b)[:limit],
        }

    def _format_binary(self, points_data: dict[str, NDArray]) -> str:
        """
        Format point data as binary (base64 encoded).

        Args:
            points_data: Dictionary with numpy arrays.

        Returns:
            Base64 encoded binary data.
        """
        if len(points_data["x"]) == 0:
            return ""

        # Create binary buffer
        n_points = len(points_data["x"])
        buffer = bytearray(n_points * BYTES_PER_POINT)

        for i in range(n_points):
            offset = i * BYTES_PER_POINT
            struct.pack_into(
                POINT_STRUCT_FORMAT,
                buffer,
                offset,
                float(points_data["x"][i]),
                float(points_data["y"][i]),
                float(points_data["z"][i]),
                int(points_data["intensity"][i]),
                int(points_data["classification"][i]),
                int(points_data["r"][i]),
                int(points_data["g"][i]),
                int(points_data["b"][i]),
            )

        return base64.b64encode(bytes(buffer)).decode("ascii")

    def _format_json(self, points_data: dict[str, NDArray]) -> list[dict[str, Any]]:
        """
        Format point data as JSON.

        Args:
            points_data: Dictionary with numpy arrays.

        Returns:
            List of point dictionaries.
        """
        points = []

        for i in range(len(points_data["x"])):
            point = {
                "x": float(points_data["x"][i]),
                "y": float(points_data["y"][i]),
                "z": float(points_data["z"][i]),
            }

            if points_data["intensity"][i] > 0:
                point["intensity"] = int(points_data["intensity"][i])

            if points_data["classification"][i] > 0:
                point["classification"] = int(points_data["classification"][i])

            # Include RGB if not all the same (default gray)
            if (
                points_data["r"][i] != 128
                or points_data["g"][i] != 128
                or points_data["b"][i] != 128
            ):
                point["r"] = int(points_data["r"][i])
                point["g"] = int(points_data["g"][i])
                point["b"] = int(points_data["b"][i])

            points.append(point)

        return points

    def get_file_metadata(
        self,
        file_path: str | Path,
        include_lod_info: bool = True,
    ) -> dict[str, Any]:
        """
        Get file metadata for viewer initialization.

        Args:
            file_path: Path to the LAS/LAZ file.
            include_lod_info: Whether to include LOD level information.

        Returns:
            Dictionary with file metadata.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with laspy.open(str(file_path)) as las_file:
            header = las_file.header

            # Get bounds
            bounds = {
                "minX": float(header.mins[0]),
                "maxX": float(header.maxs[0]),
                "minY": float(header.mins[1]),
                "maxY": float(header.maxs[1]),
                "minZ": float(header.mins[2]),
                "maxZ": float(header.maxs[2]),
            }

            # Get CRS
            crs = self._extract_crs(las_file)

            # Check available attributes
            sample_chunk = next(las_file.chunk_iterator(100))
            attributes = {
                "hasIntensity": hasattr(sample_chunk, "intensity"),
                "hasRGB": (
                    hasattr(sample_chunk, "red")
                    and hasattr(sample_chunk, "green")
                    and hasattr(sample_chunk, "blue")
                ),
                "hasClassification": hasattr(sample_chunk, "classification"),
                "hasReturnNumber": hasattr(sample_chunk, "return_number"),
                "hasNormalizedHeight": hasattr(sample_chunk, "normalized_height"),
            }

            # Calculate LOD levels
            lod_levels = []
            if include_lod_info:
                for level, factor in enumerate([1, 4, 16]):
                    lod_levels.append({
                        "level": level,
                        "pointCount": header.point_count // factor,
                        "decimationFactor": factor,
                    })

            return {
                "success": True,
                "metadata": {
                    "pointCount": header.point_count,
                    "bounds": bounds,
                    "crs": crs,
                    "lasVersion": f"{header.version.major}.{header.version.minor}",
                    "pointFormat": header.point_format.id,
                    "attributes": attributes,
                    "lodLevels": lod_levels,
                },
            }

    def _extract_crs(self, las_file: laspy.LasReader) -> str:
        """
        Extract CRS from the LAS file.

        Args:
            las_file: Open LAS file reader.

        Returns:
            CRS string (WKT or EPSG code).
        """
        for vlr in las_file.header.vlrs:
            if vlr.record_id == 2112:
                try:
                    if hasattr(vlr, "string"):
                        return vlr.string
                    return vlr.record_data.decode("utf-8").rstrip("\x00")
                except (AttributeError, UnicodeDecodeError):
                    pass

            if vlr.record_id == 34735:
                epsg = self._extract_epsg_from_geotiff(vlr)
                if epsg:
                    return f"EPSG:{epsg}"

        return "Unknown"

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

            keys = np.frombuffer(data, dtype=np.uint16)
            num_keys = keys[3] if len(keys) > 3 else 0

            for i in range(4, min(4 + num_keys * 4, len(keys)), 4):
                if len(keys) <= i + 3:
                    break

                key_id = keys[i]
                tiff_tag = keys[i + 1]
                value = keys[i + 3]

                if key_id in (3072, 2048) and tiff_tag == 0:
                    return int(value)

            return None

        except Exception as e:
            logger.warning("Failed to extract EPSG from GeoTIFF VLR: %s", e)
            return None

    def create_lod_file(
        self,
        file_path: str | Path,
        output_path: str | Path,
        decimation_factor: int,
    ) -> dict[str, Any]:
        """
        Create a downsampled LOD version of a point cloud file.

        Args:
            file_path: Path to the input LAS/LAZ file.
            output_path: Path to save the output file.
            decimation_factor: Decimation factor (2=half, 4=quarter, etc.).

        Returns:
            Dictionary with operation results.
        """
        start_time = time.perf_counter()

        file_path = Path(file_path)
        output_path = Path(output_path)

        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        logger.info(
            "Creating LOD file with decimation factor %d: %s -> %s",
            decimation_factor,
            file_path,
            output_path,
        )

        with laspy.open(str(file_path)) as las_file:
            header = las_file.header
            total_points = header.point_count
            output_points = total_points // decimation_factor

            # Create output file with same header
            output_header = laspy.LasHeader(
                point_format=header.point_format,
                version=header.version,
            )
            output_header.scales = header.scales
            output_header.offsets = header.offsets

            # Copy VLRs
            for vlr in header.vlrs:
                output_header.vlrs.append(vlr)

            with laspy.open(str(output_path), mode="w", header=output_header) as out_file:
                points_written = 0

                for chunk in las_file.chunk_iterator(1_000_000):
                    # Decimate
                    indices = np.arange(0, len(chunk), decimation_factor)

                    if len(indices) == 0:
                        continue

                    # Create decimated points
                    decimated = laspy.ScaleAwarePointRecord.zeros(
                        len(indices),
                        header=output_header,
                    )

                    # Copy all dimensions
                    for dim in chunk.point_format.dimension_names:
                        if hasattr(decimated, dim):
                            setattr(decimated, dim, getattr(chunk, dim)[indices])

                    out_file.write_points(decimated)
                    points_written += len(indices)

        processing_time = (time.perf_counter() - start_time) * 1000

        logger.info(
            "Created LOD file with %d points in %.2f ms",
            points_written,
            processing_time,
        )

        return {
            "success": True,
            "input_points": total_points,
            "output_points": points_written,
            "decimation_factor": decimation_factor,
            "output_path": str(output_path),
            "processing_time_ms": round(processing_time, 2),
        }
