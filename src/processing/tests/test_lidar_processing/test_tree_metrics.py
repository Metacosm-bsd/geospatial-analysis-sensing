"""
Unit tests for the Tree Metrics Extractor service.

Tests tree measurement calculations, allometric equations, and biomass estimation.
"""

from __future__ import annotations

import numpy as np
import pytest

from lidar_processing.models import TreeMetrics
from lidar_processing.services.tree_metrics import (
    AllometricCoefficients,
    ALLOMETRIC_COEFFICIENTS,
    CARBON_FRACTION,
    CO2_TO_C_RATIO,
    SpeciesGroup,
    TreeMetricsExtractor,
)


class TestSpeciesGroup:
    """Tests for SpeciesGroup enum."""

    def test_species_groups(self):
        """Test species group values."""
        assert SpeciesGroup.SOFTWOOD.value == "softwood"
        assert SpeciesGroup.HARDWOOD.value == "hardwood"
        assert SpeciesGroup.MIXED.value == "mixed"
        assert SpeciesGroup.TROPICAL.value == "tropical"
        assert SpeciesGroup.UNKNOWN.value == "unknown"

    def test_all_groups_have_coefficients(self):
        """Test all species groups have allometric coefficients."""
        for group in SpeciesGroup:
            assert group in ALLOMETRIC_COEFFICIENTS


class TestAllometricCoefficients:
    """Tests for AllometricCoefficients dataclass."""

    def test_coefficient_structure(self):
        """Test coefficient structure."""
        softwood = ALLOMETRIC_COEFFICIENTS[SpeciesGroup.SOFTWOOD]

        assert hasattr(softwood, 'height_dbh_a')
        assert hasattr(softwood, 'height_dbh_b')
        assert hasattr(softwood, 'dbh_biomass_a')
        assert hasattr(softwood, 'dbh_biomass_b')
        assert hasattr(softwood, 'crown_dbh_a')
        assert hasattr(softwood, 'crown_dbh_b')

    def test_coefficient_values_positive(self):
        """Test coefficient values are positive."""
        for group, coeffs in ALLOMETRIC_COEFFICIENTS.items():
            assert coeffs.height_dbh_a > 0, f"{group} height_dbh_a"
            assert coeffs.height_dbh_b > 0, f"{group} height_dbh_b"
            assert coeffs.dbh_biomass_a > 0, f"{group} dbh_biomass_a"
            assert coeffs.dbh_biomass_b > 0, f"{group} dbh_biomass_b"


class TestTreeMetricsExtractor:
    """Tests for TreeMetricsExtractor service."""

    @pytest.fixture
    def extractor(self):
        """Create a tree metrics extractor instance."""
        return TreeMetricsExtractor()

    @pytest.fixture
    def softwood_extractor(self):
        """Create extractor for softwood species."""
        return TreeMetricsExtractor(species_group=SpeciesGroup.SOFTWOOD)

    def test_extractor_initialization(self, extractor):
        """Test extractor initializes correctly."""
        assert extractor.settings is not None
        assert extractor.species_group == SpeciesGroup.UNKNOWN
        assert extractor.coefficients is not None

    def test_extractor_with_species_group(self, softwood_extractor):
        """Test extractor with specific species group."""
        assert softwood_extractor.species_group == SpeciesGroup.SOFTWOOD
        assert softwood_extractor.coefficients == ALLOMETRIC_COEFFICIENTS[SpeciesGroup.SOFTWOOD]


class TestCalculateTreeHeight:
    """Tests for tree height calculation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_height_from_normalized_z(self, extractor):
        """Test height calculation from normalized heights."""
        normalized_z = np.array([0.5, 5.0, 10.0, 15.0, 14.5])

        height = extractor.calculate_tree_height(normalized_z)

        # Should be close to max but using percentile
        assert 14.0 <= height <= 15.0

    def test_height_empty_array(self, extractor):
        """Test height with empty array."""
        normalized_z = np.array([])

        height = extractor.calculate_tree_height(normalized_z)

        assert height == 0.0

    def test_height_percentile_avoids_outliers(self, extractor):
        """Test that percentile avoids outliers."""
        normalized_z = np.array([10.0] * 100 + [100.0])  # Outlier at 100

        height = extractor.calculate_tree_height(normalized_z, percentile=99.0)

        # Should be close to 10, not 100
        assert height < 20


class TestCalculateCrownDiameter:
    """Tests for crown diameter calculation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_crown_diameter_circular(self, extractor):
        """Test crown diameter for circular crown."""
        # Create circular crown points
        angles = np.linspace(0, 2 * np.pi, 20)
        x = 5.0 * np.cos(angles)
        y = 5.0 * np.sin(angles)

        diameter = extractor.calculate_crown_diameter(x, y, method="convex_hull")

        # Diameter should be approximately 10
        assert 9.0 <= diameter <= 11.0

    def test_crown_diameter_bounding_box(self, extractor):
        """Test crown diameter using bounding box method."""
        x = np.array([0, 10, 0, 10])
        y = np.array([0, 0, 10, 10])

        diameter = extractor.calculate_crown_diameter(x, y, method="bounding_box")

        # Should be 10 (average of x and y ranges)
        assert diameter == 10.0

    def test_crown_diameter_insufficient_points(self, extractor):
        """Test crown diameter with insufficient points."""
        x = np.array([0, 1])
        y = np.array([0, 1])

        diameter = extractor.calculate_crown_diameter(x, y)

        assert diameter == 0.0


class TestCalculateCrownBaseHeight:
    """Tests for crown base height calculation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_crown_base_height_percentile(self, extractor):
        """Test crown base height using percentile method."""
        # Simulate crown with base at 5m
        normalized_z = np.concatenate([
            np.random.uniform(5, 6, 10),    # Lower crown
            np.random.uniform(10, 15, 80),  # Upper crown
            np.random.uniform(15, 18, 10),  # Tree top
        ])

        cbh = extractor.calculate_crown_base_height(normalized_z, method="percentile")

        # Crown base should be around 5-6m
        assert 4.0 <= cbh <= 8.0

    def test_crown_base_height_insufficient_points(self, extractor):
        """Test crown base height with insufficient points."""
        normalized_z = np.array([5.0, 10.0])

        cbh = extractor.calculate_crown_base_height(normalized_z)

        assert cbh == 0.0


class TestEstimateDBH:
    """Tests for DBH estimation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_estimate_dbh_from_height(self, extractor):
        """Test DBH estimation from height."""
        dbh = extractor.estimate_dbh(height=20.0)

        assert dbh is not None
        assert 15 < dbh < 80  # Reasonable range for 20m tree

    def test_estimate_dbh_below_breast_height(self, extractor):
        """Test DBH for tree below breast height."""
        dbh = extractor.estimate_dbh(height=1.0)

        assert dbh is None

    def test_estimate_dbh_with_crown(self, extractor):
        """Test DBH estimation with crown diameter."""
        height = 20.0
        crown_diameter = 8.0

        dbh_with_crown = extractor.estimate_dbh(
            height=height, crown_diameter=crown_diameter
        )
        dbh_without_crown = extractor.estimate_dbh(height=height)

        # Both should give reasonable estimates
        assert dbh_with_crown is not None
        assert dbh_without_crown is not None

    def test_estimate_dbh_species_override(self, extractor):
        """Test DBH estimation with species group override."""
        dbh_softwood = extractor.estimate_dbh(
            height=20.0, species_group=SpeciesGroup.SOFTWOOD
        )
        dbh_hardwood = extractor.estimate_dbh(
            height=20.0, species_group=SpeciesGroup.HARDWOOD
        )

        # Different species groups may give different estimates
        assert dbh_softwood is not None
        assert dbh_hardwood is not None

    def test_estimate_dbh_increases_with_height(self, extractor):
        """Test DBH increases with tree height."""
        dbh_10 = extractor.estimate_dbh(height=10.0)
        dbh_20 = extractor.estimate_dbh(height=20.0)
        dbh_30 = extractor.estimate_dbh(height=30.0)

        assert dbh_10 < dbh_20 < dbh_30


class TestEstimateBiomass:
    """Tests for biomass estimation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_estimate_biomass(self, extractor):
        """Test biomass estimation from DBH."""
        biomass = extractor.estimate_biomass(dbh=30.0)

        assert biomass is not None
        assert biomass > 0

    def test_estimate_biomass_small_dbh(self, extractor):
        """Test biomass for very small DBH."""
        biomass = extractor.estimate_biomass(dbh=0.5)

        assert biomass is None

    def test_estimate_biomass_increases_with_dbh(self, extractor):
        """Test biomass increases with DBH."""
        biomass_20 = extractor.estimate_biomass(dbh=20.0)
        biomass_40 = extractor.estimate_biomass(dbh=40.0)
        biomass_60 = extractor.estimate_biomass(dbh=60.0)

        assert biomass_20 < biomass_40 < biomass_60


class TestEstimateCarbon:
    """Tests for carbon estimation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_estimate_carbon(self, extractor):
        """Test carbon estimation from biomass."""
        biomass = 500.0
        carbon = extractor.estimate_carbon(biomass)

        expected = biomass * CARBON_FRACTION
        assert carbon == expected

    def test_estimate_carbon_none_input(self, extractor):
        """Test carbon with None biomass."""
        carbon = extractor.estimate_carbon(None)

        assert carbon is None


class TestEstimateCO2Equivalent:
    """Tests for CO2 equivalent estimation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_estimate_co2_equivalent(self, extractor):
        """Test CO2 equivalent from carbon."""
        carbon = 100.0
        co2 = extractor.estimate_co2_equivalent(carbon)

        expected = carbon * CO2_TO_C_RATIO
        assert co2 == expected

    def test_estimate_co2_none_input(self, extractor):
        """Test CO2 equivalent with None carbon."""
        co2 = extractor.estimate_co2_equivalent(None)

        assert co2 is None


class TestExtractMetrics:
    """Tests for full metrics extraction."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    def test_extract_metrics(self, extractor):
        """Test extracting all metrics for a tree."""
        np.random.seed(42)

        # Simulate crown points
        n_points = 50
        angles = np.random.uniform(0, 2 * np.pi, n_points)
        radii = np.random.uniform(0, 4, n_points)
        x = 100.0 + radii * np.cos(angles)
        y = 200.0 + radii * np.sin(angles)
        normalized_z = np.random.uniform(5, 20, n_points)

        metrics = extractor.extract_metrics(
            tree_id=1,
            x=x,
            y=y,
            normalized_z=normalized_z,
            tree_top_x=100.0,
            tree_top_y=200.0,
        )

        assert metrics.tree_id == 1
        assert metrics.x == 100.0
        assert metrics.y == 200.0
        assert metrics.height > 0
        assert metrics.crown_diameter is not None
        assert metrics.crown_area is not None
        assert metrics.point_count == n_points

    def test_extract_metrics_auto_tree_top(self, extractor):
        """Test metrics extraction with automatic tree top detection."""
        x = np.array([0, 1, 2, 3, 4])
        y = np.array([0, 0, 0, 0, 0])
        normalized_z = np.array([5, 10, 15, 10, 5])

        metrics = extractor.extract_metrics(
            tree_id=1, x=x, y=y, normalized_z=normalized_z
        )

        # Tree top should be at point with max height
        assert metrics.x == 2  # Third point has max height
        assert metrics.y == 0


class TestCalculateStandMetrics:
    """Tests for stand-level metrics calculation."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance."""
        return TreeMetricsExtractor()

    @pytest.fixture
    def sample_trees(self):
        """Create sample tree metrics."""
        return [
            TreeMetrics(
                tree_id=1, x=0, y=0, height=15.0,
                crown_diameter=6.0, dbh_estimated=25.0, biomass_estimated=200.0
            ),
            TreeMetrics(
                tree_id=2, x=10, y=0, height=20.0,
                crown_diameter=8.0, dbh_estimated=35.0, biomass_estimated=400.0
            ),
            TreeMetrics(
                tree_id=3, x=5, y=10, height=18.0,
                crown_diameter=7.0, dbh_estimated=30.0, biomass_estimated=300.0
            ),
        ]

    def test_calculate_stand_metrics(self, extractor, sample_trees):
        """Test stand metrics calculation."""
        metrics = extractor.calculate_stand_metrics(sample_trees, area_hectares=0.1)

        assert metrics['stems_per_hectare'] == 30.0
        assert metrics['mean_height_m'] == pytest.approx(17.67, rel=0.01)
        assert metrics['max_height_m'] == 20.0
        assert metrics['mean_dbh_cm'] == 30.0
        assert metrics['biomass_kg_ha'] is not None
        assert metrics['carbon_tonnes_ha'] is not None
        assert metrics['co2_equivalent_tonnes_ha'] is not None

    def test_calculate_stand_metrics_empty(self, extractor):
        """Test stand metrics with no trees."""
        metrics = extractor.calculate_stand_metrics([], area_hectares=1.0)

        assert metrics == {}

    def test_calculate_stand_metrics_basal_area(self, extractor, sample_trees):
        """Test basal area calculation."""
        metrics = extractor.calculate_stand_metrics(sample_trees, area_hectares=0.1)

        # Basal area should be positive
        assert metrics['basal_area_m2_ha'] > 0


class TestSetSpeciesGroup:
    """Tests for species group updates."""

    def test_set_species_group(self):
        """Test updating species group."""
        extractor = TreeMetricsExtractor(species_group=SpeciesGroup.UNKNOWN)

        extractor.set_species_group(SpeciesGroup.SOFTWOOD)

        assert extractor.species_group == SpeciesGroup.SOFTWOOD
        assert extractor.coefficients == ALLOMETRIC_COEFFICIENTS[SpeciesGroup.SOFTWOOD]

    def test_species_affects_estimates(self):
        """Test that species group affects estimates."""
        height = 20.0

        softwood = TreeMetricsExtractor(species_group=SpeciesGroup.SOFTWOOD)
        hardwood = TreeMetricsExtractor(species_group=SpeciesGroup.HARDWOOD)

        dbh_softwood = softwood.estimate_dbh(height)
        dbh_hardwood = hardwood.estimate_dbh(height)

        # Different species groups have different coefficients
        # so estimates may differ (though not guaranteed to be different)
        assert dbh_softwood is not None
        assert dbh_hardwood is not None


class TestConstants:
    """Tests for module constants."""

    def test_carbon_fraction(self):
        """Test carbon fraction value."""
        assert CARBON_FRACTION == 0.47

    def test_co2_ratio(self):
        """Test CO2 to C ratio."""
        assert CO2_TO_C_RATIO == pytest.approx(44.0 / 12.0)
