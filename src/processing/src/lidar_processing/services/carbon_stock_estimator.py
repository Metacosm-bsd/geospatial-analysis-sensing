"""
Carbon Stock Estimator Service.

Sprint 25-30: Carbon Stock Estimation

Implements VCS, CAR, and ACR protocol-compliant carbon stock calculations
with uncertainty propagation and audit trail logging.

VCS = Verified Carbon Standard (Verra)
CAR = Climate Action Reserve
ACR = American Carbon Registry
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class CarbonProtocol(str, Enum):
    """Supported carbon accounting protocols."""
    VCS = "vcs"  # Verified Carbon Standard (Verra)
    CAR = "car"  # Climate Action Reserve
    ACR = "acr"  # American Carbon Registry
    FIA = "fia"  # US Forest Service FIA (reference)


class PoolType(str, Enum):
    """Carbon pool types per VCS methodology."""
    ABOVE_GROUND_LIVE = "above_ground_live"
    BELOW_GROUND_LIVE = "below_ground_live"
    DEAD_WOOD = "dead_wood"
    LITTER = "litter"
    SOIL = "soil"


class UncertaintyMethod(str, Enum):
    """Methods for uncertainty quantification."""
    IPCC_DEFAULT = "ipcc_default"  # IPCC default uncertainty factors
    MONTE_CARLO = "monte_carlo"  # Monte Carlo simulation
    ERROR_PROPAGATION = "error_propagation"  # Analytical error propagation


@dataclass
class UncertaintyEstimate:
    """Uncertainty estimate for a measurement or calculation."""
    value: float
    uncertainty_pct: float  # Percentage uncertainty (95% CI half-width)
    lower_bound: float = 0.0
    upper_bound: float = 0.0
    method: str = "ipcc_default"
    confidence_level: float = 0.95

    def __post_init__(self):
        """Calculate bounds from uncertainty percentage."""
        self.lower_bound = self.value * (1 - self.uncertainty_pct / 100)
        self.upper_bound = self.value * (1 + self.uncertainty_pct / 100)


@dataclass
class CarbonPool:
    """Carbon stock in a specific pool."""
    pool_type: PoolType
    carbon_tonnes: UncertaintyEstimate
    co2e_tonnes: UncertaintyEstimate
    area_hectares: float
    carbon_density_t_ha: float = 0.0

    def __post_init__(self):
        """Calculate carbon density."""
        if self.area_hectares > 0:
            self.carbon_density_t_ha = self.carbon_tonnes.value / self.area_hectares


@dataclass
class TreeCarbonEstimate:
    """Carbon estimate for an individual tree."""
    tree_id: str
    species_code: str | None
    dbh_cm: float
    height_m: float

    # Biomass components (kg)
    aboveground_biomass_kg: UncertaintyEstimate
    belowground_biomass_kg: UncertaintyEstimate
    total_biomass_kg: UncertaintyEstimate

    # Carbon (kg)
    carbon_kg: UncertaintyEstimate
    co2e_kg: UncertaintyEstimate

    # Calculation metadata
    protocol: CarbonProtocol = CarbonProtocol.VCS
    equation_source: str = "jenkins_2003"
    calculation_timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ProjectCarbonStock:
    """Total carbon stock for a project/analysis."""
    project_id: str
    analysis_id: str
    protocol: CarbonProtocol

    # Total estimates
    total_carbon_tonnes: UncertaintyEstimate
    total_co2e_tonnes: UncertaintyEstimate

    # By pool
    pools: dict[PoolType, CarbonPool]

    # Metadata
    area_hectares: float
    tree_count: int
    calculation_date: datetime
    methodology_version: str

    # Audit info
    audit_id: str = ""

    def __post_init__(self):
        """Generate audit ID if not provided."""
        if not self.audit_id:
            self.audit_id = f"CARBON-{uuid.uuid4().hex[:12].upper()}"


@dataclass
class AuditRecord:
    """Audit record for carbon calculations."""
    audit_id: str
    calculation_type: str
    timestamp: datetime

    # Inputs
    input_data: dict[str, Any]

    # Outputs
    output_data: dict[str, Any]

    # Methodology
    protocol: CarbonProtocol
    methodology_version: str
    equation_sources: list[str]

    # Uncertainty
    uncertainty_method: UncertaintyMethod
    uncertainty_pct: float

    # User/system info
    user_id: str | None = None
    system_version: str = "1.0.0"


# Default uncertainty factors from IPCC Guidelines (2006)
IPCC_UNCERTAINTY_FACTORS = {
    "dbh_measurement": 5.0,  # ±5% for DBH measurement
    "height_measurement": 10.0,  # ±10% for height measurement
    "biomass_equation": 30.0,  # ±30% for biomass equations
    "carbon_fraction": 2.0,  # ±2% for carbon fraction (0.47)
    "root_shoot_ratio": 20.0,  # ±20% for root:shoot ratio
    "wood_density": 10.0,  # ±10% for wood density
}

# Protocol-specific parameters
PROTOCOL_PARAMETERS = {
    CarbonProtocol.VCS: {
        "carbon_fraction": 0.47,  # IPCC default
        "co2_conversion": 44 / 12,  # Molecular weight ratio
        "root_shoot_default": 0.26,  # Default R:S ratio for temperate forests
        "conservative_deduction": 0.15,  # 15% conservative deduction
        "methodology": "VM0010",  # VCS methodology
    },
    CarbonProtocol.CAR: {
        "carbon_fraction": 0.50,  # CAR uses 0.50
        "co2_conversion": 44 / 12,
        "root_shoot_default": 0.26,
        "conservative_deduction": 0.20,  # 20% buffer
        "methodology": "CAR Forest Protocol",
    },
    CarbonProtocol.ACR: {
        "carbon_fraction": 0.47,
        "co2_conversion": 44 / 12,
        "root_shoot_default": 0.26,
        "conservative_deduction": 0.18,  # 18% buffer
        "methodology": "ACR Methodology",
    },
    CarbonProtocol.FIA: {
        "carbon_fraction": 0.47,
        "co2_conversion": 44 / 12,
        "root_shoot_default": 0.26,
        "conservative_deduction": 0.0,  # No deduction for FIA
        "methodology": "FIA/Jenkins 2003",
    },
}


class CarbonStockEstimator:
    """
    Carbon stock estimation service.

    Implements VCS, CAR, and ACR protocol-compliant carbon calculations
    with uncertainty propagation and audit trail.
    """

    def __init__(
        self,
        protocol: CarbonProtocol = CarbonProtocol.VCS,
        uncertainty_method: UncertaintyMethod = UncertaintyMethod.ERROR_PROPAGATION,
    ):
        """
        Initialize carbon stock estimator.

        Args:
            protocol: Carbon accounting protocol to use
            uncertainty_method: Method for uncertainty quantification
        """
        self.protocol = protocol
        self.uncertainty_method = uncertainty_method
        self.params = PROTOCOL_PARAMETERS[protocol]
        self.audit_records: list[AuditRecord] = []

        logger.info(f"Initialized CarbonStockEstimator with protocol: {protocol.value}")

    def estimate_tree_carbon(
        self,
        tree_id: str,
        dbh_cm: float,
        height_m: float,
        species_code: str | None = None,
        aboveground_biomass_kg: float | None = None,
    ) -> TreeCarbonEstimate:
        """
        Estimate carbon stock for a single tree.

        Args:
            tree_id: Unique tree identifier
            dbh_cm: Diameter at breast height in centimeters
            height_m: Total tree height in meters
            species_code: Species code (optional)
            aboveground_biomass_kg: Pre-calculated biomass (optional)

        Returns:
            TreeCarbonEstimate with carbon values and uncertainty
        """
        # Calculate or use provided biomass
        if aboveground_biomass_kg is None:
            agb_kg = self._calculate_biomass_jenkins(dbh_cm, species_code)
        else:
            agb_kg = aboveground_biomass_kg

        # Calculate uncertainty for biomass
        agb_uncertainty = self._propagate_biomass_uncertainty(dbh_cm)
        agb_estimate = UncertaintyEstimate(
            value=agb_kg,
            uncertainty_pct=agb_uncertainty,
            method=self.uncertainty_method.value,
        )

        # Calculate belowground biomass using root:shoot ratio
        rs_ratio = self.params["root_shoot_default"]
        bgb_kg = agb_kg * rs_ratio
        bgb_uncertainty = math.sqrt(agb_uncertainty**2 + IPCC_UNCERTAINTY_FACTORS["root_shoot_ratio"]**2)
        bgb_estimate = UncertaintyEstimate(
            value=bgb_kg,
            uncertainty_pct=bgb_uncertainty,
            method=self.uncertainty_method.value,
        )

        # Total biomass
        total_biomass_kg = agb_kg + bgb_kg
        total_biomass_uncertainty = self._combine_uncertainties([
            (agb_kg, agb_uncertainty),
            (bgb_kg, bgb_uncertainty),
        ])
        total_biomass_estimate = UncertaintyEstimate(
            value=total_biomass_kg,
            uncertainty_pct=total_biomass_uncertainty,
            method=self.uncertainty_method.value,
        )

        # Convert to carbon
        carbon_fraction = self.params["carbon_fraction"]
        carbon_kg = total_biomass_kg * carbon_fraction
        carbon_uncertainty = math.sqrt(
            total_biomass_uncertainty**2 + IPCC_UNCERTAINTY_FACTORS["carbon_fraction"]**2
        )
        carbon_estimate = UncertaintyEstimate(
            value=carbon_kg,
            uncertainty_pct=carbon_uncertainty,
            method=self.uncertainty_method.value,
        )

        # Convert to CO2 equivalent
        co2_conversion = self.params["co2_conversion"]
        co2e_kg = carbon_kg * co2_conversion
        co2e_estimate = UncertaintyEstimate(
            value=co2e_kg,
            uncertainty_pct=carbon_uncertainty,  # Same uncertainty as carbon
            method=self.uncertainty_method.value,
        )

        return TreeCarbonEstimate(
            tree_id=tree_id,
            species_code=species_code,
            dbh_cm=dbh_cm,
            height_m=height_m,
            aboveground_biomass_kg=agb_estimate,
            belowground_biomass_kg=bgb_estimate,
            total_biomass_kg=total_biomass_estimate,
            carbon_kg=carbon_estimate,
            co2e_kg=co2e_estimate,
            protocol=self.protocol,
            equation_source="jenkins_2003",
        )

    def estimate_project_carbon(
        self,
        trees: list[dict[str, Any]],
        area_hectares: float,
        project_id: str = "PROJECT001",
        analysis_id: str = "ANALYSIS001",
        include_pools: list[PoolType] | None = None,
    ) -> ProjectCarbonStock:
        """
        Estimate total carbon stock for a project.

        Args:
            trees: List of tree dictionaries with dbh_cm, height_m, etc.
            area_hectares: Total project area in hectares
            project_id: Project identifier
            analysis_id: Analysis identifier
            include_pools: Carbon pools to include (default: above + below ground)

        Returns:
            ProjectCarbonStock with totals and by-pool breakdown
        """
        if include_pools is None:
            include_pools = [PoolType.ABOVE_GROUND_LIVE, PoolType.BELOW_GROUND_LIVE]

        logger.info(f"Estimating carbon for {len(trees)} trees over {area_hectares} hectares")

        # Calculate carbon for each tree
        tree_estimates: list[TreeCarbonEstimate] = []

        for i, tree in enumerate(trees):
            tree_id = tree.get("tree_id", f"tree_{i+1}")
            dbh_cm = tree.get("dbh_cm") or tree.get("dbh", 0)
            height_m = tree.get("height_m") or tree.get("height", 0)
            species_code = tree.get("species_code")
            biomass_kg = tree.get("biomass_kg") or tree.get("aboveground_biomass_kg")

            if dbh_cm <= 0:
                continue

            estimate = self.estimate_tree_carbon(
                tree_id=tree_id,
                dbh_cm=dbh_cm,
                height_m=height_m,
                species_code=species_code,
                aboveground_biomass_kg=biomass_kg,
            )
            tree_estimates.append(estimate)

        # Aggregate by pool
        pools: dict[PoolType, CarbonPool] = {}

        # Above-ground live pool
        if PoolType.ABOVE_GROUND_LIVE in include_pools:
            agb_carbon = sum(t.aboveground_biomass_kg.value * self.params["carbon_fraction"]
                           for t in tree_estimates) / 1000  # kg to tonnes
            agb_uncertainty = self._aggregate_uncertainty(
                [(t.aboveground_biomass_kg.value, t.aboveground_biomass_kg.uncertainty_pct)
                 for t in tree_estimates]
            )
            agb_carbon_estimate = UncertaintyEstimate(
                value=agb_carbon,
                uncertainty_pct=agb_uncertainty,
                method=self.uncertainty_method.value,
            )
            agb_co2e = agb_carbon * self.params["co2_conversion"]
            agb_co2e_estimate = UncertaintyEstimate(
                value=agb_co2e,
                uncertainty_pct=agb_uncertainty,
                method=self.uncertainty_method.value,
            )
            pools[PoolType.ABOVE_GROUND_LIVE] = CarbonPool(
                pool_type=PoolType.ABOVE_GROUND_LIVE,
                carbon_tonnes=agb_carbon_estimate,
                co2e_tonnes=agb_co2e_estimate,
                area_hectares=area_hectares,
            )

        # Below-ground live pool
        if PoolType.BELOW_GROUND_LIVE in include_pools:
            bgb_carbon = sum(t.belowground_biomass_kg.value * self.params["carbon_fraction"]
                           for t in tree_estimates) / 1000
            bgb_uncertainty = self._aggregate_uncertainty(
                [(t.belowground_biomass_kg.value, t.belowground_biomass_kg.uncertainty_pct)
                 for t in tree_estimates]
            )
            bgb_carbon_estimate = UncertaintyEstimate(
                value=bgb_carbon,
                uncertainty_pct=bgb_uncertainty,
                method=self.uncertainty_method.value,
            )
            bgb_co2e = bgb_carbon * self.params["co2_conversion"]
            bgb_co2e_estimate = UncertaintyEstimate(
                value=bgb_co2e,
                uncertainty_pct=bgb_uncertainty,
                method=self.uncertainty_method.value,
            )
            pools[PoolType.BELOW_GROUND_LIVE] = CarbonPool(
                pool_type=PoolType.BELOW_GROUND_LIVE,
                carbon_tonnes=bgb_carbon_estimate,
                co2e_tonnes=bgb_co2e_estimate,
                area_hectares=area_hectares,
            )

        # Calculate totals
        total_carbon = sum(p.carbon_tonnes.value for p in pools.values())
        total_co2e = sum(p.co2e_tonnes.value for p in pools.values())

        # Aggregate uncertainty
        total_uncertainty = self._combine_uncertainties([
            (p.carbon_tonnes.value, p.carbon_tonnes.uncertainty_pct) for p in pools.values()
        ])

        total_carbon_estimate = UncertaintyEstimate(
            value=total_carbon,
            uncertainty_pct=total_uncertainty,
            method=self.uncertainty_method.value,
        )
        total_co2e_estimate = UncertaintyEstimate(
            value=total_co2e,
            uncertainty_pct=total_uncertainty,
            method=self.uncertainty_method.value,
        )

        # Apply conservative deduction if required by protocol
        conservative_deduction = self.params["conservative_deduction"]
        if conservative_deduction > 0:
            total_carbon_estimate.value *= (1 - conservative_deduction)
            total_co2e_estimate.value *= (1 - conservative_deduction)

        result = ProjectCarbonStock(
            project_id=project_id,
            analysis_id=analysis_id,
            protocol=self.protocol,
            total_carbon_tonnes=total_carbon_estimate,
            total_co2e_tonnes=total_co2e_estimate,
            pools=pools,
            area_hectares=area_hectares,
            tree_count=len(tree_estimates),
            calculation_date=datetime.utcnow(),
            methodology_version=self.params["methodology"],
        )

        # Create audit record
        self._create_audit_record(
            calculation_type="project_carbon_stock",
            input_data={
                "tree_count": len(trees),
                "area_hectares": area_hectares,
                "project_id": project_id,
                "analysis_id": analysis_id,
            },
            output_data={
                "total_carbon_tonnes": total_carbon_estimate.value,
                "total_co2e_tonnes": total_co2e_estimate.value,
                "uncertainty_pct": total_uncertainty,
                "pools": {p.value: pools[p].carbon_tonnes.value for p in pools},
            },
            audit_id=result.audit_id,
        )

        logger.info(
            f"Calculated project carbon: {total_carbon_estimate.value:.2f} tC "
            f"({total_co2e_estimate.value:.2f} tCO2e) ±{total_uncertainty:.1f}%"
        )

        return result

    def calculate_carbon_credits(
        self,
        co2e_tonnes: float,
        registry: CarbonProtocol = CarbonProtocol.VCS,
    ) -> dict[str, Any]:
        """
        Calculate carbon credits from CO2e tonnes.

        Args:
            co2e_tonnes: Total CO2 equivalent in tonnes
            registry: Carbon registry for credit calculation

        Returns:
            Dictionary with credit calculations
        """
        params = PROTOCOL_PARAMETERS[registry]
        conservative_deduction = params["conservative_deduction"]

        # Apply conservative deduction
        net_co2e = co2e_tonnes * (1 - conservative_deduction)

        # 1 credit = 1 tonne CO2e
        credits = net_co2e

        # Estimated value ranges (example - varies by market)
        value_ranges = {
            CarbonProtocol.VCS: {"low": 5.0, "mid": 12.0, "high": 25.0},
            CarbonProtocol.CAR: {"low": 8.0, "mid": 15.0, "high": 30.0},
            CarbonProtocol.ACR: {"low": 6.0, "mid": 13.0, "high": 28.0},
            CarbonProtocol.FIA: {"low": 0.0, "mid": 0.0, "high": 0.0},
        }

        prices = value_ranges.get(registry, {"low": 5.0, "mid": 10.0, "high": 20.0})

        return {
            "gross_co2e_tonnes": co2e_tonnes,
            "conservative_deduction_pct": conservative_deduction * 100,
            "net_co2e_tonnes": net_co2e,
            "credits": credits,
            "registry": registry.value,
            "methodology": params["methodology"],
            "estimated_value_usd": {
                "low": credits * prices["low"],
                "mid": credits * prices["mid"],
                "high": credits * prices["high"],
            },
            "price_per_credit_usd": prices,
        }

    def get_audit_records(self) -> list[AuditRecord]:
        """Get all audit records."""
        return self.audit_records

    def export_audit_trail(self, format: str = "json") -> str | dict:
        """
        Export audit trail in specified format.

        Args:
            format: Export format ('json' or 'csv')

        Returns:
            Formatted audit trail
        """
        import json

        records = []
        for record in self.audit_records:
            records.append({
                "audit_id": record.audit_id,
                "calculation_type": record.calculation_type,
                "timestamp": record.timestamp.isoformat(),
                "protocol": record.protocol.value,
                "methodology_version": record.methodology_version,
                "uncertainty_method": record.uncertainty_method.value,
                "uncertainty_pct": record.uncertainty_pct,
                "input_summary": str(record.input_data),
                "output_summary": str(record.output_data),
            })

        if format == "json":
            return json.dumps(records, indent=2)
        elif format == "csv":
            if not records:
                return "audit_id,calculation_type,timestamp,protocol,uncertainty_pct\n"

            headers = list(records[0].keys())
            lines = [",".join(headers)]
            for record in records:
                values = [str(record.get(h, "")).replace(",", ";") for h in headers]
                lines.append(",".join(values))
            return "\n".join(lines)
        else:
            return {"records": records}

    def _calculate_biomass_jenkins(
        self,
        dbh_cm: float,
        species_code: str | None = None,
    ) -> float:
        """
        Calculate biomass using Jenkins et al. (2003) equations.

        Args:
            dbh_cm: Diameter at breast height in centimeters
            species_code: Species code for species-specific equations

        Returns:
            Above-ground biomass in kilograms
        """
        # Jenkins et al. (2003) equations
        # ln(biomass_kg) = b0 + b1 * ln(dbh_cm)

        # Default coefficients for softwood
        b0, b1 = -2.0773, 2.3323

        # Species-specific coefficients
        species_coefficients = {
            "PSME": (-2.0773, 2.3323),  # Douglas-fir
            "THPL": (-2.0773, 2.3323),  # Western red cedar
            "TSHE": (-2.0773, 2.3323),  # Western hemlock
            "PICO": (-2.0773, 2.3323),  # Lodgepole pine
            "PIPO": (-2.0773, 2.3323),  # Ponderosa pine
            "ABGR": (-2.0773, 2.3323),  # Grand fir
            "ALRU": (-2.2094, 2.3867),  # Red alder (hardwood)
            "ACMA": (-2.2094, 2.3867),  # Bigleaf maple (hardwood)
        }

        if species_code and species_code.upper() in species_coefficients:
            b0, b1 = species_coefficients[species_code.upper()]

        # Calculate biomass
        ln_biomass = b0 + b1 * math.log(dbh_cm)
        biomass_kg = math.exp(ln_biomass)

        return biomass_kg

    def _propagate_biomass_uncertainty(self, dbh_cm: float) -> float:
        """
        Propagate uncertainty through biomass calculation.

        Uses IPCC Tier 1 approach for uncertainty propagation.

        Returns:
            Combined uncertainty percentage
        """
        # Combine measurement and equation uncertainties
        dbh_unc = IPCC_UNCERTAINTY_FACTORS["dbh_measurement"]
        eqn_unc = IPCC_UNCERTAINTY_FACTORS["biomass_equation"]

        # Quadrature sum for independent uncertainties
        combined_unc = math.sqrt(dbh_unc**2 + eqn_unc**2)

        return combined_unc

    def _combine_uncertainties(
        self,
        values_uncertainties: list[tuple[float, float]],
    ) -> float:
        """
        Combine uncertainties for summed values.

        Uses quadrature sum weighted by value.

        Args:
            values_uncertainties: List of (value, uncertainty_pct) tuples

        Returns:
            Combined uncertainty percentage
        """
        if not values_uncertainties:
            return 0.0

        total_value = sum(v for v, _ in values_uncertainties)
        if total_value == 0:
            return 0.0

        # Weighted quadrature sum
        variance_sum = sum(
            (v * u / 100) ** 2 for v, u in values_uncertainties
        )

        combined_uncertainty_pct = (math.sqrt(variance_sum) / total_value) * 100

        return combined_uncertainty_pct

    def _aggregate_uncertainty(
        self,
        values_uncertainties: list[tuple[float, float]],
    ) -> float:
        """
        Aggregate uncertainties when summing many similar measurements.

        For n independent measurements with similar uncertainty, the
        combined relative uncertainty decreases as 1/sqrt(n).

        Returns:
            Aggregated uncertainty percentage
        """
        if not values_uncertainties:
            return 0.0

        n = len(values_uncertainties)
        avg_uncertainty = sum(u for _, u in values_uncertainties) / n

        # Reduce uncertainty for aggregation (but not below minimum)
        aggregated_uncertainty = avg_uncertainty / math.sqrt(n)

        # Apply minimum uncertainty floor
        min_uncertainty = 5.0  # 5% minimum
        return max(aggregated_uncertainty, min_uncertainty)

    def _create_audit_record(
        self,
        calculation_type: str,
        input_data: dict[str, Any],
        output_data: dict[str, Any],
        audit_id: str,
        user_id: str | None = None,
    ) -> AuditRecord:
        """Create and store an audit record."""
        record = AuditRecord(
            audit_id=audit_id,
            calculation_type=calculation_type,
            timestamp=datetime.utcnow(),
            input_data=input_data,
            output_data=output_data,
            protocol=self.protocol,
            methodology_version=self.params["methodology"],
            equation_sources=["Jenkins et al. 2003", "IPCC 2006"],
            uncertainty_method=self.uncertainty_method,
            uncertainty_pct=output_data.get("uncertainty_pct", 0),
            user_id=user_id,
        )

        self.audit_records.append(record)
        logger.debug(f"Created audit record: {audit_id}")

        return record
