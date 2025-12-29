"""
Stand Analysis Service for Forest Inventory.

This module provides stand-level calculations and metrics aggregation
for forest inventory reports, following standard forestry conventions.
"""

from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from collections.abc import Sequence

from lidar_processing.models import (
    SizeClassDistribution,
    SpeciesMetrics,
    StandMetrics,
    TreeMetrics,
)

logger = logging.getLogger(__name__)


# Standard size class definitions
DBH_SIZE_CLASSES = [
    ("0-10cm", 0, 10),
    ("10-20cm", 10, 20),
    ("20-30cm", 20, 30),
    ("30-40cm", 30, 40),
    ("40-50cm", 40, 50),
    ("50-60cm", 50, 60),
    ("60+cm", 60, float("inf")),
]

HEIGHT_SIZE_CLASSES = [
    ("0-5m", 0, 5),
    ("5-10m", 5, 10),
    ("10-15m", 10, 15),
    ("15-20m", 15, 20),
    ("20-25m", 20, 25),
    ("25-30m", 25, 30),
    ("30+m", 30, float("inf")),
]

# Carbon conversion factor (IPCC default)
CARBON_FRACTION = 0.47

# CO2 to C molecular weight ratio
CO2_C_RATIO = 44 / 12


class StandAnalyzer:
    """
    Analyzes forest stands and calculates forestry metrics.

    Provides methods for calculating stand-level statistics including
    stems per hectare, basal area, volume, biomass, and species composition.
    """

    def __init__(self) -> None:
        """Initialize the stand analyzer."""
        pass

    def calculate_stand_metrics(
        self,
        trees: list[TreeMetrics],
        stand_boundary: dict[str, Any] | None = None,
        stand_id: str = "stand_1",
        stand_name: str | None = None,
        area_hectares: float | None = None,
    ) -> StandMetrics:
        """
        Calculate comprehensive metrics for a forest stand.

        Args:
            trees: List of trees within the stand.
            stand_boundary: Optional GeoJSON polygon defining stand boundary.
            stand_id: Unique identifier for the stand.
            stand_name: Optional name for the stand.
            area_hectares: Stand area in hectares. If not provided, calculated
                          from boundary or estimated from tree positions.

        Returns:
            StandMetrics with all calculated values.
        """
        if not trees:
            raise ValueError("Cannot calculate stand metrics with no trees")

        # Calculate area
        if area_hectares is not None:
            area = area_hectares
        elif stand_boundary:
            area = self._calculate_polygon_area(stand_boundary)
        else:
            area = self._estimate_area_from_trees(trees)

        if area <= 0:
            raise ValueError("Stand area must be positive")

        tree_count = len(trees)
        stems_per_ha = tree_count / area

        # Height statistics
        heights = [t.height for t in trees if t.height is not None]
        mean_height = np.mean(heights) if heights else 0
        dominant_height = self._calculate_dominant_height(heights)

        # DBH statistics and basal area
        dbhs = [t.dbh_estimated for t in trees if t.dbh_estimated is not None]
        mean_dbh = np.mean(dbhs) if dbhs else None
        qmd = self._calculate_qmd(dbhs) if dbhs else None

        # Basal area calculation (pi * (dbh/200)^2 for dbh in cm)
        basal_areas = [
            math.pi * (dbh / 200) ** 2
            for dbh in dbhs
            if dbh is not None and dbh > 0
        ]
        total_basal_area = sum(basal_areas) if basal_areas else None
        basal_area_per_ha = (
            total_basal_area / area if total_basal_area is not None else 0
        )

        # Volume calculation using simple taper equations
        total_volume = self._calculate_total_volume(trees)
        volume_per_ha = total_volume / area if total_volume else None

        # Biomass and carbon
        biomass_values = [
            t.biomass_estimated for t in trees if t.biomass_estimated is not None
        ]
        total_biomass = sum(biomass_values) if biomass_values else None
        biomass_per_ha = total_biomass / area if total_biomass else None

        total_carbon = total_biomass * CARBON_FRACTION if total_biomass else None
        carbon_per_ha = total_carbon / area if total_carbon else None

        # Species composition
        species_composition = self._calculate_species_composition(trees)

        # Size class distributions
        dbh_distribution = self._calculate_dbh_distribution(dbhs) if dbhs else []
        height_distribution = self._calculate_height_distribution(heights)

        return StandMetrics(
            stand_id=stand_id,
            stand_name=stand_name,
            area_hectares=round(area, 4),
            tree_count=tree_count,
            stems_per_hectare=round(stems_per_ha, 1),
            basal_area_per_hectare=round(basal_area_per_ha, 2),
            mean_height=round(mean_height, 2),
            dominant_height=round(dominant_height, 2) if dominant_height else None,
            mean_dbh=round(mean_dbh, 2) if mean_dbh else None,
            quadratic_mean_dbh=round(qmd, 2) if qmd else None,
            total_volume=round(total_volume, 2) if total_volume else None,
            volume_per_hectare=round(volume_per_ha, 2) if volume_per_ha else None,
            total_biomass=round(total_biomass, 2) if total_biomass else None,
            biomass_per_hectare=round(biomass_per_ha, 2) if biomass_per_ha else None,
            total_carbon=round(total_carbon, 2) if total_carbon else None,
            carbon_per_hectare=round(carbon_per_ha, 2) if carbon_per_ha else None,
            species_composition=species_composition,
            dbh_distribution=dbh_distribution,
            height_distribution=height_distribution,
        )

    def _calculate_dominant_height(
        self, heights: Sequence[float], top_percent: float = 0.2
    ) -> float | None:
        """
        Calculate dominant height (mean height of tallest trees).

        Uses the top 20% of trees by height, or top 100 stems per hectare,
        whichever is smaller.

        Args:
            heights: List of tree heights.
            top_percent: Percentage of tallest trees to include.

        Returns:
            Dominant height or None if insufficient data.
        """
        if not heights or len(heights) < 5:
            return None

        sorted_heights = sorted(heights, reverse=True)
        n_dominant = max(1, int(len(sorted_heights) * top_percent))
        dominant_trees = sorted_heights[:n_dominant]

        return float(np.mean(dominant_trees))

    def _calculate_qmd(self, dbhs: Sequence[float]) -> float | None:
        """
        Calculate quadratic mean diameter.

        QMD = sqrt(sum(d^2) / n)

        Args:
            dbhs: List of DBH values in cm.

        Returns:
            Quadratic mean diameter or None if no data.
        """
        if not dbhs:
            return None

        valid_dbhs = [d for d in dbhs if d is not None and d > 0]
        if not valid_dbhs:
            return None

        sum_d_squared = sum(d ** 2 for d in valid_dbhs)
        return math.sqrt(sum_d_squared / len(valid_dbhs))

    def _calculate_total_volume(self, trees: list[TreeMetrics]) -> float | None:
        """
        Calculate total stem volume using simple form factor.

        Uses the formula: V = BA * H * form_factor
        where form_factor = 0.5 (typical for conifers)

        Args:
            trees: List of tree metrics.

        Returns:
            Total volume in cubic meters or None.
        """
        form_factor = 0.5  # Simplified form factor
        total_volume = 0.0
        valid_count = 0

        for tree in trees:
            if tree.dbh_estimated is not None and tree.height is not None:
                dbh_m = tree.dbh_estimated / 100  # Convert cm to m
                basal_area = math.pi * (dbh_m / 2) ** 2
                volume = basal_area * tree.height * form_factor
                total_volume += volume
                valid_count += 1

        return total_volume if valid_count > 0 else None

    def _calculate_species_composition(
        self, trees: list[TreeMetrics]
    ) -> list[SpeciesMetrics]:
        """
        Calculate species composition metrics.

        Args:
            trees: List of tree metrics.

        Returns:
            List of species metrics sorted by tree count.
        """
        # Group trees by species
        species_groups: dict[str, list[TreeMetrics]] = {}

        for tree in trees:
            # Use "Unknown" if species not assigned
            species = getattr(tree, "species", None) or "Unknown"
            if species not in species_groups:
                species_groups[species] = []
            species_groups[species].append(tree)

        total_trees = len(trees)
        species_metrics = []

        for species_name, species_trees in species_groups.items():
            count = len(species_trees)
            percentage = (count / total_trees * 100) if total_trees > 0 else 0

            heights = [t.height for t in species_trees if t.height is not None]
            mean_height = float(np.mean(heights)) if heights else 0

            dbhs = [t.dbh_estimated for t in species_trees if t.dbh_estimated]
            mean_dbh = float(np.mean(dbhs)) if dbhs else None

            crowns = [t.crown_diameter for t in species_trees if t.crown_diameter]
            mean_crown = float(np.mean(crowns)) if crowns else None

            # Calculate totals
            if dbhs:
                basal_areas = [math.pi * (d / 200) ** 2 for d in dbhs]
                total_ba = sum(basal_areas)
            else:
                total_ba = None

            biomass_vals = [
                t.biomass_estimated for t in species_trees if t.biomass_estimated
            ]
            total_biomass = sum(biomass_vals) if biomass_vals else None
            total_carbon = (
                total_biomass * CARBON_FRACTION if total_biomass else None
            )

            species_metrics.append(
                SpeciesMetrics(
                    species_name=species_name,
                    tree_count=count,
                    percentage=round(percentage, 2),
                    mean_height=round(mean_height, 2),
                    mean_dbh=round(mean_dbh, 2) if mean_dbh else None,
                    mean_crown_diameter=round(mean_crown, 2) if mean_crown else None,
                    total_basal_area=round(total_ba, 4) if total_ba else None,
                    total_biomass=round(total_biomass, 2) if total_biomass else None,
                    total_carbon=round(total_carbon, 2) if total_carbon else None,
                )
            )

        # Sort by tree count descending
        species_metrics.sort(key=lambda x: x.tree_count, reverse=True)

        return species_metrics

    def _calculate_dbh_distribution(
        self, dbhs: Sequence[float]
    ) -> list[SizeClassDistribution]:
        """
        Calculate DBH size class distribution.

        Args:
            dbhs: List of DBH values in cm.

        Returns:
            List of size class distributions.
        """
        if not dbhs:
            return []

        total = len(dbhs)
        distribution = []

        for class_name, min_val, max_val in DBH_SIZE_CLASSES:
            count = sum(
                1 for d in dbhs
                if d is not None and min_val <= d < max_val
            )
            percentage = (count / total * 100) if total > 0 else 0

            distribution.append(
                SizeClassDistribution(
                    size_class=class_name,
                    min_value=min_val,
                    max_value=max_val if max_val != float("inf") else 999,
                    count=count,
                    percentage=round(percentage, 2),
                )
            )

        return distribution

    def _calculate_height_distribution(
        self, heights: Sequence[float]
    ) -> list[SizeClassDistribution]:
        """
        Calculate height size class distribution.

        Args:
            heights: List of tree heights in meters.

        Returns:
            List of size class distributions.
        """
        if not heights:
            return []

        total = len(heights)
        distribution = []

        for class_name, min_val, max_val in HEIGHT_SIZE_CLASSES:
            count = sum(
                1 for h in heights
                if h is not None and min_val <= h < max_val
            )
            percentage = (count / total * 100) if total > 0 else 0

            distribution.append(
                SizeClassDistribution(
                    size_class=class_name,
                    min_value=min_val,
                    max_value=max_val if max_val != float("inf") else 999,
                    count=count,
                    percentage=round(percentage, 2),
                )
            )

        return distribution

    def _calculate_polygon_area(self, boundary: dict[str, Any]) -> float:
        """
        Calculate area of a GeoJSON polygon in hectares.

        Args:
            boundary: GeoJSON polygon geometry.

        Returns:
            Area in hectares.
        """
        try:
            from shapely.geometry import shape

            geom = shape(boundary)
            # Assume coordinates are in meters
            area_sq_m = geom.area
            return area_sq_m / 10000  # Convert to hectares

        except Exception as e:
            logger.warning("Failed to calculate polygon area: %s", e)
            return 0

    def _estimate_area_from_trees(self, trees: list[TreeMetrics]) -> float:
        """
        Estimate survey area from tree positions using convex hull.

        Args:
            trees: List of tree metrics with coordinates.

        Returns:
            Estimated area in hectares.
        """
        if len(trees) < 3:
            # Can't form a polygon, estimate from spacing
            return len(trees) / 400  # Assume 400 trees/ha

        try:
            from scipy.spatial import ConvexHull

            points = np.array([[t.x, t.y] for t in trees if t.x and t.y])

            if len(points) < 3:
                return len(trees) / 400

            hull = ConvexHull(points)
            area_sq_m = hull.volume  # For 2D, volume gives area

            # Add buffer (hull underestimates by ~10-20%)
            buffer_factor = 1.15
            return (area_sq_m * buffer_factor) / 10000

        except Exception as e:
            logger.warning("Failed to estimate area from trees: %s", e)
            return len(trees) / 400

    def calculate_inventory_summary(
        self,
        trees: list[TreeMetrics],
        total_area_hectares: float,
    ) -> dict[str, Any]:
        """
        Calculate summary statistics for an entire inventory.

        Args:
            trees: List of all trees in the inventory.
            total_area_hectares: Total surveyed area.

        Returns:
            Dictionary with summary statistics.
        """
        if not trees:
            return {
                "total_trees": 0,
                "total_area_hectares": total_area_hectares,
                "stems_per_hectare": 0,
            }

        heights = [t.height for t in trees if t.height is not None]
        dbhs = [t.dbh_estimated for t in trees if t.dbh_estimated is not None]
        biomass_vals = [
            t.biomass_estimated for t in trees if t.biomass_estimated is not None
        ]

        total_trees = len(trees)
        stems_per_ha = total_trees / total_area_hectares if total_area_hectares > 0 else 0

        # Calculate basal area
        total_ba = None
        if dbhs:
            basal_areas = [math.pi * (d / 200) ** 2 for d in dbhs]
            total_ba = sum(basal_areas)

        total_biomass = sum(biomass_vals) if biomass_vals else None
        total_carbon = total_biomass * CARBON_FRACTION if total_biomass else None
        co2_equivalent = total_carbon * CO2_C_RATIO if total_carbon else None

        # Get unique species
        species_set = set()
        for tree in trees:
            species = getattr(tree, "species", None)
            if species:
                species_set.add(species)

        return {
            "total_trees": total_trees,
            "total_area_hectares": round(total_area_hectares, 4),
            "stems_per_hectare": round(stems_per_ha, 1),
            "mean_height": round(float(np.mean(heights)), 2) if heights else None,
            "max_height": round(float(np.max(heights)), 2) if heights else None,
            "min_height": round(float(np.min(heights)), 2) if heights else None,
            "std_height": round(float(np.std(heights)), 2) if heights else None,
            "mean_dbh": round(float(np.mean(dbhs)), 2) if dbhs else None,
            "total_basal_area": round(total_ba, 4) if total_ba else None,
            "basal_area_per_hectare": (
                round(total_ba / total_area_hectares, 2)
                if total_ba and total_area_hectares > 0
                else None
            ),
            "total_volume": self._calculate_total_volume(trees),
            "total_biomass": round(total_biomass, 2) if total_biomass else None,
            "total_carbon": round(total_carbon, 2) if total_carbon else None,
            "co2_equivalent": round(co2_equivalent, 2) if co2_equivalent else None,
            "species_count": len(species_set),
        }

    def get_species_counts(self, trees: list[TreeMetrics]) -> dict[str, int]:
        """
        Get tree counts by species.

        Args:
            trees: List of tree metrics.

        Returns:
            Dictionary mapping species names to counts.
        """
        counts: dict[str, int] = {}
        for tree in trees:
            species = getattr(tree, "species", None) or "Unknown"
            counts[species] = counts.get(species, 0) + 1
        return counts

    def get_species_biomass(self, trees: list[TreeMetrics]) -> dict[str, float]:
        """
        Get total biomass by species.

        Args:
            trees: List of tree metrics.

        Returns:
            Dictionary mapping species names to total biomass.
        """
        biomass: dict[str, float] = {}
        for tree in trees:
            if tree.biomass_estimated is not None:
                species = getattr(tree, "species", None) or "Unknown"
                biomass[species] = biomass.get(species, 0) + tree.biomass_estimated
        return biomass
