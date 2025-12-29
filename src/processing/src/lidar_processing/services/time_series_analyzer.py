"""
Time Series Analysis Service.

Sprint 31-36: Change Detection & Time Series

Implements multi-epoch time series analysis for forest monitoring,
trend detection, and growth projection.
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np

from lidar_processing.services.change_detector import (
    ChangeDetector,
    ChangeDetectionResult,
    ChangeType,
    EpochData,
    GrowthProjection,
)

logger = logging.getLogger(__name__)


@dataclass
class TimeSeriesEpoch:
    """Data for a single epoch in a time series."""
    epoch_id: str
    date: datetime
    tree_count: int
    area_hectares: float

    # Aggregate metrics
    total_carbon_kg: float
    total_co2e_kg: float
    carbon_density_kg_ha: float
    mean_height_m: float
    mean_dbh_cm: float | None
    basal_area_m2_ha: float

    # Per-hectare metrics
    trees_per_hectare: float
    volume_m3_ha: float | None


@dataclass
class TimeSeriesTrend:
    """Trend analysis results."""
    metric_name: str
    unit: str
    start_value: float
    end_value: float
    absolute_change: float
    percent_change: float
    annual_rate: float
    trend_direction: str  # "increasing", "decreasing", "stable"
    r_squared: float  # Goodness of fit
    p_value: float | None  # Statistical significance


@dataclass
class TimeSeriesAnalysis:
    """Complete time series analysis results."""
    analysis_id: str
    project_id: str

    # Time range
    start_date: datetime
    end_date: datetime
    total_years: float
    epoch_count: int

    # Epochs
    epochs: list[TimeSeriesEpoch]

    # Pairwise changes
    pairwise_changes: list[ChangeDetectionResult]

    # Trends
    trends: dict[str, TimeSeriesTrend]

    # Summary statistics
    net_carbon_change_kg: float
    net_co2e_change_kg: float
    total_mortality_count: int
    total_ingrowth_count: int
    average_annual_mortality_rate: float
    average_annual_ingrowth_rate: float
    average_sequestration_rate_kg_ha_yr: float

    # Processing info
    generated_at: datetime
    processing_time_ms: float


@dataclass
class ForecastResult:
    """Future projection forecast."""
    forecast_id: str
    base_analysis_id: str
    forecast_years: list[int]

    # Projections
    projected_carbon_kg: list[float]
    projected_co2e_kg: list[float]
    projected_tree_count: list[float]

    # Uncertainty bounds
    upper_bound_carbon: list[float]
    lower_bound_carbon: list[float]

    # Model parameters
    growth_rate_pct: float
    mortality_rate_pct: float
    ingrowth_rate_pct: float
    model_type: str  # "linear", "exponential", "logistic"

    # Confidence
    confidence_level: float
    uncertainty_pct: float


class TimeSeriesAnalyzer:
    """
    Multi-epoch time series analysis service.

    Analyzes trends and patterns across multiple LiDAR acquisitions.
    """

    def __init__(self):
        """Initialize time series analyzer."""
        self.change_detector = ChangeDetector()
        logger.info("Initialized TimeSeriesAnalyzer")

    def analyze_time_series(
        self,
        epochs: list[dict[str, Any]],
        area_hectares: float,
        project_id: str = "PROJECT001",
    ) -> TimeSeriesAnalysis:
        """
        Perform time series analysis across multiple epochs.

        Args:
            epochs: List of epoch data, each with 'date' and 'trees' keys
            area_hectares: Analysis area in hectares
            project_id: Project identifier

        Returns:
            TimeSeriesAnalysis with trends and statistics
        """
        import time
        start_time = time.time()

        # Sort epochs by date
        sorted_epochs = sorted(
            epochs,
            key=lambda e: datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
            if isinstance(e["date"], str) else e["date"]
        )

        logger.info(f"Analyzing time series with {len(sorted_epochs)} epochs")

        # Create TimeSeriesEpoch objects
        ts_epochs: list[TimeSeriesEpoch] = []
        for i, epoch in enumerate(sorted_epochs):
            date = epoch["date"]
            if isinstance(date, str):
                date = datetime.fromisoformat(date.replace("Z", "+00:00"))

            ts_epoch = self._create_time_series_epoch(
                epoch_id=epoch.get("epoch_id", f"epoch_{i+1}"),
                date=date,
                trees=epoch["trees"],
                area_hectares=area_hectares,
            )
            ts_epochs.append(ts_epoch)

        # Perform pairwise change detection
        pairwise_changes: list[ChangeDetectionResult] = []
        for i in range(len(sorted_epochs) - 1):
            epoch_t1 = sorted_epochs[i]
            epoch_t2 = sorted_epochs[i + 1]

            date_t1 = epoch_t1["date"]
            date_t2 = epoch_t2["date"]
            if isinstance(date_t1, str):
                date_t1 = datetime.fromisoformat(date_t1.replace("Z", "+00:00"))
            if isinstance(date_t2, str):
                date_t2 = datetime.fromisoformat(date_t2.replace("Z", "+00:00"))

            change_result = self.change_detector.detect_changes(
                trees_t1=epoch_t1["trees"],
                trees_t2=epoch_t2["trees"],
                date_t1=date_t1,
                date_t2=date_t2,
                area_hectares=area_hectares,
                epoch_id_t1=ts_epochs[i].epoch_id,
                epoch_id_t2=ts_epochs[i + 1].epoch_id,
            )
            pairwise_changes.append(change_result)

        # Calculate trends
        trends = self._calculate_trends(ts_epochs)

        # Calculate summary statistics
        total_mortality = sum(c.mortality_count for c in pairwise_changes)
        total_ingrowth = sum(c.ingrowth_count for c in pairwise_changes)

        # Calculate rates
        total_years = (ts_epochs[-1].date - ts_epochs[0].date).days / 365.25
        avg_mortality_rate = (
            sum(c.mortality_rate_pct for c in pairwise_changes) / len(pairwise_changes)
            if pairwise_changes else 0
        )
        avg_ingrowth_rate = (
            sum(c.ingrowth_rate_pct for c in pairwise_changes) / len(pairwise_changes)
            if pairwise_changes else 0
        )
        avg_sequestration = (
            sum(c.carbon_sequestration_rate_kg_ha_yr for c in pairwise_changes) / len(pairwise_changes)
            if pairwise_changes else 0
        )

        # Net carbon change
        net_carbon = ts_epochs[-1].total_carbon_kg - ts_epochs[0].total_carbon_kg
        net_co2e = ts_epochs[-1].total_co2e_kg - ts_epochs[0].total_co2e_kg

        processing_time = (time.time() - start_time) * 1000

        result = TimeSeriesAnalysis(
            analysis_id=f"TSERIES-{uuid.uuid4().hex[:12].upper()}",
            project_id=project_id,
            start_date=ts_epochs[0].date,
            end_date=ts_epochs[-1].date,
            total_years=total_years,
            epoch_count=len(ts_epochs),
            epochs=ts_epochs,
            pairwise_changes=pairwise_changes,
            trends=trends,
            net_carbon_change_kg=net_carbon,
            net_co2e_change_kg=net_co2e,
            total_mortality_count=total_mortality,
            total_ingrowth_count=total_ingrowth,
            average_annual_mortality_rate=avg_mortality_rate,
            average_annual_ingrowth_rate=avg_ingrowth_rate,
            average_sequestration_rate_kg_ha_yr=avg_sequestration,
            generated_at=datetime.utcnow(),
            processing_time_ms=processing_time,
        )

        logger.info(
            f"Time series analysis complete: {len(ts_epochs)} epochs, "
            f"{total_years:.1f} years, net carbon change={net_carbon:.0f}kg"
        )

        return result

    def forecast_future(
        self,
        time_series: TimeSeriesAnalysis,
        forecast_years: list[int] = [5, 10, 20],
        model_type: str = "linear",
        confidence_level: float = 0.95,
    ) -> ForecastResult:
        """
        Project future conditions based on historical trends.

        Args:
            time_series: Historical time series analysis
            forecast_years: Years to project (from last epoch)
            model_type: Projection model ("linear", "exponential")
            confidence_level: Confidence level for bounds

        Returns:
            ForecastResult with projections and uncertainty
        """
        logger.info(f"Forecasting for years: {forecast_years}")

        # Get carbon trend
        carbon_trend = time_series.trends.get("carbon_density")

        if not carbon_trend:
            raise ValueError("No carbon trend available for forecasting")

        # Get last epoch values
        last_epoch = time_series.epochs[-1]
        base_carbon = last_epoch.total_carbon_kg
        base_trees = last_epoch.tree_count

        # Calculate growth parameters from trends
        growth_rate = carbon_trend.annual_rate / base_carbon * 100 if base_carbon > 0 else 0

        # Project forward
        projected_carbon = []
        projected_co2e = []
        projected_trees = []
        upper_carbon = []
        lower_carbon = []

        # Uncertainty increases with projection length
        base_uncertainty = 10  # 10% base uncertainty

        for years in forecast_years:
            if model_type == "exponential":
                # Exponential growth
                carbon = base_carbon * math.exp(growth_rate / 100 * years)
            else:
                # Linear growth
                carbon = base_carbon + (carbon_trend.annual_rate * years)

            # Project tree count using net change rate
            net_tree_rate = time_series.average_annual_ingrowth_rate - time_series.average_annual_mortality_rate
            trees = base_trees * (1 + net_tree_rate / 100) ** years

            # Calculate uncertainty bounds
            uncertainty = base_uncertainty + years * 1.5  # Increases 1.5% per year
            upper = carbon * (1 + uncertainty / 100)
            lower = carbon * (1 - uncertainty / 100)

            projected_carbon.append(max(0, carbon))
            projected_co2e.append(max(0, carbon * (44 / 12)))
            projected_trees.append(max(0, trees))
            upper_carbon.append(max(0, upper))
            lower_carbon.append(max(0, lower))

        return ForecastResult(
            forecast_id=f"FORECAST-{uuid.uuid4().hex[:8].upper()}",
            base_analysis_id=time_series.analysis_id,
            forecast_years=forecast_years,
            projected_carbon_kg=projected_carbon,
            projected_co2e_kg=projected_co2e,
            projected_tree_count=projected_trees,
            upper_bound_carbon=upper_carbon,
            lower_bound_carbon=lower_carbon,
            growth_rate_pct=growth_rate,
            mortality_rate_pct=time_series.average_annual_mortality_rate,
            ingrowth_rate_pct=time_series.average_annual_ingrowth_rate,
            model_type=model_type,
            confidence_level=confidence_level,
            uncertainty_pct=base_uncertainty,
        )

    def _create_time_series_epoch(
        self,
        epoch_id: str,
        date: datetime,
        trees: list[dict[str, Any]],
        area_hectares: float,
    ) -> TimeSeriesEpoch:
        """Create a TimeSeriesEpoch from tree data."""
        if not trees:
            return TimeSeriesEpoch(
                epoch_id=epoch_id,
                date=date,
                tree_count=0,
                area_hectares=area_hectares,
                total_carbon_kg=0,
                total_co2e_kg=0,
                carbon_density_kg_ha=0,
                mean_height_m=0,
                mean_dbh_cm=None,
                basal_area_m2_ha=0,
                trees_per_hectare=0,
                volume_m3_ha=None,
            )

        # Calculate metrics
        heights = [t.get("height_m") or t.get("height", 0) for t in trees]
        dbhs = [t.get("dbh_cm") or t.get("dbh") for t in trees if t.get("dbh_cm") or t.get("dbh")]
        volumes = [t.get("volume_m3") for t in trees if t.get("volume_m3")]

        # Carbon calculation
        carbon_fraction = 0.47
        co2_conversion = 44 / 12

        total_carbon = 0
        total_basal_area = 0

        for tree in trees:
            dbh_cm = tree.get("dbh_cm") or tree.get("dbh")

            # Estimate carbon
            if dbh_cm and dbh_cm > 0:
                # Jenkins equation
                ln_biomass = -2.0773 + 2.3323 * math.log(dbh_cm)
                biomass_kg = math.exp(ln_biomass)
                total_carbon += biomass_kg * carbon_fraction

                # Basal area
                radius_m = dbh_cm / 100 / 2
                total_basal_area += math.pi * radius_m ** 2
            elif tree.get("carbon_kg"):
                total_carbon += tree["carbon_kg"]
            elif tree.get("biomass_kg"):
                total_carbon += tree["biomass_kg"] * carbon_fraction

        return TimeSeriesEpoch(
            epoch_id=epoch_id,
            date=date,
            tree_count=len(trees),
            area_hectares=area_hectares,
            total_carbon_kg=total_carbon,
            total_co2e_kg=total_carbon * co2_conversion,
            carbon_density_kg_ha=total_carbon / area_hectares if area_hectares > 0 else 0,
            mean_height_m=sum(heights) / len(heights) if heights else 0,
            mean_dbh_cm=sum(dbhs) / len(dbhs) if dbhs else None,
            basal_area_m2_ha=total_basal_area / area_hectares if area_hectares > 0 else 0,
            trees_per_hectare=len(trees) / area_hectares if area_hectares > 0 else 0,
            volume_m3_ha=sum(volumes) / area_hectares if volumes and area_hectares > 0 else None,
        )

    def _calculate_trends(
        self,
        epochs: list[TimeSeriesEpoch],
    ) -> dict[str, TimeSeriesTrend]:
        """Calculate trends for various metrics."""
        if len(epochs) < 2:
            return {}

        trends = {}

        # Time values (in years from start)
        start_date = epochs[0].date
        times = [(e.date - start_date).days / 365.25 for e in epochs]
        total_years = times[-1]

        # Metrics to analyze
        metrics = [
            ("carbon_density", "kg/ha", [e.carbon_density_kg_ha for e in epochs]),
            ("tree_count", "trees", [float(e.tree_count) for e in epochs]),
            ("mean_height", "m", [e.mean_height_m for e in epochs]),
            ("basal_area", "m²/ha", [e.basal_area_m2_ha for e in epochs]),
            ("trees_per_hectare", "trees/ha", [e.trees_per_hectare for e in epochs]),
        ]

        for metric_name, unit, values in metrics:
            if not all(v is not None for v in values):
                continue

            # Simple linear regression
            trend = self._linear_regression(times, values, metric_name, unit, total_years)
            if trend:
                trends[metric_name] = trend

        return trends

    def _linear_regression(
        self,
        x: list[float],
        y: list[float],
        metric_name: str,
        unit: str,
        total_years: float,
    ) -> TimeSeriesTrend | None:
        """Perform simple linear regression."""
        n = len(x)
        if n < 2:
            return None

        # Calculate means
        x_mean = sum(x) / n
        y_mean = sum(y) / n

        # Calculate slope and intercept
        numerator = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(n))
        denominator = sum((x[i] - x_mean) ** 2 for i in range(n))

        if denominator == 0:
            return None

        slope = numerator / denominator
        intercept = y_mean - slope * x_mean

        # Calculate R-squared
        y_pred = [slope * x[i] + intercept for i in range(n)]
        ss_res = sum((y[i] - y_pred[i]) ** 2 for i in range(n))
        ss_tot = sum((y[i] - y_mean) ** 2 for i in range(n))
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

        # Determine trend direction
        if abs(slope * total_years) < 0.01 * y[0]:  # Less than 1% change
            direction = "stable"
        elif slope > 0:
            direction = "increasing"
        else:
            direction = "decreasing"

        absolute_change = y[-1] - y[0]
        percent_change = (absolute_change / y[0] * 100) if y[0] != 0 else 0

        return TimeSeriesTrend(
            metric_name=metric_name,
            unit=unit,
            start_value=y[0],
            end_value=y[-1],
            absolute_change=absolute_change,
            percent_change=percent_change,
            annual_rate=slope,
            trend_direction=direction,
            r_squared=r_squared,
            p_value=None,  # Would require scipy for proper calculation
        )

    def export_to_geojson(
        self,
        time_series: TimeSeriesAnalysis,
        change_type_filter: list[ChangeType] | None = None,
    ) -> dict[str, Any]:
        """
        Export change detection results to GeoJSON.

        Args:
            time_series: Time series analysis results
            change_type_filter: Filter by change types (None = all)

        Returns:
            GeoJSON FeatureCollection
        """
        features = []

        for change_result in time_series.pairwise_changes:
            # Combine all changes
            all_changes = (
                change_result.matched_trees +
                change_result.mortality_trees +
                change_result.ingrowth_trees
            )

            for tree_change in all_changes:
                # Filter by type if specified
                if change_type_filter and tree_change.change_type not in change_type_filter:
                    continue

                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [tree_change.x, tree_change.y],
                    },
                    "properties": {
                        "tree_id": tree_change.tree_id,
                        "change_type": tree_change.change_type.value,
                        "height_t1": tree_change.height_t1,
                        "height_t2": tree_change.height_t2,
                        "height_change_m": tree_change.height_change_m,
                        "height_change_pct": tree_change.height_change_pct,
                        "dbh_t1": tree_change.dbh_t1,
                        "dbh_t2": tree_change.dbh_t2,
                        "dbh_change_cm": tree_change.dbh_change_cm,
                        "carbon_change_kg": tree_change.carbon_change_kg,
                        "co2e_change_kg": tree_change.co2e_change_kg,
                        "match_confidence": tree_change.match_confidence.value,
                        "epoch_t1": change_result.epoch_t1.epoch_id,
                        "epoch_t2": change_result.epoch_t2.epoch_id,
                    },
                }
                features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "analysis_id": time_series.analysis_id,
                "start_date": time_series.start_date.isoformat(),
                "end_date": time_series.end_date.isoformat(),
                "total_years": time_series.total_years,
                "epoch_count": time_series.epoch_count,
                "feature_count": len(features),
            },
        }
