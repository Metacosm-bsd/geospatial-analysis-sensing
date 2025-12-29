"""
Timber Valuation Service.

Sprint 37-42: Growth Projections & Timber Value

Implements timber value estimation including:
- Product class assignment (sawlogs, pulpwood, etc.)
- Stumpage value calculation by species and product
- Regional timber price integration
- Harvest scenario modeling
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
import math


class ProductClass(str, Enum):
    """Timber product classifications."""
    SAWLOG_PREMIUM = "sawlog_premium"  # High-grade sawlogs (clear, export grade)
    SAWLOG_STANDARD = "sawlog_standard"  # Standard sawlogs
    SAWLOG_UTILITY = "sawlog_utility"   # Utility grade sawlogs
    PEELER = "peeler"                    # Veneer/peeler logs
    PULPWOOD = "pulpwood"               # Pulp and paper
    CHIP = "chip"                        # Chip-n-saw
    FIREWOOD = "firewood"               # Fuelwood
    CULL = "cull"                        # Non-merchantable


class MerchantabilityStandard(str, Enum):
    """Merchantability standards."""
    USFS = "usfs"           # USFS/FIA standards
    REGIONAL = "regional"   # Regional logger standards
    EXPORT = "export"       # Export market standards


@dataclass
class ProductSpecs:
    """Specifications for a product class."""
    name: str
    min_dbh_cm: float      # Minimum DBH
    min_length_m: float    # Minimum log length
    max_defect_pct: float  # Maximum defect percentage
    form_factor: float     # Volume adjustment factor


# Product specifications by class
PRODUCT_SPECS = {
    ProductClass.SAWLOG_PREMIUM: ProductSpecs(
        name="Premium Sawlog",
        min_dbh_cm=40,
        min_length_m=4.9,
        max_defect_pct=10,
        form_factor=0.85,
    ),
    ProductClass.SAWLOG_STANDARD: ProductSpecs(
        name="Standard Sawlog",
        min_dbh_cm=25,
        min_length_m=3.7,
        max_defect_pct=25,
        form_factor=0.80,
    ),
    ProductClass.SAWLOG_UTILITY: ProductSpecs(
        name="Utility Sawlog",
        min_dbh_cm=20,
        min_length_m=2.4,
        max_defect_pct=40,
        form_factor=0.75,
    ),
    ProductClass.PEELER: ProductSpecs(
        name="Peeler Log",
        min_dbh_cm=35,
        min_length_m=2.5,
        max_defect_pct=15,
        form_factor=0.90,
    ),
    ProductClass.PULPWOOD: ProductSpecs(
        name="Pulpwood",
        min_dbh_cm=10,
        min_length_m=2.4,
        max_defect_pct=50,
        form_factor=0.70,
    ),
    ProductClass.CHIP: ProductSpecs(
        name="Chip-n-Saw",
        min_dbh_cm=15,
        min_length_m=2.4,
        max_defect_pct=40,
        form_factor=0.72,
    ),
    ProductClass.FIREWOOD: ProductSpecs(
        name="Firewood",
        min_dbh_cm=10,
        min_length_m=1.0,
        max_defect_pct=70,
        form_factor=0.65,
    ),
    ProductClass.CULL: ProductSpecs(
        name="Cull/Non-Merchantable",
        min_dbh_cm=0,
        min_length_m=0,
        max_defect_pct=100,
        form_factor=0.0,
    ),
}


@dataclass
class TimberPrice:
    """Regional timber price by species and product."""
    product: ProductClass
    species_code: str | None  # None = default for all species
    price_per_mbf: float      # $/MBF (thousand board feet)
    price_per_m3: float       # $/m3 (derived)
    region: str
    effective_date: datetime
    source: str = "regional_average"


# Regional timber prices (Q4 2024 estimates)
# MBF = thousand board feet, converted to $/m3
TIMBER_PRICES = {
    "pnw": [
        TimberPrice(ProductClass.SAWLOG_PREMIUM, "PSME", 750, 318, "pnw", datetime(2024, 10, 1), "Oregon DOF"),
        TimberPrice(ProductClass.SAWLOG_PREMIUM, "TSHE", 650, 276, "pnw", datetime(2024, 10, 1), "Oregon DOF"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, "PSME", 550, 233, "pnw", datetime(2024, 10, 1), "Oregon DOF"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, "TSHE", 450, 191, "pnw", datetime(2024, 10, 1), "Oregon DOF"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, None, 500, 212, "pnw", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.SAWLOG_UTILITY, None, 350, 149, "pnw", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.PEELER, None, 700, 297, "pnw", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.PULPWOOD, None, 45, 19, "pnw", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.CHIP, None, 150, 64, "pnw", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.FIREWOOD, None, 80, 34, "pnw", datetime(2024, 10, 1), "regional_default"),
    ],
    "southeast": [
        TimberPrice(ProductClass.SAWLOG_PREMIUM, "PITA", 450, 191, "southeast", datetime(2024, 10, 1), "Timber Mart-South"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, "PITA", 350, 149, "southeast", datetime(2024, 10, 1), "Timber Mart-South"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, None, 300, 127, "southeast", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.CHIP, "PITA", 100, 42, "southeast", datetime(2024, 10, 1), "Timber Mart-South"),
        TimberPrice(ProductClass.PULPWOOD, None, 35, 15, "southeast", datetime(2024, 10, 1), "regional_default"),
    ],
    "northeast": [
        TimberPrice(ProductClass.SAWLOG_PREMIUM, "QURU", 650, 276, "northeast", datetime(2024, 10, 1), "regional_average"),
        TimberPrice(ProductClass.SAWLOG_PREMIUM, "ACSA", 800, 339, "northeast", datetime(2024, 10, 1), "regional_average"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, None, 400, 170, "northeast", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.PULPWOOD, None, 40, 17, "northeast", datetime(2024, 10, 1), "regional_default"),
    ],
    "rockies": [
        TimberPrice(ProductClass.SAWLOG_STANDARD, "PIPO", 400, 170, "rockies", datetime(2024, 10, 1), "regional_average"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, None, 350, 149, "rockies", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.PULPWOOD, None, 30, 13, "rockies", datetime(2024, 10, 1), "regional_default"),
    ],
    "california": [
        TimberPrice(ProductClass.SAWLOG_PREMIUM, None, 600, 255, "california", datetime(2024, 10, 1), "CAL FIRE"),
        TimberPrice(ProductClass.SAWLOG_STANDARD, None, 450, 191, "california", datetime(2024, 10, 1), "regional_default"),
        TimberPrice(ProductClass.PULPWOOD, None, 40, 17, "california", datetime(2024, 10, 1), "regional_default"),
    ],
}


@dataclass
class TreeProduct:
    """Product assignment for a single tree."""
    tree_id: str
    species_code: str | None
    dbh_cm: float
    height_m: float
    product_class: ProductClass
    merchantable_height_m: float
    gross_volume_m3: float
    net_volume_m3: float        # After defect deduction
    board_feet: float           # MBF
    price_per_unit: float       # $/m3 or $/MBF
    stumpage_value: float       # Total value in USD


@dataclass
class ProductSummary:
    """Summary of products in a stand."""
    product_class: ProductClass
    tree_count: int
    total_volume_m3: float
    total_board_feet: float
    average_price: float
    total_value: float
    percent_of_volume: float


@dataclass
class HarvestScenario:
    """A harvest scenario with constraints."""
    scenario_id: str
    name: str
    description: str
    min_dbh_cm: float          # Minimum DBH to harvest
    target_ba_m2_ha: float     # Residual basal area target
    products_allowed: list[ProductClass]
    estimated_trees: int
    estimated_volume_m3: float
    estimated_value: float
    residual_trees: int
    residual_ba_m2_ha: float


@dataclass
class TimberAppraisal:
    """Complete timber appraisal result."""
    project_id: str
    analysis_id: str
    appraisal_date: datetime
    region: str
    area_hectares: float
    tree_count: int
    merchantable_trees: int
    total_gross_volume_m3: float
    total_net_volume_m3: float
    total_board_feet: float
    products: list[ProductSummary]
    tree_products: list[TreeProduct]
    total_stumpage_value: float
    value_per_hectare: float
    value_per_mbf_average: float
    harvest_scenarios: list[HarvestScenario]
    price_sources: list[str]
    processing_time_ms: float


class TimberValuator:
    """
    Timber valuation engine.

    Assigns product classes to trees and calculates
    stumpage values based on regional prices.
    """

    def __init__(self, region: str = "pnw"):
        self.region = region.lower()
        self.prices = TIMBER_PRICES.get(self.region, TIMBER_PRICES["pnw"])
        self._build_price_lookup()

    def _build_price_lookup(self):
        """Build a lookup table for prices by product and species."""
        self.price_lookup: dict[tuple[ProductClass, str | None], TimberPrice] = {}

        for price in self.prices:
            key = (price.product, price.species_code)
            self.price_lookup[key] = price

    def get_price(
        self,
        product: ProductClass,
        species_code: str | None = None,
    ) -> TimberPrice | None:
        """Get price for a product/species combination."""
        # Try exact match first
        key = (product, species_code)
        if key in self.price_lookup:
            return self.price_lookup[key]

        # Fall back to default (None species)
        key = (product, None)
        if key in self.price_lookup:
            return self.price_lookup[key]

        return None

    def assign_product_class(
        self,
        dbh_cm: float,
        height_m: float,
        species_code: str | None = None,
        defect_pct: float = 15,
    ) -> ProductClass:
        """
        Assign a product class to a tree based on its dimensions.

        Uses merchantability standards to determine the highest
        value product the tree qualifies for.
        """
        # Check each product class from highest to lowest value
        priority_order = [
            ProductClass.SAWLOG_PREMIUM,
            ProductClass.PEELER,
            ProductClass.SAWLOG_STANDARD,
            ProductClass.SAWLOG_UTILITY,
            ProductClass.CHIP,
            ProductClass.PULPWOOD,
            ProductClass.FIREWOOD,
        ]

        for product in priority_order:
            specs = PRODUCT_SPECS[product]

            # Check if tree meets specifications
            if (
                dbh_cm >= specs.min_dbh_cm
                and height_m >= specs.min_length_m + 1.0  # Allow for stump
                and defect_pct <= specs.max_defect_pct
            ):
                return product

        return ProductClass.CULL

    def calculate_tree_value(
        self,
        tree_id: str,
        dbh_cm: float,
        height_m: float,
        species_code: str | None = None,
        defect_pct: float = 15,
    ) -> TreeProduct:
        """
        Calculate the stumpage value for a single tree.
        """
        # Assign product class
        product_class = self.assign_product_class(
            dbh_cm=dbh_cm,
            height_m=height_m,
            species_code=species_code,
            defect_pct=defect_pct,
        )

        specs = PRODUCT_SPECS[product_class]

        # Calculate merchantable height
        if product_class == ProductClass.CULL:
            merch_height = 0
        else:
            # Merchantable height to minimum top diameter
            min_top_cm = 15  # Common standard
            taper_ratio = 0.02  # cm/m typical taper
            merch_height = min(
                height_m - 1.0,  # Leave stump
                (dbh_cm - min_top_cm) / taper_ratio,
            )
            merch_height = max(specs.min_length_m, merch_height)

        # Calculate gross volume (Smalian's formula simplified)
        ba_base = math.pi * (dbh_cm / 200) ** 2  # m2
        ba_top = math.pi * ((dbh_cm - taper_ratio * merch_height * 100) / 200) ** 2
        gross_volume = ((ba_base + ba_top) / 2) * merch_height

        # Apply form factor and defect deductions
        net_volume = gross_volume * specs.form_factor * (1 - defect_pct / 100)

        # Convert to board feet (Scribner Decimal C)
        # 1 m3 ≈ 423.8 board feet (approximate)
        board_feet = net_volume * 423.8 / 1000  # MBF

        # Get price
        price = self.get_price(product_class, species_code)
        if price:
            price_per_m3 = price.price_per_m3
            stumpage_value = net_volume * price_per_m3
        else:
            price_per_m3 = 0
            stumpage_value = 0

        return TreeProduct(
            tree_id=tree_id,
            species_code=species_code,
            dbh_cm=dbh_cm,
            height_m=height_m,
            product_class=product_class,
            merchantable_height_m=round(merch_height, 2),
            gross_volume_m3=round(gross_volume, 4),
            net_volume_m3=round(net_volume, 4),
            board_feet=round(board_feet, 3),
            price_per_unit=round(price_per_m3, 2),
            stumpage_value=round(stumpage_value, 2),
        )

    def appraise_stand(
        self,
        trees: list[dict[str, Any]],
        area_hectares: float,
        project_id: str = "PROJECT001",
        analysis_id: str = "ANALYSIS001",
        include_scenarios: bool = True,
    ) -> TimberAppraisal:
        """
        Appraise all timber in a stand.

        Args:
            trees: List of tree dictionaries
            area_hectares: Stand area
            project_id: Project identifier
            analysis_id: Analysis identifier
            include_scenarios: Whether to generate harvest scenarios

        Returns:
            Complete timber appraisal
        """
        import time
        start_time = time.time()

        tree_products: list[TreeProduct] = []
        product_totals: dict[ProductClass, dict] = {}

        # Process each tree
        for i, tree in enumerate(trees):
            tree_id = tree.get("tree_id", tree.get("id", f"T{i+1:05d}"))
            dbh_cm = tree.get("dbh", tree.get("dbh_cm", 0))
            height_m = tree.get("height", tree.get("height_m", 0))
            species_code = tree.get("species_code", tree.get("species"))
            defect_pct = tree.get("defect_pct", 15)

            if dbh_cm <= 0 or height_m <= 0:
                continue

            product = self.calculate_tree_value(
                tree_id=tree_id,
                dbh_cm=dbh_cm,
                height_m=height_m,
                species_code=species_code,
                defect_pct=defect_pct,
            )
            tree_products.append(product)

            # Aggregate by product class
            if product.product_class not in product_totals:
                product_totals[product.product_class] = {
                    "count": 0,
                    "volume": 0,
                    "board_feet": 0,
                    "value": 0,
                    "price_sum": 0,
                }

            totals = product_totals[product.product_class]
            totals["count"] += 1
            totals["volume"] += product.net_volume_m3
            totals["board_feet"] += product.board_feet
            totals["value"] += product.stumpage_value
            totals["price_sum"] += product.price_per_unit

        # Calculate summaries
        total_volume = sum(p.net_volume_m3 for p in tree_products)
        total_gross_volume = sum(p.gross_volume_m3 for p in tree_products)
        total_board_feet = sum(p.board_feet for p in tree_products)
        total_value = sum(p.stumpage_value for p in tree_products)
        merchantable_count = sum(
            1 for p in tree_products if p.product_class != ProductClass.CULL
        )

        # Create product summaries
        products: list[ProductSummary] = []
        for product_class, totals in product_totals.items():
            if totals["count"] > 0:
                avg_price = totals["price_sum"] / totals["count"]
                pct_volume = (totals["volume"] / total_volume * 100) if total_volume > 0 else 0

                products.append(ProductSummary(
                    product_class=product_class,
                    tree_count=totals["count"],
                    total_volume_m3=round(totals["volume"], 2),
                    total_board_feet=round(totals["board_feet"], 2),
                    average_price=round(avg_price, 2),
                    total_value=round(totals["value"], 2),
                    percent_of_volume=round(pct_volume, 1),
                ))

        # Sort by value (highest first)
        products.sort(key=lambda p: p.total_value, reverse=True)

        # Generate harvest scenarios
        scenarios: list[HarvestScenario] = []
        if include_scenarios:
            scenarios = self._generate_harvest_scenarios(
                trees=trees,
                tree_products=tree_products,
                area_hectares=area_hectares,
            )

        # Get unique price sources
        price_sources = list(set(p.source for p in self.prices))

        processing_time = (time.time() - start_time) * 1000

        return TimberAppraisal(
            project_id=project_id,
            analysis_id=analysis_id,
            appraisal_date=datetime.now(),
            region=self.region,
            area_hectares=area_hectares,
            tree_count=len(trees),
            merchantable_trees=merchantable_count,
            total_gross_volume_m3=round(total_gross_volume, 2),
            total_net_volume_m3=round(total_volume, 2),
            total_board_feet=round(total_board_feet, 2),
            products=products,
            tree_products=tree_products,
            total_stumpage_value=round(total_value, 2),
            value_per_hectare=round(total_value / area_hectares, 2) if area_hectares > 0 else 0,
            value_per_mbf_average=round(total_value / total_board_feet, 2) if total_board_feet > 0 else 0,
            harvest_scenarios=scenarios,
            price_sources=price_sources,
            processing_time_ms=processing_time,
        )

    def _generate_harvest_scenarios(
        self,
        trees: list[dict],
        tree_products: list[TreeProduct],
        area_hectares: float,
    ) -> list[HarvestScenario]:
        """Generate common harvest scenarios."""
        scenarios = []

        # Calculate current basal area
        current_ba = sum(
            math.pi * (t.get("dbh", t.get("dbh_cm", 0)) / 200) ** 2
            for t in trees
        ) / area_hectares if area_hectares > 0 else 0

        # Scenario 1: Clearcut (all merchantable timber)
        clearcut_trees = [p for p in tree_products if p.product_class != ProductClass.CULL]
        scenarios.append(HarvestScenario(
            scenario_id="S1",
            name="Clearcut",
            description="Harvest all merchantable timber",
            min_dbh_cm=10,
            target_ba_m2_ha=0,
            products_allowed=list(ProductClass),
            estimated_trees=len(clearcut_trees),
            estimated_volume_m3=sum(p.net_volume_m3 for p in clearcut_trees),
            estimated_value=sum(p.stumpage_value for p in clearcut_trees),
            residual_trees=len(trees) - len(clearcut_trees),
            residual_ba_m2_ha=0,
        ))

        # Scenario 2: Commercial thin (remove smaller trees)
        thin_dbh = 25  # cm
        thin_trees = [
            p for p in tree_products
            if p.dbh_cm < thin_dbh and p.product_class != ProductClass.CULL
        ]
        residual_count = len(trees) - len(thin_trees)
        residual_ba = current_ba * (residual_count / len(trees)) if trees else 0

        scenarios.append(HarvestScenario(
            scenario_id="S2",
            name="Commercial Thinning",
            description=f"Remove trees < {thin_dbh} cm DBH",
            min_dbh_cm=10,
            target_ba_m2_ha=residual_ba,
            products_allowed=[ProductClass.PULPWOOD, ProductClass.CHIP, ProductClass.SAWLOG_UTILITY],
            estimated_trees=len(thin_trees),
            estimated_volume_m3=sum(p.net_volume_m3 for p in thin_trees),
            estimated_value=sum(p.stumpage_value for p in thin_trees),
            residual_trees=residual_count,
            residual_ba_m2_ha=round(residual_ba, 2),
        ))

        # Scenario 3: Sawlog only harvest (premium trees)
        sawlog_trees = [
            p for p in tree_products
            if p.product_class in [ProductClass.SAWLOG_PREMIUM, ProductClass.SAWLOG_STANDARD, ProductClass.PEELER]
        ]
        residual_count = len(trees) - len(sawlog_trees)
        residual_ba = current_ba * (residual_count / len(trees)) if trees else 0

        scenarios.append(HarvestScenario(
            scenario_id="S3",
            name="Sawlog Harvest",
            description="Harvest sawlog-quality trees only",
            min_dbh_cm=25,
            target_ba_m2_ha=residual_ba,
            products_allowed=[ProductClass.SAWLOG_PREMIUM, ProductClass.SAWLOG_STANDARD, ProductClass.PEELER],
            estimated_trees=len(sawlog_trees),
            estimated_volume_m3=sum(p.net_volume_m3 for p in sawlog_trees),
            estimated_value=sum(p.stumpage_value for p in sawlog_trees),
            residual_trees=residual_count,
            residual_ba_m2_ha=round(residual_ba, 2),
        ))

        # Scenario 4: Selective harvest (largest trees)
        sorted_products = sorted(tree_products, key=lambda p: p.dbh_cm, reverse=True)
        top_30_pct = sorted_products[:int(len(sorted_products) * 0.3)]
        residual_count = len(trees) - len(top_30_pct)
        residual_ba = current_ba * 0.7  # Approximate

        scenarios.append(HarvestScenario(
            scenario_id="S4",
            name="Selective Harvest (30%)",
            description="Remove 30% of largest trees",
            min_dbh_cm=30,
            target_ba_m2_ha=residual_ba,
            products_allowed=list(ProductClass),
            estimated_trees=len(top_30_pct),
            estimated_volume_m3=sum(p.net_volume_m3 for p in top_30_pct),
            estimated_value=sum(p.stumpage_value for p in top_30_pct),
            residual_trees=residual_count,
            residual_ba_m2_ha=round(residual_ba, 2),
        ))

        return scenarios


def appraise_timber(
    trees: list[dict],
    area_hectares: float,
    region: str = "pnw",
    project_id: str = "PROJECT001",
) -> TimberAppraisal:
    """
    Convenience function for timber appraisal.

    Args:
        trees: List of tree dictionaries
        area_hectares: Stand area
        region: Forest region for pricing
        project_id: Project identifier

    Returns:
        Complete timber appraisal
    """
    valuator = TimberValuator(region=region)
    return valuator.appraise_stand(
        trees=trees,
        area_hectares=area_hectares,
        project_id=project_id,
    )
