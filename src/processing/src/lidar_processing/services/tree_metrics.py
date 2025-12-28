"""
Tree Metrics Extraction Service.

This module provides comprehensive tree metric extraction from LiDAR
point clouds, including height, crown dimensions, DBH estimation,
and biomass calculations using allometric equations.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

import numpy as np
from scipy import ndimage

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import TreeMetrics

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class SpeciesGroup(str, Enum):
    """Species groups for allometric equations."""

    SOFTWOOD = "softwood"
    HARDWOOD = "hardwood"
    MIXED = "mixed"
    TROPICAL = "tropical"
    UNKNOWN = "unknown"


@dataclass
class AllometricCoefficients:
    """Coefficients for allometric equations."""

    # Height-DBH relationship: DBH = a * H^b
    height_dbh_a: float
    height_dbh_b: float

    # DBH-Biomass relationship: Biomass = a * DBH^b
    dbh_biomass_a: float
    dbh_biomass_b: float

    # Crown-DBH relationship: Crown = a * DBH^b
    crown_dbh_a: float
    crown_dbh_b: float


# Allometric coefficients by species group
# Based on Jenkins et al. (2003) and other published equations
ALLOMETRIC_COEFFICIENTS: dict[SpeciesGroup, AllometricCoefficients] = {
    SpeciesGroup.SOFTWOOD: AllometricCoefficients(
        height_dbh_a=2.1,
        height_dbh_b=1.15,
        dbh_biomass_a=0.0936,
        dbh_biomass_b=2.4349,
        crown_dbh_a=0.3,
        crown_dbh_b=0.8,
    ),
    SpeciesGroup.HARDWOOD: AllometricCoefficients(
        height_dbh_a=2.8,
        height_dbh_b=1.05,
        dbh_biomass_a=0.0912,
        dbh_biomass_b=2.4572,
        crown_dbh_a=0.35,
        crown_dbh_b=0.75,
    ),
    SpeciesGroup.MIXED: AllometricCoefficients(
        height_dbh_a=2.5,
        height_dbh_b=1.1,
        dbh_biomass_a=0.1,
        dbh_biomass_b=2.4,
        crown_dbh_a=0.32,
        crown_dbh_b=0.78,
    ),
    SpeciesGroup.TROPICAL: AllometricCoefficients(
        height_dbh_a=3.0,
        height_dbh_b=0.95,
        dbh_biomass_a=0.112,
        dbh_biomass_b=2.53,
        crown_dbh_a=0.4,
        crown_dbh_b=0.7,
    ),
    SpeciesGroup.UNKNOWN: AllometricCoefficients(
        height_dbh_a=2.5,
        height_dbh_b=1.1,
        dbh_biomass_a=0.1,
        dbh_biomass_b=2.4,
        crown_dbh_a=0.32,
        crown_dbh_b=0.78,
    ),
}

# Carbon fraction of biomass (varies by species, typically 0.47-0.50)
CARBON_FRACTION = 0.47

# CO2 to C ratio (molecular weight ratio)
CO2_TO_C_RATIO = 44.0 / 12.0


class TreeMetricsExtractor:
    """
    Extracts comprehensive metrics from individual trees.

    This class provides methods to calculate tree height, crown dimensions,
    DBH estimates using allometric equations, biomass, and carbon content.

    Attributes:
        settings: Application settings.
        species_group: Species group for allometric equations.
        coefficients: Allometric coefficients to use.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        species_group: SpeciesGroup = SpeciesGroup.UNKNOWN,
    ) -> None:
        """
        Initialize the tree metrics extractor.

        Args:
            settings: Optional settings instance.
            species_group: Species group for allometric equations.
        """
        self.settings = settings or get_settings()
        self.species_group = species_group
        self.coefficients = ALLOMETRIC_COEFFICIENTS[species_group]

    def calculate_tree_height(
        self,
        normalized_z: NDArray[np.float64],
        percentile: float = 99.0,
    ) -> float:
        """
        Calculate tree height from normalized point heights.

        Args:
            normalized_z: Normalized height values (height above ground).
            percentile: Percentile to use for height (default 99th to avoid outliers).

        Returns:
            Tree height in meters.
        """
        if len(normalized_z) == 0:
            return 0.0

        # Use percentile to avoid outliers
        height = float(np.percentile(normalized_z, percentile))

        # Ensure non-negative
        return max(0.0, height)

    def calculate_crown_diameter(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        method: str = "convex_hull",
    ) -> float:
        """
        Calculate crown diameter from crown points.

        Args:
            x: X coordinates of crown points.
            y: Y coordinates of crown points.
            method: Method to use - 'convex_hull', 'circle_fit', or 'bounding_box'.

        Returns:
            Crown diameter in meters.
        """
        if len(x) < 3:
            return 0.0

        if method == "convex_hull":
            return self._crown_diameter_convex_hull(x, y)
        elif method == "circle_fit":
            return self._crown_diameter_circle_fit(x, y)
        else:  # bounding_box
            return self._crown_diameter_bounding_box(x, y)

    def _crown_diameter_convex_hull(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
    ) -> float:
        """Calculate crown diameter from convex hull area."""
        try:
            from scipy.spatial import ConvexHull

            points = np.column_stack([x, y])
            hull = ConvexHull(points)
            area = hull.volume  # In 2D, volume gives area

            # Diameter of circle with equivalent area
            diameter = 2 * np.sqrt(area / np.pi)
            return float(diameter)

        except Exception as e:
            logger.debug("Convex hull failed, using bounding box: %s", e)
            return self._crown_diameter_bounding_box(x, y)

    def _crown_diameter_circle_fit(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
    ) -> float:
        """Calculate crown diameter by fitting a circle to points."""
        # Calculate centroid
        cx, cy = np.mean(x), np.mean(y)

        # Calculate distances from centroid
        distances = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)

        # Use 95th percentile distance as radius
        radius = np.percentile(distances, 95)

        return float(2 * radius)

    def _crown_diameter_bounding_box(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
    ) -> float:
        """Calculate crown diameter from bounding box."""
        x_range = np.max(x) - np.min(x)
        y_range = np.max(y) - np.min(y)

        # Use average of X and Y ranges
        return float((x_range + y_range) / 2)

    def calculate_crown_base_height(
        self,
        normalized_z: NDArray[np.float64],
        method: str = "inflection",
    ) -> float:
        """
        Calculate crown base height (height to live crown).

        Args:
            normalized_z: Normalized height values.
            method: Method to use - 'percentile' or 'inflection'.

        Returns:
            Crown base height in meters.
        """
        if len(normalized_z) < 10:
            return 0.0

        if method == "percentile":
            # Use lower percentile as crown base
            return float(np.percentile(normalized_z, 10))

        # Inflection point method
        # Create height histogram and find where crown starts
        z_sorted = np.sort(normalized_z)
        bins = np.linspace(0, np.max(z_sorted), 20)
        hist, _ = np.histogram(z_sorted, bins=bins)

        # Find inflection point (where point density increases)
        if len(hist) < 3:
            return float(np.percentile(normalized_z, 10))

        gradient = np.gradient(hist)
        gradient2 = np.gradient(gradient)

        # Find first significant increase in density
        threshold = np.std(gradient2) * 0.5
        inflection_indices = np.where(gradient2 > threshold)[0]

        if len(inflection_indices) > 0:
            crown_base_bin = inflection_indices[0]
            crown_base_height = bins[crown_base_bin]
            return float(crown_base_height)

        return float(np.percentile(normalized_z, 10))

    def estimate_dbh(
        self,
        height: float,
        crown_diameter: float | None = None,
        species_group: SpeciesGroup | None = None,
    ) -> float | None:
        """
        Estimate DBH using allometric equations.

        Uses height-DBH relationship with optional crown diameter refinement.

        Args:
            height: Tree height in meters.
            crown_diameter: Optional crown diameter for improved estimate.
            species_group: Optional species group override.

        Returns:
            Estimated DBH in centimeters, or None if unable to estimate.
        """
        if height < 1.3:  # Below breast height
            return None

        coefficients = (
            ALLOMETRIC_COEFFICIENTS[species_group]
            if species_group
            else self.coefficients
        )

        # Primary estimate from height
        dbh_from_height = coefficients.height_dbh_a * (height ** coefficients.height_dbh_b)

        # If crown diameter available, use as secondary estimate
        if crown_diameter is not None and crown_diameter > 0:
            # Inverse crown-DBH relationship
            dbh_from_crown = (
                crown_diameter / coefficients.crown_dbh_a
            ) ** (1 / coefficients.crown_dbh_b)

            # Weighted average (height more reliable for most cases)
            dbh = 0.7 * dbh_from_height + 0.3 * dbh_from_crown
        else:
            dbh = dbh_from_height

        # Sanity check
        if dbh < 1 or dbh > 300:
            return None

        return dbh

    def estimate_biomass(
        self,
        dbh: float,
        species_group: SpeciesGroup | None = None,
    ) -> float | None:
        """
        Estimate above-ground biomass using allometric equations.

        Args:
            dbh: Diameter at breast height in centimeters.
            species_group: Optional species group override.

        Returns:
            Estimated above-ground biomass in kilograms.
        """
        if dbh is None or dbh < 1:
            return None

        coefficients = (
            ALLOMETRIC_COEFFICIENTS[species_group]
            if species_group
            else self.coefficients
        )

        biomass = coefficients.dbh_biomass_a * (dbh ** coefficients.dbh_biomass_b)

        return biomass

    def estimate_carbon(
        self,
        biomass: float | None,
    ) -> float | None:
        """
        Estimate carbon content from biomass.

        Args:
            biomass: Above-ground biomass in kilograms.

        Returns:
            Carbon content in kilograms.
        """
        if biomass is None:
            return None

        return biomass * CARBON_FRACTION

    def estimate_co2_equivalent(
        self,
        carbon: float | None,
    ) -> float | None:
        """
        Calculate CO2 equivalent from carbon content.

        Args:
            carbon: Carbon content in kilograms.

        Returns:
            CO2 equivalent in kilograms.
        """
        if carbon is None:
            return None

        return carbon * CO2_TO_C_RATIO

    def extract_metrics(
        self,
        tree_id: int,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        normalized_z: NDArray[np.float64],
        tree_top_x: float | None = None,
        tree_top_y: float | None = None,
    ) -> TreeMetrics:
        """
        Extract all metrics for a single tree.

        Args:
            tree_id: Unique tree identifier.
            x: X coordinates of tree points.
            y: Y coordinates of tree points.
            normalized_z: Normalized Z values (height above ground).
            tree_top_x: Optional X coordinate of tree top.
            tree_top_y: Optional Y coordinate of tree top.

        Returns:
            TreeMetrics with all calculated measurements.
        """
        # Calculate tree height
        height = self.calculate_tree_height(normalized_z)

        # Determine tree top location
        if tree_top_x is None or tree_top_y is None:
            # Find point with maximum height
            max_idx = np.argmax(normalized_z)
            tree_top_x = float(x[max_idx])
            tree_top_y = float(y[max_idx])

        # Calculate crown metrics
        crown_diameter = self.calculate_crown_diameter(x, y)

        # Calculate crown area from convex hull
        try:
            from scipy.spatial import ConvexHull
            points = np.column_stack([x, y])
            hull = ConvexHull(points)
            crown_area = float(hull.volume)
        except Exception:
            crown_area = np.pi * (crown_diameter / 2) ** 2 if crown_diameter else None

        # Calculate crown base height
        crown_base_height = self.calculate_crown_base_height(normalized_z)

        # Estimate DBH
        dbh = self.estimate_dbh(height, crown_diameter)

        # Estimate biomass
        biomass = self.estimate_biomass(dbh) if dbh else None

        return TreeMetrics(
            tree_id=tree_id,
            x=round(tree_top_x, 3),
            y=round(tree_top_y, 3),
            height=round(height, 2),
            crown_diameter=round(crown_diameter, 2) if crown_diameter else None,
            crown_area=round(crown_area, 2) if crown_area else None,
            crown_base_height=round(crown_base_height, 2) if crown_base_height else None,
            dbh_estimated=round(dbh, 1) if dbh else None,
            biomass_estimated=round(biomass, 2) if biomass else None,
            point_count=len(x),
        )

    def calculate_stand_metrics(
        self,
        trees: list[TreeMetrics],
        area_hectares: float,
    ) -> dict:
        """
        Calculate stand-level metrics from individual trees.

        Args:
            trees: List of TreeMetrics for all trees in stand.
            area_hectares: Stand area in hectares.

        Returns:
            Dictionary with stand-level statistics.
        """
        if not trees or area_hectares <= 0:
            return {}

        heights = [t.height for t in trees]
        dbhs = [t.dbh_estimated for t in trees if t.dbh_estimated is not None]
        biomasses = [t.biomass_estimated for t in trees if t.biomass_estimated is not None]

        # Calculate stand metrics
        stems_per_hectare = len(trees) / area_hectares

        mean_height = np.mean(heights) if heights else None
        max_height = np.max(heights) if heights else None
        std_height = np.std(heights) if len(heights) > 1 else None

        mean_dbh = np.mean(dbhs) if dbhs else None
        quadratic_mean_dbh = np.sqrt(np.mean(np.array(dbhs) ** 2)) if dbhs else None

        # Basal area (m2/ha)
        basal_area = None
        if dbhs:
            # BA = pi/4 * sum(DBH^2) / area, DBH in m, area in ha
            dbhs_m = np.array(dbhs) / 100  # cm to m
            ba_m2 = np.pi / 4 * np.sum(dbhs_m ** 2)
            basal_area = ba_m2 / area_hectares

        # Total biomass (kg/ha)
        total_biomass = np.sum(biomasses) / area_hectares if biomasses else None

        # Carbon (tonnes/ha)
        total_carbon = None
        if total_biomass:
            total_carbon = (total_biomass * CARBON_FRACTION) / 1000  # kg to tonnes

        # CO2 equivalent (tonnes/ha)
        co2_equivalent = None
        if total_carbon:
            co2_equivalent = total_carbon * CO2_TO_C_RATIO

        return {
            "stems_per_hectare": round(stems_per_hectare, 1),
            "mean_height_m": round(mean_height, 2) if mean_height else None,
            "max_height_m": round(max_height, 2) if max_height else None,
            "height_std_m": round(std_height, 2) if std_height else None,
            "mean_dbh_cm": round(mean_dbh, 1) if mean_dbh else None,
            "quadratic_mean_dbh_cm": round(quadratic_mean_dbh, 1) if quadratic_mean_dbh else None,
            "basal_area_m2_ha": round(basal_area, 2) if basal_area else None,
            "biomass_kg_ha": round(total_biomass, 1) if total_biomass else None,
            "carbon_tonnes_ha": round(total_carbon, 2) if total_carbon else None,
            "co2_equivalent_tonnes_ha": round(co2_equivalent, 2) if co2_equivalent else None,
        }

    def set_species_group(self, species_group: SpeciesGroup) -> None:
        """
        Update the species group for allometric equations.

        Args:
            species_group: New species group to use.
        """
        self.species_group = species_group
        self.coefficients = ALLOMETRIC_COEFFICIENTS[species_group]
        logger.info("Updated species group to: %s", species_group.value)
