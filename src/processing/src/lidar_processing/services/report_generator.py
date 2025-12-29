"""
Report Generation Orchestrator Service.

This module provides the main report orchestrator that coordinates
PDF generation, Excel export, chart creation, and stand analysis
to produce comprehensive forest inventory reports.
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from lidar_processing.models import (
    GenerateReportRequest,
    InventorySummary,
    ProjectInfo,
    ReportFormat,
    ReportOptions,
    ReportResult,
    ReportStatus,
    SpeciesMetrics,
    StandMetrics,
    TreeMetrics,
    UnitSystem,
)
from lidar_processing.services.chart_generator import ChartGenerator
from lidar_processing.services.excel_generator import ExcelGenerator
from lidar_processing.services.pdf_generator import PDFGenerator
from lidar_processing.services.stand_analyzer import StandAnalyzer

if TYPE_CHECKING:
    from lidar_processing.config import Settings

logger = logging.getLogger(__name__)

# Unit conversion factors
METERS_TO_FEET = 3.28084
CM_TO_INCHES = 0.393701
KG_TO_LBS = 2.20462
HECTARES_TO_ACRES = 2.47105
SQ_METERS_TO_SQ_FEET = 10.7639


class ReportGenerator:
    """
    Main orchestrator for forest inventory report generation.

    Coordinates the creation of PDF and Excel reports by:
    1. Analyzing tree data and calculating stand metrics
    2. Generating charts and visualizations
    3. Creating formatted PDF reports
    4. Creating Excel workbooks with multiple sheets
    5. Managing output files and report metadata
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the report generator.

        Args:
            settings: Optional application settings.
        """
        self.settings = settings
        self.chart_generator = ChartGenerator()
        self.pdf_generator = PDFGenerator()
        self.excel_generator = ExcelGenerator()
        self.stand_analyzer = StandAnalyzer()

        # Report storage (in production, use Redis or database)
        self._reports: dict[str, ReportResult] = {}

    def generate_inventory_report(
        self,
        analysis_id: str,
        tree_data: list[TreeMetrics],
        project_info: ProjectInfo,
        output_format: Literal["pdf", "excel", "both"] = "both",
        options: ReportOptions | None = None,
        output_directory: str | None = None,
        stand_boundaries: list[dict[str, Any]] | None = None,
    ) -> ReportResult:
        """
        Generate a complete forest inventory report.

        Args:
            analysis_id: Unique identifier for the analysis.
            tree_data: List of detected trees with metrics.
            project_info: Project information for report header.
            output_format: Output format (pdf, excel, or both).
            options: Report generation options.
            output_directory: Directory for output files.
            stand_boundaries: Optional stand boundary polygons.

        Returns:
            ReportResult with paths to generated files.
        """
        start_time = time.time()
        report_id = str(uuid.uuid4())

        if options is None:
            options = ReportOptions()

        # Determine output directory
        if output_directory:
            output_dir = Path(output_directory)
        else:
            output_dir = Path(tempfile.mkdtemp(prefix="lidar_report_"))

        output_dir.mkdir(parents=True, exist_ok=True)

        logger.info(
            "Generating report %s for analysis %s with %d trees",
            report_id,
            analysis_id,
            len(tree_data),
        )

        try:
            # Convert units if needed
            trees = self._convert_units(tree_data, options.units)

            # Calculate summary and metrics
            total_area = project_info.total_area_hectares or self._estimate_area(trees)
            summary = self._calculate_summary(trees, total_area, options.units)

            # Calculate species metrics
            species_metrics = self.stand_analyzer._calculate_species_composition(trees)

            # Calculate stand metrics if boundaries provided
            stand_metrics = None
            if stand_boundaries and options.include_stand_summary:
                stand_metrics = self._calculate_stand_metrics(
                    trees, stand_boundaries, total_area
                )

            # Generate charts
            charts = {}
            if options.include_charts:
                charts = self._generate_charts(trees, species_metrics, options)

            # Generate output files
            pdf_path = None
            excel_path = None
            file_sizes = {}

            base_name = self._sanitize_filename(project_info.project_name)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            if output_format in ("pdf", "both"):
                pdf_filename = f"{base_name}_{timestamp}.pdf"
                pdf_path = str(output_dir / pdf_filename)

                self.pdf_generator.generate_report(
                    output_path=pdf_path,
                    project_info=project_info,
                    summary=summary,
                    trees=trees,
                    options=options,
                    species_metrics=species_metrics,
                    stand_metrics=stand_metrics,
                    charts=charts,
                )
                file_sizes["pdf"] = os.path.getsize(pdf_path)
                logger.info("Generated PDF report: %s", pdf_path)

            if output_format in ("excel", "both"):
                excel_filename = f"{base_name}_{timestamp}.xlsx"
                excel_path = str(output_dir / excel_filename)

                self.excel_generator.generate_workbook(
                    output_path=excel_path,
                    project_info=project_info,
                    summary=summary,
                    trees=trees,
                    options=options,
                    species_metrics=species_metrics,
                    stand_metrics=stand_metrics,
                    charts=charts,
                )
                file_sizes["excel"] = os.path.getsize(excel_path)
                logger.info("Generated Excel report: %s", excel_path)

            generation_time_ms = (time.time() - start_time) * 1000

            result = ReportResult(
                report_id=report_id,
                analysis_id=analysis_id,
                status=ReportStatus.COMPLETED,
                pdf_path=pdf_path,
                excel_path=excel_path,
                generated_at=datetime.utcnow(),
                generation_time_ms=round(generation_time_ms, 2),
                file_sizes=file_sizes,
            )

            # Store result for later retrieval
            self._reports[report_id] = result

            logger.info(
                "Report generation completed in %.2f ms: %s",
                generation_time_ms,
                report_id,
            )

            return result

        except Exception as e:
            logger.exception("Report generation failed: %s", e)

            generation_time_ms = (time.time() - start_time) * 1000

            result = ReportResult(
                report_id=report_id,
                analysis_id=analysis_id,
                status=ReportStatus.FAILED,
                generated_at=datetime.utcnow(),
                generation_time_ms=round(generation_time_ms, 2),
                error=str(e),
            )

            self._reports[report_id] = result
            return result

    def get_report_status(self, report_id: str) -> ReportResult | None:
        """
        Get the status of a report generation.

        Args:
            report_id: Unique report identifier.

        Returns:
            ReportResult or None if not found.
        """
        return self._reports.get(report_id)

    def generate_from_request(self, request: GenerateReportRequest) -> ReportResult:
        """
        Generate a report from a request model.

        This method is designed to work with the API endpoint.

        Args:
            request: Report generation request.

        Returns:
            ReportResult with generation status.
        """
        # In a real implementation, you would fetch tree data from storage
        # based on the analysis_id. For now, we'll raise an error.
        raise NotImplementedError(
            "Tree data must be provided directly. Use generate_inventory_report() "
            "with tree_data parameter, or implement data retrieval from storage."
        )

    def _calculate_summary(
        self,
        trees: list[TreeMetrics],
        total_area: float,
        units: UnitSystem,
    ) -> InventorySummary:
        """Calculate inventory summary statistics."""
        import numpy as np

        if not trees:
            return InventorySummary(
                total_trees=0,
                total_area_hectares=total_area,
                stems_per_hectare=0,
                mean_height=0,
                max_height=0,
                min_height=0,
                std_height=0,
            )

        heights = [t.height for t in trees if t.height is not None]
        dbhs = [t.dbh_estimated for t in trees if t.dbh_estimated is not None]
        biomass_vals = [
            t.biomass_estimated for t in trees if t.biomass_estimated is not None
        ]

        total_trees = len(trees)
        stems_per_ha = total_trees / total_area if total_area > 0 else 0

        # Calculate basal area
        total_ba = None
        ba_per_ha = None
        if dbhs:
            import math
            basal_areas = [math.pi * (d / 200) ** 2 for d in dbhs]
            total_ba = sum(basal_areas)
            ba_per_ha = total_ba / total_area if total_area > 0 else None

        total_biomass = sum(biomass_vals) if biomass_vals else None
        total_carbon = total_biomass * 0.47 if total_biomass else None
        co2_equivalent = total_carbon * (44 / 12) if total_carbon else None

        # Get unique species
        species_set = set()
        for tree in trees:
            species = getattr(tree, "species", None)
            if species:
                species_set.add(species)

        return InventorySummary(
            total_trees=total_trees,
            total_area_hectares=round(total_area, 4),
            stems_per_hectare=round(stems_per_ha, 1),
            mean_height=round(float(np.mean(heights)), 2) if heights else 0,
            max_height=round(float(np.max(heights)), 2) if heights else 0,
            min_height=round(float(np.min(heights)), 2) if heights else 0,
            std_height=round(float(np.std(heights)), 2) if heights else 0,
            mean_dbh=round(float(np.mean(dbhs)), 2) if dbhs else None,
            total_basal_area=round(total_ba, 4) if total_ba else None,
            basal_area_per_hectare=round(ba_per_ha, 2) if ba_per_ha else None,
            total_biomass=round(total_biomass, 2) if total_biomass else None,
            total_carbon=round(total_carbon, 2) if total_carbon else None,
            co2_equivalent=round(co2_equivalent, 2) if co2_equivalent else None,
            species_count=len(species_set),
        )

    def _generate_charts(
        self,
        trees: list[TreeMetrics],
        species_metrics: list[SpeciesMetrics],
        options: ReportOptions,
    ) -> dict[str, bytes]:
        """Generate all charts for the report."""
        charts = {}

        try:
            # Species pie chart
            if species_metrics:
                species_counts = {
                    s.species_name: s.tree_count for s in species_metrics
                }
                charts["species_pie"] = self.chart_generator.species_pie_chart(
                    species_counts
                )

            # Height histogram
            heights = [t.height for t in trees if t.height is not None]
            if heights:
                unit_label = "Height (m)" if options.units == UnitSystem.METRIC else "Height (ft)"
                charts["height_histogram"] = self.chart_generator.height_histogram(
                    heights,
                    xlabel=unit_label,
                )

            # DBH histogram
            dbhs = [t.dbh_estimated for t in trees if t.dbh_estimated is not None]
            if dbhs:
                unit_label = "DBH (cm)" if options.units == UnitSystem.METRIC else "DBH (in)"
                charts["dbh_histogram"] = self.chart_generator.dbh_distribution(
                    dbhs,
                    xlabel=unit_label,
                )

            # Biomass by species
            if species_metrics:
                species_biomass = {
                    s.species_name: s.total_biomass
                    for s in species_metrics
                    if s.total_biomass is not None
                }
                if species_biomass:
                    charts["biomass_chart"] = self.chart_generator.biomass_by_species(
                        species_biomass
                    )

            # Height vs DBH scatter
            if heights and dbhs and len(heights) == len(dbhs):
                charts["height_dbh_scatter"] = self.chart_generator.height_dbh_scatter(
                    heights, dbhs
                )

        except Exception as e:
            logger.warning("Failed to generate some charts: %s", e)

        return charts

    def _calculate_stand_metrics(
        self,
        trees: list[TreeMetrics],
        stand_boundaries: list[dict[str, Any]],
        total_area: float,
    ) -> list[StandMetrics]:
        """Calculate metrics for each stand."""
        stand_metrics = []

        for i, boundary in enumerate(stand_boundaries):
            stand_id = boundary.get("id", f"stand_{i + 1}")
            stand_name = boundary.get("name", f"Stand {i + 1}")

            # Filter trees within this stand (simplified - would use spatial query)
            # In production, use shapely for proper point-in-polygon tests
            stand_trees = trees  # Placeholder - all trees for now

            try:
                metrics = self.stand_analyzer.calculate_stand_metrics(
                    trees=stand_trees,
                    stand_boundary=boundary.get("geometry"),
                    stand_id=stand_id,
                    stand_name=stand_name,
                    area_hectares=boundary.get("area_hectares"),
                )
                stand_metrics.append(metrics)
            except Exception as e:
                logger.warning("Failed to calculate metrics for stand %s: %s", stand_id, e)

        return stand_metrics

    def _convert_units(
        self,
        trees: list[TreeMetrics],
        units: UnitSystem,
    ) -> list[TreeMetrics]:
        """
        Convert tree metrics to the specified unit system.

        Args:
            trees: List of tree metrics in metric units.
            units: Target unit system.

        Returns:
            List of trees with converted units.
        """
        if units == UnitSystem.METRIC:
            return trees

        # Convert to imperial
        converted = []
        for tree in trees:
            converted.append(
                TreeMetrics(
                    tree_id=tree.tree_id,
                    x=tree.x,
                    y=tree.y,
                    height=tree.height * METERS_TO_FEET if tree.height else None,
                    crown_diameter=(
                        tree.crown_diameter * METERS_TO_FEET
                        if tree.crown_diameter
                        else None
                    ),
                    crown_area=(
                        tree.crown_area * SQ_METERS_TO_SQ_FEET
                        if tree.crown_area
                        else None
                    ),
                    crown_base_height=(
                        tree.crown_base_height * METERS_TO_FEET
                        if tree.crown_base_height
                        else None
                    ),
                    dbh_estimated=(
                        tree.dbh_estimated * CM_TO_INCHES
                        if tree.dbh_estimated
                        else None
                    ),
                    biomass_estimated=(
                        tree.biomass_estimated * KG_TO_LBS
                        if tree.biomass_estimated
                        else None
                    ),
                    point_count=tree.point_count,
                )
            )

        return converted

    def _estimate_area(self, trees: list[TreeMetrics]) -> float:
        """
        Estimate survey area from tree positions.

        Args:
            trees: List of tree metrics.

        Returns:
            Estimated area in hectares.
        """
        if len(trees) < 3:
            # Can't form a polygon, estimate from density
            return len(trees) / 400  # Assume 400 trees/ha

        try:
            from scipy.spatial import ConvexHull
            import numpy as np

            points = np.array([[t.x, t.y] for t in trees if t.x and t.y])

            if len(points) < 3:
                return len(trees) / 400

            hull = ConvexHull(points)
            area_sq_m = hull.volume  # For 2D, volume gives area

            # Add buffer (hull underestimates by ~10-20%)
            buffer_factor = 1.15
            return (area_sq_m * buffer_factor) / 10000

        except Exception as e:
            logger.warning("Failed to estimate area: %s", e)
            return len(trees) / 400

    def _sanitize_filename(self, name: str) -> str:
        """
        Sanitize a string for use as a filename.

        Args:
            name: Input string.

        Returns:
            Safe filename string.
        """
        # Replace spaces and special characters
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
        # Remove consecutive underscores
        while "__" in safe:
            safe = safe.replace("__", "_")
        # Trim and limit length
        return safe.strip("_")[:100]


# Convenience function for direct usage
def generate_report(
    analysis_id: str,
    tree_data: list[TreeMetrics],
    project_info: dict[str, Any],
    output_format: str = "both",
    options: dict[str, Any] | None = None,
    output_directory: str | None = None,
) -> ReportResult:
    """
    Convenience function to generate a forest inventory report.

    Args:
        analysis_id: Unique identifier for the analysis.
        tree_data: List of detected trees.
        project_info: Project information dictionary.
        output_format: Output format (pdf, excel, both).
        options: Report options dictionary.
        output_directory: Output directory path.

    Returns:
        ReportResult with paths to generated files.
    """
    generator = ReportGenerator()

    # Convert dictionaries to models
    project = ProjectInfo(**project_info)
    report_options = ReportOptions(**options) if options else ReportOptions()

    return generator.generate_inventory_report(
        analysis_id=analysis_id,
        tree_data=tree_data,
        project_info=project,
        output_format=output_format,  # type: ignore
        options=report_options,
        output_directory=output_directory,
    )
