"""
Species Configuration for Tree Classification.

This module defines species by region with codes, common names,
and classification characteristics for the species classification system.

Sprint 13-14: Species Classification ML System
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class SpeciesInfo:
    """Information about a tree species."""

    code: str  # FIA/standard species code (e.g., 'PSME')
    name: str  # Common name (e.g., 'Douglas-fir')
    scientific_name: str  # Scientific name (e.g., 'Pseudotsuga menziesii')
    category: str  # 'conifer' or 'deciduous'
    typical_height_range: tuple[float, float]  # Min/max height in meters
    typical_crown_ratio: float  # Crown width to height ratio
    description: str  # Brief description


# Species definitions by region
SPECIES_BY_REGION: dict[str, dict[str, SpeciesInfo]] = {
    "pnw": {  # Pacific Northwest
        "PSME": SpeciesInfo(
            code="PSME",
            name="Douglas-fir",
            scientific_name="Pseudotsuga menziesii",
            category="conifer",
            typical_height_range=(20.0, 75.0),
            typical_crown_ratio=0.25,
            description="Dominant conifer of PNW forests with distinctive furrowed bark",
        ),
        "TSHE": SpeciesInfo(
            code="TSHE",
            name="Western Hemlock",
            scientific_name="Tsuga heterophylla",
            category="conifer",
            typical_height_range=(15.0, 60.0),
            typical_crown_ratio=0.30,
            description="Shade-tolerant conifer with drooping leader and fine foliage",
        ),
        "THPL": SpeciesInfo(
            code="THPL",
            name="Western Red Cedar",
            scientific_name="Thuja plicata",
            category="conifer",
            typical_height_range=(15.0, 65.0),
            typical_crown_ratio=0.35,
            description="Large conifer with fluted trunk and drooping branches",
        ),
        "PISI": SpeciesInfo(
            code="PISI",
            name="Sitka Spruce",
            scientific_name="Picea sitchensis",
            category="conifer",
            typical_height_range=(25.0, 80.0),
            typical_crown_ratio=0.28,
            description="Coastal giant with sharp needles and large cones",
        ),
        "ALRU": SpeciesInfo(
            code="ALRU",
            name="Red Alder",
            scientific_name="Alnus rubra",
            category="deciduous",
            typical_height_range=(10.0, 30.0),
            typical_crown_ratio=0.45,
            description="Fast-growing deciduous with nitrogen-fixing ability",
        ),
        "ACMA": SpeciesInfo(
            code="ACMA",
            name="Bigleaf Maple",
            scientific_name="Acer macrophyllum",
            category="deciduous",
            typical_height_range=(15.0, 35.0),
            typical_crown_ratio=0.50,
            description="Large deciduous with massive leaves and spreading crown",
        ),
        "ABGR": SpeciesInfo(
            code="ABGR",
            name="Grand Fir",
            scientific_name="Abies grandis",
            category="conifer",
            typical_height_range=(20.0, 70.0),
            typical_crown_ratio=0.26,
            description="Large fir with flattened needles and smooth bark",
        ),
    },
    "southeast": {  # Southeastern US
        "PITA": SpeciesInfo(
            code="PITA",
            name="Loblolly Pine",
            scientific_name="Pinus taeda",
            category="conifer",
            typical_height_range=(20.0, 45.0),
            typical_crown_ratio=0.30,
            description="Most commercially important southern pine",
        ),
        "PIPA": SpeciesInfo(
            code="PIPA",
            name="Longleaf Pine",
            scientific_name="Pinus palustris",
            category="conifer",
            typical_height_range=(25.0, 40.0),
            typical_crown_ratio=0.28,
            description="Historic southern pine with long needles, fire-adapted",
        ),
        "PIEL": SpeciesInfo(
            code="PIEL",
            name="Slash Pine",
            scientific_name="Pinus elliottii",
            category="conifer",
            typical_height_range=(18.0, 35.0),
            typical_crown_ratio=0.32,
            description="Fast-growing pine of coastal plains",
        ),
        "QURU": SpeciesInfo(
            code="QURU",
            name="Northern Red Oak",
            scientific_name="Quercus rubra",
            category="deciduous",
            typical_height_range=(18.0, 35.0),
            typical_crown_ratio=0.55,
            description="Important hardwood with rounded crown",
        ),
        "LITU": SpeciesInfo(
            code="LITU",
            name="Tulip Poplar",
            scientific_name="Liriodendron tulipifera",
            category="deciduous",
            typical_height_range=(25.0, 50.0),
            typical_crown_ratio=0.40,
            description="Tall straight hardwood with distinctive leaves",
        ),
        "ACRU": SpeciesInfo(
            code="ACRU",
            name="Red Maple",
            scientific_name="Acer rubrum",
            category="deciduous",
            typical_height_range=(15.0, 30.0),
            typical_crown_ratio=0.50,
            description="Adaptable maple with brilliant fall color",
        ),
        "NYSY": SpeciesInfo(
            code="NYSY",
            name="Blackgum",
            scientific_name="Nyssa sylvatica",
            category="deciduous",
            typical_height_range=(15.0, 30.0),
            typical_crown_ratio=0.45,
            description="Medium hardwood common in wetland edges",
        ),
    },
    "northeast": {  # Northeastern US
        "ACSA": SpeciesInfo(
            code="ACSA",
            name="Sugar Maple",
            scientific_name="Acer saccharum",
            category="deciduous",
            typical_height_range=(20.0, 35.0),
            typical_crown_ratio=0.50,
            description="Iconic northeastern hardwood with dense crown",
        ),
        "FAGR": SpeciesInfo(
            code="FAGR",
            name="American Beech",
            scientific_name="Fagus grandifolia",
            category="deciduous",
            typical_height_range=(18.0, 30.0),
            typical_crown_ratio=0.55,
            description="Shade-tolerant hardwood with smooth gray bark",
        ),
        "TSCA": SpeciesInfo(
            code="TSCA",
            name="Eastern Hemlock",
            scientific_name="Tsuga canadensis",
            category="conifer",
            typical_height_range=(18.0, 40.0),
            typical_crown_ratio=0.35,
            description="Native hemlock with fine needles and small cones",
        ),
        "PIST": SpeciesInfo(
            code="PIST",
            name="Eastern White Pine",
            scientific_name="Pinus strobus",
            category="conifer",
            typical_height_range=(25.0, 55.0),
            typical_crown_ratio=0.30,
            description="Tallest northeastern conifer with horizontal branching",
        ),
        "QURU": SpeciesInfo(
            code="QURU",
            name="Northern Red Oak",
            scientific_name="Quercus rubra",
            category="deciduous",
            typical_height_range=(18.0, 35.0),
            typical_crown_ratio=0.55,
            description="Important hardwood with rounded crown",
        ),
        "BEAL": SpeciesInfo(
            code="BEAL",
            name="Yellow Birch",
            scientific_name="Betula alleghaniensis",
            category="deciduous",
            typical_height_range=(18.0, 30.0),
            typical_crown_ratio=0.48,
            description="Large birch with golden peeling bark",
        ),
        "FRAM": SpeciesInfo(
            code="FRAM",
            name="White Ash",
            scientific_name="Fraxinus americana",
            category="deciduous",
            typical_height_range=(18.0, 35.0),
            typical_crown_ratio=0.45,
            description="Valuable hardwood with compound leaves",
        ),
    },
    "rocky_mountain": {  # Rocky Mountain Region
        "PIPO": SpeciesInfo(
            code="PIPO",
            name="Ponderosa Pine",
            scientific_name="Pinus ponderosa",
            category="conifer",
            typical_height_range=(20.0, 50.0),
            typical_crown_ratio=0.28,
            description="Dominant western pine with distinctive orange bark",
        ),
        "PICO": SpeciesInfo(
            code="PICO",
            name="Lodgepole Pine",
            scientific_name="Pinus contorta",
            category="conifer",
            typical_height_range=(15.0, 35.0),
            typical_crown_ratio=0.25,
            description="Dense-growing pine with thin bark, fire-adapted",
        ),
        "ABLA": SpeciesInfo(
            code="ABLA",
            name="Subalpine Fir",
            scientific_name="Abies lasiocarpa",
            category="conifer",
            typical_height_range=(15.0, 35.0),
            typical_crown_ratio=0.22,
            description="High-elevation fir with narrow spire-like crown",
        ),
        "PIEN": SpeciesInfo(
            code="PIEN",
            name="Engelmann Spruce",
            scientific_name="Picea engelmannii",
            category="conifer",
            typical_height_range=(20.0, 45.0),
            typical_crown_ratio=0.24,
            description="High-elevation spruce with blue-green needles",
        ),
        "POTR": SpeciesInfo(
            code="POTR",
            name="Quaking Aspen",
            scientific_name="Populus tremuloides",
            category="deciduous",
            typical_height_range=(10.0, 25.0),
            typical_crown_ratio=0.40,
            description="Clonal deciduous with distinctive white bark",
        ),
        "PSME": SpeciesInfo(
            code="PSME",
            name="Douglas-fir",
            scientific_name="Pseudotsuga menziesii",
            category="conifer",
            typical_height_range=(20.0, 60.0),
            typical_crown_ratio=0.26,
            description="Major timber species with furrowed bark",
        ),
    },
    "california": {  # California
        "SEGI": SpeciesInfo(
            code="SEGI",
            name="Giant Sequoia",
            scientific_name="Sequoiadendron giganteum",
            category="conifer",
            typical_height_range=(50.0, 95.0),
            typical_crown_ratio=0.20,
            description="Massive long-lived conifer of Sierra Nevada",
        ),
        "SESE": SpeciesInfo(
            code="SESE",
            name="Coast Redwood",
            scientific_name="Sequoia sempervirens",
            category="conifer",
            typical_height_range=(60.0, 115.0),
            typical_crown_ratio=0.18,
            description="World's tallest tree species, coastal fog belt",
        ),
        "ABCO": SpeciesInfo(
            code="ABCO",
            name="White Fir",
            scientific_name="Abies concolor",
            category="conifer",
            typical_height_range=(25.0, 55.0),
            typical_crown_ratio=0.28,
            description="Common Sierra Nevada fir with blue-green foliage",
        ),
        "QUKE": SpeciesInfo(
            code="QUKE",
            name="California Black Oak",
            scientific_name="Quercus kelloggii",
            category="deciduous",
            typical_height_range=(10.0, 25.0),
            typical_crown_ratio=0.55,
            description="Major foothill oak species",
        ),
        "PILA": SpeciesInfo(
            code="PILA",
            name="Sugar Pine",
            scientific_name="Pinus lambertiana",
            category="conifer",
            typical_height_range=(40.0, 70.0),
            typical_crown_ratio=0.25,
            description="Largest pine species with massive cones",
        ),
        "PIPO": SpeciesInfo(
            code="PIPO",
            name="Ponderosa Pine",
            scientific_name="Pinus ponderosa",
            category="conifer",
            typical_height_range=(20.0, 50.0),
            typical_crown_ratio=0.28,
            description="Dominant western pine with distinctive orange bark",
        ),
    },
}

# Region metadata
REGION_METADATA: dict[str, dict[str, Any]] = {
    "pnw": {
        "name": "Pacific Northwest",
        "states": ["WA", "OR", "Northern CA"],
        "description": "Temperate rainforest and mixed conifer forests",
        "dominant_species": ["PSME", "TSHE", "THPL"],
    },
    "southeast": {
        "name": "Southeastern United States",
        "states": ["FL", "GA", "AL", "SC", "NC", "VA", "TN", "MS", "LA"],
        "description": "Southern pine and mixed hardwood forests",
        "dominant_species": ["PITA", "PIPA", "LITU"],
    },
    "northeast": {
        "name": "Northeastern United States",
        "states": ["ME", "NH", "VT", "MA", "NY", "PA", "NJ", "CT", "RI"],
        "description": "Northern hardwood and mixed forest",
        "dominant_species": ["ACSA", "FAGR", "PIST"],
    },
    "rocky_mountain": {
        "name": "Rocky Mountain Region",
        "states": ["CO", "WY", "MT", "ID", "UT", "NM", "AZ"],
        "description": "High-elevation conifer forests",
        "dominant_species": ["PIPO", "PICO", "PIEN"],
    },
    "california": {
        "name": "California",
        "states": ["CA"],
        "description": "Diverse forest types from coast to Sierra Nevada",
        "dominant_species": ["SESE", "PIPO", "ABCO"],
    },
}


def get_species_for_region(region: str) -> dict[str, SpeciesInfo]:
    """
    Get all species definitions for a region.

    Args:
        region: Region code (e.g., 'pnw', 'southeast').

    Returns:
        Dictionary mapping species codes to SpeciesInfo.

    Raises:
        ValueError: If region is not supported.
    """
    if region.lower() not in SPECIES_BY_REGION:
        available = list(SPECIES_BY_REGION.keys())
        raise ValueError(f"Unknown region '{region}'. Available: {available}")

    return SPECIES_BY_REGION[region.lower()]


def get_species_info(region: str, species_code: str) -> SpeciesInfo:
    """
    Get species information for a specific species in a region.

    Args:
        region: Region code.
        species_code: Species code (e.g., 'PSME').

    Returns:
        SpeciesInfo for the species.

    Raises:
        ValueError: If region or species is not supported.
    """
    species_dict = get_species_for_region(region)

    if species_code not in species_dict:
        available = list(species_dict.keys())
        raise ValueError(
            f"Unknown species '{species_code}' in region '{region}'. "
            f"Available: {available}"
        )

    return species_dict[species_code]


def get_region_metadata(region: str) -> dict[str, Any]:
    """
    Get metadata for a region.

    Args:
        region: Region code.

    Returns:
        Dictionary with region metadata.

    Raises:
        ValueError: If region is not supported.
    """
    if region.lower() not in REGION_METADATA:
        available = list(REGION_METADATA.keys())
        raise ValueError(f"Unknown region '{region}'. Available: {available}")

    return REGION_METADATA[region.lower()]


def get_all_regions() -> list[str]:
    """
    Get list of all supported regions.

    Returns:
        List of region codes.
    """
    return list(SPECIES_BY_REGION.keys())


def get_species_codes_for_region(region: str) -> list[str]:
    """
    Get list of species codes for a region.

    Args:
        region: Region code.

    Returns:
        List of species codes.
    """
    return list(get_species_for_region(region).keys())
