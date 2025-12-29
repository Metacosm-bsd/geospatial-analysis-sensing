/**
 * Change Detection Types
 * Sprint 31-36: Change Detection & Time Series
 */

export type ChangeType = 'mortality' | 'ingrowth' | 'growth' | 'decline' | 'stable' | 'unmatched';

export interface TreeChange {
  tree_id: string;
  change_type: ChangeType;
  x: number;
  y: number;
  height_t1_m: number | null;
  height_t2_m: number | null;
  dbh_t1_cm: number | null;
  dbh_t2_cm: number | null;
  height_change_m: number | null;
  dbh_change_cm: number | null;
  carbon_t1_kg: number | null;
  carbon_t2_kg: number | null;
  carbon_change_kg: number | null;
  annual_height_growth_m: number | null;
  annual_carbon_change_kg: number | null;
}

export interface ChangeSummary {
  total_trees_t1: number;
  total_trees_t2: number;
  matched_trees: number;
  mortality_count: number;
  ingrowth_count: number;
  growth_count: number;
  decline_count: number;
  stable_count: number;
  mortality_rate_pct: number;
  ingrowth_rate_pct: number;
  net_tree_change: number;
  mean_height_growth_m: number;
  mean_dbh_growth_cm: number;
  total_carbon_change_kg: number;
  annual_carbon_change_kg: number;
  carbon_per_hectare_change: number;
}

export interface ChangeDetectionResult {
  project_id: string;
  date_t1: string;
  date_t2: string;
  time_interval_years: number;
  area_hectares: number;
  summary: ChangeSummary;
  tree_changes: TreeChange[];
  processing_time_ms: number;
}

export interface TimeSeriesEpoch {
  date: string;
  tree_count: number;
  total_carbon_kg: number;
  carbon_per_hectare_kg: number;
  mean_height_m: number;
  mean_dbh_cm: number;
  basal_area_m2_ha: number;
}

export interface TrendAnalysis {
  slope: number;
  intercept: number;
  r_squared: number;
  p_value: number;
  significant: boolean;
  trend_direction: 'increasing' | 'decreasing' | 'stable';
  annual_change: number;
  total_change: number;
  percent_change: number;
}

export interface TimeSeriesAnalysis {
  project_id: string;
  start_date: string;
  end_date: string;
  total_years: number;
  epoch_count: number;
  area_hectares: number;
  epochs: TimeSeriesEpoch[];
  trends: Record<string, TrendAnalysis>;
  overall_summary: {
    net_tree_change: number;
    net_carbon_change_kg: number;
    annual_carbon_rate_kg: number;
    annual_height_growth_m: number;
  };
  processing_time_ms: number;
}

export interface ForecastValue {
  value: number;
  lower_bound: number;
  upper_bound: number;
}

export interface ForecastProjection {
  year: number;
  date: string;
  tree_count: ForecastValue;
  carbon_kg: ForecastValue;
  carbon_per_ha_kg: ForecastValue;
}

export interface ForecastResult {
  project_id: string;
  base_date: string;
  forecast_end_date: string;
  forecast_years: number;
  model_type: 'linear' | 'exponential' | 'moving_average';
  confidence_level: number;
  projections: ForecastProjection[];
  cumulative_carbon_gain_kg: number;
  average_annual_growth_rate: number;
  processing_time_ms: number;
}

export interface ChangeTypeInfo {
  name: ChangeType;
  description: string;
  color: string;
}

export const CHANGE_TYPE_COLORS: Record<ChangeType, string> = {
  mortality: '#dc2626',    // red
  ingrowth: '#16a34a',     // green
  growth: '#2563eb',       // blue
  decline: '#d97706',      // amber
  stable: '#6b7280',       // gray
  unmatched: '#a855f7',    // purple
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  mortality: 'Mortality',
  ingrowth: 'Ingrowth',
  growth: 'Growth',
  decline: 'Decline',
  stable: 'Stable',
  unmatched: 'Unmatched',
};
