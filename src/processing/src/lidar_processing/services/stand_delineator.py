"""
Stand Delineation Service.

This module provides algorithms for delineating forest stands from
individual tree data using spatial clustering and attribute-based
segmentation.

Sprint 21-24: FIA Reports & Export
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

import numpy as np
from scipy.spatial import ConvexHull, Delaunay
from scipy.ndimage import label
from sklearn.cluster import DBSCAN, KMeans

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class DelineationMethod(str, Enum):
    """Stand delineation methods."""

    DBSCAN = "dbscan"  # Density-based spatial clustering
    KMEANS = "kmeans"  # K-means clustering
    GRID = "grid"  # Regular grid-based
    CHM = "chm"  # Canopy Height Model segmentation
    ATTRIBUTE = "attribute"  # Attribute-based (species, height class)


class StandType(str, Enum):
    """Forest stand type classification."""

    EVEN_AGED = "even_aged"
    UNEVEN_AGED = "uneven_aged"
    TWO_AGED = "two_aged"
    MIXED = "mixed"


class SizeClass(str, Enum):
    """FIA size class definitions."""

    SEEDLING = "seedling"  # <2.5cm DBH
    SAPLING = "sapling"  # 2.5-12.5cm DBH
    POLETIMBER = "poletimber"  # 12.5-27.5cm DBH (softwood) or 12.5-27.5cm (hardwood)
    SAWTIMBER = "sawtimber"  # >27.5cm DBH


@dataclass
class TreeData:
    """Tree data for stand delineation."""

    tree_id: str
    x: float
    y: float
    z: float
    height: float
    dbh: float | None = None
    crown_diameter: float | None = None
    species_code: str | None = None
    volume: float | None = None
    biomass: float | None = None


@dataclass
class StandBoundary:
    """Stand boundary polygon."""

    vertices: list[tuple[float, float]]  # (x, y) coordinates
    area_m2: float
    perimeter_m: float
    centroid: tuple[float, float]


@dataclass
class StandSummary:
    """Summary statistics for a forest stand."""

    stand_id: str
    tree_count: int
    area_hectares: float
    stems_per_hectare: float

    # Height metrics
    mean_height_m: float
    dominant_height_m: float
    height_std: float

    # DBH metrics
    mean_dbh_cm: float
    quadratic_mean_dbh_cm: float
    dbh_std: float

    # Basal area
    basal_area_m2_ha: float
    basal_area_total_m2: float

    # Volume
    volume_m3_ha: float
    volume_total_m3: float

    # Biomass and carbon
    biomass_tonnes_ha: float
    carbon_tonnes_ha: float

    # Species composition
    species_composition: dict[str, float]  # species_code -> percentage
    dominant_species: str

    # Structure
    stand_type: StandType
    size_class: SizeClass

    # Stocking
    relative_density: float  # SDI or similar
    stocking_percent: float

    # Boundary
    boundary: StandBoundary | None = None


@dataclass
class Stand:
    """A forest stand with trees and summary."""

    stand_id: str
    trees: list[TreeData]
    summary: StandSummary
    boundary: StandBoundary | None = None


@dataclass
class DelineationResult:
    """Result of stand delineation."""

    stands: list[Stand]
    unassigned_trees: list[TreeData]
    method: DelineationMethod
    parameters: dict[str, Any]
    total_area_hectares: float
    stand_count: int


class StandDelineator:
    """
    Service for delineating forest stands from tree data.

    Supports multiple delineation methods:
    - DBSCAN: Density-based clustering for irregular stands
    - KMeans: Fixed number of stands
    - Grid: Regular grid-based division
    - CHM: Canopy Height Model segmentation
    - Attribute: Group by species/size class
    """

    def __init__(
        self,
        min_stand_size: float = 0.5,  # Minimum stand size in hectares
        min_trees_per_stand: int = 10,
        default_method: DelineationMethod = DelineationMethod.DBSCAN,
    ) -> None:
        """
        Initialize stand delineator.

        Args:
            min_stand_size: Minimum stand size in hectares
            min_trees_per_stand: Minimum number of trees per stand
            default_method: Default delineation method
        """
        self.min_stand_size = min_stand_size
        self.min_trees_per_stand = min_trees_per_stand
        self.default_method = default_method

        logger.info(
            "Initialized StandDelineator (min_size=%.2f ha, min_trees=%d)",
            min_stand_size,
            min_trees_per_stand,
        )

    def delineate(
        self,
        trees: list[dict[str, Any]],
        method: DelineationMethod | None = None,
        **kwargs: Any,
    ) -> DelineationResult:
        """
        Delineate stands from tree data.

        Args:
            trees: List of tree dictionaries with x, y, height, etc.
            method: Delineation method to use
            **kwargs: Method-specific parameters

        Returns:
            DelineationResult with stands and summaries
        """
        if not trees:
            return DelineationResult(
                stands=[],
                unassigned_trees=[],
                method=method or self.default_method,
                parameters=kwargs,
                total_area_hectares=0.0,
                stand_count=0,
            )

        # Convert to TreeData objects
        tree_data = self._convert_trees(trees)

        method = method or self.default_method

        # Run delineation based on method
        if method == DelineationMethod.DBSCAN:
            labels = self._delineate_dbscan(tree_data, **kwargs)
        elif method == DelineationMethod.KMEANS:
            labels = self._delineate_kmeans(tree_data, **kwargs)
        elif method == DelineationMethod.GRID:
            labels = self._delineate_grid(tree_data, **kwargs)
        elif method == DelineationMethod.ATTRIBUTE:
            labels = self._delineate_attribute(tree_data, **kwargs)
        else:
            labels = self._delineate_dbscan(tree_data, **kwargs)

        # Group trees by stand
        stands, unassigned = self._group_by_labels(tree_data, labels)

        # Calculate summaries and boundaries
        final_stands = []
        for stand_id, stand_trees in stands.items():
            summary = self._calculate_stand_summary(stand_id, stand_trees)
            boundary = self._calculate_boundary(stand_trees)

            if boundary:
                summary.boundary = boundary

            final_stands.append(
                Stand(
                    stand_id=stand_id,
                    trees=stand_trees,
                    summary=summary,
                    boundary=boundary,
                )
            )

        # Sort by area (largest first)
        final_stands.sort(key=lambda s: s.summary.area_hectares, reverse=True)

        # Calculate total area
        total_area = sum(s.summary.area_hectares for s in final_stands)

        return DelineationResult(
            stands=final_stands,
            unassigned_trees=unassigned,
            method=method,
            parameters=kwargs,
            total_area_hectares=round(total_area, 2),
            stand_count=len(final_stands),
        )

    def _convert_trees(self, trees: list[dict[str, Any]]) -> list[TreeData]:
        """Convert tree dictionaries to TreeData objects."""
        tree_data = []

        for i, tree in enumerate(trees):
            try:
                td = TreeData(
                    tree_id=str(tree.get("tree_id", tree.get("id", i))),
                    x=float(tree.get("x", tree.get("position", {}).get("x", 0))),
                    y=float(tree.get("y", tree.get("position", {}).get("y", 0))),
                    z=float(tree.get("z", tree.get("position", {}).get("z", 0))),
                    height=float(tree.get("height", 0)),
                    dbh=tree.get("dbh") or tree.get("dbh_cm"),
                    crown_diameter=tree.get("crown_diameter") or tree.get("crownDiameter"),
                    species_code=tree.get("species_code") or tree.get("speciesCode"),
                    volume=tree.get("volume"),
                    biomass=tree.get("biomass"),
                )
                tree_data.append(td)
            except (ValueError, TypeError) as e:
                logger.warning("Failed to convert tree %s: %s", i, e)

        return tree_data

    def _delineate_dbscan(
        self,
        trees: list[TreeData],
        eps: float = 30.0,  # Maximum distance between samples (meters)
        min_samples: int = 5,
        **_kwargs: Any,
    ) -> NDArray[np.int32]:
        """
        Delineate stands using DBSCAN clustering.

        Args:
            trees: List of TreeData objects
            eps: Maximum distance between points in a cluster
            min_samples: Minimum samples in a cluster

        Returns:
            Array of cluster labels (-1 for noise)
        """
        if len(trees) < min_samples:
            return np.zeros(len(trees), dtype=np.int32)

        # Extract coordinates
        coords = np.array([[t.x, t.y] for t in trees])

        # Run DBSCAN
        clustering = DBSCAN(eps=eps, min_samples=min_samples).fit(coords)

        return clustering.labels_

    def _delineate_kmeans(
        self,
        trees: list[TreeData],
        n_clusters: int | None = None,
        target_stand_size_ha: float = 2.0,
        **_kwargs: Any,
    ) -> NDArray[np.int32]:
        """
        Delineate stands using K-means clustering.

        Args:
            trees: List of TreeData objects
            n_clusters: Number of clusters (auto if None)
            target_stand_size_ha: Target stand size for auto clustering

        Returns:
            Array of cluster labels
        """
        if len(trees) < 2:
            return np.zeros(len(trees), dtype=np.int32)

        # Extract coordinates
        coords = np.array([[t.x, t.y] for t in trees])

        # Estimate number of clusters if not provided
        if n_clusters is None:
            # Estimate total area
            if len(coords) > 2:
                try:
                    hull = ConvexHull(coords)
                    total_area_ha = hull.volume / 10000  # m² to ha
                except Exception:
                    # Fallback: bounding box
                    extent = np.ptp(coords, axis=0)
                    total_area_ha = (extent[0] * extent[1]) / 10000

                n_clusters = max(1, int(total_area_ha / target_stand_size_ha))
            else:
                n_clusters = 1

        n_clusters = min(n_clusters, len(trees))

        # Run K-means
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(coords)

        return labels

    def _delineate_grid(
        self,
        trees: list[TreeData],
        cell_size: float = 100.0,  # Grid cell size in meters
        **_kwargs: Any,
    ) -> NDArray[np.int32]:
        """
        Delineate stands using a regular grid.

        Args:
            trees: List of TreeData objects
            cell_size: Grid cell size in meters

        Returns:
            Array of cluster labels
        """
        if not trees:
            return np.array([], dtype=np.int32)

        coords = np.array([[t.x, t.y] for t in trees])

        # Calculate grid indices
        min_coords = coords.min(axis=0)
        grid_indices = ((coords - min_coords) / cell_size).astype(int)

        # Create unique labels for each grid cell
        max_col = grid_indices[:, 0].max() + 1
        labels = grid_indices[:, 0] + grid_indices[:, 1] * max_col

        # Relabel to consecutive integers
        unique_labels = np.unique(labels)
        label_map = {old: new for new, old in enumerate(unique_labels)}
        labels = np.array([label_map[l] for l in labels], dtype=np.int32)

        return labels

    def _delineate_attribute(
        self,
        trees: list[TreeData],
        attribute: str = "species_code",
        height_classes: int = 3,
        **_kwargs: Any,
    ) -> NDArray[np.int32]:
        """
        Delineate stands based on tree attributes.

        Args:
            trees: List of TreeData objects
            attribute: Attribute to group by ('species_code', 'height_class', 'combined')
            height_classes: Number of height classes

        Returns:
            Array of cluster labels
        """
        if not trees:
            return np.array([], dtype=np.int32)

        labels = []
        label_map: dict[str, int] = {}
        current_label = 0

        # Calculate height class boundaries
        heights = [t.height for t in trees if t.height > 0]
        if heights:
            height_bounds = np.percentile(
                heights,
                np.linspace(0, 100, height_classes + 1)[1:-1],
            )
        else:
            height_bounds = []

        for tree in trees:
            if attribute == "species_code":
                key = tree.species_code or "Unknown"
            elif attribute == "height_class":
                hc = self._get_height_class(tree.height, height_bounds)
                key = f"HC{hc}"
            else:  # combined
                species = tree.species_code or "Unknown"
                hc = self._get_height_class(tree.height, height_bounds)
                key = f"{species}_HC{hc}"

            if key not in label_map:
                label_map[key] = current_label
                current_label += 1

            labels.append(label_map[key])

        return np.array(labels, dtype=np.int32)

    def _get_height_class(
        self,
        height: float,
        bounds: list[float] | NDArray[np.float64],
    ) -> int:
        """Get height class index."""
        for i, bound in enumerate(bounds):
            if height < bound:
                return i
        return len(bounds)

    def _group_by_labels(
        self,
        trees: list[TreeData],
        labels: NDArray[np.int32],
    ) -> tuple[dict[str, list[TreeData]], list[TreeData]]:
        """Group trees by cluster labels."""
        stands: dict[str, list[TreeData]] = {}
        unassigned: list[TreeData] = []

        for tree, label in zip(trees, labels):
            if label == -1:  # Noise/unassigned
                unassigned.append(tree)
            else:
                stand_id = f"S{label + 1:03d}"
                if stand_id not in stands:
                    stands[stand_id] = []
                stands[stand_id].append(tree)

        # Filter out stands that are too small
        filtered_stands: dict[str, list[TreeData]] = {}
        for stand_id, stand_trees in stands.items():
            if len(stand_trees) >= self.min_trees_per_stand:
                # Check area
                boundary = self._calculate_boundary(stand_trees)
                if boundary and boundary.area_m2 / 10000 >= self.min_stand_size:
                    filtered_stands[stand_id] = stand_trees
                else:
                    unassigned.extend(stand_trees)
            else:
                unassigned.extend(stand_trees)

        return filtered_stands, unassigned

    def _calculate_boundary(
        self,
        trees: list[TreeData],
    ) -> StandBoundary | None:
        """Calculate convex hull boundary for a stand."""
        if len(trees) < 3:
            return None

        coords = np.array([[t.x, t.y] for t in trees])

        try:
            hull = ConvexHull(coords)

            # Get vertices in order
            vertices = [(coords[i, 0], coords[i, 1]) for i in hull.vertices]

            # Calculate area and perimeter
            area = hull.volume  # In 2D, volume is area
            perimeter = sum(
                np.linalg.norm(coords[hull.vertices[i]] - coords[hull.vertices[(i + 1) % len(hull.vertices)]])
                for i in range(len(hull.vertices))
            )

            # Calculate centroid
            centroid = (coords[:, 0].mean(), coords[:, 1].mean())

            return StandBoundary(
                vertices=vertices,
                area_m2=float(area),
                perimeter_m=float(perimeter),
                centroid=centroid,
            )

        except Exception as e:
            logger.warning("Failed to calculate boundary: %s", e)
            return None

    def _calculate_stand_summary(
        self,
        stand_id: str,
        trees: list[TreeData],
    ) -> StandSummary:
        """Calculate summary statistics for a stand."""
        n_trees = len(trees)

        # Get arrays
        heights = np.array([t.height for t in trees if t.height > 0])
        dbhs = np.array([t.dbh for t in trees if t.dbh and t.dbh > 0])
        volumes = np.array([t.volume for t in trees if t.volume and t.volume > 0])
        biomasses = np.array([t.biomass for t in trees if t.biomass and t.biomass > 0])

        # Calculate area from boundary
        boundary = self._calculate_boundary(trees)
        area_m2 = boundary.area_m2 if boundary else 0
        area_ha = area_m2 / 10000

        # Height metrics
        mean_height = float(np.mean(heights)) if len(heights) > 0 else 0
        dominant_height = float(np.percentile(heights, 80)) if len(heights) >= 10 else mean_height
        height_std = float(np.std(heights)) if len(heights) > 1 else 0

        # DBH metrics
        mean_dbh = float(np.mean(dbhs)) if len(dbhs) > 0 else 0
        qmd = float(np.sqrt(np.mean(dbhs ** 2))) if len(dbhs) > 0 else 0
        dbh_std = float(np.std(dbhs)) if len(dbhs) > 1 else 0

        # Basal area
        basal_areas = np.pi / 4 * (dbhs / 100) ** 2 if len(dbhs) > 0 else np.array([])
        ba_total = float(np.sum(basal_areas)) if len(basal_areas) > 0 else 0
        ba_ha = ba_total / area_ha if area_ha > 0 else 0

        # Volume
        vol_total = float(np.sum(volumes)) if len(volumes) > 0 else 0
        vol_ha = vol_total / area_ha if area_ha > 0 else 0

        # Biomass and carbon
        bio_total = float(np.sum(biomasses)) if len(biomasses) > 0 else 0
        bio_tonnes_ha = (bio_total / 1000) / area_ha if area_ha > 0 else 0
        carbon_tonnes_ha = bio_tonnes_ha * 0.47

        # Species composition
        species_counts: dict[str, int] = {}
        for tree in trees:
            sp = tree.species_code or "Unknown"
            species_counts[sp] = species_counts.get(sp, 0) + 1

        species_composition = {
            sp: count / n_trees * 100
            for sp, count in species_counts.items()
        }
        dominant_species = max(species_counts, key=species_counts.get) if species_counts else "Unknown"

        # Stand structure classification
        stand_type = self._classify_stand_type(heights)
        size_class = self._classify_size_class(mean_dbh)

        # Stocking
        stems_ha = n_trees / area_ha if area_ha > 0 else 0
        relative_density = self._calculate_sdi(qmd, stems_ha)
        stocking = min(100, relative_density / 4.5 * 100) if relative_density > 0 else 0

        return StandSummary(
            stand_id=stand_id,
            tree_count=n_trees,
            area_hectares=round(area_ha, 2),
            stems_per_hectare=round(stems_ha, 1),
            mean_height_m=round(mean_height, 2),
            dominant_height_m=round(dominant_height, 2),
            height_std=round(height_std, 2),
            mean_dbh_cm=round(mean_dbh, 1),
            quadratic_mean_dbh_cm=round(qmd, 1),
            dbh_std=round(dbh_std, 1),
            basal_area_m2_ha=round(ba_ha, 2),
            basal_area_total_m2=round(ba_total, 2),
            volume_m3_ha=round(vol_ha, 2),
            volume_total_m3=round(vol_total, 2),
            biomass_tonnes_ha=round(bio_tonnes_ha, 2),
            carbon_tonnes_ha=round(carbon_tonnes_ha, 2),
            species_composition=species_composition,
            dominant_species=dominant_species,
            stand_type=stand_type,
            size_class=size_class,
            relative_density=round(relative_density, 1),
            stocking_percent=round(stocking, 1),
            boundary=boundary,
        )

    def _classify_stand_type(self, heights: NDArray[np.float64]) -> StandType:
        """Classify stand structure type based on height distribution."""
        if len(heights) < 10:
            return StandType.MIXED

        # Calculate coefficient of variation
        cv = np.std(heights) / np.mean(heights) if np.mean(heights) > 0 else 0

        if cv < 0.15:
            return StandType.EVEN_AGED
        elif cv < 0.30:
            return StandType.TWO_AGED
        else:
            return StandType.UNEVEN_AGED

    def _classify_size_class(self, mean_dbh: float) -> SizeClass:
        """Classify stand by FIA size class."""
        if mean_dbh < 2.5:
            return SizeClass.SEEDLING
        elif mean_dbh < 12.5:
            return SizeClass.SAPLING
        elif mean_dbh < 27.5:
            return SizeClass.POLETIMBER
        else:
            return SizeClass.SAWTIMBER

    def _calculate_sdi(self, qmd: float, stems_ha: float) -> float:
        """
        Calculate Stand Density Index (Reineke).

        SDI = N * (QMD/25)^1.605

        Args:
            qmd: Quadratic mean diameter in cm
            stems_ha: Stems per hectare

        Returns:
            Stand Density Index
        """
        if qmd <= 0 or stems_ha <= 0:
            return 0

        return stems_ha * (qmd / 25) ** 1.605

    def to_geojson(self, result: DelineationResult) -> dict[str, Any]:
        """
        Convert delineation result to GeoJSON FeatureCollection.

        Args:
            result: DelineationResult to convert

        Returns:
            GeoJSON FeatureCollection
        """
        features = []

        for stand in result.stands:
            if stand.boundary:
                # Create polygon geometry
                coords = [[list(v) for v in stand.boundary.vertices]]
                # Close the ring
                if coords[0] and coords[0][0] != coords[0][-1]:
                    coords[0].append(coords[0][0])

                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": coords,
                    },
                    "properties": {
                        "stand_id": stand.stand_id,
                        "tree_count": stand.summary.tree_count,
                        "area_hectares": stand.summary.area_hectares,
                        "stems_per_hectare": stand.summary.stems_per_hectare,
                        "mean_height_m": stand.summary.mean_height_m,
                        "dominant_height_m": stand.summary.dominant_height_m,
                        "mean_dbh_cm": stand.summary.mean_dbh_cm,
                        "qmd_cm": stand.summary.quadratic_mean_dbh_cm,
                        "basal_area_m2_ha": stand.summary.basal_area_m2_ha,
                        "volume_m3_ha": stand.summary.volume_m3_ha,
                        "biomass_tonnes_ha": stand.summary.biomass_tonnes_ha,
                        "carbon_tonnes_ha": stand.summary.carbon_tonnes_ha,
                        "dominant_species": stand.summary.dominant_species,
                        "stand_type": stand.summary.stand_type.value,
                        "size_class": stand.summary.size_class.value,
                        "stocking_percent": stand.summary.stocking_percent,
                    },
                }
                features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "total_stands": result.stand_count,
                "total_area_hectares": result.total_area_hectares,
                "method": result.method.value,
            },
        }

    def trees_to_geojson(self, trees: list[TreeData]) -> dict[str, Any]:
        """
        Convert trees to GeoJSON FeatureCollection (points).

        Args:
            trees: List of TreeData objects

        Returns:
            GeoJSON FeatureCollection of points
        """
        features = []

        for tree in trees:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [tree.x, tree.y, tree.z],
                },
                "properties": {
                    "tree_id": tree.tree_id,
                    "height_m": tree.height,
                    "dbh_cm": tree.dbh,
                    "crown_diameter_m": tree.crown_diameter,
                    "species_code": tree.species_code,
                    "volume_m3": tree.volume,
                    "biomass_kg": tree.biomass,
                },
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
        }
