"""
Growth Projection Engine.

Sprint 37-42: Growth Projections & Timber Value

Implements forest growth projections using regional yield models,
site index estimation, and stand development forecasting.

Key features:
- Site index estimation from height/age relationships
- Growth projection for 5/10/20+ years
- Stand table projection
- Regional yield model support (PNW, Southeast, Northeast)
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
import math
import uuid


class Region(str, Enum):
    """Forest regions with distinct growth models."""
    PNW = "pnw"              # Pacific Northwest
    SOUTHEAST = "southeast"   # Southeastern US
    NORTHEAST = "northeast"   # Northeastern US
    ROCKIES = "rockies"      # Rocky Mountain region
    CALIFORNIA = "california" # California


class GrowthModel(str, Enum):
    """Growth model types."""
    CHAPMAN_RICHARDS = "chapman_richards"
    SCHUMACHER = "schumacher"
    SITE_INDEX = "site_index"
    FVS = "fvs"  # Forest Vegetation Simulator compatible


@dataclass
class SiteIndexEstimate:
    """Site index estimation result."""
    site_index_ft: float          # Site index in feet (height at base age)
    base_age_years: int           # Base age for site index
    height_m: float               # Reference height used
    age_years: float | None       # Estimated or provided age
    confidence: float             # Confidence score 0-1
    method: str                   # Estimation method used
    species_code: str | None = None


@dataclass
class GrowthRate:
    """Annual growth rate estimates."""
    height_growth_m_yr: float     # Height growth (m/year)
    dbh_growth_cm_yr: float       # DBH growth (cm/year)
    basal_area_growth_m2_ha_yr: float  # Basal area growth
    volume_growth_m3_ha_yr: float # Volume growth
    biomass_growth_kg_ha_yr: float  # Biomass growth
    carbon_growth_kg_ha_yr: float   # Carbon sequestration


@dataclass
class StandProjection:
    """Projected stand conditions at a future time."""
    projection_year: int          # Calendar year
    years_from_now: int           # Years from current
    tree_count: int               # Projected tree count
    trees_per_hectare: float
    mean_height_m: float
    dominant_height_m: float
    mean_dbh_cm: float
    qmd_cm: float                 # Quadratic mean diameter
    basal_area_m2_ha: float
    volume_m3_ha: float
    biomass_kg_ha: float
    carbon_kg_ha: float
    co2e_kg_ha: float
    mortality_pct: float          # Cumulative mortality
    site_index_ft: float


@dataclass
class TreeProjection:
    """Projected tree attributes at a future time."""
    tree_id: str
    projection_year: int
    years_from_now: int
    height_m: float
    dbh_cm: float
    crown_diameter_m: float
    volume_m3: float
    biomass_kg: float
    carbon_kg: float
    survival_probability: float   # Probability tree survives to this year


@dataclass
class GrowthProjectionResult:
    """Complete growth projection result."""
    project_id: str
    analysis_id: str
    projection_date: datetime
    base_year: int
    region: Region
    growth_model: GrowthModel
    site_index: SiteIndexEstimate
    area_hectares: float
    current_stand: StandProjection
    projections: list[StandProjection]
    tree_projections: list[TreeProjection]
    annual_growth: GrowthRate
    processing_time_ms: float


# Regional site index coefficients (King 1966, Monserud 1984, etc.)
SITE_INDEX_COEFFICIENTS = {
    Region.PNW: {
        "PSME": {"b1": 2500, "b2": 4.5, "base_age": 50},  # Douglas-fir
        "TSHE": {"b1": 2000, "b2": 4.0, "base_age": 50},  # Western hemlock
        "THPL": {"b1": 1800, "b2": 3.8, "base_age": 50},  # Western redcedar
        "PISI": {"b1": 1600, "b2": 3.5, "base_age": 50},  # Sitka spruce
        "ABGR": {"b1": 2200, "b2": 4.2, "base_age": 50},  # Grand fir
        "default": {"b1": 2000, "b2": 4.0, "base_age": 50},
    },
    Region.SOUTHEAST: {
        "PITA": {"b1": 2800, "b2": 5.0, "base_age": 25},  # Loblolly pine
        "PIEL": {"b1": 2600, "b2": 4.8, "base_age": 25},  # Slash pine
        "PIPA": {"b1": 2400, "b2": 4.5, "base_age": 25},  # Longleaf pine
        "PIEC": {"b1": 2200, "b2": 4.2, "base_age": 25},  # Shortleaf pine
        "default": {"b1": 2500, "b2": 4.5, "base_age": 25},
    },
    Region.NORTHEAST: {
        "PIST": {"b1": 2000, "b2": 4.0, "base_age": 50},  # White pine
        "ACRU": {"b1": 1600, "b2": 3.5, "base_age": 50},  # Red maple
        "QURU": {"b1": 1800, "b2": 3.8, "base_age": 50},  # Red oak
        "BEAL": {"b1": 1500, "b2": 3.3, "base_age": 50},  # Yellow birch
        "default": {"b1": 1700, "b2": 3.6, "base_age": 50},
    },
    Region.ROCKIES: {
        "PIPO": {"b1": 1800, "b2": 3.5, "base_age": 100}, # Ponderosa pine
        "PICO": {"b1": 1400, "b2": 3.0, "base_age": 100}, # Lodgepole pine
        "ABLA": {"b1": 1600, "b2": 3.3, "base_age": 100}, # Subalpine fir
        "PIFL": {"b1": 1200, "b2": 2.8, "base_age": 100}, # Limber pine
        "default": {"b1": 1500, "b2": 3.2, "base_age": 100},
    },
    Region.CALIFORNIA: {
        "PIPO": {"b1": 2200, "b2": 4.0, "base_age": 100}, # Ponderosa pine
        "SEGI": {"b1": 3500, "b2": 5.5, "base_age": 100}, # Giant sequoia
        "SESE": {"b1": 4000, "b2": 6.0, "base_age": 100}, # Coast redwood
        "ABCO": {"b1": 2000, "b2": 4.0, "base_age": 100}, # White fir
        "default": {"b1": 2500, "b2": 4.5, "base_age": 100},
    },
}

# Regional mortality rates (annual % based on SDI)
MORTALITY_RATES = {
    Region.PNW: {"base": 0.5, "sdi_factor": 0.02},
    Region.SOUTHEAST: {"base": 1.0, "sdi_factor": 0.03},
    Region.NORTHEAST: {"base": 0.8, "sdi_factor": 0.025},
    Region.ROCKIES: {"base": 0.6, "sdi_factor": 0.02},
    Region.CALIFORNIA: {"base": 0.4, "sdi_factor": 0.015},
}


class GrowthProjector:
    """
    Forest growth projection engine.

    Uses regional growth models to project stand development
    over time, including height, diameter, volume, and carbon.
    """

    def __init__(
        self,
        region: Region = Region.PNW,
        growth_model: GrowthModel = GrowthModel.CHAPMAN_RICHARDS,
    ):
        self.region = region
        self.growth_model = growth_model
        self.coefficients = SITE_INDEX_COEFFICIENTS.get(region, SITE_INDEX_COEFFICIENTS[Region.PNW])
        self.mortality = MORTALITY_RATES.get(region, MORTALITY_RATES[Region.PNW])

    def estimate_site_index(
        self,
        dominant_height_m: float,
        age_years: float | None = None,
        species_code: str | None = None,
    ) -> SiteIndexEstimate:
        """
        Estimate site index from dominant height.

        If age is not provided, estimates based on regional averages.
        Site index is returned in feet (US forestry standard).
        """
        # Get coefficients for species
        coefs = self.coefficients.get(
            species_code,
            self.coefficients.get("default", {"b1": 2000, "b2": 4.0, "base_age": 50})
        )
        base_age = coefs["base_age"]

        # Convert to feet
        dominant_height_ft = dominant_height_m * 3.28084

        # Estimate age if not provided (using height-age relationship)
        if age_years is None:
            # Rough estimate: assume height ~ log(age) relationship
            # This is simplified; real estimation would use species-specific curves
            estimated_age = math.exp((dominant_height_ft / 10) ** 0.5)
            estimated_age = max(10, min(200, estimated_age))  # Bound to reasonable range
            age_years = estimated_age
            confidence = 0.6  # Lower confidence when age is estimated
        else:
            confidence = 0.85

        # Calculate site index using King (1966) equation:
        # SI = H * (b1 / (b1 - (base_age - age) * H^(1/b2)))
        # Simplified Chapman-Richards form:
        try:
            if age_years > 0:
                # Site index calculation
                age_ratio = base_age / age_years
                si_ft = dominant_height_ft * (age_ratio ** 0.5)

                # Adjust using regional coefficients
                adjustment = 1.0 + (coefs["b2"] / 100) * (1 - age_ratio)
                si_ft *= adjustment

                # Bound to reasonable values
                si_ft = max(30, min(200, si_ft))
            else:
                si_ft = 80  # Default
                confidence = 0.3
        except Exception:
            si_ft = 80
            confidence = 0.3

        return SiteIndexEstimate(
            site_index_ft=round(si_ft, 1),
            base_age_years=base_age,
            height_m=dominant_height_m,
            age_years=age_years,
            confidence=confidence,
            method=f"{self.growth_model.value}_estimation",
            species_code=species_code,
        )

    def calculate_growth_rates(
        self,
        current_height_m: float,
        current_dbh_cm: float,
        site_index_ft: float,
        age_years: float,
        species_code: str | None = None,
    ) -> GrowthRate:
        """
        Calculate annual growth rates based on site index and current conditions.
        """
        # Height growth (Chapman-Richards model)
        # dH/dt = b1 * SI * (1 - H/Hmax)^b2
        coefs = self.coefficients.get(
            species_code,
            self.coefficients.get("default")
        )

        # Maximum potential height based on site index
        max_height_ft = site_index_ft * 2.0
        max_height_m = max_height_ft / 3.28084

        # Height growth rate
        if current_height_m < max_height_m:
            height_ratio = current_height_m / max_height_m
            height_growth = 0.5 * (1 - height_ratio) ** 1.5  # m/year
        else:
            height_growth = 0.05  # Minimal growth at maturity

        # DBH growth correlates with height growth
        # Younger trees allocate more to height, older to diameter
        age_factor = min(1.0, age_years / 50)
        dbh_growth = height_growth * 0.8 * (0.5 + 0.5 * age_factor)  # cm/year

        # Basal area growth (from DBH growth)
        current_ba_m2 = math.pi * (current_dbh_cm / 200) ** 2
        projected_dbh = current_dbh_cm + dbh_growth
        projected_ba_m2 = math.pi * (projected_dbh / 200) ** 2
        ba_growth = (projected_ba_m2 - current_ba_m2) * 1000  # m2/ha (assuming 1000 trees)

        # Volume growth (from height and DBH growth)
        volume_growth = ba_growth * current_height_m * 0.4  # m3/ha/year

        # Biomass growth (Jenkins equations, approximate)
        # Biomass ~ 0.5 * volume * wood_density
        wood_density = 450  # kg/m3 average
        biomass_growth = volume_growth * wood_density * 0.5  # kg/ha/year

        # Carbon growth (biomass * 0.47)
        carbon_growth = biomass_growth * 0.47

        return GrowthRate(
            height_growth_m_yr=round(height_growth, 3),
            dbh_growth_cm_yr=round(dbh_growth, 3),
            basal_area_growth_m2_ha_yr=round(ba_growth, 3),
            volume_growth_m3_ha_yr=round(volume_growth, 2),
            biomass_growth_kg_ha_yr=round(biomass_growth, 1),
            carbon_growth_kg_ha_yr=round(carbon_growth, 1),
        )

    def project_stand(
        self,
        trees: list[dict[str, Any]],
        area_hectares: float,
        projection_years: list[int],
        site_index: SiteIndexEstimate | None = None,
        project_id: str = "PROJECT001",
        analysis_id: str = "ANALYSIS001",
    ) -> GrowthProjectionResult:
        """
        Project stand conditions into the future.

        Args:
            trees: List of tree dictionaries with height, dbh, etc.
            area_hectares: Stand area in hectares
            projection_years: List of years to project (e.g., [5, 10, 20])
            site_index: Pre-calculated site index (or will estimate)
            project_id: Project identifier
            analysis_id: Analysis identifier

        Returns:
            Complete projection result with stand and tree-level projections
        """
        import time
        start_time = time.time()

        if not trees:
            raise ValueError("At least one tree is required for projection")

        current_year = datetime.now().year

        # Calculate current stand metrics
        heights = [t.get("height", t.get("height_m", 0)) for t in trees]
        dbhs = [t.get("dbh", t.get("dbh_cm", 0)) for t in trees]

        mean_height = sum(heights) / len(heights) if heights else 0
        mean_dbh = sum(dbhs) / len(dbhs) if dbhs else 0

        # Dominant height (top 20% by height)
        sorted_heights = sorted(heights, reverse=True)
        top_20_pct = max(1, int(len(sorted_heights) * 0.2))
        dominant_height = sum(sorted_heights[:top_20_pct]) / top_20_pct

        # Estimate site index if not provided
        if site_index is None:
            dominant_species = self._get_dominant_species(trees)
            site_index = self.estimate_site_index(
                dominant_height_m=dominant_height,
                species_code=dominant_species,
            )

        # Calculate current stand metrics
        current_stand = self._calculate_stand_metrics(
            trees=trees,
            area_hectares=area_hectares,
            projection_year=current_year,
            years_from_now=0,
            cumulative_mortality=0,
            site_index=site_index,
        )

        # Calculate annual growth rates
        annual_growth = self.calculate_growth_rates(
            current_height_m=mean_height,
            current_dbh_cm=mean_dbh,
            site_index_ft=site_index.site_index_ft,
            age_years=site_index.age_years or 50,
        )

        # Project into future
        projections = []
        tree_projections = []

        for years in sorted(projection_years):
            if years <= 0:
                continue

            # Calculate cumulative mortality
            annual_mortality = self.mortality["base"] / 100
            cumulative_mortality = 1 - (1 - annual_mortality) ** years

            # Project stand
            stand_proj = self._project_stand_forward(
                current_stand=current_stand,
                annual_growth=annual_growth,
                years=years,
                current_year=current_year,
                cumulative_mortality=cumulative_mortality,
                site_index=site_index,
            )
            projections.append(stand_proj)

            # Project individual trees (sample if too many)
            max_trees = 100
            sample_trees = trees if len(trees) <= max_trees else trees[:max_trees]

            for tree in sample_trees:
                tree_proj = self._project_tree_forward(
                    tree=tree,
                    annual_growth=annual_growth,
                    years=years,
                    current_year=current_year,
                    annual_mortality=annual_mortality,
                )
                tree_projections.append(tree_proj)

        processing_time = (time.time() - start_time) * 1000

        return GrowthProjectionResult(
            project_id=project_id,
            analysis_id=analysis_id,
            projection_date=datetime.now(),
            base_year=current_year,
            region=self.region,
            growth_model=self.growth_model,
            site_index=site_index,
            area_hectares=area_hectares,
            current_stand=current_stand,
            projections=projections,
            tree_projections=tree_projections,
            annual_growth=annual_growth,
            processing_time_ms=processing_time,
        )

    def _get_dominant_species(self, trees: list[dict]) -> str | None:
        """Get the most common species code from trees."""
        species_counts: dict[str, int] = {}
        for tree in trees:
            sp = tree.get("species_code", tree.get("species"))
            if sp:
                species_counts[sp] = species_counts.get(sp, 0) + 1

        if not species_counts:
            return None

        return max(species_counts, key=species_counts.get)

    def _calculate_stand_metrics(
        self,
        trees: list[dict],
        area_hectares: float,
        projection_year: int,
        years_from_now: int,
        cumulative_mortality: float,
        site_index: SiteIndexEstimate,
    ) -> StandProjection:
        """Calculate stand-level metrics from trees."""
        if not trees:
            raise ValueError("No trees provided")

        heights = [t.get("height", t.get("height_m", 0)) for t in trees]
        dbhs = [t.get("dbh", t.get("dbh_cm", 0)) for t in trees]

        tree_count = len(trees)
        trees_per_ha = tree_count / area_hectares if area_hectares > 0 else 0

        mean_height = sum(heights) / len(heights)

        # Dominant height (top 20%)
        sorted_heights = sorted(heights, reverse=True)
        top_count = max(1, int(len(sorted_heights) * 0.2))
        dominant_height = sum(sorted_heights[:top_count]) / top_count

        mean_dbh = sum(dbhs) / len(dbhs) if dbhs else 0

        # Quadratic mean diameter
        sum_dbh_sq = sum(d ** 2 for d in dbhs if d > 0)
        qmd = math.sqrt(sum_dbh_sq / len(dbhs)) if dbhs else 0

        # Basal area
        ba_per_tree = [math.pi * (d / 200) ** 2 for d in dbhs if d > 0]
        total_ba = sum(ba_per_tree)
        ba_m2_ha = total_ba / area_hectares if area_hectares > 0 else 0

        # Volume (using simplified form factor)
        form_factor = 0.42
        volumes = [
            ba * h * form_factor
            for ba, h in zip(ba_per_tree, heights)
        ]
        total_volume = sum(volumes)
        volume_m3_ha = total_volume / area_hectares if area_hectares > 0 else 0

        # Biomass and carbon
        wood_density = 450  # kg/m3
        biomass_kg_ha = volume_m3_ha * wood_density
        carbon_kg_ha = biomass_kg_ha * 0.47
        co2e_kg_ha = carbon_kg_ha * (44 / 12)

        return StandProjection(
            projection_year=projection_year,
            years_from_now=years_from_now,
            tree_count=tree_count,
            trees_per_hectare=round(trees_per_ha, 1),
            mean_height_m=round(mean_height, 2),
            dominant_height_m=round(dominant_height, 2),
            mean_dbh_cm=round(mean_dbh, 1),
            qmd_cm=round(qmd, 1),
            basal_area_m2_ha=round(ba_m2_ha, 2),
            volume_m3_ha=round(volume_m3_ha, 1),
            biomass_kg_ha=round(biomass_kg_ha, 0),
            carbon_kg_ha=round(carbon_kg_ha, 0),
            co2e_kg_ha=round(co2e_kg_ha, 0),
            mortality_pct=round(cumulative_mortality * 100, 1),
            site_index_ft=site_index.site_index_ft,
        )

    def _project_stand_forward(
        self,
        current_stand: StandProjection,
        annual_growth: GrowthRate,
        years: int,
        current_year: int,
        cumulative_mortality: float,
        site_index: SiteIndexEstimate,
    ) -> StandProjection:
        """Project stand metrics forward in time."""
        # Surviving trees
        survival_rate = 1 - cumulative_mortality
        projected_trees = int(current_stand.tree_count * survival_rate)

        # Project heights (decreasing growth with age)
        growth_modifier = 1.0 - (years / 100) * 0.3  # Decreasing growth
        height_growth = annual_growth.height_growth_m_yr * years * growth_modifier
        projected_height = current_stand.mean_height_m + height_growth
        projected_dom_height = current_stand.dominant_height_m + height_growth * 1.1

        # Project DBH
        dbh_growth = annual_growth.dbh_growth_cm_yr * years * growth_modifier
        projected_dbh = current_stand.mean_dbh_cm + dbh_growth
        projected_qmd = current_stand.qmd_cm + dbh_growth * 1.05

        # Basal area (accounting for mortality)
        ba_growth = annual_growth.basal_area_growth_m2_ha_yr * years * survival_rate
        projected_ba = current_stand.basal_area_m2_ha + ba_growth

        # Volume
        volume_growth = annual_growth.volume_growth_m3_ha_yr * years * survival_rate
        projected_volume = current_stand.volume_m3_ha + volume_growth

        # Biomass and carbon
        biomass_growth = annual_growth.biomass_growth_kg_ha_yr * years * survival_rate
        carbon_growth = annual_growth.carbon_growth_kg_ha_yr * years * survival_rate

        projected_biomass = current_stand.biomass_kg_ha + biomass_growth
        projected_carbon = current_stand.carbon_kg_ha + carbon_growth
        projected_co2e = projected_carbon * (44 / 12)

        return StandProjection(
            projection_year=current_year + years,
            years_from_now=years,
            tree_count=projected_trees,
            trees_per_hectare=round(projected_trees / (current_stand.tree_count / current_stand.trees_per_hectare), 1),
            mean_height_m=round(projected_height, 2),
            dominant_height_m=round(projected_dom_height, 2),
            mean_dbh_cm=round(projected_dbh, 1),
            qmd_cm=round(projected_qmd, 1),
            basal_area_m2_ha=round(projected_ba, 2),
            volume_m3_ha=round(projected_volume, 1),
            biomass_kg_ha=round(projected_biomass, 0),
            carbon_kg_ha=round(projected_carbon, 0),
            co2e_kg_ha=round(projected_co2e, 0),
            mortality_pct=round(cumulative_mortality * 100, 1),
            site_index_ft=site_index.site_index_ft,
        )

    def _project_tree_forward(
        self,
        tree: dict,
        annual_growth: GrowthRate,
        years: int,
        current_year: int,
        annual_mortality: float,
    ) -> TreeProjection:
        """Project individual tree forward in time."""
        tree_id = tree.get("tree_id", tree.get("id", str(uuid.uuid4())[:8]))
        current_height = tree.get("height", tree.get("height_m", 0))
        current_dbh = tree.get("dbh", tree.get("dbh_cm", 0))
        current_crown = tree.get("crown_diameter", tree.get("crown_diameter_m", 0))

        # Calculate survival probability
        survival_prob = (1 - annual_mortality) ** years

        # Project with decreasing growth rate
        growth_modifier = 1.0 - (years / 100) * 0.3

        projected_height = current_height + (annual_growth.height_growth_m_yr * years * growth_modifier)
        projected_dbh = current_dbh + (annual_growth.dbh_growth_cm_yr * years * growth_modifier)

        # Crown grows more slowly
        crown_growth_rate = annual_growth.dbh_growth_cm_yr / 100  # m/year
        projected_crown = current_crown + (crown_growth_rate * years * growth_modifier)

        # Volume (simplified)
        ba = math.pi * (projected_dbh / 200) ** 2
        projected_volume = ba * projected_height * 0.42

        # Biomass and carbon
        projected_biomass = projected_volume * 450 * 0.5
        projected_carbon = projected_biomass * 0.47

        return TreeProjection(
            tree_id=tree_id,
            projection_year=current_year + years,
            years_from_now=years,
            height_m=round(projected_height, 2),
            dbh_cm=round(projected_dbh, 1),
            crown_diameter_m=round(projected_crown, 2),
            volume_m3=round(projected_volume, 4),
            biomass_kg=round(projected_biomass, 1),
            carbon_kg=round(projected_carbon, 1),
            survival_probability=round(survival_prob, 3),
        )


def project_growth(
    trees: list[dict],
    area_hectares: float,
    projection_years: list[int] = None,
    region: str = "pnw",
    project_id: str = "PROJECT001",
) -> GrowthProjectionResult:
    """
    Convenience function for growth projection.

    Args:
        trees: List of tree dictionaries
        area_hectares: Stand area
        projection_years: Years to project (default: [5, 10, 20])
        region: Forest region
        project_id: Project identifier

    Returns:
        Growth projection result
    """
    if projection_years is None:
        projection_years = [5, 10, 20]

    try:
        region_enum = Region(region.lower())
    except ValueError:
        region_enum = Region.PNW

    projector = GrowthProjector(region=region_enum)
    return projector.project_stand(
        trees=trees,
        area_hectares=area_hectares,
        projection_years=projection_years,
        project_id=project_id,
    )
