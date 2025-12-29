"""
PDF Report Generation Service.

This module provides professional PDF report generation for forest inventory
using ReportLab. Creates publication-quality forestry reports with charts,
tables, and proper formatting.
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

if TYPE_CHECKING:
    from lidar_processing.models import (
        InventorySummary,
        ProjectInfo,
        ReportOptions,
        SpeciesMetrics,
        StandMetrics,
        TreeMetrics,
    )

logger = logging.getLogger(__name__)

# Color scheme
PRIMARY_COLOR = colors.HexColor("#2E7D32")  # Forest green
SECONDARY_COLOR = colors.HexColor("#4CAF50")  # Green
ACCENT_COLOR = colors.HexColor("#81C784")  # Light green
HEADER_BG = colors.HexColor("#E8F5E9")  # Very light green
TEXT_COLOR = colors.HexColor("#333333")


class PDFGenerator:
    """
    Generates professional PDF reports for forest inventory.

    Creates multi-page reports with cover pages, charts, tables,
    and methodology sections suitable for consulting foresters.
    """

    def __init__(
        self,
        page_size: tuple[float, float] = letter,
        margins: tuple[float, float, float, float] = (0.75 * inch,) * 4,
    ) -> None:
        """
        Initialize the PDF generator.

        Args:
            page_size: Page dimensions (width, height).
            margins: Page margins (left, right, top, bottom).
        """
        self.page_size = page_size
        self.margins = margins
        self.styles = self._create_styles()

    def _create_styles(self) -> dict[str, ParagraphStyle]:
        """Create custom paragraph styles for the report."""
        base_styles = getSampleStyleSheet()

        styles = {
            "title": ParagraphStyle(
                "ReportTitle",
                parent=base_styles["Heading1"],
                fontSize=28,
                textColor=PRIMARY_COLOR,
                alignment=TA_CENTER,
                spaceAfter=12,
                fontName="Helvetica-Bold",
            ),
            "subtitle": ParagraphStyle(
                "ReportSubtitle",
                parent=base_styles["Heading2"],
                fontSize=16,
                textColor=TEXT_COLOR,
                alignment=TA_CENTER,
                spaceAfter=24,
                fontName="Helvetica",
            ),
            "heading1": ParagraphStyle(
                "SectionHeading",
                parent=base_styles["Heading1"],
                fontSize=18,
                textColor=PRIMARY_COLOR,
                spaceBefore=20,
                spaceAfter=12,
                fontName="Helvetica-Bold",
            ),
            "heading2": ParagraphStyle(
                "SubsectionHeading",
                parent=base_styles["Heading2"],
                fontSize=14,
                textColor=SECONDARY_COLOR,
                spaceBefore=14,
                spaceAfter=8,
                fontName="Helvetica-Bold",
            ),
            "body": ParagraphStyle(
                "BodyText",
                parent=base_styles["Normal"],
                fontSize=11,
                textColor=TEXT_COLOR,
                alignment=TA_JUSTIFY,
                spaceAfter=8,
                leading=14,
                fontName="Helvetica",
            ),
            "table_header": ParagraphStyle(
                "TableHeader",
                parent=base_styles["Normal"],
                fontSize=10,
                textColor=colors.white,
                fontName="Helvetica-Bold",
                alignment=TA_CENTER,
            ),
            "table_cell": ParagraphStyle(
                "TableCell",
                parent=base_styles["Normal"],
                fontSize=9,
                textColor=TEXT_COLOR,
                fontName="Helvetica",
                alignment=TA_LEFT,
            ),
            "footer": ParagraphStyle(
                "Footer",
                parent=base_styles["Normal"],
                fontSize=8,
                textColor=colors.gray,
                alignment=TA_CENTER,
            ),
            "metric_value": ParagraphStyle(
                "MetricValue",
                parent=base_styles["Normal"],
                fontSize=24,
                textColor=PRIMARY_COLOR,
                alignment=TA_CENTER,
                fontName="Helvetica-Bold",
            ),
            "metric_label": ParagraphStyle(
                "MetricLabel",
                parent=base_styles["Normal"],
                fontSize=10,
                textColor=TEXT_COLOR,
                alignment=TA_CENTER,
            ),
        }

        return styles

    def generate_report(
        self,
        output_path: str | Path,
        project_info: ProjectInfo,
        summary: InventorySummary,
        trees: list[TreeMetrics],
        options: ReportOptions,
        species_metrics: list[SpeciesMetrics] | None = None,
        stand_metrics: list[StandMetrics] | None = None,
        charts: dict[str, bytes] | None = None,
    ) -> str:
        """
        Generate a complete PDF report.

        Args:
            output_path: Path for the output PDF file.
            project_info: Project information for the cover page.
            summary: Inventory summary statistics.
            trees: List of tree metrics.
            options: Report generation options.
            species_metrics: Optional species composition data.
            stand_metrics: Optional stand-level metrics.
            charts: Dictionary of chart names to PNG bytes.

        Returns:
            Path to the generated PDF file.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=self.page_size,
            leftMargin=self.margins[0],
            rightMargin=self.margins[1],
            topMargin=self.margins[2],
            bottomMargin=self.margins[3],
        )

        story = []

        # Cover page
        story.extend(self._create_cover_page(project_info, options))
        story.append(PageBreak())

        # Executive summary
        story.extend(self._create_executive_summary(summary, project_info))
        story.append(PageBreak())

        # Species distribution
        if options.include_species_summary and species_metrics:
            story.extend(
                self._create_species_section(species_metrics, charts)
            )
            story.append(PageBreak())

        # Height and DBH distributions
        if options.include_charts and charts:
            story.extend(self._create_distribution_charts(charts))
            story.append(PageBreak())

        # Stand summary
        if options.include_stand_summary and stand_metrics:
            story.extend(self._create_stand_summary(stand_metrics))
            story.append(PageBreak())

        # Tree inventory table
        if options.include_tree_list:
            story.extend(self._create_tree_inventory(trees, options))
            story.append(PageBreak())

        # Methodology
        if options.include_methodology:
            story.extend(self._create_methodology_section())

        # Build the document
        doc.build(
            story,
            onFirstPage=self._add_page_decorations,
            onLaterPages=self._add_page_decorations,
        )

        logger.info("Generated PDF report: %s", output_path)
        return str(output_path)

    def _create_cover_page(
        self,
        project_info: ProjectInfo,
        options: ReportOptions,
    ) -> list:
        """Create the cover page elements."""
        elements = []

        # Spacer for top margin
        elements.append(Spacer(1, 2 * inch))

        # Logo placeholder or company name
        if options.company_name:
            elements.append(
                Paragraph(options.company_name, self.styles["subtitle"])
            )
            elements.append(Spacer(1, 0.5 * inch))

        # Title
        elements.append(
            Paragraph("Forest Inventory Report", self.styles["title"])
        )
        elements.append(Spacer(1, 0.25 * inch))

        # Project name
        elements.append(
            Paragraph(project_info.project_name, self.styles["subtitle"])
        )
        elements.append(Spacer(1, 1 * inch))

        # Project details table
        details_data = []

        if project_info.client_name:
            details_data.append(["Client:", project_info.client_name])
        if project_info.location:
            details_data.append(["Location:", project_info.location])
        if project_info.project_id:
            details_data.append(["Project ID:", project_info.project_id])
        if project_info.survey_date:
            details_data.append([
                "Survey Date:",
                project_info.survey_date.strftime("%B %d, %Y"),
            ])
        details_data.append([
            "Analysis Date:",
            project_info.analysis_date.strftime("%B %d, %Y"),
        ])
        if project_info.coordinate_system:
            details_data.append(["Coordinate System:", project_info.coordinate_system])

        if details_data:
            details_table = Table(
                details_data,
                colWidths=[2 * inch, 4 * inch],
            )
            details_table.setStyle(
                TableStyle([
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 11),
                    ("TEXTCOLOR", (0, 0), (-1, -1), TEXT_COLOR),
                    ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                    ("ALIGN", (1, 0), (1, -1), "LEFT"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ])
            )
            elements.append(details_table)

        elements.append(Spacer(1, 1.5 * inch))

        # Prepared by
        if options.prepared_by:
            elements.append(
                Paragraph(f"Prepared by: {options.prepared_by}", self.styles["body"])
            )

        # Generation timestamp
        elements.append(Spacer(1, 0.5 * inch))
        elements.append(
            Paragraph(
                f"Report generated: {datetime.now().strftime('%B %d, %Y at %H:%M')}",
                self.styles["footer"],
            )
        )

        return elements

    def _create_executive_summary(
        self,
        summary: InventorySummary,
        project_info: ProjectInfo,
    ) -> list:
        """Create the executive summary section."""
        elements = []

        elements.append(
            Paragraph("Executive Summary", self.styles["heading1"])
        )

        # Key metrics cards
        metrics_data = [
            [
                self._create_metric_cell(
                    f"{summary.total_trees:,}",
                    "Total Trees Detected",
                ),
                self._create_metric_cell(
                    f"{summary.total_area_hectares:.2f} ha",
                    "Survey Area",
                ),
                self._create_metric_cell(
                    f"{summary.stems_per_hectare:.0f}",
                    "Stems per Hectare",
                ),
            ],
        ]

        metrics_table = Table(
            metrics_data,
            colWidths=[2.2 * inch] * 3,
        )
        metrics_table.setStyle(
            TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 1, ACCENT_COLOR),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, ACCENT_COLOR),
                ("BACKGROUND", (0, 0), (-1, -1), HEADER_BG),
                ("TOPPADDING", (0, 0), (-1, -1), 15),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 15),
            ])
        )
        elements.append(metrics_table)
        elements.append(Spacer(1, 0.5 * inch))

        # Summary statistics table
        elements.append(
            Paragraph("Inventory Statistics", self.styles["heading2"])
        )

        stats_data = [
            ["Metric", "Value", "Unit"],
            ["Mean Tree Height", f"{summary.mean_height:.2f}", "meters"],
            ["Maximum Height", f"{summary.max_height:.2f}", "meters"],
            ["Height Std. Dev.", f"{summary.std_height:.2f}", "meters"],
        ]

        if summary.mean_dbh:
            stats_data.append(["Mean DBH", f"{summary.mean_dbh:.1f}", "cm"])
        if summary.basal_area_per_hectare:
            stats_data.append([
                "Basal Area",
                f"{summary.basal_area_per_hectare:.2f}",
                "m\u00B2/ha",
            ])
        if summary.total_biomass:
            stats_data.append([
                "Total Biomass",
                f"{summary.total_biomass / 1000:.2f}",
                "tonnes",
            ])
        if summary.total_carbon:
            stats_data.append([
                "Carbon Stock",
                f"{summary.total_carbon / 1000:.2f}",
                "tonnes C",
            ])
        if summary.co2_equivalent:
            stats_data.append([
                "CO\u2082 Equivalent",
                f"{summary.co2_equivalent / 1000:.2f}",
                "tonnes CO\u2082",
            ])
        if summary.species_count > 0:
            stats_data.append(["Species Identified", str(summary.species_count), ""])

        stats_table = self._create_styled_table(
            stats_data,
            col_widths=[3 * inch, 2 * inch, 1.5 * inch],
        )
        elements.append(stats_table)

        # Project notes
        if project_info.notes:
            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph("Notes", self.styles["heading2"]))
            elements.append(Paragraph(project_info.notes, self.styles["body"]))

        return elements

    def _create_species_section(
        self,
        species_metrics: list[SpeciesMetrics],
        charts: dict[str, bytes] | None,
    ) -> list:
        """Create the species distribution section."""
        elements = []

        elements.append(
            Paragraph("Species Distribution", self.styles["heading1"])
        )

        # Species pie chart
        if charts and "species_pie" in charts:
            img_buffer = io.BytesIO(charts["species_pie"])
            img = Image(img_buffer, width=5 * inch, height=4 * inch)
            elements.append(img)
            elements.append(Spacer(1, 0.3 * inch))

        # Species summary table
        elements.append(
            Paragraph("Species Summary", self.styles["heading2"])
        )

        table_data = [
            ["Species", "Count", "%", "Mean Ht (m)", "Mean DBH (cm)", "Biomass (kg)"],
        ]

        for species in species_metrics[:15]:  # Limit to top 15
            table_data.append([
                species.species_name,
                f"{species.tree_count:,}",
                f"{species.percentage:.1f}%",
                f"{species.mean_height:.1f}",
                f"{species.mean_dbh:.1f}" if species.mean_dbh else "-",
                f"{species.total_biomass:,.0f}" if species.total_biomass else "-",
            ])

        species_table = self._create_styled_table(
            table_data,
            col_widths=[1.8 * inch, 0.8 * inch, 0.7 * inch, 1 * inch, 1 * inch, 1.2 * inch],
        )
        elements.append(species_table)

        return elements

    def _create_distribution_charts(
        self,
        charts: dict[str, bytes],
    ) -> list:
        """Create the distribution charts section."""
        elements = []

        elements.append(
            Paragraph("Distribution Analysis", self.styles["heading1"])
        )

        # Height histogram
        if "height_histogram" in charts:
            elements.append(
                Paragraph("Height Distribution", self.styles["heading2"])
            )
            img_buffer = io.BytesIO(charts["height_histogram"])
            img = Image(img_buffer, width=6 * inch, height=4 * inch)
            elements.append(img)
            elements.append(Spacer(1, 0.3 * inch))

        # DBH histogram
        if "dbh_histogram" in charts:
            elements.append(
                Paragraph("DBH Distribution", self.styles["heading2"])
            )
            img_buffer = io.BytesIO(charts["dbh_histogram"])
            img = Image(img_buffer, width=6 * inch, height=4 * inch)
            elements.append(img)
            elements.append(Spacer(1, 0.3 * inch))

        # Biomass by species
        if "biomass_chart" in charts:
            elements.append(
                Paragraph("Biomass by Species", self.styles["heading2"])
            )
            img_buffer = io.BytesIO(charts["biomass_chart"])
            img = Image(img_buffer, width=6 * inch, height=4 * inch)
            elements.append(img)

        return elements

    def _create_stand_summary(
        self,
        stand_metrics: list[StandMetrics],
    ) -> list:
        """Create the stand summary section."""
        elements = []

        elements.append(
            Paragraph("Stand Summary", self.styles["heading1"])
        )

        for stand in stand_metrics:
            stand_name = stand.stand_name or stand.stand_id
            elements.append(
                Paragraph(f"Stand: {stand_name}", self.styles["heading2"])
            )

            stand_data = [
                ["Metric", "Value"],
                ["Area", f"{stand.area_hectares:.2f} ha"],
                ["Tree Count", f"{stand.tree_count:,}"],
                ["Stems/ha", f"{stand.stems_per_hectare:.0f}"],
                ["Basal Area", f"{stand.basal_area_per_hectare:.2f} m\u00B2/ha"],
                ["Mean Height", f"{stand.mean_height:.1f} m"],
            ]

            if stand.dominant_height:
                stand_data.append(["Dominant Height", f"{stand.dominant_height:.1f} m"])
            if stand.mean_dbh:
                stand_data.append(["Mean DBH", f"{stand.mean_dbh:.1f} cm"])
            if stand.quadratic_mean_dbh:
                stand_data.append(["QMD", f"{stand.quadratic_mean_dbh:.1f} cm"])
            if stand.volume_per_hectare:
                stand_data.append(["Volume", f"{stand.volume_per_hectare:.1f} m\u00B3/ha"])
            if stand.biomass_per_hectare:
                stand_data.append(["Biomass", f"{stand.biomass_per_hectare:.0f} kg/ha"])
            if stand.carbon_per_hectare:
                stand_data.append(["Carbon", f"{stand.carbon_per_hectare:.0f} kg C/ha"])

            stand_table = self._create_styled_table(
                stand_data,
                col_widths=[3 * inch, 3 * inch],
            )
            elements.append(stand_table)
            elements.append(Spacer(1, 0.3 * inch))

        return elements

    def _create_tree_inventory(
        self,
        trees: list[TreeMetrics],
        options: ReportOptions,
        trees_per_page: int = 40,
    ) -> list:
        """Create the tree inventory table section."""
        elements = []

        elements.append(
            Paragraph("Tree Inventory", self.styles["heading1"])
        )

        elements.append(
            Paragraph(
                f"Total trees: {len(trees):,}",
                self.styles["body"],
            )
        )
        elements.append(Spacer(1, 0.2 * inch))

        # Table header
        header = ["ID", "X", "Y", "Height (m)", "Crown (m)", "DBH (cm)", "Biomass (kg)"]

        # Split into pages
        for i in range(0, len(trees), trees_per_page):
            page_trees = trees[i : i + trees_per_page]

            table_data = [header]
            for tree in page_trees:
                table_data.append([
                    str(tree.tree_id),
                    f"{tree.x:.1f}",
                    f"{tree.y:.1f}",
                    f"{tree.height:.2f}",
                    f"{tree.crown_diameter:.2f}" if tree.crown_diameter else "-",
                    f"{tree.dbh_estimated:.1f}" if tree.dbh_estimated else "-",
                    f"{tree.biomass_estimated:.0f}" if tree.biomass_estimated else "-",
                ])

            tree_table = self._create_styled_table(
                table_data,
                col_widths=[0.6 * inch, 1.1 * inch, 1.1 * inch, 0.9 * inch, 0.9 * inch, 0.9 * inch, 1 * inch],
                font_size=8,
            )
            elements.append(tree_table)

            if i + trees_per_page < len(trees):
                elements.append(PageBreak())
                elements.append(
                    Paragraph("Tree Inventory (continued)", self.styles["heading1"])
                )

        return elements

    def _create_methodology_section(self) -> list:
        """Create the methodology notes section."""
        elements = []

        elements.append(
            Paragraph("Methodology", self.styles["heading1"])
        )

        methodology_text = """
        <b>LiDAR Data Processing</b><br/>
        This forest inventory was derived from airborne LiDAR (Light Detection and Ranging)
        point cloud data. The processing pipeline includes the following steps:
        <br/><br/>

        <b>1. Ground Classification</b><br/>
        Ground points were classified using a progressive morphological filter algorithm.
        This separates ground returns from vegetation returns, enabling accurate terrain
        modeling and height normalization.
        <br/><br/>

        <b>2. Height Normalization</b><br/>
        Point cloud heights were normalized to height above ground (HAG) using a
        triangulated irregular network (TIN) interpolation of classified ground points.
        This provides accurate tree heights regardless of terrain variation.
        <br/><br/>

        <b>3. Canopy Height Model (CHM)</b><br/>
        A rasterized canopy height model was generated from the normalized point cloud
        at 1-meter resolution. The CHM represents the maximum vegetation height in each
        grid cell.
        <br/><br/>

        <b>4. Individual Tree Detection</b><br/>
        Trees were detected using local maxima identification on a smoothed CHM,
        followed by watershed segmentation to delineate individual tree crowns.
        Minimum tree height threshold: 2 meters.
        <br/><br/>

        <b>5. Tree Metrics Extraction</b><br/>
        For each detected tree, the following metrics were extracted:
        <br/>- Tree height (from CHM maximum within crown)
        <br/>- Crown diameter (from watershed segment)
        <br/>- Crown area (from segment polygon)
        <br/>- Point count (number of LiDAR returns in segment)
        <br/><br/>

        <b>6. DBH Estimation</b><br/>
        Diameter at breast height (DBH) was estimated using species-specific allometric
        equations relating height and crown dimensions to stem diameter. These
        relationships are derived from published forestry research.
        <br/><br/>

        <b>7. Biomass and Carbon</b><br/>
        Above-ground biomass was calculated using FIA (Forest Inventory and Analysis)
        allometric equations. Carbon stock is estimated as 47% of dry biomass
        (IPCC default). CO2 equivalent is calculated using the molecular weight
        ratio of 44/12.
        <br/><br/>

        <b>Accuracy Notes</b><br/>
        - Tree detection accuracy is typically 90%+ for trees with DBH >15cm
        - Height estimates are accurate to approximately +/- 0.5 meters
        - Crown diameter estimates are accurate to approximately +/- 1.0 meters
        - DBH and biomass estimates rely on allometric relationships and
          should be validated with field measurements
        """

        elements.append(
            Paragraph(methodology_text, self.styles["body"])
        )

        return elements

    def _create_metric_cell(self, value: str, label: str) -> list:
        """Create a metric display cell with large value and label."""
        return [
            Paragraph(value, self.styles["metric_value"]),
            Paragraph(label, self.styles["metric_label"]),
        ]

    def _create_styled_table(
        self,
        data: list[list[str]],
        col_widths: list[float] | None = None,
        font_size: int = 10,
    ) -> Table:
        """
        Create a consistently styled table.

        Args:
            data: Table data with header row first.
            col_widths: Optional column widths.
            font_size: Font size for cells.

        Returns:
            Styled Table object.
        """
        table = Table(data, colWidths=col_widths)

        style = TableStyle([
            # Header row
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_COLOR),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), font_size),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            # Data rows
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), font_size - 1),
            ("TEXTCOLOR", (0, 1), (-1, -1), TEXT_COLOR),
            # Alternating row colors
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HEADER_BG]),
            # Borders
            ("GRID", (0, 0), (-1, -1), 0.5, colors.gray),
            ("BOX", (0, 0), (-1, -1), 1, PRIMARY_COLOR),
            # Padding
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            # Alignment
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])

        table.setStyle(style)
        return table

    def _add_page_decorations(
        self,
        canvas: canvas.Canvas,
        doc: SimpleDocTemplate,
    ) -> None:
        """
        Add headers and footers to each page.

        Args:
            canvas: ReportLab canvas.
            doc: Document template.
        """
        canvas.saveState()

        # Header line
        canvas.setStrokeColor(PRIMARY_COLOR)
        canvas.setLineWidth(2)
        canvas.line(
            doc.leftMargin,
            doc.height + doc.topMargin - 0.25 * inch,
            doc.width + doc.leftMargin,
            doc.height + doc.topMargin - 0.25 * inch,
        )

        # Footer
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.gray)

        # Page number
        page_num = canvas.getPageNumber()
        canvas.drawCentredString(
            doc.width / 2 + doc.leftMargin,
            0.5 * inch,
            f"Page {page_num}",
        )

        # Footer text
        canvas.drawString(
            doc.leftMargin,
            0.5 * inch,
            "Forest Inventory Report",
        )

        canvas.drawRightString(
            doc.width + doc.leftMargin,
            0.5 * inch,
            datetime.now().strftime("%Y-%m-%d"),
        )

        canvas.restoreState()
