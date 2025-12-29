/**
 * Volume Estimation Types
 * Sprint 17-18: DBH & Volume Estimation
 */

export interface VolumeEstimate {
  total_m3: number;
  merchantable_m3: number | null;
  board_feet: number | null;
  cords: number | null;
}

export interface BiomassEstimate {
  aboveground_kg: number;
  stem_kg: number | null;
  branch_kg: number | null;
  foliage_kg: number | null;
  root_kg: number | null;
  carbon_kg: number | null;
  co2_equivalent_kg: number | null;
}

export interface TreeEstimate {
  tree_id: string;
  species_code: string;
  dbh_cm: number;
  height_m: number;
  crown_diameter_m: number | null;
  basal_area_m2: number;
  confidence: number;
  volume: VolumeEstimate;
  biomass: BiomassEstimate;
}

export interface StandTotals {
  tree_count: number;
  area_hectares: number;
  stems_per_hectare: number;
  mean_dbh_cm: number;
  quadratic_mean_dbh_cm: number;
  mean_height_m: number;
  dominant_height_m: number;
  basal_area_m2_total: number;
  basal_area_m2_ha: number;
  total_volume_m3: number;
  volume_m3_ha: number;
  merchantable_volume_m3: number;
  merchantable_volume_m3_ha: number;
  total_board_feet: number;
  board_feet_per_hectare: number;
  mbf_per_hectare: number;
  total_biomass_kg: number;
  biomass_kg_ha: number;
  biomass_tonnes_ha: number;
  total_carbon_kg: number;
  carbon_kg_ha: number;
  carbon_tonnes_ha: number;
  total_co2_equivalent_kg: number;
  co2_equivalent_tonnes_ha: number;
}

export interface CarbonCredits {
  tonnesCO2e: number;
  creditValue: {
    low: number;
    high: number;
  };
  methodology: string;
}

export interface SpeciesAllometry {
  species_code: string;
  common_name: string;
  scientific_name: string;
  wood_type: string;
  regions: string[];
}

export type UnitSystem = 'metric' | 'imperial';

export interface DisplayOptions {
  unitSystem: UnitSystem;
  showComponents: boolean;
  showConfidence: boolean;
  decimalPlaces: number;
}

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  unitSystem: 'metric',
  showComponents: true,
  showConfidence: true,
  decimalPlaces: 2,
};
