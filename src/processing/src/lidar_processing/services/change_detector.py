"""
Change Detection Service.

Sprint 31-36: Change Detection & Time Series

Implements multi-temporal LiDAR analysis for detecting tree changes
including mortality, ingrowth, and growth over time.
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class ChangeType(str, Enum):
    """Types of detected changes."""
    MORTALITY = "mortality"  # Tree died or was removed
    INGROWTH = "ingrowth"  # New tree appeared
    GROWTH = "growth"  # Tree grew (height/dbh increase)
    DECLINE = "decline"  # Tree health declined
    STABLE = "stable"  # No significant change
    UNMATCHED = "unmatched"  # Could not match between epochs


class MatchConfidence(str, Enum):
    """Confidence level for tree matching."""
    HIGH = "high"  # >90% confidence
    MEDIUM = "medium"  # 70-90% confidence
    LOW = "low"  # 50-70% confidence
    UNMATCHED = "unmatched"  # <50% confidence


@dataclass
class TreeMatch:
    """Matched tree pair between two epochs."""
    match_id: str
    tree_id_t1: str
    tree_id_t2: str | None
    confidence: MatchConfidence
    distance_m: float
    height_diff_m: float
    dbh_diff_cm: float
    crown_diff_m: float
    change_type: ChangeType


@dataclass
class TreeChange:
    """Detected change for a single tree."""
    tree_id: str
    change_type: ChangeType

    # Location
    x: float
    y: float

    # Time 1 measurements
    height_t1: float
    dbh_t1: float | None
    crown_t1: float | None
    species_t1: str | None

    # Time 2 measurements (None if mortality)
    height_t2: float | None
    dbh_t2: float | None
    crown_t2: float | None
    species_t2: str | None

    # Changes
    height_change_m: float
    height_change_pct: float
    dbh_change_cm: float | None
    dbh_change_pct: float | None
    crown_change_m: float | None

    # Carbon change
    carbon_change_kg: float
    co2e_change_kg: float

    # Confidence
    match_confidence: MatchConfidence
    match_distance_m: float


@dataclass
class EpochData:
    """Data for a single temporal epoch."""
    epoch_id: str
    acquisition_date: datetime
    tree_count: int
    total_carbon_kg: float
    total_co2e_kg: float
    mean_height_m: float
    mean_dbh_cm: float | None
    area_hectares: float


@dataclass
class ChangeDetectionResult:
    """Results from change detection analysis."""
    analysis_id: str

    # Epoch info
    epoch_t1: EpochData
    epoch_t2: EpochData
    time_interval_years: float

    # Tree changes
    matched_trees: list[TreeChange]
    mortality_trees: list[TreeChange]
    ingrowth_trees: list[TreeChange]

    # Summary statistics
    total_trees_t1: int
    total_trees_t2: int
    matched_count: int
    mortality_count: int
    ingrowth_count: int
    growth_count: int
    decline_count: int

    # Carbon changes
    carbon_change_total_kg: float
    carbon_change_mortality_kg: float
    carbon_change_ingrowth_kg: float
    carbon_change_growth_kg: float
    co2e_change_total_kg: float

    # Rates
    mortality_rate_pct: float  # Annual mortality rate
    ingrowth_rate_pct: float  # Annual ingrowth rate
    carbon_sequestration_rate_kg_ha_yr: float

    # Processing info
    processing_time_ms: float
    methodology_version: str = "v1.0"


@dataclass
class GrowthProjection:
    """Projected future growth."""
    projection_id: str
    base_epoch: EpochData
    projection_years: int
    projected_carbon_kg: float
    projected_co2e_kg: float
    annual_growth_rate_pct: float
    uncertainty_pct: float


class ChangeDetector:
    """
    Multi-temporal LiDAR change detection service.

    Detects tree mortality, ingrowth, and growth between LiDAR acquisitions.
    """

    def __init__(
        self,
        match_distance_threshold_m: float = 3.0,
        height_tolerance_pct: float = 50.0,
        min_tree_height_m: float = 2.0,
        carbon_fraction: float = 0.47,
    ):
        """
        Initialize change detector.

        Args:
            match_distance_threshold_m: Maximum distance for tree matching
            height_tolerance_pct: Height tolerance for matching (%)
            min_tree_height_m: Minimum tree height to consider
            carbon_fraction: Biomass to carbon conversion factor
        """
        self.match_distance_threshold = match_distance_threshold_m
        self.height_tolerance_pct = height_tolerance_pct
        self.min_tree_height = min_tree_height_m
        self.carbon_fraction = carbon_fraction
        self.co2_conversion = 44 / 12

        logger.info(
            f"Initialized ChangeDetector: match_dist={match_distance_threshold_m}m, "
            f"height_tol={height_tolerance_pct}%"
        )

    def detect_changes(
        self,
        trees_t1: list[dict[str, Any]],
        trees_t2: list[dict[str, Any]],
        date_t1: datetime | str,
        date_t2: datetime | str,
        area_hectares: float,
        epoch_id_t1: str = "epoch_1",
        epoch_id_t2: str = "epoch_2",
    ) -> ChangeDetectionResult:
        """
        Detect changes between two temporal epochs.

        Args:
            trees_t1: Trees from first epoch
            trees_t2: Trees from second epoch
            date_t1: Acquisition date for first epoch
            date_t2: Acquisition date for second epoch
            area_hectares: Analysis area in hectares
            epoch_id_t1: Identifier for first epoch
            epoch_id_t2: Identifier for second epoch

        Returns:
            ChangeDetectionResult with all detected changes
        """
        import time
        start_time = time.time()

        # Parse dates
        if isinstance(date_t1, str):
            date_t1 = datetime.fromisoformat(date_t1.replace("Z", "+00:00"))
        if isinstance(date_t2, str):
            date_t2 = datetime.fromisoformat(date_t2.replace("Z", "+00:00"))

        # Calculate time interval
        time_interval_days = (date_t2 - date_t1).days
        time_interval_years = time_interval_days / 365.25

        logger.info(
            f"Detecting changes: {len(trees_t1)} trees (T1) vs {len(trees_t2)} trees (T2), "
            f"interval={time_interval_years:.2f} years"
        )

        # Build spatial index for T2 trees
        t2_index = self._build_spatial_index(trees_t2)

        # Match trees between epochs
        matches, unmatched_t1, unmatched_t2 = self._match_trees(
            trees_t1, trees_t2, t2_index
        )

        # Classify changes
        matched_changes: list[TreeChange] = []
        mortality_changes: list[TreeChange] = []
        ingrowth_changes: list[TreeChange] = []

        growth_count = 0
        decline_count = 0

        # Process matched trees
        for match in matches:
            tree_t1 = self._find_tree_by_id(trees_t1, match.tree_id_t1)
            tree_t2 = self._find_tree_by_id(trees_t2, match.tree_id_t2) if match.tree_id_t2 else None

            if tree_t1 and tree_t2:
                change = self._create_tree_change(tree_t1, tree_t2, match)
                matched_changes.append(change)

                if change.change_type == ChangeType.GROWTH:
                    growth_count += 1
                elif change.change_type == ChangeType.DECLINE:
                    decline_count += 1

        # Process mortality (T1 trees not found in T2)
        for tree_id in unmatched_t1:
            tree = self._find_tree_by_id(trees_t1, tree_id)
            if tree:
                change = self._create_mortality_change(tree)
                mortality_changes.append(change)

        # Process ingrowth (T2 trees not in T1)
        for tree_id in unmatched_t2:
            tree = self._find_tree_by_id(trees_t2, tree_id)
            if tree:
                change = self._create_ingrowth_change(tree)
                ingrowth_changes.append(change)

        # Calculate carbon changes
        carbon_mortality = sum(c.carbon_change_kg for c in mortality_changes)
        carbon_ingrowth = sum(c.carbon_change_kg for c in ingrowth_changes)
        carbon_growth = sum(c.carbon_change_kg for c in matched_changes)
        carbon_total = carbon_mortality + carbon_ingrowth + carbon_growth
        co2e_total = carbon_total * self.co2_conversion

        # Calculate rates
        mortality_rate = (
            (len(mortality_changes) / len(trees_t1) / time_interval_years * 100)
            if trees_t1 and time_interval_years > 0 else 0
        )
        ingrowth_rate = (
            (len(ingrowth_changes) / len(trees_t1) / time_interval_years * 100)
            if trees_t1 and time_interval_years > 0 else 0
        )
        sequestration_rate = (
            carbon_total / area_hectares / time_interval_years
            if area_hectares > 0 and time_interval_years > 0 else 0
        )

        # Create epoch summaries
        epoch_t1_data = self._create_epoch_data(
            epoch_id_t1, date_t1, trees_t1, area_hectares
        )
        epoch_t2_data = self._create_epoch_data(
            epoch_id_t2, date_t2, trees_t2, area_hectares
        )

        processing_time = (time.time() - start_time) * 1000

        result = ChangeDetectionResult(
            analysis_id=f"CHANGE-{uuid.uuid4().hex[:12].upper()}",
            epoch_t1=epoch_t1_data,
            epoch_t2=epoch_t2_data,
            time_interval_years=time_interval_years,
            matched_trees=matched_changes,
            mortality_trees=mortality_changes,
            ingrowth_trees=ingrowth_changes,
            total_trees_t1=len(trees_t1),
            total_trees_t2=len(trees_t2),
            matched_count=len(matched_changes),
            mortality_count=len(mortality_changes),
            ingrowth_count=len(ingrowth_changes),
            growth_count=growth_count,
            decline_count=decline_count,
            carbon_change_total_kg=carbon_total,
            carbon_change_mortality_kg=carbon_mortality,
            carbon_change_ingrowth_kg=carbon_ingrowth,
            carbon_change_growth_kg=carbon_growth,
            co2e_change_total_kg=co2e_total,
            mortality_rate_pct=mortality_rate,
            ingrowth_rate_pct=ingrowth_rate,
            carbon_sequestration_rate_kg_ha_yr=sequestration_rate,
            processing_time_ms=processing_time,
        )

        logger.info(
            f"Change detection complete: {len(matched_changes)} matched, "
            f"{len(mortality_changes)} mortality, {len(ingrowth_changes)} ingrowth, "
            f"carbon change={carbon_total:.2f}kg"
        )

        return result

    def calculate_growth_rates(
        self,
        trees_t1: list[dict[str, Any]],
        trees_t2: list[dict[str, Any]],
        time_interval_years: float,
    ) -> dict[str, Any]:
        """
        Calculate growth rates between epochs.

        Returns:
            Dictionary with growth rate statistics
        """
        # Build index and match trees
        t2_index = self._build_spatial_index(trees_t2)
        matches, _, _ = self._match_trees(trees_t1, trees_t2, t2_index)

        height_changes = []
        dbh_changes = []

        for match in matches:
            if match.change_type in (ChangeType.GROWTH, ChangeType.STABLE):
                if match.height_diff_m != 0:
                    height_changes.append(match.height_diff_m)
                if match.dbh_diff_cm != 0:
                    dbh_changes.append(match.dbh_diff_cm)

        # Calculate statistics
        if height_changes:
            mean_height_growth = sum(height_changes) / len(height_changes)
            annual_height_growth = mean_height_growth / time_interval_years if time_interval_years > 0 else 0
        else:
            mean_height_growth = 0
            annual_height_growth = 0

        if dbh_changes:
            mean_dbh_growth = sum(dbh_changes) / len(dbh_changes)
            annual_dbh_growth = mean_dbh_growth / time_interval_years if time_interval_years > 0 else 0
        else:
            mean_dbh_growth = 0
            annual_dbh_growth = 0

        return {
            "matched_trees": len(matches),
            "trees_with_height_change": len(height_changes),
            "trees_with_dbh_change": len(dbh_changes),
            "mean_height_change_m": mean_height_growth,
            "annual_height_growth_m_yr": annual_height_growth,
            "mean_dbh_change_cm": mean_dbh_growth,
            "annual_dbh_growth_cm_yr": annual_dbh_growth,
            "time_interval_years": time_interval_years,
        }

    def project_growth(
        self,
        current_trees: list[dict[str, Any]],
        annual_growth_rate_pct: float,
        projection_years: int,
        area_hectares: float,
        current_date: datetime | None = None,
    ) -> GrowthProjection:
        """
        Project future carbon stock based on growth rate.

        Args:
            current_trees: Current tree inventory
            annual_growth_rate_pct: Annual growth rate (%)
            projection_years: Years to project forward
            area_hectares: Project area
            current_date: Current date (default: now)

        Returns:
            GrowthProjection with projected values
        """
        if current_date is None:
            current_date = datetime.utcnow()

        # Calculate current carbon
        current_carbon = sum(
            self._estimate_tree_carbon(tree)
            for tree in current_trees
        )

        # Project forward using compound growth
        growth_factor = (1 + annual_growth_rate_pct / 100) ** projection_years
        projected_carbon = current_carbon * growth_factor
        projected_co2e = projected_carbon * self.co2_conversion

        # Estimate uncertainty (increases with projection length)
        uncertainty_pct = 10 + (projection_years * 2)  # Base 10% + 2% per year

        epoch_data = self._create_epoch_data(
            "current",
            current_date,
            current_trees,
            area_hectares,
        )

        return GrowthProjection(
            projection_id=f"PROJ-{uuid.uuid4().hex[:8].upper()}",
            base_epoch=epoch_data,
            projection_years=projection_years,
            projected_carbon_kg=projected_carbon,
            projected_co2e_kg=projected_co2e,
            annual_growth_rate_pct=annual_growth_rate_pct,
            uncertainty_pct=uncertainty_pct,
        )

    def _build_spatial_index(
        self,
        trees: list[dict[str, Any]],
    ) -> dict[tuple[int, int], list[dict[str, Any]]]:
        """Build a grid-based spatial index for trees."""
        grid_size = self.match_distance_threshold * 2
        index: dict[tuple[int, int], list[dict[str, Any]]] = {}

        for tree in trees:
            x = tree.get("x", 0)
            y = tree.get("y", 0)
            grid_x = int(x / grid_size)
            grid_y = int(y / grid_size)
            key = (grid_x, grid_y)

            if key not in index:
                index[key] = []
            index[key].append(tree)

        return index

    def _match_trees(
        self,
        trees_t1: list[dict[str, Any]],
        trees_t2: list[dict[str, Any]],
        t2_index: dict[tuple[int, int], list[dict[str, Any]]],
    ) -> tuple[list[TreeMatch], set[str], set[str]]:
        """
        Match trees between two epochs using spatial proximity and attributes.

        Returns:
            Tuple of (matches, unmatched_t1_ids, unmatched_t2_ids)
        """
        grid_size = self.match_distance_threshold * 2
        matches: list[TreeMatch] = []
        matched_t1: set[str] = set()
        matched_t2: set[str] = set()

        for tree_t1 in trees_t1:
            tree_id_t1 = tree_t1.get("tree_id", str(id(tree_t1)))
            x1 = tree_t1.get("x", 0)
            y1 = tree_t1.get("y", 0)
            h1 = tree_t1.get("height_m") or tree_t1.get("height", 0)

            # Search neighboring grid cells
            grid_x = int(x1 / grid_size)
            grid_y = int(y1 / grid_size)

            candidates = []
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    key = (grid_x + dx, grid_y + dy)
                    if key in t2_index:
                        candidates.extend(t2_index[key])

            # Find best match
            best_match = None
            best_distance = float("inf")
            best_tree_t2 = None

            for tree_t2 in candidates:
                tree_id_t2 = tree_t2.get("tree_id", str(id(tree_t2)))
                if tree_id_t2 in matched_t2:
                    continue

                x2 = tree_t2.get("x", 0)
                y2 = tree_t2.get("y", 0)
                h2 = tree_t2.get("height_m") or tree_t2.get("height", 0)

                # Calculate distance
                distance = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

                if distance > self.match_distance_threshold:
                    continue

                # Check height tolerance
                if h1 > 0:
                    height_diff_pct = abs(h2 - h1) / h1 * 100
                    if height_diff_pct > self.height_tolerance_pct:
                        continue

                if distance < best_distance:
                    best_distance = distance
                    best_tree_t2 = tree_t2

            if best_tree_t2 is not None:
                tree_id_t2 = best_tree_t2.get("tree_id", str(id(best_tree_t2)))
                h2 = best_tree_t2.get("height_m") or best_tree_t2.get("height", 0)
                dbh1 = tree_t1.get("dbh_cm") or tree_t1.get("dbh", 0)
                dbh2 = best_tree_t2.get("dbh_cm") or best_tree_t2.get("dbh", 0)
                crown1 = tree_t1.get("crown_diameter_m") or tree_t1.get("crown_diameter", 0)
                crown2 = best_tree_t2.get("crown_diameter_m") or best_tree_t2.get("crown_diameter", 0)

                # Determine confidence
                if best_distance < self.match_distance_threshold * 0.3:
                    confidence = MatchConfidence.HIGH
                elif best_distance < self.match_distance_threshold * 0.7:
                    confidence = MatchConfidence.MEDIUM
                else:
                    confidence = MatchConfidence.LOW

                # Determine change type
                height_diff = h2 - h1
                if height_diff > 0.5:  # >0.5m growth
                    change_type = ChangeType.GROWTH
                elif height_diff < -1.0:  # >1m decline (could be crown breakage)
                    change_type = ChangeType.DECLINE
                else:
                    change_type = ChangeType.STABLE

                match = TreeMatch(
                    match_id=f"M-{uuid.uuid4().hex[:8]}",
                    tree_id_t1=tree_id_t1,
                    tree_id_t2=tree_id_t2,
                    confidence=confidence,
                    distance_m=best_distance,
                    height_diff_m=height_diff,
                    dbh_diff_cm=dbh2 - dbh1 if dbh1 and dbh2 else 0,
                    crown_diff_m=crown2 - crown1 if crown1 and crown2 else 0,
                    change_type=change_type,
                )

                matches.append(match)
                matched_t1.add(tree_id_t1)
                matched_t2.add(tree_id_t2)

        # Find unmatched trees
        all_t1_ids = {t.get("tree_id", str(id(t))) for t in trees_t1}
        all_t2_ids = {t.get("tree_id", str(id(t))) for t in trees_t2}

        unmatched_t1 = all_t1_ids - matched_t1
        unmatched_t2 = all_t2_ids - matched_t2

        return matches, unmatched_t1, unmatched_t2

    def _find_tree_by_id(
        self,
        trees: list[dict[str, Any]],
        tree_id: str,
    ) -> dict[str, Any] | None:
        """Find a tree by its ID."""
        for tree in trees:
            if tree.get("tree_id", str(id(tree))) == tree_id:
                return tree
        return None

    def _create_tree_change(
        self,
        tree_t1: dict[str, Any],
        tree_t2: dict[str, Any],
        match: TreeMatch,
    ) -> TreeChange:
        """Create a TreeChange object from matched trees."""
        h1 = tree_t1.get("height_m") or tree_t1.get("height", 0)
        h2 = tree_t2.get("height_m") or tree_t2.get("height", 0)
        dbh1 = tree_t1.get("dbh_cm") or tree_t1.get("dbh")
        dbh2 = tree_t2.get("dbh_cm") or tree_t2.get("dbh")
        crown1 = tree_t1.get("crown_diameter_m") or tree_t1.get("crown_diameter")
        crown2 = tree_t2.get("crown_diameter_m") or tree_t2.get("crown_diameter")

        height_change = h2 - h1 if h1 and h2 else 0
        height_change_pct = (height_change / h1 * 100) if h1 > 0 else 0

        dbh_change = dbh2 - dbh1 if dbh1 and dbh2 else None
        dbh_change_pct = (dbh_change / dbh1 * 100) if dbh1 and dbh_change else None

        crown_change = crown2 - crown1 if crown1 and crown2 else None

        # Calculate carbon change
        carbon_t1 = self._estimate_tree_carbon(tree_t1)
        carbon_t2 = self._estimate_tree_carbon(tree_t2)
        carbon_change = carbon_t2 - carbon_t1

        return TreeChange(
            tree_id=match.tree_id_t1,
            change_type=match.change_type,
            x=tree_t1.get("x", 0),
            y=tree_t1.get("y", 0),
            height_t1=h1,
            dbh_t1=dbh1,
            crown_t1=crown1,
            species_t1=tree_t1.get("species_code"),
            height_t2=h2,
            dbh_t2=dbh2,
            crown_t2=crown2,
            species_t2=tree_t2.get("species_code"),
            height_change_m=height_change,
            height_change_pct=height_change_pct,
            dbh_change_cm=dbh_change,
            dbh_change_pct=dbh_change_pct,
            crown_change_m=crown_change,
            carbon_change_kg=carbon_change,
            co2e_change_kg=carbon_change * self.co2_conversion,
            match_confidence=match.confidence,
            match_distance_m=match.distance_m,
        )

    def _create_mortality_change(self, tree: dict[str, Any]) -> TreeChange:
        """Create a TreeChange for a dead/removed tree."""
        carbon_t1 = self._estimate_tree_carbon(tree)

        return TreeChange(
            tree_id=tree.get("tree_id", str(id(tree))),
            change_type=ChangeType.MORTALITY,
            x=tree.get("x", 0),
            y=tree.get("y", 0),
            height_t1=tree.get("height_m") or tree.get("height", 0),
            dbh_t1=tree.get("dbh_cm") or tree.get("dbh"),
            crown_t1=tree.get("crown_diameter_m") or tree.get("crown_diameter"),
            species_t1=tree.get("species_code"),
            height_t2=None,
            dbh_t2=None,
            crown_t2=None,
            species_t2=None,
            height_change_m=-tree.get("height_m", tree.get("height", 0)),
            height_change_pct=-100,
            dbh_change_cm=None,
            dbh_change_pct=None,
            crown_change_m=None,
            carbon_change_kg=-carbon_t1,  # Carbon loss
            co2e_change_kg=-carbon_t1 * self.co2_conversion,
            match_confidence=MatchConfidence.UNMATCHED,
            match_distance_m=float("inf"),
        )

    def _create_ingrowth_change(self, tree: dict[str, Any]) -> TreeChange:
        """Create a TreeChange for a new tree (ingrowth)."""
        carbon_t2 = self._estimate_tree_carbon(tree)

        return TreeChange(
            tree_id=tree.get("tree_id", str(id(tree))),
            change_type=ChangeType.INGROWTH,
            x=tree.get("x", 0),
            y=tree.get("y", 0),
            height_t1=0,
            dbh_t1=None,
            crown_t1=None,
            species_t1=None,
            height_t2=tree.get("height_m") or tree.get("height", 0),
            dbh_t2=tree.get("dbh_cm") or tree.get("dbh"),
            crown_t2=tree.get("crown_diameter_m") or tree.get("crown_diameter"),
            species_t2=tree.get("species_code"),
            height_change_m=tree.get("height_m") or tree.get("height", 0),
            height_change_pct=float("inf"),  # New tree
            dbh_change_cm=None,
            dbh_change_pct=None,
            crown_change_m=None,
            carbon_change_kg=carbon_t2,  # Carbon gain
            co2e_change_kg=carbon_t2 * self.co2_conversion,
            match_confidence=MatchConfidence.UNMATCHED,
            match_distance_m=float("inf"),
        )

    def _create_epoch_data(
        self,
        epoch_id: str,
        acquisition_date: datetime,
        trees: list[dict[str, Any]],
        area_hectares: float,
    ) -> EpochData:
        """Create epoch summary data."""
        if not trees:
            return EpochData(
                epoch_id=epoch_id,
                acquisition_date=acquisition_date,
                tree_count=0,
                total_carbon_kg=0,
                total_co2e_kg=0,
                mean_height_m=0,
                mean_dbh_cm=None,
                area_hectares=area_hectares,
            )

        heights = [t.get("height_m") or t.get("height", 0) for t in trees]
        dbhs = [t.get("dbh_cm") or t.get("dbh") for t in trees if t.get("dbh_cm") or t.get("dbh")]

        total_carbon = sum(self._estimate_tree_carbon(t) for t in trees)

        return EpochData(
            epoch_id=epoch_id,
            acquisition_date=acquisition_date,
            tree_count=len(trees),
            total_carbon_kg=total_carbon,
            total_co2e_kg=total_carbon * self.co2_conversion,
            mean_height_m=sum(heights) / len(heights) if heights else 0,
            mean_dbh_cm=sum(dbhs) / len(dbhs) if dbhs else None,
            area_hectares=area_hectares,
        )

    def _estimate_tree_carbon(self, tree: dict[str, Any]) -> float:
        """Estimate carbon for a single tree using simple allometry."""
        # Get DBH
        dbh_cm = tree.get("dbh_cm") or tree.get("dbh")

        if not dbh_cm:
            # Estimate from height if no DBH
            height_m = tree.get("height_m") or tree.get("height", 0)
            if height_m > 0:
                # Simple height-DBH relationship
                dbh_cm = 2.5 + 1.5 * height_m
            else:
                return 0

        # Jenkins et al. (2003) softwood equation
        # ln(biomass_kg) = -2.0773 + 2.3323 * ln(dbh_cm)
        if dbh_cm <= 0:
            return 0

        ln_biomass = -2.0773 + 2.3323 * math.log(dbh_cm)
        biomass_kg = math.exp(ln_biomass)

        # Convert to carbon
        carbon_kg = biomass_kg * self.carbon_fraction

        return carbon_kg
