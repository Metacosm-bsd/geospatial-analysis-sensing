"""
FIA Report Generator Service.

Generates Forest Inventory and Analysis (FIA) compliant reports
with proper terminology, codes, and formatting.

Sprint 21-24: FIA Reports & Export
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


# FIA Species Codes (subset for common species)
FIA_SPECIES_CODES: dict[str, int] = {
    # Pacific Northwest Conifers
    "PSME": 202,  # Douglas-fir
    "THPL": 242,  # Western red cedar
    "TSHE": 263,  # Western hemlock
    "PISI": 98,   # Sitka spruce
    "ABGR": 17,   # Grand fir
    "ABPR": 22,   # Noble fir
    "ABAM": 11,   # Pacific silver fir
    "PICO": 108,  # Lodgepole pine
    "PIPO": 122,  # Ponderosa pine
    # Pacific Northwest Hardwoods
    "ALRU": 351,  # Red alder
    "ACMA": 312,  # Bigleaf maple
    "POBAT": 747, # Black cottonwood
    "QUGA": 815,  # Oregon white oak
    "ARME": 361,  # Pacific madrone
    # Southeast Conifers
    "PITA": 131,  # Loblolly pine
    "PIEL": 111,  # Slash pine
    "PIPA": 121,  # Longleaf pine
    # Southeast Hardwoods
    "LIST": 611,  # Sweetgum
    "QUAL": 802,  # White oak
    "QURU": 833,  # Northern red oak
}


class FIATreeStatus(int, Enum):
    """FIA tree status codes."""

    LIVE = 1
    CUT = 2
    DEAD = 3


class FIAConditionClass(int, Enum):
    """FIA forest type group codes."""

    WHITE_RED_JACK_PINE = 100
    SPRUCE_FIR = 120
    LONGLEAF_SLASH_PINE = 140
    LOBLOLLY_SHORTLEAF_PINE = 160
    PINYON_JUNIPER = 180
    DOUGLAS_FIR = 200
    PONDEROSA_PINE = 220
    WESTERN_WHITE_PINE = 240
    FIR_SPRUCE_MTN_HEMLOCK = 260
    LODGEPOLE_PINE = 280
    HEMLOCK_SITKA_SPRUCE = 300
    WESTERN_LARCH = 320
    REDWOOD = 340
    OTHER_SOFTWOOD = 360
    CALIFORNIA_MIXED_CONIFER = 370
    OAK_PINE = 400
    OAK_HICKORY = 500
    OAK_GUM_CYPRESS = 600
    ELM_ASH_COTTONWOOD = 700
    MAPLE_BEECH_BIRCH = 800
    ASPEN_BIRCH = 900
    ALDER_MAPLE = 910
    WESTERN_OAK = 920
    OTHER_HARDWOOD = 990


@dataclass
class FIATreeRecord:
    """FIA tree record format."""

    tree_id: str
    plot_id: str
    subp: int  # Subplot number
    tree_num: int  # Tree number within subplot
    species: int  # FIA species code
    status: FIATreeStatus
    dia: float  # DBH in inches (FIA uses imperial)
    ht: float  # Total height in feet
    actualht: float  # Actual height in feet
    cr: int  # Compacted crown ratio (1-99)
    cclcd: int  # Crown class code
    treeclcd: int  # Tree class code
    volcfgrs: float  # Gross cubic foot volume
    volcfnet: float  # Net cubic foot volume
    volbfnet: float  # Net board foot volume
    drybio_ag: float  # Dry above-ground biomass (pounds)
    carbon_ag: float  # Above-ground carbon (pounds)


@dataclass
class FIAPlotRecord:
    """FIA plot record format."""

    plot_id: str
    state: int
    county: int
    lat: float
    lon: float
    elev: int  # Elevation in feet
    aspect: int
    slope: int
    forest_type: FIAConditionClass
    stand_age: int
    stdszcd: int  # Stand size class
    balive: float  # Basal area of live trees
    carbon_acre: float
    condition_class: int


@dataclass
class FIAReport:
    """Complete FIA report structure."""

    report_id: str
    created_at: datetime
    project_name: str
    location: str | None

    # Summary metrics
    total_plots: int
    total_trees: int
    total_area_acres: float

    # Per-acre metrics
    trees_per_acre: float
    basal_area_per_acre: float
    volume_cuft_per_acre: float
    volume_bf_per_acre: float
    biomass_lb_per_acre: float
    carbon_lb_per_acre: float

    # Species summary
    species_summary: list[dict[str, Any]]

    # Size class distribution
    size_class_distribution: dict[str, int]

    # Records
    plot_records: list[FIAPlotRecord]
    tree_records: list[FIATreeRecord]


class FIAReportGenerator:
    """
    Generates FIA-compliant forest inventory reports.

    Converts metric measurements to imperial (FIA standard),
    applies FIA species codes, and formats data according to
    FIA database specifications.
    """

    def __init__(self) -> None:
        """Initialize FIA report generator."""
        logger.info("Initialized FIAReportGenerator")

    def generate_report(
        self,
        trees: list[dict[str, Any]],
        stands: list[dict[str, Any]] | None = None,
        project_name: str = "Forest Inventory",
        location: str | None = None,
        area_acres: float | None = None,
    ) -> FIAReport:
        """
        Generate FIA-compliant report from tree data.

        Args:
            trees: List of tree dictionaries with metrics
            stands: Optional list of stand dictionaries
            project_name: Project name for report
            location: Project location
            area_acres: Total area in acres

        Returns:
            FIAReport with all FIA-formatted data
        """
        report_id = f"FIA-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

        # Convert trees to FIA records
        tree_records = self._convert_trees_to_fia(trees)

        # Create plot records (one per stand or one for all)
        if stands:
            plot_records = self._convert_stands_to_plots(stands)
        else:
            plot_records = [self._create_single_plot(trees, area_acres)]

        # Calculate summary metrics
        n_trees = len(tree_records)
        total_area = area_acres or self._estimate_area_acres(trees)

        # Per-acre calculations
        tpa = n_trees / total_area if total_area > 0 else 0
        ba_acre = sum(self._calc_ba_sqft(t.dia) for t in tree_records) / total_area if total_area > 0 else 0
        vol_cuft_acre = sum(t.volcfnet for t in tree_records) / total_area if total_area > 0 else 0
        vol_bf_acre = sum(t.volbfnet for t in tree_records) / total_area if total_area > 0 else 0
        bio_lb_acre = sum(t.drybio_ag for t in tree_records) / total_area if total_area > 0 else 0
        carbon_lb_acre = sum(t.carbon_ag for t in tree_records) / total_area if total_area > 0 else 0

        # Species summary
        species_summary = self._calculate_species_summary(tree_records, total_area)

        # Size class distribution
        size_class_dist = self._calculate_size_class_distribution(tree_records)

        return FIAReport(
            report_id=report_id,
            created_at=datetime.now(),
            project_name=project_name,
            location=location,
            total_plots=len(plot_records),
            total_trees=n_trees,
            total_area_acres=round(total_area, 2),
            trees_per_acre=round(tpa, 1),
            basal_area_per_acre=round(ba_acre, 1),
            volume_cuft_per_acre=round(vol_cuft_acre, 1),
            volume_bf_per_acre=round(vol_bf_acre, 0),
            biomass_lb_per_acre=round(bio_lb_acre, 1),
            carbon_lb_per_acre=round(carbon_lb_acre, 1),
            species_summary=species_summary,
            size_class_distribution=size_class_dist,
            plot_records=plot_records,
            tree_records=tree_records,
        )

    def _convert_trees_to_fia(
        self,
        trees: list[dict[str, Any]],
    ) -> list[FIATreeRecord]:
        """Convert tree dictionaries to FIA records."""
        records = []

        for i, tree in enumerate(trees):
            try:
                # Get species code
                species_code = tree.get("species_code", tree.get("speciesCode", ""))
                fia_species = FIA_SPECIES_CODES.get(species_code, 999)

                # Convert measurements to imperial
                dbh_cm = tree.get("dbh", tree.get("dbh_cm", 0)) or 0
                dbh_in = dbh_cm / 2.54

                height_m = tree.get("height", tree.get("height_m", 0)) or 0
                height_ft = height_m * 3.28084

                # Get volume (convert m³ to ft³)
                vol_m3 = tree.get("volume", 0) or 0
                vol_cuft = vol_m3 * 35.3147

                # Board feet (from volume service or estimate)
                bf = tree.get("board_feet", 0) or 0
                if bf == 0 and dbh_in >= 8:
                    bf = ((dbh_in - 4) ** 2) * height_ft / 10

                # Biomass (convert kg to lb)
                bio_kg = tree.get("biomass", 0) or 0
                bio_lb = bio_kg * 2.20462

                # Carbon
                carbon_kg = tree.get("carbon_kg", bio_kg * 0.47) or 0
                carbon_lb = carbon_kg * 2.20462

                # Crown ratio estimate
                crown_diam = tree.get("crown_diameter", tree.get("crownDiameter", 0)) or 0
                cr = min(99, max(1, int((crown_diam / height_m * 100) if height_m > 0 else 50)))

                record = FIATreeRecord(
                    tree_id=str(tree.get("tree_id", tree.get("id", i))),
                    plot_id="P001",
                    subp=1,
                    tree_num=i + 1,
                    species=fia_species,
                    status=FIATreeStatus.LIVE,
                    dia=round(dbh_in, 1),
                    ht=round(height_ft, 0),
                    actualht=round(height_ft, 0),
                    cr=cr,
                    cclcd=3,  # Codominant (default)
                    treeclcd=2,  # Growing-stock tree
                    volcfgrs=round(vol_cuft, 2),
                    volcfnet=round(vol_cuft * 0.95, 2),  # 95% net
                    volbfnet=round(bf, 0),
                    drybio_ag=round(bio_lb, 1),
                    carbon_ag=round(carbon_lb, 1),
                )
                records.append(record)

            except Exception as e:
                logger.warning("Failed to convert tree %s: %s", i, e)

        return records

    def _convert_stands_to_plots(
        self,
        stands: list[dict[str, Any]],
    ) -> list[FIAPlotRecord]:
        """Convert stand dictionaries to FIA plot records."""
        records = []

        for i, stand in enumerate(stands):
            try:
                area_ha = stand.get("area_hectares", 0) or 0
                area_acres = area_ha * 2.47105

                # Determine forest type from dominant species
                dom_species = stand.get("dominant_species", "")
                forest_type = self._get_forest_type(dom_species)

                # Basal area conversion
                ba_m2_ha = stand.get("basal_area_m2_ha", 0) or 0
                ba_sqft_acre = ba_m2_ha * 4.356

                # Carbon conversion
                carbon_t_ha = stand.get("carbon_tonnes_ha", 0) or 0
                carbon_lb_acre = carbon_t_ha * 892.179  # tonnes/ha to lb/acre

                record = FIAPlotRecord(
                    plot_id=stand.get("stand_id", f"P{i+1:03d}"),
                    state=41,  # Oregon (default)
                    county=1,
                    lat=0.0,
                    lon=0.0,
                    elev=0,
                    aspect=0,
                    slope=0,
                    forest_type=forest_type,
                    stand_age=0,
                    stdszcd=self._get_stand_size_code(stand.get("size_class", "")),
                    balive=round(ba_sqft_acre, 1),
                    carbon_acre=round(carbon_lb_acre, 1),
                    condition_class=1,
                )
                records.append(record)

            except Exception as e:
                logger.warning("Failed to convert stand %s: %s", i, e)

        return records

    def _create_single_plot(
        self,
        trees: list[dict[str, Any]],
        area_acres: float | None = None,
    ) -> FIAPlotRecord:
        """Create a single plot record from all trees."""
        if area_acres is None:
            area_acres = self._estimate_area_acres(trees)

        # Calculate metrics
        dbhs = [t.get("dbh", 0) or 0 for t in trees]
        ba_m2 = sum(np.pi / 4 * (d / 100) ** 2 for d in dbhs if d > 0)
        ba_sqft_acre = (ba_m2 * 10.764) / area_acres if area_acres > 0 else 0

        return FIAPlotRecord(
            plot_id="P001",
            state=41,
            county=1,
            lat=0.0,
            lon=0.0,
            elev=0,
            aspect=0,
            slope=0,
            forest_type=FIAConditionClass.DOUGLAS_FIR,
            stand_age=0,
            stdszcd=3,  # Sawtimber
            balive=round(ba_sqft_acre, 1),
            carbon_acre=0.0,
            condition_class=1,
        )

    def _estimate_area_acres(self, trees: list[dict[str, Any]]) -> float:
        """Estimate area from tree coordinates."""
        if len(trees) < 3:
            return 1.0

        try:
            from scipy.spatial import ConvexHull

            coords = []
            for t in trees:
                x = t.get("x", t.get("position", {}).get("x"))
                y = t.get("y", t.get("position", {}).get("y"))
                if x is not None and y is not None:
                    coords.append([float(x), float(y)])

            if len(coords) < 3:
                return 1.0

            hull = ConvexHull(coords)
            area_m2 = hull.volume  # In 2D, volume is area
            area_acres = area_m2 / 4046.86
            return max(0.1, area_acres)

        except Exception:
            return 1.0

    def _calc_ba_sqft(self, dia_inches: float) -> float:
        """Calculate basal area in square feet."""
        return np.pi / 4 * (dia_inches / 12) ** 2

    def _get_forest_type(self, species_code: str) -> FIAConditionClass:
        """Get FIA forest type from dominant species."""
        mapping = {
            "PSME": FIAConditionClass.DOUGLAS_FIR,
            "TSHE": FIAConditionClass.HEMLOCK_SITKA_SPRUCE,
            "THPL": FIAConditionClass.HEMLOCK_SITKA_SPRUCE,
            "PISI": FIAConditionClass.HEMLOCK_SITKA_SPRUCE,
            "ABGR": FIAConditionClass.FIR_SPRUCE_MTN_HEMLOCK,
            "ABPR": FIAConditionClass.FIR_SPRUCE_MTN_HEMLOCK,
            "ABAM": FIAConditionClass.FIR_SPRUCE_MTN_HEMLOCK,
            "PICO": FIAConditionClass.LODGEPOLE_PINE,
            "PIPO": FIAConditionClass.PONDEROSA_PINE,
            "ALRU": FIAConditionClass.ALDER_MAPLE,
            "ACMA": FIAConditionClass.ALDER_MAPLE,
            "QUGA": FIAConditionClass.WESTERN_OAK,
            "PITA": FIAConditionClass.LOBLOLLY_SHORTLEAF_PINE,
            "PIEL": FIAConditionClass.LONGLEAF_SLASH_PINE,
        }
        return mapping.get(species_code, FIAConditionClass.OTHER_SOFTWOOD)

    def _get_stand_size_code(self, size_class: str) -> int:
        """Get FIA stand size code."""
        mapping = {
            "seedling": 1,
            "sapling": 2,
            "poletimber": 3,
            "sawtimber": 4,
        }
        return mapping.get(size_class.lower() if size_class else "", 3)

    def _calculate_species_summary(
        self,
        records: list[FIATreeRecord],
        total_area: float,
    ) -> list[dict[str, Any]]:
        """Calculate species-level summary."""
        species_data: dict[int, dict[str, float]] = {}

        for record in records:
            if record.species not in species_data:
                species_data[record.species] = {
                    "count": 0,
                    "ba_sqft": 0,
                    "vol_cuft": 0,
                    "vol_bf": 0,
                    "biomass_lb": 0,
                }

            species_data[record.species]["count"] += 1
            species_data[record.species]["ba_sqft"] += self._calc_ba_sqft(record.dia)
            species_data[record.species]["vol_cuft"] += record.volcfnet
            species_data[record.species]["vol_bf"] += record.volbfnet
            species_data[record.species]["biomass_lb"] += record.drybio_ag

        # Get species name from code
        code_to_name = {v: k for k, v in FIA_SPECIES_CODES.items()}

        summary = []
        for species_code, data in sorted(species_data.items(), key=lambda x: -x[1]["count"]):
            species_name = code_to_name.get(species_code, f"Species {species_code}")
            summary.append({
                "fia_code": species_code,
                "species_code": species_name,
                "tree_count": int(data["count"]),
                "tpa": round(data["count"] / total_area, 1) if total_area > 0 else 0,
                "ba_sqft_acre": round(data["ba_sqft"] / total_area, 2) if total_area > 0 else 0,
                "vol_cuft_acre": round(data["vol_cuft"] / total_area, 2) if total_area > 0 else 0,
                "vol_bf_acre": round(data["vol_bf"] / total_area, 0) if total_area > 0 else 0,
                "percent_ba": round(
                    data["ba_sqft"] / sum(d["ba_sqft"] for d in species_data.values()) * 100, 1
                ) if sum(d["ba_sqft"] for d in species_data.values()) > 0 else 0,
            })

        return summary

    def _calculate_size_class_distribution(
        self,
        records: list[FIATreeRecord],
    ) -> dict[str, int]:
        """Calculate tree count by diameter class."""
        classes = {
            "0-2": 0,
            "2-4": 0,
            "4-6": 0,
            "6-8": 0,
            "8-10": 0,
            "10-12": 0,
            "12-14": 0,
            "14-16": 0,
            "16-18": 0,
            "18-20": 0,
            "20-24": 0,
            "24-28": 0,
            "28-32": 0,
            "32+": 0,
        }

        for record in records:
            dia = record.dia
            if dia < 2:
                classes["0-2"] += 1
            elif dia < 4:
                classes["2-4"] += 1
            elif dia < 6:
                classes["4-6"] += 1
            elif dia < 8:
                classes["6-8"] += 1
            elif dia < 10:
                classes["8-10"] += 1
            elif dia < 12:
                classes["10-12"] += 1
            elif dia < 14:
                classes["12-14"] += 1
            elif dia < 16:
                classes["14-16"] += 1
            elif dia < 18:
                classes["16-18"] += 1
            elif dia < 20:
                classes["18-20"] += 1
            elif dia < 24:
                classes["20-24"] += 1
            elif dia < 28:
                classes["24-28"] += 1
            elif dia < 32:
                classes["28-32"] += 1
            else:
                classes["32+"] += 1

        return classes

    def to_json(self, report: FIAReport) -> str:
        """Convert FIA report to JSON string."""
        data = {
            "report_id": report.report_id,
            "created_at": report.created_at.isoformat(),
            "project_name": report.project_name,
            "location": report.location,
            "summary": {
                "total_plots": report.total_plots,
                "total_trees": report.total_trees,
                "total_area_acres": report.total_area_acres,
                "trees_per_acre": report.trees_per_acre,
                "basal_area_per_acre": report.basal_area_per_acre,
                "volume_cuft_per_acre": report.volume_cuft_per_acre,
                "volume_bf_per_acre": report.volume_bf_per_acre,
                "biomass_lb_per_acre": report.biomass_lb_per_acre,
                "carbon_lb_per_acre": report.carbon_lb_per_acre,
            },
            "species_summary": report.species_summary,
            "size_class_distribution": report.size_class_distribution,
            "plots": [
                {
                    "plot_id": p.plot_id,
                    "forest_type": p.forest_type.value,
                    "balive": p.balive,
                    "carbon_acre": p.carbon_acre,
                }
                for p in report.plot_records
            ],
        }
        return json.dumps(data, indent=2)

    def to_csv_trees(self, report: FIAReport) -> str:
        """Convert tree records to CSV format."""
        headers = [
            "TREE_ID", "PLOT_ID", "SUBP", "TREE", "SPCD", "STATUSCD",
            "DIA", "HT", "ACTUALHT", "CR", "CCLCD", "TREECLCD",
            "VOLCFGRS", "VOLCFNET", "VOLBFNET", "DRYBIO_AG", "CARBON_AG"
        ]

        lines = [",".join(headers)]

        for t in report.tree_records:
            row = [
                t.tree_id,
                t.plot_id,
                str(t.subp),
                str(t.tree_num),
                str(t.species),
                str(t.status.value),
                str(t.dia),
                str(int(t.ht)),
                str(int(t.actualht)),
                str(t.cr),
                str(t.cclcd),
                str(t.treeclcd),
                f"{t.volcfgrs:.2f}",
                f"{t.volcfnet:.2f}",
                f"{t.volbfnet:.0f}",
                f"{t.drybio_ag:.1f}",
                f"{t.carbon_ag:.1f}",
            ]
            lines.append(",".join(row))

        return "\n".join(lines)
