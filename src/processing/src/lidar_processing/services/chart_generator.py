"""
Chart Generation Service for Forest Inventory Reports.

This module provides matplotlib-based chart generation for forestry reports,
producing professional-quality visualizations as PNG bytes for embedding
in PDF and Excel reports.
"""

from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

import matplotlib
import matplotlib.pyplot as plt
import numpy as np

# Use non-interactive backend for server-side rendering
matplotlib.use("Agg")

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

# Professional color palette for forestry charts
FOREST_COLORS = [
    "#2E7D32",  # Forest green (primary)
    "#4CAF50",  # Green
    "#81C784",  # Light green
    "#1B5E20",  # Dark green
    "#8BC34A",  # Lime
    "#689F38",  # Light lime
    "#558B2F",  # Olive
    "#33691E",  # Dark olive
    "#7CB342",  # Grass green
    "#9CCC65",  # Light grass
    "#C5E1A5",  # Pale green
    "#DCEDC8",  # Very light green
]

# Chart styling defaults
CHART_STYLE = {
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "axes.edgecolor": "#333333",
    "axes.labelcolor": "#333333",
    "axes.titleweight": "bold",
    "axes.titlesize": 14,
    "axes.labelsize": 11,
    "xtick.color": "#333333",
    "ytick.color": "#333333",
    "xtick.labelsize": 10,
    "ytick.labelsize": 10,
    "legend.fontsize": 10,
    "font.family": "sans-serif",
    "font.sans-serif": ["DejaVu Sans", "Helvetica", "Arial"],
}


class ChartGenerator:
    """
    Generates professional charts for forestry reports.

    All methods return PNG images as bytes for embedding in reports.
    Charts are styled with a consistent forestry theme.
    """

    def __init__(
        self,
        dpi: int = 150,
        figure_width: float = 8.0,
        figure_height: float = 6.0,
    ) -> None:
        """
        Initialize the chart generator.

        Args:
            dpi: Resolution for output images.
            figure_width: Default figure width in inches.
            figure_height: Default figure height in inches.
        """
        self.dpi = dpi
        self.figure_width = figure_width
        self.figure_height = figure_height

        # Apply default style
        plt.rcParams.update(CHART_STYLE)

    def _save_figure_to_bytes(self, fig: plt.Figure) -> bytes:
        """
        Save a matplotlib figure to PNG bytes.

        Args:
            fig: Matplotlib figure to save.

        Returns:
            PNG image as bytes.
        """
        buffer = io.BytesIO()
        fig.savefig(
            buffer,
            format="png",
            dpi=self.dpi,
            bbox_inches="tight",
            facecolor="white",
            edgecolor="none",
        )
        plt.close(fig)
        buffer.seek(0)
        return buffer.getvalue()

    def species_pie_chart(
        self,
        species_counts: dict[str, int],
        title: str = "Species Distribution",
        show_percentages: bool = True,
        max_slices: int = 10,
    ) -> bytes:
        """
        Generate a pie chart showing species distribution.

        Args:
            species_counts: Dictionary mapping species names to tree counts.
            title: Chart title.
            show_percentages: Whether to show percentage labels.
            max_slices: Maximum number of slices (others grouped as "Other").

        Returns:
            PNG image as bytes.
        """
        if not species_counts:
            return self._empty_chart("No species data available")

        # Sort by count and group small species as "Other"
        sorted_species = sorted(
            species_counts.items(), key=lambda x: x[1], reverse=True
        )

        if len(sorted_species) > max_slices:
            main_species = sorted_species[: max_slices - 1]
            other_count = sum(count for _, count in sorted_species[max_slices - 1 :])
            main_species.append(("Other", other_count))
            sorted_species = main_species

        labels = [name for name, _ in sorted_species]
        sizes = [count for _, count in sorted_species]
        colors = FOREST_COLORS[: len(sizes)]

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height))

        # Create pie chart with exploded small slices
        explode = [0.02] * len(sizes)

        def autopct_func(pct: float) -> str:
            if show_percentages and pct >= 3:  # Only show if >= 3%
                return f"{pct:.1f}%"
            return ""

        wedges, texts, autotexts = ax.pie(
            sizes,
            labels=labels,
            colors=colors,
            explode=explode,
            autopct=autopct_func,
            startangle=90,
            shadow=False,
            wedgeprops={"linewidth": 1, "edgecolor": "white"},
        )

        # Style the labels
        for text in texts:
            text.set_fontsize(10)
        for autotext in autotexts:
            autotext.set_fontsize(9)
            autotext.set_fontweight("bold")
            autotext.set_color("white")

        ax.set_title(title, fontsize=14, fontweight="bold", pad=20)
        ax.axis("equal")

        # Add legend for better readability
        total = sum(sizes)
        legend_labels = [f"{name}: {count:,} ({count/total*100:.1f}%)"
                        for name, count in zip(labels, sizes)]
        ax.legend(
            wedges,
            legend_labels,
            title="Species",
            loc="center left",
            bbox_to_anchor=(1.0, 0.5),
            fontsize=9,
        )

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def height_histogram(
        self,
        heights: Sequence[float],
        bins: int = 10,
        title: str = "Tree Height Distribution",
        xlabel: str = "Height (m)",
        ylabel: str = "Number of Trees",
        show_stats: bool = True,
    ) -> bytes:
        """
        Generate a histogram of tree heights.

        Args:
            heights: List of tree heights.
            bins: Number of histogram bins.
            title: Chart title.
            xlabel: X-axis label.
            ylabel: Y-axis label.
            show_stats: Whether to show statistics box.

        Returns:
            PNG image as bytes.
        """
        if not heights or len(heights) == 0:
            return self._empty_chart("No height data available")

        heights_arr = np.array(heights)
        heights_arr = heights_arr[~np.isnan(heights_arr)]

        if len(heights_arr) == 0:
            return self._empty_chart("No valid height data available")

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height))

        n, bins_edges, patches = ax.hist(
            heights_arr,
            bins=bins,
            color=FOREST_COLORS[0],
            edgecolor="white",
            linewidth=1.0,
            alpha=0.8,
        )

        # Add gradient effect
        for i, patch in enumerate(patches):
            patch.set_facecolor(plt.cm.Greens(0.4 + 0.4 * i / len(patches)))

        ax.set_xlabel(xlabel, fontsize=11)
        ax.set_ylabel(ylabel, fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        # Add statistics box
        if show_stats:
            stats_text = (
                f"n = {len(heights_arr):,}\n"
                f"Mean = {np.mean(heights_arr):.1f} m\n"
                f"Std = {np.std(heights_arr):.1f} m\n"
                f"Min = {np.min(heights_arr):.1f} m\n"
                f"Max = {np.max(heights_arr):.1f} m"
            )
            props = {"boxstyle": "round", "facecolor": "white", "alpha": 0.9}
            ax.text(
                0.95,
                0.95,
                stats_text,
                transform=ax.transAxes,
                fontsize=9,
                verticalalignment="top",
                horizontalalignment="right",
                bbox=props,
            )

        # Add mean line
        mean_height = np.mean(heights_arr)
        ax.axvline(
            mean_height,
            color="#D32F2F",
            linestyle="--",
            linewidth=2,
            label=f"Mean: {mean_height:.1f} m",
        )
        ax.legend(loc="upper left")

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def dbh_distribution(
        self,
        dbhs: Sequence[float],
        bins: int = 10,
        title: str = "DBH Distribution",
        xlabel: str = "DBH (cm)",
        ylabel: str = "Number of Trees",
        show_stats: bool = True,
    ) -> bytes:
        """
        Generate a histogram of DBH values.

        Args:
            dbhs: List of DBH values in centimeters.
            bins: Number of histogram bins.
            title: Chart title.
            xlabel: X-axis label.
            ylabel: Y-axis label.
            show_stats: Whether to show statistics box.

        Returns:
            PNG image as bytes.
        """
        if not dbhs or len(dbhs) == 0:
            return self._empty_chart("No DBH data available")

        dbhs_arr = np.array(dbhs)
        dbhs_arr = dbhs_arr[~np.isnan(dbhs_arr)]

        if len(dbhs_arr) == 0:
            return self._empty_chart("No valid DBH data available")

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height))

        n, bins_edges, patches = ax.hist(
            dbhs_arr,
            bins=bins,
            color=FOREST_COLORS[1],
            edgecolor="white",
            linewidth=1.0,
            alpha=0.8,
        )

        # Add gradient effect
        for i, patch in enumerate(patches):
            patch.set_facecolor(plt.cm.YlGn(0.3 + 0.5 * i / len(patches)))

        ax.set_xlabel(xlabel, fontsize=11)
        ax.set_ylabel(ylabel, fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        # Add statistics box
        if show_stats:
            stats_text = (
                f"n = {len(dbhs_arr):,}\n"
                f"Mean = {np.mean(dbhs_arr):.1f} cm\n"
                f"Std = {np.std(dbhs_arr):.1f} cm\n"
                f"Min = {np.min(dbhs_arr):.1f} cm\n"
                f"Max = {np.max(dbhs_arr):.1f} cm"
            )
            props = {"boxstyle": "round", "facecolor": "white", "alpha": 0.9}
            ax.text(
                0.95,
                0.95,
                stats_text,
                transform=ax.transAxes,
                fontsize=9,
                verticalalignment="top",
                horizontalalignment="right",
                bbox=props,
            )

        # Add mean line
        mean_dbh = np.mean(dbhs_arr)
        ax.axvline(
            mean_dbh,
            color="#D32F2F",
            linestyle="--",
            linewidth=2,
            label=f"Mean: {mean_dbh:.1f} cm",
        )
        ax.legend(loc="upper left")

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def biomass_by_species(
        self,
        species_biomass: dict[str, float],
        title: str = "Biomass by Species",
        xlabel: str = "Species",
        ylabel: str = "Biomass (kg)",
        show_values: bool = True,
        horizontal: bool = True,
    ) -> bytes:
        """
        Generate a bar chart showing biomass by species.

        Args:
            species_biomass: Dictionary mapping species names to biomass values.
            title: Chart title.
            xlabel: X-axis label.
            ylabel: Y-axis label.
            show_values: Whether to show value labels on bars.
            horizontal: Whether to use horizontal bars.

        Returns:
            PNG image as bytes.
        """
        if not species_biomass:
            return self._empty_chart("No biomass data available")

        # Sort by biomass
        sorted_data = sorted(
            species_biomass.items(), key=lambda x: x[1], reverse=True
        )
        species = [name for name, _ in sorted_data]
        biomass = [value for _, value in sorted_data]

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height))

        if horizontal:
            y_pos = np.arange(len(species))
            bars = ax.barh(
                y_pos,
                biomass,
                color=FOREST_COLORS[: len(species)],
                edgecolor="white",
                linewidth=1,
            )
            ax.set_yticks(y_pos)
            ax.set_yticklabels(species)
            ax.set_xlabel(ylabel, fontsize=11)
            ax.invert_yaxis()

            if show_values:
                for bar, value in zip(bars, biomass):
                    width = bar.get_width()
                    label = f"{value:,.0f}"
                    if value >= 1000:
                        label = f"{value/1000:,.1f}t"
                    ax.text(
                        width + max(biomass) * 0.02,
                        bar.get_y() + bar.get_height() / 2,
                        label,
                        va="center",
                        fontsize=9,
                    )
        else:
            x_pos = np.arange(len(species))
            bars = ax.bar(
                x_pos,
                biomass,
                color=FOREST_COLORS[: len(species)],
                edgecolor="white",
                linewidth=1,
            )
            ax.set_xticks(x_pos)
            ax.set_xticklabels(species, rotation=45, ha="right")
            ax.set_ylabel(ylabel, fontsize=11)

            if show_values:
                for bar, value in zip(bars, biomass):
                    height = bar.get_height()
                    label = f"{value:,.0f}"
                    if value >= 1000:
                        label = f"{value/1000:,.1f}t"
                    ax.text(
                        bar.get_x() + bar.get_width() / 2,
                        height + max(biomass) * 0.02,
                        label,
                        ha="center",
                        fontsize=9,
                    )

        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def carbon_summary_chart(
        self,
        carbon_data: dict[str, float],
        title: str = "Carbon Stock Summary",
    ) -> bytes:
        """
        Generate a summary chart showing carbon stocks.

        Args:
            carbon_data: Dictionary with carbon-related metrics.
            title: Chart title.

        Returns:
            PNG image as bytes.
        """
        if not carbon_data:
            return self._empty_chart("No carbon data available")

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height * 0.7))

        categories = list(carbon_data.keys())
        values = list(carbon_data.values())

        x_pos = np.arange(len(categories))
        bars = ax.bar(
            x_pos,
            values,
            color=[FOREST_COLORS[0], FOREST_COLORS[2], FOREST_COLORS[4]][
                : len(categories)
            ],
            edgecolor="white",
            linewidth=1.5,
        )

        ax.set_xticks(x_pos)
        ax.set_xticklabels(categories, fontsize=11)
        ax.set_ylabel("Amount (tonnes)", fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        # Add value labels
        for bar, value in zip(bars, values):
            height = bar.get_height()
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                height + max(values) * 0.02,
                f"{value:,.1f} t",
                ha="center",
                fontsize=11,
                fontweight="bold",
            )

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def stand_comparison_chart(
        self,
        stand_data: dict[str, dict[str, float]],
        metric: str = "stems_per_hectare",
        title: str = "Stand Comparison",
        ylabel: str = "Stems per Hectare",
    ) -> bytes:
        """
        Generate a bar chart comparing stands.

        Args:
            stand_data: Dictionary mapping stand names to metric dictionaries.
            metric: The metric to compare.
            title: Chart title.
            ylabel: Y-axis label.

        Returns:
            PNG image as bytes.
        """
        if not stand_data:
            return self._empty_chart("No stand data available")

        stands = list(stand_data.keys())
        values = [data.get(metric, 0) for data in stand_data.values()]

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height * 0.8))

        x_pos = np.arange(len(stands))
        bars = ax.bar(
            x_pos,
            values,
            color=FOREST_COLORS[: len(stands)],
            edgecolor="white",
            linewidth=1.5,
        )

        ax.set_xticks(x_pos)
        ax.set_xticklabels(stands, rotation=45, ha="right")
        ax.set_ylabel(ylabel, fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        # Add value labels
        for bar, value in zip(bars, values):
            height = bar.get_height()
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                height + max(values) * 0.02,
                f"{value:,.0f}",
                ha="center",
                fontsize=10,
            )

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def height_dbh_scatter(
        self,
        heights: Sequence[float],
        dbhs: Sequence[float],
        species: Sequence[str] | None = None,
        title: str = "Height vs DBH Relationship",
        xlabel: str = "DBH (cm)",
        ylabel: str = "Height (m)",
    ) -> bytes:
        """
        Generate a scatter plot of height vs DBH.

        Args:
            heights: List of tree heights.
            dbhs: List of DBH values.
            species: Optional list of species for coloring.
            title: Chart title.
            xlabel: X-axis label.
            ylabel: Y-axis label.

        Returns:
            PNG image as bytes.
        """
        if not heights or not dbhs or len(heights) != len(dbhs):
            return self._empty_chart("Invalid height/DBH data")

        heights_arr = np.array(heights)
        dbhs_arr = np.array(dbhs)

        # Filter out invalid values
        valid_mask = ~(np.isnan(heights_arr) | np.isnan(dbhs_arr))
        heights_arr = heights_arr[valid_mask]
        dbhs_arr = dbhs_arr[valid_mask]

        if len(heights_arr) == 0:
            return self._empty_chart("No valid height/DBH data")

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height))

        if species is not None and len(species) == len(valid_mask):
            species_arr = np.array(species)[valid_mask]
            unique_species = list(set(species_arr))
            color_map = {s: FOREST_COLORS[i % len(FOREST_COLORS)]
                        for i, s in enumerate(unique_species)}
            colors = [color_map[s] for s in species_arr]
            scatter = ax.scatter(
                dbhs_arr, heights_arr, c=colors, alpha=0.6, edgecolors="white", s=50
            )

            # Add legend
            handles = [
                plt.scatter([], [], c=color_map[s], label=s, s=50)
                for s in unique_species[:10]  # Limit legend
            ]
            ax.legend(handles=handles, loc="lower right", fontsize=9)
        else:
            ax.scatter(
                dbhs_arr,
                heights_arr,
                c=FOREST_COLORS[0],
                alpha=0.6,
                edgecolors="white",
                s=50,
            )

        # Add trend line
        z = np.polyfit(dbhs_arr, heights_arr, 2)
        p = np.poly1d(z)
        dbh_range = np.linspace(dbhs_arr.min(), dbhs_arr.max(), 100)
        ax.plot(dbh_range, p(dbh_range), "--", color="#D32F2F", linewidth=2, alpha=0.8)

        ax.set_xlabel(xlabel, fontsize=11)
        ax.set_ylabel(ylabel, fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def size_class_distribution(
        self,
        size_classes: dict[str, int],
        title: str = "Size Class Distribution",
        xlabel: str = "Size Class",
        ylabel: str = "Number of Trees",
    ) -> bytes:
        """
        Generate a bar chart showing size class distribution.

        Args:
            size_classes: Dictionary mapping size class labels to counts.
            title: Chart title.
            xlabel: X-axis label.
            ylabel: Y-axis label.

        Returns:
            PNG image as bytes.
        """
        if not size_classes:
            return self._empty_chart("No size class data available")

        classes = list(size_classes.keys())
        counts = list(size_classes.values())

        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height * 0.8))

        x_pos = np.arange(len(classes))
        bars = ax.bar(
            x_pos,
            counts,
            color=plt.cm.Greens(np.linspace(0.3, 0.9, len(classes))),
            edgecolor="white",
            linewidth=1,
        )

        ax.set_xticks(x_pos)
        ax.set_xticklabels(classes, rotation=45, ha="right")
        ax.set_xlabel(xlabel, fontsize=11)
        ax.set_ylabel(ylabel, fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold")

        # Add value labels
        for bar, count in zip(bars, counts):
            height = bar.get_height()
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                height + max(counts) * 0.02,
                str(count),
                ha="center",
                fontsize=9,
            )

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)

    def _empty_chart(self, message: str) -> bytes:
        """
        Generate an empty chart with a message.

        Args:
            message: Message to display.

        Returns:
            PNG image as bytes.
        """
        fig, ax = plt.subplots(figsize=(self.figure_width, self.figure_height * 0.5))
        ax.text(
            0.5,
            0.5,
            message,
            ha="center",
            va="center",
            fontsize=12,
            color="#666666",
        )
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")

        plt.tight_layout()
        return self._save_figure_to_bytes(fig)
