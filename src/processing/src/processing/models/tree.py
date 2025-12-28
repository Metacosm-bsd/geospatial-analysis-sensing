"""
Pydantic models for tree data structures.

This module defines data models for representing detected trees and
their attributes using Pydantic for validation and serialization.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class TreeSpecies(str, Enum):
    """Common tree species classifications."""

    UNKNOWN = "unknown"
    CONIFER = "conifer"
    DECIDUOUS = "deciduous"
    PINE = "pine"
    SPRUCE = "spruce"
    FIR = "fir"
    OAK = "oak"
    MAPLE = "maple"
    BIRCH = "birch"


class HealthStatus(str, Enum):
    """Tree health status indicators."""

    HEALTHY = "healthy"
    STRESSED = "stressed"
    DECLINING = "declining"
    DEAD = "dead"
    UNKNOWN = "unknown"


class CrownMetrics(BaseModel):
    """
    Metrics describing a tree crown.

    Attributes:
        area: Crown area in square meters.
        perimeter: Crown perimeter in meters.
        diameter_ns: Crown diameter in north-south direction (meters).
        diameter_ew: Crown diameter in east-west direction (meters).
        asymmetry: Crown asymmetry ratio (0=symmetric, 1=highly asymmetric).
        compactness: Crown compactness index.
    """

    area: float = Field(ge=0, description="Crown area in square meters")
    perimeter: float | None = Field(
        default=None, ge=0, description="Crown perimeter in meters"
    )
    diameter_ns: float | None = Field(
        default=None, ge=0, description="North-south diameter in meters"
    )
    diameter_ew: float | None = Field(
        default=None, ge=0, description="East-west diameter in meters"
    )
    asymmetry: float | None = Field(
        default=None, ge=0, le=1, description="Crown asymmetry ratio"
    )
    compactness: float | None = Field(
        default=None, ge=0, le=1, description="Crown compactness index"
    )


class Tree(BaseModel):
    """
    Model representing a detected tree.

    Contains location, dimensional attributes, and derived metrics
    for an individual tree detected from LiDAR data.

    Attributes:
        id: Unique identifier for the tree.
        x: X coordinate (easting) in CRS units.
        y: Y coordinate (northing) in CRS units.
        height: Tree height in meters.
        crown_radius: Crown radius in meters.
        dbh: Diameter at breast height in centimeters.
        species: Tree species classification.
        health: Health status assessment.
        confidence: Detection confidence score (0-1).
        crown_metrics: Detailed crown measurements.
        metadata: Additional custom attributes.

    Example:
        >>> tree = Tree(
        ...     id="tree_00001",
        ...     x=500000.0,
        ...     y=4500000.0,
        ...     height=25.5,
        ...     crown_radius=4.2,
        ...     confidence=0.95,
        ... )
        >>> print(tree.model_dump_json())
    """

    id: str = Field(description="Unique tree identifier")
    x: float = Field(description="X coordinate (easting)")
    y: float = Field(description="Y coordinate (northing)")
    height: float = Field(ge=0, description="Tree height in meters")
    crown_radius: float | None = Field(
        default=None, ge=0, description="Crown radius in meters"
    )
    dbh: float | None = Field(
        default=None, ge=0, description="Diameter at breast height in cm"
    )
    species: TreeSpecies = Field(
        default=TreeSpecies.UNKNOWN, description="Tree species"
    )
    health: HealthStatus = Field(
        default=HealthStatus.UNKNOWN, description="Health status"
    )
    confidence: float = Field(
        default=1.0, ge=0, le=1, description="Detection confidence"
    )
    crown_metrics: CrownMetrics | None = Field(
        default=None, description="Detailed crown metrics"
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        """Ensure confidence is between 0 and 1."""
        if not 0 <= v <= 1:
            raise ValueError("Confidence must be between 0 and 1")
        return round(v, 4)

    @property
    def crown_area(self) -> float | None:
        """Calculate approximate crown area from radius."""
        if self.crown_radius is None:
            return None
        import math

        return math.pi * self.crown_radius**2

    @property
    def location(self) -> tuple[float, float]:
        """Return (x, y) coordinate tuple."""
        return (self.x, self.y)

    def to_geojson_feature(self) -> dict[str, Any]:
        """
        Convert tree to GeoJSON Feature format.

        Returns:
            GeoJSON Feature dictionary.
        """
        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [self.x, self.y],
            },
            "properties": {
                "id": self.id,
                "height": self.height,
                "crown_radius": self.crown_radius,
                "dbh": self.dbh,
                "species": self.species.value,
                "health": self.health.value,
                "confidence": self.confidence,
            },
        }


class TreeCollection(BaseModel):
    """
    Collection of detected trees.

    Provides container for multiple trees with metadata about the
    detection process and spatial extent.

    Attributes:
        trees: List of detected trees.
        source_file: Path to source LAS/LAZ file.
        detection_timestamp: When detection was performed.
        algorithm: Detection algorithm used.
        crs: Coordinate reference system.
        bounds: Spatial bounds (min_x, min_y, max_x, max_y).
    """

    trees: list[Tree] = Field(default_factory=list)
    source_file: str | None = Field(default=None, description="Source file path")
    detection_timestamp: datetime | None = Field(
        default=None, description="Detection timestamp"
    )
    algorithm: str | None = Field(
        default=None, description="Detection algorithm used"
    )
    crs: str | None = Field(default=None, description="Coordinate reference system")
    bounds: tuple[float, float, float, float] | None = Field(
        default=None, description="Spatial bounds (min_x, min_y, max_x, max_y)"
    )

    def __len__(self) -> int:
        """Return number of trees in collection."""
        return len(self.trees)

    def __iter__(self):
        """Iterate over trees."""
        return iter(self.trees)

    def __getitem__(self, index: int) -> Tree:
        """Get tree by index."""
        return self.trees[index]

    @property
    def tree_count(self) -> int:
        """Return total number of trees."""
        return len(self.trees)

    @property
    def mean_height(self) -> float | None:
        """Calculate mean tree height."""
        if not self.trees:
            return None
        return sum(t.height for t in self.trees) / len(self.trees)

    @property
    def max_height(self) -> float | None:
        """Return maximum tree height."""
        if not self.trees:
            return None
        return max(t.height for t in self.trees)

    @property
    def min_height(self) -> float | None:
        """Return minimum tree height."""
        if not self.trees:
            return None
        return min(t.height for t in self.trees)

    def filter_by_height(
        self,
        min_height: float | None = None,
        max_height: float | None = None,
    ) -> "TreeCollection":
        """
        Filter trees by height range.

        Args:
            min_height: Minimum height threshold.
            max_height: Maximum height threshold.

        Returns:
            New TreeCollection with filtered trees.
        """
        filtered = self.trees

        if min_height is not None:
            filtered = [t for t in filtered if t.height >= min_height]

        if max_height is not None:
            filtered = [t for t in filtered if t.height <= max_height]

        return TreeCollection(
            trees=filtered,
            source_file=self.source_file,
            detection_timestamp=self.detection_timestamp,
            algorithm=self.algorithm,
            crs=self.crs,
            bounds=self.bounds,
        )

    def filter_by_confidence(self, min_confidence: float = 0.5) -> "TreeCollection":
        """
        Filter trees by minimum confidence score.

        Args:
            min_confidence: Minimum confidence threshold (0-1).

        Returns:
            New TreeCollection with filtered trees.
        """
        filtered = [t for t in self.trees if t.confidence >= min_confidence]

        return TreeCollection(
            trees=filtered,
            source_file=self.source_file,
            detection_timestamp=self.detection_timestamp,
            algorithm=self.algorithm,
            crs=self.crs,
            bounds=self.bounds,
        )

    def to_geojson(self) -> dict[str, Any]:
        """
        Convert collection to GeoJSON FeatureCollection.

        Returns:
            GeoJSON FeatureCollection dictionary.
        """
        return {
            "type": "FeatureCollection",
            "features": [tree.to_geojson_feature() for tree in self.trees],
            "properties": {
                "source_file": self.source_file,
                "detection_timestamp": (
                    self.detection_timestamp.isoformat()
                    if self.detection_timestamp
                    else None
                ),
                "algorithm": self.algorithm,
                "tree_count": self.tree_count,
                "crs": self.crs,
            },
        }

    def get_statistics(self) -> dict[str, Any]:
        """
        Calculate summary statistics for the collection.

        Returns:
            Dictionary with collection statistics.
        """
        if not self.trees:
            return {"tree_count": 0}

        heights = [t.height for t in self.trees]
        radii = [t.crown_radius for t in self.trees if t.crown_radius is not None]
        confidences = [t.confidence for t in self.trees]

        import statistics

        stats = {
            "tree_count": len(self.trees),
            "height_stats": {
                "min": min(heights),
                "max": max(heights),
                "mean": statistics.mean(heights),
                "stdev": statistics.stdev(heights) if len(heights) > 1 else 0,
            },
            "confidence_stats": {
                "min": min(confidences),
                "max": max(confidences),
                "mean": statistics.mean(confidences),
            },
        }

        if radii:
            stats["crown_radius_stats"] = {
                "min": min(radii),
                "max": max(radii),
                "mean": statistics.mean(radii),
            }

        # Species distribution
        species_counts: dict[str, int] = {}
        for tree in self.trees:
            species = tree.species.value
            species_counts[species] = species_counts.get(species, 0) + 1
        stats["species_distribution"] = species_counts

        return stats
