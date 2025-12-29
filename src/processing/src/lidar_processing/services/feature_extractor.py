"""
Tree Feature Extraction for Species Classification.

This module provides feature extraction from LiDAR point clouds
for use in species classification models.

Sprint 13-14: Species Classification ML System
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np
from scipy import stats
from scipy.spatial import ConvexHull

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import TreeFeatures, TreeMetrics

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class TreeFeatureExtractor:
    """
    Extracts features from tree point clouds for species classification.

    This class processes individual tree point clouds and extracts
    structural and intensity-based features that can distinguish
    between different tree species.

    Attributes:
        settings: Application settings.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the feature extractor.

        Args:
            settings: Optional settings instance.
        """
        self.settings = settings or get_settings()

    def extract_features(
        self,
        tree_points: NDArray[np.float64],
        tree_metrics: TreeMetrics | None = None,
        intensity: NDArray[np.float64] | None = None,
        return_number: NDArray[np.int32] | None = None,
        number_of_returns: NDArray[np.int32] | None = None,
    ) -> TreeFeatures:
        """
        Extract features from a tree point cloud for classification.

        Args:
            tree_points: Nx3 array of (x, y, z) coordinates (z should be normalized height).
            tree_metrics: Optional pre-computed tree metrics.
            intensity: Optional point intensity values.
            return_number: Optional return number for each point.
            number_of_returns: Optional number of returns for each point.

        Returns:
            TreeFeatures with all extracted features.
        """
        if tree_points.shape[0] < 5:
            # Not enough points for meaningful feature extraction
            return self._create_empty_features()

        # Extract coordinates
        x = tree_points[:, 0]
        y = tree_points[:, 1]
        z = tree_points[:, 2]

        # Height metrics
        height_features = self._extract_height_features(z)

        # Crown shape features
        crown_features = self._extract_crown_features(x, y, z)

        # Vertical distribution features
        vertical_features = self._extract_vertical_features(z)

        # Point density features
        density_features = self._extract_density_features(x, y, z)

        # Intensity features (if available)
        intensity_features = self._extract_intensity_features(intensity)

        # Return number features (if available)
        return_features = self._extract_return_features(return_number, number_of_returns)

        # Combine all features
        return TreeFeatures(
            # Height metrics
            height=height_features["max_height"],
            height_mean=height_features["mean_height"],
            height_std=height_features["std_height"],
            height_percentiles=height_features["percentiles"],
            height_skewness=height_features["skewness"],
            height_kurtosis=height_features["kurtosis"],
            # Crown shape
            crown_diameter=crown_features["diameter"],
            crown_area=crown_features["area"],
            crown_asymmetry=crown_features["asymmetry"],
            crown_density=crown_features["density"],
            crown_perimeter=crown_features["perimeter"],
            crown_circularity=crown_features["circularity"],
            # Vertical distribution
            vertical_complexity=vertical_features["complexity"],
            canopy_relief_ratio=vertical_features["relief_ratio"],
            gap_fraction=vertical_features["gap_fraction"],
            layer_count=vertical_features["layer_count"],
            crown_base_height=vertical_features["crown_base_height"],
            crown_length_ratio=vertical_features["crown_length_ratio"],
            # Density patterns
            point_density_upper=density_features["upper"],
            point_density_mid=density_features["mid"],
            point_density_lower=density_features["lower"],
            point_count=len(x),
            # Intensity (if available)
            intensity_mean=intensity_features.get("mean"),
            intensity_std=intensity_features.get("std"),
            intensity_max=intensity_features.get("max"),
            intensity_percentile_90=intensity_features.get("p90"),
            # Return distribution (if available)
            first_return_ratio=return_features.get("first_return_ratio"),
            last_return_ratio=return_features.get("last_return_ratio"),
            single_return_ratio=return_features.get("single_return_ratio"),
        )

    def extract_features_from_metrics(
        self,
        tree_metrics: TreeMetrics,
        additional_features: dict | None = None,
    ) -> TreeFeatures:
        """
        Create TreeFeatures from existing TreeMetrics.

        This is useful when you have pre-computed metrics but need
        the full feature set for classification. Missing features
        will be estimated or set to None.

        Args:
            tree_metrics: Pre-computed tree metrics.
            additional_features: Optional dictionary with additional features.

        Returns:
            TreeFeatures instance.
        """
        features = additional_features or {}

        # Estimate percentiles from height if not provided
        height = tree_metrics.height
        percentiles = features.get(
            "height_percentiles",
            [height * 0.25, height * 0.50, height * 0.75, height * 0.90, height * 0.95],
        )

        # Estimate crown metrics
        crown_diameter = tree_metrics.crown_diameter or height * 0.3
        crown_area = tree_metrics.crown_area or np.pi * (crown_diameter / 2) ** 2

        return TreeFeatures(
            height=height,
            crown_diameter=crown_diameter,
            crown_area=crown_area,
            height_percentiles=percentiles,
            crown_density=features.get("crown_density", 0.5),
            vertical_complexity=features.get("vertical_complexity", 0.5),
            intensity_mean=features.get("intensity_mean"),
            intensity_std=features.get("intensity_std"),
            point_count=tree_metrics.point_count,
            # Set other features to defaults or None
            height_mean=features.get("height_mean", height * 0.6),
            height_std=features.get("height_std", height * 0.2),
            height_skewness=features.get("height_skewness"),
            height_kurtosis=features.get("height_kurtosis"),
            crown_asymmetry=features.get("crown_asymmetry", 0.1),
            crown_perimeter=features.get("crown_perimeter"),
            crown_circularity=features.get("crown_circularity", 0.8),
            canopy_relief_ratio=features.get("canopy_relief_ratio", 0.5),
            gap_fraction=features.get("gap_fraction", 0.3),
            layer_count=features.get("layer_count", 3),
            crown_base_height=tree_metrics.crown_base_height,
            crown_length_ratio=features.get("crown_length_ratio", 0.6),
            point_density_upper=features.get("point_density_upper", 0.4),
            point_density_mid=features.get("point_density_mid", 0.35),
            point_density_lower=features.get("point_density_lower", 0.25),
            intensity_max=features.get("intensity_max"),
            intensity_percentile_90=features.get("intensity_percentile_90"),
            first_return_ratio=features.get("first_return_ratio"),
            last_return_ratio=features.get("last_return_ratio"),
            single_return_ratio=features.get("single_return_ratio"),
        )

    def _extract_height_features(
        self,
        z: NDArray[np.float64],
    ) -> dict:
        """Extract height-related features."""
        if len(z) == 0:
            return {
                "max_height": 0.0,
                "mean_height": 0.0,
                "std_height": 0.0,
                "percentiles": [0.0] * 5,
                "skewness": 0.0,
                "kurtosis": 0.0,
            }

        # Filter to positive heights
        z_pos = z[z > 0]
        if len(z_pos) == 0:
            z_pos = z

        percentiles = list(np.percentile(z_pos, [25, 50, 75, 90, 95]))

        # Calculate distribution metrics
        if len(z_pos) > 3:
            skewness = float(stats.skew(z_pos))
            kurtosis = float(stats.kurtosis(z_pos))
        else:
            skewness = 0.0
            kurtosis = 0.0

        return {
            "max_height": float(np.max(z_pos)),
            "mean_height": float(np.mean(z_pos)),
            "std_height": float(np.std(z_pos)) if len(z_pos) > 1 else 0.0,
            "percentiles": [round(p, 3) for p in percentiles],
            "skewness": round(skewness, 4),
            "kurtosis": round(kurtosis, 4),
        }

    def _extract_crown_features(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
    ) -> dict:
        """Extract crown shape features."""
        # Use upper portion of points for crown analysis
        max_height = np.max(z)
        crown_threshold = max_height * 0.5
        crown_mask = z >= crown_threshold

        if np.sum(crown_mask) < 3:
            # Fall back to all points
            crown_x, crown_y = x, y
        else:
            crown_x = x[crown_mask]
            crown_y = y[crown_mask]

        # Calculate crown dimensions
        try:
            points = np.column_stack([crown_x, crown_y])
            hull = ConvexHull(points)
            area = float(hull.volume)  # In 2D, volume gives area
            perimeter = float(hull.area)  # In 2D, area gives perimeter

            # Circularity: 4*pi*A / P^2 (1.0 for perfect circle)
            circularity = (4 * np.pi * area) / (perimeter ** 2) if perimeter > 0 else 0

        except Exception:
            # Fallback for insufficient points
            x_range = np.max(crown_x) - np.min(crown_x)
            y_range = np.max(crown_y) - np.min(crown_y)
            diameter = (x_range + y_range) / 2
            area = np.pi * (diameter / 2) ** 2
            perimeter = np.pi * diameter
            circularity = 1.0

        # Diameter from area
        diameter = 2 * np.sqrt(area / np.pi)

        # Crown asymmetry (difference in x/y extent)
        x_extent = np.max(crown_x) - np.min(crown_x)
        y_extent = np.max(crown_y) - np.min(crown_y)
        if max(x_extent, y_extent) > 0:
            asymmetry = abs(x_extent - y_extent) / max(x_extent, y_extent)
        else:
            asymmetry = 0.0

        # Crown density (points per unit area)
        density = len(crown_x) / area if area > 0 else 0

        return {
            "diameter": round(diameter, 3),
            "area": round(area, 3),
            "asymmetry": round(asymmetry, 4),
            "density": round(density, 4),
            "perimeter": round(perimeter, 3),
            "circularity": round(circularity, 4),
        }

    def _extract_vertical_features(
        self,
        z: NDArray[np.float64],
    ) -> dict:
        """Extract vertical distribution features."""
        if len(z) < 5:
            return {
                "complexity": 0.0,
                "relief_ratio": 0.0,
                "gap_fraction": 0.0,
                "layer_count": 1,
                "crown_base_height": 0.0,
                "crown_length_ratio": 1.0,
            }

        max_height = np.max(z)
        min_height = np.min(z)
        height_range = max_height - min_height

        if height_range < 0.1:
            return {
                "complexity": 0.0,
                "relief_ratio": 0.0,
                "gap_fraction": 0.0,
                "layer_count": 1,
                "crown_base_height": float(min_height),
                "crown_length_ratio": 1.0,
            }

        # Canopy relief ratio: (mean - min) / (max - min)
        mean_height = np.mean(z)
        relief_ratio = (mean_height - min_height) / height_range

        # Vertical complexity (entropy-based)
        n_bins = min(20, len(z) // 5)
        if n_bins >= 3:
            hist, _ = np.histogram(z, bins=n_bins)
            hist_norm = hist / np.sum(hist)
            hist_norm = hist_norm[hist_norm > 0]  # Remove zeros for log
            entropy = -np.sum(hist_norm * np.log(hist_norm))
            max_entropy = np.log(n_bins)
            complexity = entropy / max_entropy if max_entropy > 0 else 0
        else:
            complexity = 0.5

        # Gap fraction (proportion of empty height bins)
        n_gap_bins = 10
        gap_hist, _ = np.histogram(z, bins=n_gap_bins)
        gap_fraction = np.sum(gap_hist == 0) / n_gap_bins

        # Layer count (number of distinct peaks in height distribution)
        layer_count = self._count_layers(z)

        # Crown base height (lower percentile)
        crown_base_height = float(np.percentile(z, 10))

        # Crown length ratio (crown length / total height)
        crown_length = max_height - crown_base_height
        crown_length_ratio = crown_length / max_height if max_height > 0 else 1.0

        return {
            "complexity": round(complexity, 4),
            "relief_ratio": round(relief_ratio, 4),
            "gap_fraction": round(gap_fraction, 4),
            "layer_count": layer_count,
            "crown_base_height": round(crown_base_height, 3),
            "crown_length_ratio": round(crown_length_ratio, 4),
        }

    def _count_layers(self, z: NDArray[np.float64]) -> int:
        """Count distinct vertical layers in the tree."""
        if len(z) < 10:
            return 1

        # Create height histogram
        n_bins = 20
        hist, bin_edges = np.histogram(z, bins=n_bins)

        # Smooth the histogram
        from scipy.ndimage import gaussian_filter1d
        hist_smooth = gaussian_filter1d(hist.astype(float), sigma=1.0)

        # Find peaks (local maxima)
        peaks = []
        for i in range(1, len(hist_smooth) - 1):
            if hist_smooth[i] > hist_smooth[i - 1] and hist_smooth[i] > hist_smooth[i + 1]:
                if hist_smooth[i] > np.mean(hist_smooth) * 0.5:  # Significant peak
                    peaks.append(i)

        return max(1, len(peaks))

    def _extract_density_features(
        self,
        x: NDArray[np.float64],
        y: NDArray[np.float64],
        z: NDArray[np.float64],
    ) -> dict:
        """Extract point density distribution features."""
        if len(z) == 0:
            return {"upper": 0.0, "mid": 0.0, "lower": 0.0}

        max_height = np.max(z)
        if max_height <= 0:
            return {"upper": 0.0, "mid": 0.0, "lower": 1.0}

        # Divide into three vertical zones
        upper_threshold = max_height * 0.67
        mid_threshold = max_height * 0.33

        upper_count = np.sum(z >= upper_threshold)
        mid_count = np.sum((z >= mid_threshold) & (z < upper_threshold))
        lower_count = np.sum(z < mid_threshold)

        total_count = len(z)

        return {
            "upper": round(upper_count / total_count, 4),
            "mid": round(mid_count / total_count, 4),
            "lower": round(lower_count / total_count, 4),
        }

    def _extract_intensity_features(
        self,
        intensity: NDArray[np.float64] | None,
    ) -> dict:
        """Extract intensity-based features."""
        if intensity is None or len(intensity) == 0:
            return {}

        # Filter valid intensity values
        valid_intensity = intensity[~np.isnan(intensity)]
        if len(valid_intensity) == 0:
            return {}

        return {
            "mean": round(float(np.mean(valid_intensity)), 3),
            "std": round(float(np.std(valid_intensity)), 3),
            "max": round(float(np.max(valid_intensity)), 3),
            "p90": round(float(np.percentile(valid_intensity, 90)), 3),
        }

    def _extract_return_features(
        self,
        return_number: NDArray[np.int32] | None,
        number_of_returns: NDArray[np.int32] | None,
    ) -> dict:
        """Extract return number distribution features."""
        if return_number is None or len(return_number) == 0:
            return {}

        total_points = len(return_number)

        # First return ratio
        first_returns = np.sum(return_number == 1)
        first_return_ratio = first_returns / total_points

        # Last return ratio (points where return_number == number_of_returns)
        if number_of_returns is not None:
            last_returns = np.sum(return_number == number_of_returns)
            last_return_ratio = last_returns / total_points

            # Single returns (only one return for that pulse)
            single_returns = np.sum(number_of_returns == 1)
            single_return_ratio = single_returns / total_points
        else:
            last_return_ratio = None
            single_return_ratio = None

        result = {
            "first_return_ratio": round(first_return_ratio, 4),
        }

        if last_return_ratio is not None:
            result["last_return_ratio"] = round(last_return_ratio, 4)

        if single_return_ratio is not None:
            result["single_return_ratio"] = round(single_return_ratio, 4)

        return result

    def _create_empty_features(self) -> TreeFeatures:
        """Create an empty TreeFeatures instance for invalid inputs."""
        return TreeFeatures(
            height=0.0,
            crown_diameter=0.0,
            crown_area=0.0,
            height_percentiles=[0.0, 0.0, 0.0, 0.0, 0.0],
            crown_density=0.0,
            vertical_complexity=0.0,
            point_count=0,
        )

    def get_feature_vector(
        self,
        features: TreeFeatures,
        include_intensity: bool = True,
        include_returns: bool = True,
    ) -> NDArray[np.float64]:
        """
        Convert TreeFeatures to a feature vector for ML models.

        Args:
            features: TreeFeatures instance.
            include_intensity: Include intensity features (filled with 0 if missing).
            include_returns: Include return number features (filled with 0 if missing).

        Returns:
            1D numpy array of feature values.
        """
        # Core features that are always present
        vector = [
            features.height,
            features.height_mean or 0.0,
            features.height_std or 0.0,
            features.height_skewness or 0.0,
            features.height_kurtosis or 0.0,
            features.crown_diameter,
            features.crown_area,
            features.crown_asymmetry or 0.0,
            features.crown_density,
            features.crown_circularity or 0.0,
            features.vertical_complexity,
            features.canopy_relief_ratio or 0.0,
            features.gap_fraction or 0.0,
            features.layer_count or 1,
            features.crown_base_height or 0.0,
            features.crown_length_ratio or 1.0,
            features.point_density_upper or 0.0,
            features.point_density_mid or 0.0,
            features.point_density_lower or 0.0,
        ]

        # Add height percentiles
        vector.extend(features.height_percentiles)

        # Optional intensity features
        if include_intensity:
            vector.extend([
                features.intensity_mean or 0.0,
                features.intensity_std or 0.0,
                features.intensity_max or 0.0,
                features.intensity_percentile_90 or 0.0,
            ])

        # Optional return features
        if include_returns:
            vector.extend([
                features.first_return_ratio or 0.0,
                features.last_return_ratio or 0.0,
                features.single_return_ratio or 0.0,
            ])

        return np.array(vector, dtype=np.float64)

    def get_feature_names(
        self,
        include_intensity: bool = True,
        include_returns: bool = True,
    ) -> list[str]:
        """
        Get the names of features in the feature vector.

        Args:
            include_intensity: Include intensity feature names.
            include_returns: Include return feature names.

        Returns:
            List of feature names in the same order as get_feature_vector.
        """
        names = [
            "height",
            "height_mean",
            "height_std",
            "height_skewness",
            "height_kurtosis",
            "crown_diameter",
            "crown_area",
            "crown_asymmetry",
            "crown_density",
            "crown_circularity",
            "vertical_complexity",
            "canopy_relief_ratio",
            "gap_fraction",
            "layer_count",
            "crown_base_height",
            "crown_length_ratio",
            "point_density_upper",
            "point_density_mid",
            "point_density_lower",
            "height_p25",
            "height_p50",
            "height_p75",
            "height_p90",
            "height_p95",
        ]

        if include_intensity:
            names.extend([
                "intensity_mean",
                "intensity_std",
                "intensity_max",
                "intensity_p90",
            ])

        if include_returns:
            names.extend([
                "first_return_ratio",
                "last_return_ratio",
                "single_return_ratio",
            ])

        return names
