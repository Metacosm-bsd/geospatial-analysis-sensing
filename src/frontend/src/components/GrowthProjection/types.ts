/**
 * Growth Projection & Timber Valuation Types
 * Sprint 37-42: Growth Projections & Timber Value
 */

export type GrowthRegion = 'pnw' | 'southeast' | 'northeast' | 'rockies' | 'california';

export type ProductClass =
  | 'sawlog_premium'
  | 'sawlog_standard'
  | 'sawlog_utility'
  | 'peeler'
  | 'pulpwood'
  | 'chip'
  | 'firewood'
  | 'cull';

export interface SiteIndexEstimate {
  site_index_ft: number;
  base_age_years: number;
  height_m: number;
  age_years: number | null;
  confidence: number;
  method: string;
  species_code: string | null;
  region: string;
}

export interface GrowthRate {
  height_growth_m_yr: number;
  dbh_growth_cm_yr: number;
  basal_area_growth_m2_ha_yr: number;
  volume_growth_m3_ha_yr: number;
  carbon_growth_kg_ha_yr: number;
}

export interface StandProjection {
  projection_year: number;
  years_from_now: number;
  tree_count: number;
  trees_per_hectare: number;
  mean_height_m: number;
  dominant_height_m: number;
  mean_dbh_cm: number;
  qmd_cm: number;
  basal_area_m2_ha: number;
  volume_m3_ha: number;
  biomass_kg_ha: number;
  carbon_kg_ha: number;
  co2e_kg_ha: number;
  mortality_pct: number;
}

export interface GrowthProjectionResult {
  project_id: string;
  analysis_id: string;
  projection_date: string;
  base_year: number;
  region: string;
  growth_model: string;
  site_index: {
    site_index_ft: number;
    base_age_years: number;
    confidence: number;
  };
  area_hectares: number;
  current_stand: {
    tree_count: number;
    trees_per_hectare: number;
    mean_height_m: number;
    dominant_height_m: number;
    mean_dbh_cm: number;
    basal_area_m2_ha: number;
    volume_m3_ha: number;
    carbon_kg_ha: number;
  };
  projections: StandProjection[];
  annual_growth: GrowthRate;
  processing_time_ms: number;
}

export interface ProductSummary {
  product_class: ProductClass;
  tree_count: number;
  total_volume_m3: number;
  total_board_feet: number;
  average_price: number;
  total_value: number;
  percent_of_volume: number;
}

export interface HarvestScenario {
  scenario_id: string;
  name: string;
  description: string;
  min_dbh_cm: number;
  target_ba_m2_ha: number;
  estimated_trees: number;
  estimated_volume_m3: number;
  estimated_value: number;
  residual_trees: number;
  residual_ba_m2_ha: number;
}

export interface TimberAppraisal {
  project_id: string;
  analysis_id: string;
  appraisal_date: string;
  region: string;
  area_hectares: number;
  tree_count: number;
  merchantable_trees: number;
  total_gross_volume_m3: number;
  total_net_volume_m3: number;
  total_board_feet: number;
  products: ProductSummary[];
  total_stumpage_value: number;
  value_per_hectare: number;
  value_per_mbf_average: number;
  harvest_scenarios: HarvestScenario[];
  price_sources: string[];
  processing_time_ms: number;
}

export interface TimberPrice {
  product: ProductClass;
  species_code: string | null;
  price_per_mbf: number;
  price_per_m3: number;
  effective_date: string;
  source: string;
}

export interface GrowthRegionInfo {
  code: GrowthRegion;
  name: string;
  description: string;
  base_age_years: number;
  primary_species: string[];
}

export const PRODUCT_CLASS_LABELS: Record<ProductClass, string> = {
  sawlog_premium: 'Premium Sawlog',
  sawlog_standard: 'Standard Sawlog',
  sawlog_utility: 'Utility Sawlog',
  peeler: 'Peeler/Veneer',
  pulpwood: 'Pulpwood',
  chip: 'Chip-n-Saw',
  firewood: 'Firewood',
  cull: 'Cull/Non-Merchantable',
};

export const PRODUCT_CLASS_COLORS: Record<ProductClass, string> = {
  sawlog_premium: '#166534',    // dark green
  sawlog_standard: '#16a34a',   // green
  sawlog_utility: '#4ade80',    // light green
  peeler: '#0d9488',            // teal
  pulpwood: '#0284c7',          // blue
  chip: '#6366f1',              // indigo
  firewood: '#d97706',          // amber
  cull: '#9ca3af',              // gray
};
