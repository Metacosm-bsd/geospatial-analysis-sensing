"""
Spatial Data Exporter Service.

Exports forest inventory data to spatial formats including
Shapefile, GeoJSON, and GeoPackage.

Sprint 21-24: FIA Reports & Export
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

logger = logging.getLogger(__name__)


class ExportFormat(str, Enum):
    """Supported export formats."""

    GEOJSON = "geojson"
    SHAPEFILE = "shapefile"
    GEOPACKAGE = "geopackage"
    KML = "kml"
    CSV = "csv"


class GeometryType(str, Enum):
    """Geometry types."""

    POINT = "Point"
    POLYGON = "Polygon"
    MULTIPOLYGON = "MultiPolygon"


@dataclass
class ExportResult:
    """Result of spatial export operation."""

    format: ExportFormat
    file_path: str | None
    file_bytes: bytes | None
    feature_count: int
    geometry_type: GeometryType
    crs: str
    created_at: datetime


class SpatialExporter:
    """
    Exports forest inventory data to spatial formats.

    Supports:
    - GeoJSON: Web-friendly JSON format
    - Shapefile: Traditional GIS format (zipped)
    - GeoPackage: Modern SQLite-based format
    - KML: Google Earth format
    - CSV: With WKT geometry column
    """

    def __init__(
        self,
        default_crs: str = "EPSG:4326",
        output_dir: str | None = None,
    ) -> None:
        """
        Initialize spatial exporter.

        Args:
            default_crs: Default coordinate reference system
            output_dir: Directory for output files (temp if None)
        """
        self.default_crs = default_crs
        self.output_dir = output_dir or tempfile.gettempdir()

        logger.info("Initialized SpatialExporter (CRS=%s)", default_crs)

    def export_trees(
        self,
        trees: list[dict[str, Any]],
        format: ExportFormat = ExportFormat.GEOJSON,
        filename: str | None = None,
        crs: str | None = None,
        include_attributes: list[str] | None = None,
    ) -> ExportResult:
        """
        Export tree data as point features.

        Args:
            trees: List of tree dictionaries
            format: Output format
            filename: Output filename (auto-generated if None)
            crs: Coordinate reference system
            include_attributes: Attributes to include (all if None)

        Returns:
            ExportResult with file path or bytes
        """
        crs = crs or self.default_crs

        # Convert to GeoJSON features
        features = self._trees_to_geojson_features(trees, include_attributes)

        geojson = {
            "type": "FeatureCollection",
            "crs": {
                "type": "name",
                "properties": {"name": crs},
            },
            "features": features,
        }

        # Export in requested format
        if format == ExportFormat.GEOJSON:
            return self._export_geojson(geojson, filename, GeometryType.POINT, crs)
        elif format == ExportFormat.SHAPEFILE:
            return self._export_shapefile(geojson, filename, GeometryType.POINT, crs)
        elif format == ExportFormat.KML:
            return self._export_kml(geojson, filename, GeometryType.POINT, crs)
        elif format == ExportFormat.CSV:
            return self._export_csv_with_wkt(geojson, filename, GeometryType.POINT, crs)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def export_stands(
        self,
        stands: list[dict[str, Any]],
        format: ExportFormat = ExportFormat.GEOJSON,
        filename: str | None = None,
        crs: str | None = None,
    ) -> ExportResult:
        """
        Export stand data as polygon features.

        Args:
            stands: List of stand dictionaries with boundary info
            format: Output format
            filename: Output filename
            crs: Coordinate reference system

        Returns:
            ExportResult with file path or bytes
        """
        crs = crs or self.default_crs

        # Convert to GeoJSON features
        features = self._stands_to_geojson_features(stands)

        geojson = {
            "type": "FeatureCollection",
            "crs": {
                "type": "name",
                "properties": {"name": crs},
            },
            "features": features,
        }

        # Export in requested format
        if format == ExportFormat.GEOJSON:
            return self._export_geojson(geojson, filename, GeometryType.POLYGON, crs)
        elif format == ExportFormat.SHAPEFILE:
            return self._export_shapefile(geojson, filename, GeometryType.POLYGON, crs)
        elif format == ExportFormat.KML:
            return self._export_kml(geojson, filename, GeometryType.POLYGON, crs)
        else:
            raise ValueError(f"Unsupported format for polygons: {format}")

    def _trees_to_geojson_features(
        self,
        trees: list[dict[str, Any]],
        include_attributes: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Convert trees to GeoJSON point features."""
        features = []

        # Default attributes to include
        default_attrs = [
            "tree_id", "id", "height", "height_m", "dbh", "dbh_cm",
            "crown_diameter", "crownDiameter", "species_code", "speciesCode",
            "species", "volume", "volume_m3", "biomass", "biomass_kg",
            "carbon_kg", "basal_area_m2", "confidence",
        ]

        attrs_to_include = include_attributes or default_attrs

        for tree in trees:
            # Get coordinates
            x = tree.get("x") or tree.get("position", {}).get("x")
            y = tree.get("y") or tree.get("position", {}).get("y")
            z = tree.get("z") or tree.get("position", {}).get("z", 0)

            if x is None or y is None:
                continue

            # Build properties
            properties = {}
            for attr in attrs_to_include:
                if attr in tree:
                    value = tree[attr]
                    # Ensure JSON serializable
                    if isinstance(value, (int, float, str, bool, type(None))):
                        properties[attr] = value
                    else:
                        properties[attr] = str(value)

            # Standardize property names
            if "tree_id" not in properties and "id" in properties:
                properties["tree_id"] = properties.pop("id")
            if "height_m" not in properties and "height" in properties:
                properties["height_m"] = properties.get("height")
            if "dbh_cm" not in properties and "dbh" in properties:
                properties["dbh_cm"] = properties.get("dbh")

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(x), float(y), float(z)] if z else [float(x), float(y)],
                },
                "properties": properties,
            }
            features.append(feature)

        return features

    def _stands_to_geojson_features(
        self,
        stands: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Convert stands to GeoJSON polygon features."""
        features = []

        for stand in stands:
            # Get boundary
            boundary = stand.get("boundary") or stand.get("summary", {}).get("boundary")

            if not boundary:
                continue

            vertices = boundary.get("vertices", [])
            if len(vertices) < 3:
                continue

            # Create polygon coordinates (close the ring)
            coords = [[float(v[0]), float(v[1])] for v in vertices]
            if coords[0] != coords[-1]:
                coords.append(coords[0])

            # Build properties
            summary = stand.get("summary", stand)
            properties = {
                "stand_id": stand.get("stand_id") or summary.get("stand_id", ""),
                "tree_count": summary.get("tree_count", 0),
                "area_hectares": summary.get("area_hectares", 0),
                "stems_per_ha": summary.get("stems_per_hectare", 0),
                "mean_height_m": summary.get("mean_height_m", 0),
                "dom_height_m": summary.get("dominant_height_m", 0),
                "mean_dbh_cm": summary.get("mean_dbh_cm", 0),
                "qmd_cm": summary.get("quadratic_mean_dbh_cm", 0),
                "ba_m2_ha": summary.get("basal_area_m2_ha", 0),
                "vol_m3_ha": summary.get("volume_m3_ha", 0),
                "bio_t_ha": summary.get("biomass_tonnes_ha", 0),
                "carbon_t_ha": summary.get("carbon_tonnes_ha", 0),
                "dom_species": summary.get("dominant_species", ""),
                "stand_type": str(summary.get("stand_type", "")),
                "size_class": str(summary.get("size_class", "")),
                "stocking_pct": summary.get("stocking_percent", 0),
            }

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords],
                },
                "properties": properties,
            }
            features.append(feature)

        return features

    def _export_geojson(
        self,
        geojson: dict[str, Any],
        filename: str | None,
        geom_type: GeometryType,
        crs: str,
    ) -> ExportResult:
        """Export to GeoJSON format."""
        filename = filename or f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.geojson"
        if not filename.endswith(".geojson"):
            filename += ".geojson"

        file_path = os.path.join(self.output_dir, filename)

        json_str = json.dumps(geojson, indent=2)
        file_bytes = json_str.encode("utf-8")

        with open(file_path, "w") as f:
            f.write(json_str)

        return ExportResult(
            format=ExportFormat.GEOJSON,
            file_path=file_path,
            file_bytes=file_bytes,
            feature_count=len(geojson.get("features", [])),
            geometry_type=geom_type,
            crs=crs,
            created_at=datetime.now(),
        )

    def _export_shapefile(
        self,
        geojson: dict[str, Any],
        filename: str | None,
        geom_type: GeometryType,
        crs: str,
    ) -> ExportResult:
        """
        Export to Shapefile format (zipped).

        Creates .shp, .shx, .dbf, .prj files in a zip archive.
        Uses pure Python implementation without GDAL.
        """
        filename = filename or f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        if filename.endswith(".shp") or filename.endswith(".zip"):
            filename = filename.rsplit(".", 1)[0]

        features = geojson.get("features", [])
        if not features:
            raise ValueError("No features to export")

        # Create temporary directory for shapefile components
        temp_dir = tempfile.mkdtemp()

        try:
            # Write shapefile components
            shp_path = os.path.join(temp_dir, f"{filename}.shp")
            shx_path = os.path.join(temp_dir, f"{filename}.shx")
            dbf_path = os.path.join(temp_dir, f"{filename}.dbf")
            prj_path = os.path.join(temp_dir, f"{filename}.prj")

            # Write using simple shapefile writer
            self._write_shapefile_components(
                features, shp_path, shx_path, dbf_path, geom_type
            )

            # Write PRJ file
            self._write_prj_file(prj_path, crs)

            # Create zip archive
            zip_path = os.path.join(self.output_dir, f"{filename}.zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for ext in [".shp", ".shx", ".dbf", ".prj"]:
                    src_path = os.path.join(temp_dir, f"{filename}{ext}")
                    if os.path.exists(src_path):
                        zf.write(src_path, f"{filename}{ext}")

            # Read zip bytes
            with open(zip_path, "rb") as f:
                file_bytes = f.read()

            return ExportResult(
                format=ExportFormat.SHAPEFILE,
                file_path=zip_path,
                file_bytes=file_bytes,
                feature_count=len(features),
                geometry_type=geom_type,
                crs=crs,
                created_at=datetime.now(),
            )

        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _write_shapefile_components(
        self,
        features: list[dict[str, Any]],
        shp_path: str,
        shx_path: str,
        dbf_path: str,
        geom_type: GeometryType,
    ) -> None:
        """Write shapefile components using pure Python."""
        import struct

        # Determine bounds
        min_x = min_y = float("inf")
        max_x = max_y = float("-inf")

        for feature in features:
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [])
            if geom_type == GeometryType.POINT:
                if len(coords) >= 2:
                    min_x = min(min_x, coords[0])
                    max_x = max(max_x, coords[0])
                    min_y = min(min_y, coords[1])
                    max_y = max(max_y, coords[1])
            elif geom_type == GeometryType.POLYGON:
                for ring in coords:
                    for pt in ring:
                        if len(pt) >= 2:
                            min_x = min(min_x, pt[0])
                            max_x = max(max_x, pt[0])
                            min_y = min(min_y, pt[1])
                            max_y = max(max_y, pt[1])

        # Shape type codes
        shape_type = 1 if geom_type == GeometryType.POINT else 5  # Point=1, Polygon=5

        # Write SHP file
        shp_records = []
        record_num = 1

        for feature in features:
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [])

            if geom_type == GeometryType.POINT:
                if len(coords) >= 2:
                    # Point record: shape_type (4 bytes) + x (8 bytes) + y (8 bytes)
                    record_data = struct.pack("<i", shape_type)
                    record_data += struct.pack("<d", coords[0])
                    record_data += struct.pack("<d", coords[1])
                    shp_records.append((record_num, record_data))
                    record_num += 1

            elif geom_type == GeometryType.POLYGON:
                if coords:
                    # Calculate polygon bounds
                    all_points = []
                    for ring in coords:
                        all_points.extend(ring)

                    if all_points:
                        ring_min_x = min(p[0] for p in all_points)
                        ring_max_x = max(p[0] for p in all_points)
                        ring_min_y = min(p[1] for p in all_points)
                        ring_max_y = max(p[1] for p in all_points)

                        # Polygon record structure
                        num_parts = len(coords)
                        num_points = sum(len(ring) for ring in coords)

                        record_data = struct.pack("<i", shape_type)
                        record_data += struct.pack("<4d", ring_min_x, ring_min_y, ring_max_x, ring_max_y)
                        record_data += struct.pack("<i", num_parts)
                        record_data += struct.pack("<i", num_points)

                        # Part indices
                        idx = 0
                        for ring in coords:
                            record_data += struct.pack("<i", idx)
                            idx += len(ring)

                        # Points
                        for ring in coords:
                            for pt in ring:
                                record_data += struct.pack("<2d", pt[0], pt[1])

                        shp_records.append((record_num, record_data))
                        record_num += 1

        # Calculate file length
        content_length = sum(8 + len(r[1]) for r in shp_records)  # 8 bytes per record header
        file_length = (100 + content_length) // 2  # In 16-bit words

        # Write SHP header
        with open(shp_path, "wb") as f:
            # File header (100 bytes)
            f.write(struct.pack(">i", 9994))  # File code
            f.write(b"\x00" * 20)  # Unused
            f.write(struct.pack(">i", file_length))  # File length in 16-bit words
            f.write(struct.pack("<i", 1000))  # Version
            f.write(struct.pack("<i", shape_type))  # Shape type
            f.write(struct.pack("<8d", min_x, min_y, max_x, max_y, 0, 0, 0, 0))  # Bounding box

            # Records
            for rec_num, rec_data in shp_records:
                content_len = len(rec_data) // 2
                f.write(struct.pack(">i", rec_num))
                f.write(struct.pack(">i", content_len))
                f.write(rec_data)

        # Write SHX file (index)
        with open(shx_path, "wb") as f:
            shx_length = (100 + 8 * len(shp_records)) // 2

            # Header
            f.write(struct.pack(">i", 9994))
            f.write(b"\x00" * 20)
            f.write(struct.pack(">i", shx_length))
            f.write(struct.pack("<i", 1000))
            f.write(struct.pack("<i", shape_type))
            f.write(struct.pack("<8d", min_x, min_y, max_x, max_y, 0, 0, 0, 0))

            # Index records
            offset = 50  # Header is 100 bytes = 50 words
            for rec_num, rec_data in shp_records:
                content_len = len(rec_data) // 2
                f.write(struct.pack(">i", offset))
                f.write(struct.pack(">i", content_len))
                offset += 4 + content_len  # Record header (8 bytes = 4 words) + content

        # Write DBF file (attributes)
        self._write_dbf_file(dbf_path, features)

    def _write_dbf_file(
        self,
        dbf_path: str,
        features: list[dict[str, Any]],
    ) -> None:
        """Write DBF file with feature attributes."""
        import struct

        if not features:
            return

        # Get all unique property keys and determine types
        all_keys = set()
        for f in features:
            all_keys.update(f.get("properties", {}).keys())

        # Limit field names to 10 characters (DBF limit)
        fields = []
        for key in sorted(all_keys):
            field_name = key[:10].upper()
            # Determine field type from first non-null value
            field_type = "C"  # Character (default)
            field_size = 50
            field_decimal = 0

            for f in features:
                val = f.get("properties", {}).get(key)
                if val is not None:
                    if isinstance(val, bool):
                        field_type = "L"
                        field_size = 1
                    elif isinstance(val, int):
                        field_type = "N"
                        field_size = 18
                        field_decimal = 0
                    elif isinstance(val, float):
                        field_type = "N"
                        field_size = 18
                        field_decimal = 8
                    else:
                        field_type = "C"
                        field_size = min(254, max(50, len(str(val))))
                    break

            fields.append((key, field_name, field_type, field_size, field_decimal))

        # Calculate header size
        header_size = 32 + (32 * len(fields)) + 1
        record_size = 1 + sum(f[3] for f in fields)  # 1 byte deletion flag + field sizes

        with open(dbf_path, "wb") as f:
            # Header
            f.write(struct.pack("<B", 3))  # Version (dBASE III)
            f.write(struct.pack("<3B", 24, 1, 1))  # Date (YY, MM, DD)
            f.write(struct.pack("<I", len(features)))  # Number of records
            f.write(struct.pack("<H", header_size))  # Header size
            f.write(struct.pack("<H", record_size))  # Record size
            f.write(b"\x00" * 20)  # Reserved

            # Field descriptors
            for key, name, ftype, size, decimal in fields:
                f.write(name.encode("ascii").ljust(11, b"\x00"))
                f.write(ftype.encode("ascii"))
                f.write(b"\x00" * 4)  # Reserved
                f.write(struct.pack("<B", size))
                f.write(struct.pack("<B", decimal))
                f.write(b"\x00" * 14)  # Reserved

            f.write(b"\x0d")  # Header terminator

            # Records
            for feature in features:
                props = feature.get("properties", {})
                f.write(b" ")  # Deletion flag (space = not deleted)

                for key, name, ftype, size, decimal in fields:
                    val = props.get(key, "")

                    if ftype == "N":
                        if val is None or val == "":
                            val_str = " " * size
                        else:
                            if decimal > 0:
                                val_str = f"{float(val):{size}.{decimal}f}"
                            else:
                                val_str = f"{int(val):{size}d}"
                    elif ftype == "L":
                        val_str = "T" if val else "F"
                    else:
                        val_str = str(val) if val is not None else ""

                    # Pad or truncate to field size
                    val_bytes = val_str.encode("ascii", errors="replace")[:size].ljust(size)
                    f.write(val_bytes)

            f.write(b"\x1a")  # EOF marker

    def _write_prj_file(self, prj_path: str, crs: str) -> None:
        """Write PRJ file with coordinate system definition."""
        # Common CRS WKT strings
        crs_wkt = {
            "EPSG:4326": 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]',
            "EPSG:3857": 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]',
            "EPSG:32610": 'PROJCS["WGS_1984_UTM_Zone_10N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-123],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["Meter",1]]',
        }

        wkt = crs_wkt.get(crs, crs_wkt["EPSG:4326"])

        with open(prj_path, "w") as f:
            f.write(wkt)

    def _export_kml(
        self,
        geojson: dict[str, Any],
        filename: str | None,
        geom_type: GeometryType,
        crs: str,
    ) -> ExportResult:
        """Export to KML format for Google Earth."""
        filename = filename or f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.kml"
        if not filename.endswith(".kml"):
            filename += ".kml"

        features = geojson.get("features", [])

        # Build KML document
        kml_parts = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<kml xmlns="http://www.opengis.net/kml/2.2">',
            "<Document>",
            f"<name>{filename}</name>",
        ]

        for feature in features:
            geom = feature.get("geometry", {})
            props = feature.get("properties", {})
            coords = geom.get("coordinates", [])

            name = props.get("tree_id") or props.get("stand_id") or "Feature"

            kml_parts.append("<Placemark>")
            kml_parts.append(f"<name>{name}</name>")

            # Description from properties
            desc_parts = []
            for k, v in props.items():
                if v is not None:
                    desc_parts.append(f"{k}: {v}")
            if desc_parts:
                kml_parts.append(f"<description>{chr(10).join(desc_parts)}</description>")

            # Geometry
            if geom_type == GeometryType.POINT:
                if len(coords) >= 2:
                    z = coords[2] if len(coords) > 2 else 0
                    kml_parts.append("<Point>")
                    kml_parts.append(f"<coordinates>{coords[0]},{coords[1]},{z}</coordinates>")
                    kml_parts.append("</Point>")

            elif geom_type == GeometryType.POLYGON:
                kml_parts.append("<Polygon>")
                kml_parts.append("<outerBoundaryIs><LinearRing><coordinates>")

                if coords:
                    coord_strs = []
                    for ring in coords[:1]:  # Outer ring only
                        for pt in ring:
                            z = pt[2] if len(pt) > 2 else 0
                            coord_strs.append(f"{pt[0]},{pt[1]},{z}")
                    kml_parts.append(" ".join(coord_strs))

                kml_parts.append("</coordinates></LinearRing></outerBoundaryIs>")
                kml_parts.append("</Polygon>")

            kml_parts.append("</Placemark>")

        kml_parts.extend(["</Document>", "</kml>"])

        kml_str = "\n".join(kml_parts)
        file_bytes = kml_str.encode("utf-8")

        file_path = os.path.join(self.output_dir, filename)
        with open(file_path, "w") as f:
            f.write(kml_str)

        return ExportResult(
            format=ExportFormat.KML,
            file_path=file_path,
            file_bytes=file_bytes,
            feature_count=len(features),
            geometry_type=geom_type,
            crs="EPSG:4326",  # KML is always WGS84
            created_at=datetime.now(),
        )

    def _export_csv_with_wkt(
        self,
        geojson: dict[str, Any],
        filename: str | None,
        geom_type: GeometryType,
        crs: str,
    ) -> ExportResult:
        """Export to CSV with WKT geometry column."""
        filename = filename or f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        if not filename.endswith(".csv"):
            filename += ".csv"

        features = geojson.get("features", [])

        if not features:
            raise ValueError("No features to export")

        # Get all property keys
        all_keys = set()
        for f in features:
            all_keys.update(f.get("properties", {}).keys())
        all_keys = sorted(all_keys)

        # Build CSV
        headers = ["WKT"] + list(all_keys)
        rows = [",".join(headers)]

        for feature in features:
            geom = feature.get("geometry", {})
            props = feature.get("properties", {})
            coords = geom.get("coordinates", [])

            # Convert geometry to WKT
            if geom_type == GeometryType.POINT:
                if len(coords) >= 2:
                    wkt = f"POINT ({coords[0]} {coords[1]})"
                else:
                    wkt = ""
            elif geom_type == GeometryType.POLYGON:
                if coords:
                    ring_strs = []
                    for ring in coords:
                        pts = ", ".join(f"{p[0]} {p[1]}" for p in ring)
                        ring_strs.append(f"({pts})")
                    wkt = f"POLYGON ({', '.join(ring_strs)})"
                else:
                    wkt = ""
            else:
                wkt = ""

            # Build row
            row_values = [f'"{wkt}"']
            for key in all_keys:
                val = props.get(key, "")
                if val is None:
                    val = ""
                elif isinstance(val, str):
                    val = f'"{val}"'
                else:
                    val = str(val)
                row_values.append(val)

            rows.append(",".join(row_values))

        csv_str = "\n".join(rows)
        file_bytes = csv_str.encode("utf-8")

        file_path = os.path.join(self.output_dir, filename)
        with open(file_path, "w") as f:
            f.write(csv_str)

        return ExportResult(
            format=ExportFormat.CSV,
            file_path=file_path,
            file_bytes=file_bytes,
            feature_count=len(features),
            geometry_type=geom_type,
            crs=crs,
            created_at=datetime.now(),
        )
