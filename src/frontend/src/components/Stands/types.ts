/**
 * Stand Types
 * Sprint 21-24: FIA Reports & Export
 */

export interface StandSummary {
  stems_per_hectare: number;
  basal_area_m2_ha: number;
  volume_m3_ha: number;
  biomass_kg_ha: number;
  carbon_kg_ha: number;
  co2_kg_ha?: number;
  mean_height_m: number;
  dominant_height_m: number;
  mean_dbh_cm: number;
  qmd_cm: number;
  sdi: number;
  stand_type: string;
  size_class?: string;
  dominant_species: string;
  species_composition?: Record<string, number>;
}

export interface StandBoundary {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface Stand {
  stand_id: string;
  tree_count: number;
  area_hectares: number;
  summary: StandSummary;
  boundary: StandBoundary | null;
  centroid: [number, number];
}

export interface DelineationResult {
  stands: Stand[];
  total_stands: number;
  total_trees: number;
  unassigned_trees: number;
  method: string;
  processing_time_ms: number;
}

export type ClusteringMethod = 'dbscan' | 'kmeans' | 'grid' | 'attribute';

export interface DelineationParams {
  method: ClusteringMethod;
  min_trees: number;
  eps: number;
  n_clusters?: number;
  grid_size: number;
  attribute_weights?: Record<string, number>;
}

export type ExportFormat = 'geojson' | 'shapefile' | 'kml' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  crs: string;
  includeAttributes: boolean;
}

export interface FIATreeRecord {
  tree_id: string;
  fia_species_code: string;
  species_common: string;
  dbh_inches: number;
  height_feet: number;
  crown_ratio: number;
  status_code: string;
  damage_code: string;
  volume_cuft: number;
  biomass_lb: number;
}

export interface FIASpeciesSummary {
  fia_species_code: string;
  species_common: string;
  tree_count: number;
  basal_area_sqft_ac: number;
  volume_cuft_ac: number;
  biomass_lb_ac: number;
  mean_dbh_inches: number;
  mean_height_feet: number;
}

export interface FIAReport {
  plot_id: string;
  state_code: string;
  county_code: string;
  plot_area_acres: number;
  total_trees: number;
  trees_per_acre: number;
  basal_area_sqft_ac: number;
  volume_cuft_ac: number;
  biomass_lb_ac: number;
  tree_records: FIATreeRecord[];
  species_summary: FIASpeciesSummary[];
  size_class_distribution: Record<string, number>;
  generated_at: string;
  processing_time_ms: number;
}
