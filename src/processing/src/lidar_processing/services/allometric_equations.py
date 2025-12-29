"""
Allometric Equations Service.

This module provides comprehensive allometric equations for estimating
tree attributes from LiDAR-derived measurements. Includes:
- DBH estimation from height and crown diameter
- Volume calculations using FIA/regional equations
- Species-specific allometric relationships
- Biomass and carbon estimation

Based on FIA (Forest Inventory and Analysis) equations and
published forestry research.

Sprint 17-18: DBH & Volume Estimation
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class WoodType(str, Enum):
    """Wood type classification for allometric equations."""

    SOFTWOOD = "softwood"
    HARDWOOD = "hardwood"


class RegionCode(str, Enum):
    """FIA region codes for regional equations."""

    PNW = "pnw"  # Pacific Northwest
    NORTHERN = "northern"  # Northern Region (Great Lakes, Northeast)
    SOUTHERN = "southern"  # Southern Region
    ROCKY_MOUNTAIN = "rocky_mountain"
    PACIFIC_SW = "pacific_sw"  # California
    INTERIOR_WEST = "interior_west"


@dataclass
class SpeciesAllometry:
    """
    Species-specific allometric parameters.

    Contains coefficients for height-DBH, DBH-volume, and DBH-biomass
    relationships for a specific tree species.
    """

    species_code: str
    common_name: str
    scientific_name: str
    wood_type: WoodType

    # Height-DBH relationship: DBH = a * H^b (H in m, DBH in cm)
    height_dbh_a: float
    height_dbh_b: float

    # Crown-DBH relationship: Crown = a * DBH^b (Crown in m, DBH in cm)
    crown_dbh_a: float
    crown_dbh_b: float

    # Volume equation coefficients (various forms)
    # Form 1: V = a * DBH^b * H^c (Scribner form)
    volume_a: float = 0.0
    volume_b: float = 2.0
    volume_c: float = 1.0

    # Biomass equation coefficients (Jenkins 2003 form)
    # ln(biomass) = a + b * ln(DBH)
    biomass_a: float = 0.0
    biomass_b: float = 2.4

    # Bark factor (ratio of inside bark to outside bark diameter)
    bark_factor: float = 0.90

    # Wood density (kg/m3) for biomass calculations
    wood_density: float = 450.0

    # Form factor for volume calculation
    form_factor: float = 0.42

    # Regional applicability
    regions: list[str] = field(default_factory=lambda: ["pnw"])


# Species-specific allometric equations
# Based on FIA equations and published research
SPECIES_ALLOMETRY: dict[str, SpeciesAllometry] = {
    # Pacific Northwest Conifers
    "PSME": SpeciesAllometry(
        species_code="PSME",
        common_name="Douglas-fir",
        scientific_name="Pseudotsuga menziesii",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=1.8,
        height_dbh_b=1.20,
        crown_dbh_a=0.25,
        crown_dbh_b=0.85,
        volume_a=0.000050,
        volume_b=1.88,
        volume_c=1.02,
        biomass_a=-2.0773,
        biomass_b=2.3323,
        bark_factor=0.92,
        wood_density=480,
        form_factor=0.45,
        regions=["pnw", "rocky_mountain", "northern"],
    ),
    "THPL": SpeciesAllometry(
        species_code="THPL",
        common_name="Western Red Cedar",
        scientific_name="Thuja plicata",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=1.5,
        height_dbh_b=1.15,
        crown_dbh_a=0.35,
        crown_dbh_b=0.75,
        volume_a=0.000055,
        volume_b=1.90,
        volume_c=0.98,
        biomass_a=-2.0180,
        biomass_b=2.3440,
        bark_factor=0.88,
        wood_density=340,
        form_factor=0.40,
        regions=["pnw"],
    ),
    "TSHE": SpeciesAllometry(
        species_code="TSHE",
        common_name="Western Hemlock",
        scientific_name="Tsuga heterophylla",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=1.6,
        height_dbh_b=1.18,
        crown_dbh_a=0.28,
        crown_dbh_b=0.80,
        volume_a=0.000048,
        volume_b=1.85,
        volume_c=1.05,
        biomass_a=-2.0660,
        biomass_b=2.3820,
        bark_factor=0.91,
        wood_density=420,
        form_factor=0.43,
        regions=["pnw"],
    ),
    "PISI": SpeciesAllometry(
        species_code="PISI",
        common_name="Sitka Spruce",
        scientific_name="Picea sitchensis",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=1.7,
        height_dbh_b=1.22,
        crown_dbh_a=0.30,
        crown_dbh_b=0.78,
        volume_a=0.000052,
        volume_b=1.87,
        volume_c=1.00,
        biomass_a=-2.1250,
        biomass_b=2.4125,
        bark_factor=0.93,
        wood_density=400,
        form_factor=0.42,
        regions=["pnw"],
    ),
    "ABGR": SpeciesAllometry(
        species_code="ABGR",
        common_name="Grand Fir",
        scientific_name="Abies grandis",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=1.9,
        height_dbh_b=1.15,
        crown_dbh_a=0.32,
        crown_dbh_b=0.76,
        volume_a=0.000054,
        volume_b=1.89,
        volume_c=0.99,
        biomass_a=-2.0950,
        biomass_b=2.3850,
        bark_factor=0.90,
        wood_density=380,
        form_factor=0.41,
        regions=["pnw", "rocky_mountain"],
    ),
    "ABPR": SpeciesAllometry(
        species_code="ABPR",
        common_name="Noble Fir",
        scientific_name="Abies procera",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=2.0,
        height_dbh_b=1.12,
        crown_dbh_a=0.29,
        crown_dbh_b=0.79,
        volume_a=0.000056,
        volume_b=1.86,
        volume_c=1.01,
        biomass_a=-2.0850,
        biomass_b=2.3650,
        bark_factor=0.91,
        wood_density=390,
        form_factor=0.43,
        regions=["pnw"],
    ),
    "ABAM": SpeciesAllometry(
        species_code="ABAM",
        common_name="Pacific Silver Fir",
        scientific_name="Abies amabilis",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=1.85,
        height_dbh_b=1.14,
        crown_dbh_a=0.31,
        crown_dbh_b=0.77,
        volume_a=0.000053,
        volume_b=1.88,
        volume_c=1.00,
        biomass_a=-2.0750,
        biomass_b=2.3750,
        bark_factor=0.90,
        wood_density=370,
        form_factor=0.42,
        regions=["pnw"],
    ),
    "PICO": SpeciesAllometry(
        species_code="PICO",
        common_name="Lodgepole Pine",
        scientific_name="Pinus contorta",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=2.2,
        height_dbh_b=1.10,
        crown_dbh_a=0.22,
        crown_dbh_b=0.82,
        volume_a=0.000045,
        volume_b=1.92,
        volume_c=0.95,
        biomass_a=-2.1580,
        biomass_b=2.4050,
        bark_factor=0.89,
        wood_density=410,
        form_factor=0.40,
        regions=["pnw", "rocky_mountain", "interior_west"],
    ),
    "PIPO": SpeciesAllometry(
        species_code="PIPO",
        common_name="Ponderosa Pine",
        scientific_name="Pinus ponderosa",
        wood_type=WoodType.SOFTWOOD,
        height_dbh_a=2.0,
        height_dbh_b=1.12,
        crown_dbh_a=0.30,
        crown_dbh_b=0.80,
        volume_a=0.000048,
        volume_b=1.90,
        volume_c=0.98,
        biomass_a=-2.1350,
        biomass_b=2.3980,
        bark_factor=0.85,
        wood_density=430,
        form_factor=0.42,
        regions=["pnw", "rocky_mountain", "interior_west"],
    ),
    # Pacific Northwest Hardwoods
    "ALRU": SpeciesAllometry(
        species_code="ALRU",
        common_name="Red Alder",
        scientific_name="Alnus rubra",
        wood_type=WoodType.HARDWOOD,
        height_dbh_a=2.5,
        height_dbh_b=1.05,
        crown_dbh_a=0.40,
        crown_dbh_b=0.70,
        volume_a=0.000060,
        volume_b=1.82,
        volume_c=1.05,
        biomass_a=-2.2850,
        biomass_b=2.4310,
        bark_factor=0.92,
        wood_density=420,
        form_factor=0.38,
        regions=["pnw"],
    ),
    "ACMA": SpeciesAllometry(
        species_code="ACMA",
        common_name="Bigleaf Maple",
        scientific_name="Acer macrophyllum",
        wood_type=WoodType.HARDWOOD,
        height_dbh_a=2.8,
        height_dbh_b=1.00,
        crown_dbh_a=0.45,
        crown_dbh_b=0.68,
        volume_a=0.000065,
        volume_b=1.80,
        volume_c=1.02,
        biomass_a=-2.3250,
        biomass_b=2.4520,
        bark_factor=0.91,
        wood_density=480,
        form_factor=0.36,
        regions=["pnw"],
    ),
    "POBAT": SpeciesAllometry(
        species_code="POBAT",
        common_name="Black Cottonwood",
        scientific_name="Populus trichocarpa",
        wood_type=WoodType.HARDWOOD,
        height_dbh_a=2.6,
        height_dbh_b=1.08,
        crown_dbh_a=0.38,
        crown_dbh_b=0.72,
        volume_a=0.000058,
        volume_b=1.84,
        volume_c=1.00,
        biomass_a=-2.2650,
        biomass_b=2.4180,
        bark_factor=0.88,
        wood_density=380,
        form_factor=0.37,
        regions=["pnw"],
    ),
    "QUGA": SpeciesAllometry(
        species_code="QUGA",
        common_name="Oregon White Oak",
        scientific_name="Quercus garryana",
        wood_type=WoodType.HARDWOOD,
        height_dbh_a=3.2,
        height_dbh_b=0.95,
        crown_dbh_a=0.50,
        crown_dbh_b=0.65,
        volume_a=0.000070,
        volume_b=1.78,
        volume_c=1.00,
        biomass_a=-2.4250,
        biomass_b=2.4680,
        bark_factor=0.86,
        wood_density=650,
        form_factor=0.35,
        regions=["pnw"],
    ),
    "ARME": SpeciesAllometry(
        species_code="ARME",
        common_name="Pacific Madrone",
        scientific_name="Arbutus menziesii",
        wood_type=WoodType.HARDWOOD,
        height_dbh_a=3.0,
        height_dbh_b=0.98,
        crown_dbh_a=0.42,
        crown_dbh_b=0.70,
        volume_a=0.000062,
        volume_b=1.81,
        volume_c=1.01,
        biomass_a=-2.3550,
        biomass_b=2.4420,
        bark_factor=0.93,
        wood_density=580,
        form_factor=0.38,
        regions=["pnw", "pacific_sw"],
    ),
}

# Default allometry by wood type for unknown species
DEFAULT_SOFTWOOD = SpeciesAllometry(
    species_code="SOFT",
    common_name="Generic Softwood",
    scientific_name="Unknown conifer",
    wood_type=WoodType.SOFTWOOD,
    height_dbh_a=2.0,
    height_dbh_b=1.15,
    crown_dbh_a=0.28,
    crown_dbh_b=0.80,
    volume_a=0.000050,
    volume_b=1.88,
    volume_c=1.00,
    biomass_a=-2.0936,
    biomass_b=2.3617,
    bark_factor=0.90,
    wood_density=420,
    form_factor=0.42,
    regions=["pnw", "northern", "southern", "rocky_mountain"],
)

DEFAULT_HARDWOOD = SpeciesAllometry(
    species_code="HARD",
    common_name="Generic Hardwood",
    scientific_name="Unknown deciduous",
    wood_type=WoodType.HARDWOOD,
    height_dbh_a=2.8,
    height_dbh_b=1.02,
    crown_dbh_a=0.42,
    crown_dbh_b=0.70,
    volume_a=0.000062,
    volume_b=1.82,
    volume_c=1.02,
    biomass_a=-2.2118,
    biomass_b=2.4133,
    bark_factor=0.90,
    wood_density=500,
    form_factor=0.38,
    regions=["pnw", "northern", "southern", "rocky_mountain"],
)

# Carbon fraction of dry biomass (IPCC default)
CARBON_FRACTION = 0.47

# CO2 to C molecular weight ratio
CO2_TO_C_RATIO = 44.0 / 12.0


@dataclass
class VolumeResult:
    """Result of volume calculation."""

    total_volume_m3: float
    merchantable_volume_m3: float | None = None
    board_feet: float | None = None
    cords: float | None = None
    method: str = "fvs_combined"


@dataclass
class BiomassResult:
    """Result of biomass calculation."""

    aboveground_biomass_kg: float
    stem_biomass_kg: float | None = None
    branch_biomass_kg: float | None = None
    foliage_biomass_kg: float | None = None
    root_biomass_kg: float | None = None
    carbon_kg: float | None = None
    co2_equivalent_kg: float | None = None


@dataclass
class TreeEstimates:
    """Complete tree estimates from allometric equations."""

    tree_id: str | int
    species_code: str
    dbh_cm: float
    height_m: float
    crown_diameter_m: float | None
    volume: VolumeResult
    biomass: BiomassResult
    basal_area_m2: float
    confidence: float = 0.8


class AllometricEquations:
    """
    Service for calculating tree metrics using allometric equations.

    Provides species-specific and generic allometric equations for:
    - DBH estimation from height and crown diameter
    - Volume calculation (total, merchantable, board feet)
    - Biomass estimation (above-ground, components)
    - Carbon and CO2 equivalent
    """

    def __init__(
        self,
        region: str = "pnw",
        custom_species: dict[str, SpeciesAllometry] | None = None,
    ) -> None:
        """
        Initialize allometric equations service.

        Args:
            region: Geographic region for regional equations
            custom_species: Optional custom species allometry dictionary
        """
        self.region = region
        self.species_data = {**SPECIES_ALLOMETRY}

        if custom_species:
            self.species_data.update(custom_species)

        logger.info(
            "Initialized AllometricEquations with %d species for region %s",
            len(self.species_data),
            region,
        )

    def get_species_allometry(
        self,
        species_code: str | None,
        wood_type: WoodType | None = None,
    ) -> SpeciesAllometry:
        """
        Get allometric parameters for a species.

        Args:
            species_code: FIA species code (e.g., 'PSME')
            wood_type: Wood type hint if species unknown

        Returns:
            SpeciesAllometry with parameters for the species
        """
        if species_code and species_code.upper() in self.species_data:
            return self.species_data[species_code.upper()]

        # Use default based on wood type
        if wood_type == WoodType.HARDWOOD:
            return DEFAULT_HARDWOOD
        return DEFAULT_SOFTWOOD

    def estimate_dbh(
        self,
        height_m: float,
        crown_diameter_m: float | None = None,
        species_code: str | None = None,
        method: str = "combined",
    ) -> tuple[float, float]:
        """
        Estimate DBH from height and optionally crown diameter.

        Args:
            height_m: Tree height in meters
            crown_diameter_m: Crown diameter in meters (optional)
            species_code: Species code for species-specific equations
            method: Estimation method - 'height', 'crown', or 'combined'

        Returns:
            Tuple of (estimated DBH in cm, confidence score 0-1)
        """
        if height_m < 1.3:  # Below breast height
            return 0.0, 0.0

        allometry = self.get_species_allometry(species_code)

        # Height-based estimate
        # Inverse of H = a * DBH^b -> DBH = (H/a)^(1/b)
        dbh_from_height = (height_m / allometry.height_dbh_a) ** (
            1 / allometry.height_dbh_b
        )

        if crown_diameter_m is None or crown_diameter_m <= 0 or method == "height":
            return max(1.0, dbh_from_height), 0.7

        # Crown-based estimate
        # Inverse of Crown = a * DBH^b -> DBH = (Crown/a)^(1/b)
        dbh_from_crown = (crown_diameter_m / allometry.crown_dbh_a) ** (
            1 / allometry.crown_dbh_b
        )

        if method == "crown":
            return max(1.0, dbh_from_crown), 0.65

        # Combined estimate with weighted average
        # Height is generally more reliable for LiDAR
        weight_height = 0.65
        weight_crown = 0.35

        dbh_combined = (weight_height * dbh_from_height) + (
            weight_crown * dbh_from_crown
        )

        # Confidence increases when estimates agree
        agreement = 1.0 - abs(dbh_from_height - dbh_from_crown) / max(
            dbh_from_height, dbh_from_crown
        )
        confidence = 0.6 + 0.3 * agreement

        return max(1.0, dbh_combined), confidence

    def calculate_volume_fia(
        self,
        dbh_cm: float,
        height_m: float,
        species_code: str | None = None,
    ) -> VolumeResult:
        """
        Calculate tree volume using FIA equations.

        Uses species-specific volume equations when available,
        falls back to generic form factor method.

        Args:
            dbh_cm: Diameter at breast height in centimeters
            height_m: Tree height in meters
            species_code: Species code for species-specific equations

        Returns:
            VolumeResult with various volume measures
        """
        if dbh_cm < 1 or height_m < 1.3:
            return VolumeResult(
                total_volume_m3=0.0,
                merchantable_volume_m3=0.0,
                board_feet=0.0,
                cords=0.0,
            )

        allometry = self.get_species_allometry(species_code)

        # Method 1: Species-specific equation
        # V = a * DBH^b * H^c
        total_volume = (
            allometry.volume_a
            * (dbh_cm ** allometry.volume_b)
            * (height_m ** allometry.volume_c)
        )

        # Method 2: Form factor method (as validation)
        # V = pi/4 * DBH^2 * H * form_factor
        dbh_m = dbh_cm / 100
        form_factor_volume = (
            math.pi / 4 * (dbh_m ** 2) * height_m * allometry.form_factor
        )

        # Use average if significant difference
        if abs(total_volume - form_factor_volume) / max(
            total_volume, form_factor_volume
        ) > 0.3:
            total_volume = (total_volume + form_factor_volume) / 2

        # Calculate merchantable volume (to 4" top)
        # Approximate using taper equations
        merchantable_ratio = self._calculate_merchantable_ratio(
            dbh_cm, height_m, allometry
        )
        merchantable_volume = total_volume * merchantable_ratio

        # Convert to board feet (Scribner rule approximation)
        # BF = (DBH - 4)^2 * H / 10 for DBH > 8"
        dbh_inches = dbh_cm / 2.54
        height_feet = height_m * 3.28084

        if dbh_inches >= 8:
            board_feet = ((dbh_inches - 4) ** 2) * height_feet / 10
        else:
            board_feet = 0.0

        # Convert to cords (1 cord = 3.62 m3 solid wood)
        cords = total_volume / 3.62

        return VolumeResult(
            total_volume_m3=round(total_volume, 4),
            merchantable_volume_m3=round(merchantable_volume, 4),
            board_feet=round(board_feet, 1),
            cords=round(cords, 4),
            method="fia_combined",
        )

    def _calculate_merchantable_ratio(
        self,
        dbh_cm: float,
        height_m: float,
        allometry: SpeciesAllometry,
    ) -> float:
        """
        Calculate ratio of merchantable to total volume.

        Uses simplified taper assumptions.
        """
        # Merchantable height is typically to a 10cm top
        # Use simplified taper: diameter decreases linearly
        top_diameter_cm = 10.0  # 4" merchantable top

        if dbh_cm <= top_diameter_cm:
            return 0.0

        # Estimate merchantable height ratio
        # Assumes linear taper (simplified)
        merch_height_ratio = (dbh_cm - top_diameter_cm) / dbh_cm

        # Volume ratio is approximately the cube of height ratio
        # for conical form, squared for paraboloid
        if allometry.wood_type == WoodType.SOFTWOOD:
            volume_ratio = merch_height_ratio ** 1.8
        else:
            volume_ratio = merch_height_ratio ** 1.6

        return min(1.0, max(0.0, volume_ratio))

    def calculate_biomass_jenkins(
        self,
        dbh_cm: float,
        species_code: str | None = None,
        include_roots: bool = True,
    ) -> BiomassResult:
        """
        Calculate tree biomass using Jenkins et al. (2003) equations.

        Provides above-ground biomass with optional component breakdown.

        Args:
            dbh_cm: Diameter at breast height in centimeters
            species_code: Species code for species-specific equations
            include_roots: Whether to estimate root biomass

        Returns:
            BiomassResult with biomass components
        """
        if dbh_cm < 1:
            return BiomassResult(
                aboveground_biomass_kg=0.0,
                carbon_kg=0.0,
                co2_equivalent_kg=0.0,
            )

        allometry = self.get_species_allometry(species_code)

        # Jenkins equation: ln(biomass) = a + b * ln(DBH)
        # biomass in kg, DBH in cm
        ln_biomass = allometry.biomass_a + allometry.biomass_b * math.log(dbh_cm)
        aboveground_biomass = math.exp(ln_biomass)

        # Component ratios (approximate, based on FIA data)
        if allometry.wood_type == WoodType.SOFTWOOD:
            stem_ratio = 0.65
            branch_ratio = 0.15
            foliage_ratio = 0.05
        else:
            stem_ratio = 0.60
            branch_ratio = 0.20
            foliage_ratio = 0.05

        stem_biomass = aboveground_biomass * stem_ratio
        branch_biomass = aboveground_biomass * branch_ratio
        foliage_biomass = aboveground_biomass * foliage_ratio

        # Root biomass ratio (Cairns et al. 1997)
        # Root:shoot ratio varies by tree size and species
        if include_roots:
            if dbh_cm < 10:
                root_ratio = 0.35
            elif dbh_cm < 30:
                root_ratio = 0.28
            else:
                root_ratio = 0.22

            if allometry.wood_type == WoodType.HARDWOOD:
                root_ratio *= 1.1  # Hardwoods have slightly higher ratios

            root_biomass = aboveground_biomass * root_ratio
        else:
            root_biomass = None

        # Carbon and CO2
        carbon = aboveground_biomass * CARBON_FRACTION
        co2_equivalent = carbon * CO2_TO_C_RATIO

        return BiomassResult(
            aboveground_biomass_kg=round(aboveground_biomass, 2),
            stem_biomass_kg=round(stem_biomass, 2),
            branch_biomass_kg=round(branch_biomass, 2),
            foliage_biomass_kg=round(foliage_biomass, 2),
            root_biomass_kg=round(root_biomass, 2) if root_biomass else None,
            carbon_kg=round(carbon, 2),
            co2_equivalent_kg=round(co2_equivalent, 2),
        )

    def calculate_basal_area(self, dbh_cm: float) -> float:
        """
        Calculate tree basal area.

        Args:
            dbh_cm: Diameter at breast height in centimeters

        Returns:
            Basal area in square meters
        """
        dbh_m = dbh_cm / 100
        return math.pi / 4 * (dbh_m ** 2)

    def estimate_tree_complete(
        self,
        tree_id: str | int,
        height_m: float,
        crown_diameter_m: float | None = None,
        species_code: str | None = None,
        dbh_cm: float | None = None,
    ) -> TreeEstimates:
        """
        Calculate complete tree estimates from available measurements.

        Args:
            tree_id: Unique tree identifier
            height_m: Tree height in meters
            crown_diameter_m: Crown diameter in meters (optional)
            species_code: Species code for species-specific equations
            dbh_cm: Known DBH if available (optional)

        Returns:
            TreeEstimates with all calculated values
        """
        # Estimate or use provided DBH
        if dbh_cm is None or dbh_cm <= 0:
            dbh_cm, dbh_confidence = self.estimate_dbh(
                height_m, crown_diameter_m, species_code
            )
        else:
            dbh_confidence = 0.95  # High confidence for measured DBH

        # Calculate volume
        volume = self.calculate_volume_fia(dbh_cm, height_m, species_code)

        # Calculate biomass
        biomass = self.calculate_biomass_jenkins(dbh_cm, species_code)

        # Calculate basal area
        basal_area = self.calculate_basal_area(dbh_cm)

        return TreeEstimates(
            tree_id=tree_id,
            species_code=species_code or "UNKNOWN",
            dbh_cm=round(dbh_cm, 1),
            height_m=round(height_m, 2),
            crown_diameter_m=round(crown_diameter_m, 2) if crown_diameter_m else None,
            volume=volume,
            biomass=biomass,
            basal_area_m2=round(basal_area, 4),
            confidence=dbh_confidence,
        )

    def estimate_batch(
        self,
        trees: list[dict[str, Any]],
        height_field: str = "height",
        crown_field: str = "crown_diameter",
        species_field: str = "species_code",
        id_field: str = "tree_id",
    ) -> list[TreeEstimates]:
        """
        Calculate estimates for a batch of trees.

        Args:
            trees: List of tree dictionaries with measurements
            height_field: Field name for height
            crown_field: Field name for crown diameter
            species_field: Field name for species code
            id_field: Field name for tree ID

        Returns:
            List of TreeEstimates for all trees
        """
        results = []

        for tree in trees:
            try:
                height = float(tree.get(height_field, 0))
                crown = tree.get(crown_field)
                if crown is not None:
                    crown = float(crown)
                species = tree.get(species_field)
                tree_id = tree.get(id_field, len(results))

                estimate = self.estimate_tree_complete(
                    tree_id=tree_id,
                    height_m=height,
                    crown_diameter_m=crown,
                    species_code=species,
                )
                results.append(estimate)

            except (ValueError, TypeError) as e:
                logger.warning(
                    "Failed to estimate tree %s: %s", tree.get(id_field), e
                )

        return results

    def calculate_stand_totals(
        self,
        trees: list[TreeEstimates],
        area_hectares: float,
    ) -> dict[str, Any]:
        """
        Calculate stand-level summary from individual tree estimates.

        Args:
            trees: List of TreeEstimates
            area_hectares: Stand area in hectares

        Returns:
            Dictionary with stand-level metrics
        """
        if not trees or area_hectares <= 0:
            return {}

        n_trees = len(trees)

        # Collect metrics
        dbhs = [t.dbh_cm for t in trees if t.dbh_cm > 0]
        heights = [t.height_m for t in trees if t.height_m > 0]
        volumes = [t.volume.total_volume_m3 for t in trees]
        merch_volumes = [
            t.volume.merchantable_volume_m3
            for t in trees
            if t.volume.merchantable_volume_m3
        ]
        board_feet = [
            t.volume.board_feet for t in trees if t.volume.board_feet
        ]
        biomasses = [t.biomass.aboveground_biomass_kg for t in trees]
        carbons = [
            t.biomass.carbon_kg for t in trees if t.biomass.carbon_kg
        ]
        basal_areas = [t.basal_area_m2 for t in trees]

        # Calculate means and totals
        mean_dbh = np.mean(dbhs) if dbhs else 0
        qmd = np.sqrt(np.mean(np.array(dbhs) ** 2)) if dbhs else 0
        mean_height = np.mean(heights) if heights else 0
        dominant_height = np.percentile(heights, 80) if len(heights) >= 10 else mean_height

        total_volume = sum(volumes)
        total_merch_volume = sum(merch_volumes)
        total_board_feet = sum(board_feet)
        total_biomass = sum(biomasses)
        total_carbon = sum(carbons)
        total_basal_area = sum(basal_areas)

        total_co2 = total_carbon * CO2_TO_C_RATIO

        # Per hectare values
        stems_ha = n_trees / area_hectares
        volume_ha = total_volume / area_hectares
        merch_volume_ha = total_merch_volume / area_hectares
        bf_ha = total_board_feet / area_hectares
        biomass_ha = total_biomass / area_hectares
        carbon_ha = total_carbon / area_hectares
        basal_area_ha = total_basal_area / area_hectares
        co2_ha = total_co2 / area_hectares

        return {
            "tree_count": n_trees,
            "area_hectares": round(area_hectares, 2),
            "stems_per_hectare": round(stems_ha, 1),
            "mean_dbh_cm": round(mean_dbh, 1),
            "quadratic_mean_dbh_cm": round(qmd, 1),
            "mean_height_m": round(mean_height, 2),
            "dominant_height_m": round(dominant_height, 2),
            "basal_area_m2_total": round(total_basal_area, 2),
            "basal_area_m2_ha": round(basal_area_ha, 2),
            "total_volume_m3": round(total_volume, 2),
            "volume_m3_ha": round(volume_ha, 2),
            "merchantable_volume_m3": round(total_merch_volume, 2),
            "merchantable_volume_m3_ha": round(merch_volume_ha, 2),
            "total_board_feet": round(total_board_feet, 0),
            "board_feet_per_hectare": round(bf_ha, 0),
            "mbf_per_hectare": round(bf_ha / 1000, 2),  # Thousand board feet
            "total_biomass_kg": round(total_biomass, 1),
            "biomass_kg_ha": round(biomass_ha, 1),
            "biomass_tonnes_ha": round(biomass_ha / 1000, 2),
            "total_carbon_kg": round(total_carbon, 1),
            "carbon_kg_ha": round(carbon_ha, 1),
            "carbon_tonnes_ha": round(carbon_ha / 1000, 2),
            "total_co2_equivalent_kg": round(total_co2, 1),
            "co2_equivalent_tonnes_ha": round(co2_ha / 1000, 2),
        }

    def get_available_species(self) -> list[dict[str, str]]:
        """
        Get list of species with allometric equations.

        Returns:
            List of species info dictionaries
        """
        return [
            {
                "code": s.species_code,
                "common_name": s.common_name,
                "scientific_name": s.scientific_name,
                "wood_type": s.wood_type.value,
            }
            for s in self.species_data.values()
        ]
