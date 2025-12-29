/**
 * Volume Estimation Service
 * Sprint 17-18: DBH & Volume Estimation
 *
 * Provides tree volume, biomass, and carbon estimation using
 * species-specific allometric equations.
 */

import axios, { AxiosInstance } from 'axios';

// Types for volume estimation
export interface VolumeEstimate {
  total_volume_m3: number;
  merchantable_volume_m3: number | null;
  board_feet: number | null;
  cords: number | null;
  method: string;
}

export interface BiomassEstimate {
  aboveground_biomass_kg: number;
  stem_biomass_kg: number | null;
  branch_biomass_kg: number | null;
  foliage_biomass_kg: number | null;
  root_biomass_kg: number | null;
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
  volume: {
    total_m3: number;
    merchantable_m3: number | null;
    board_feet: number | null;
    cords: number | null;
  };
  biomass: {
    aboveground_kg: number;
    stem_kg: number | null;
    branch_kg: number | null;
    foliage_kg: number | null;
    root_kg: number | null;
    carbon_kg: number | null;
    co2_equivalent_kg: number | null;
  };
}

export interface DbhEstimate {
  dbh_cm: number;
  confidence: number;
  height_m: number;
  crown_diameter_m: number | null;
  species_code: string | null;
  method: string;
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

export interface SpeciesAllometry {
  species_code: string;
  common_name: string;
  scientific_name: string;
  wood_type: string;
  regions: string[];
  equations: {
    height_dbh: { description: string; a: number; b: number };
    crown_dbh: { description: string; a: number; b: number };
    volume: { description: string; a: number; b: number; c: number };
    biomass: { description: string; a: number; b: number };
  };
  properties: {
    bark_factor: number;
    wood_density_kg_m3: number;
    form_factor: number;
  };
}

export interface TreeInput {
  tree_id?: string;
  height: number;
  crown_diameter?: number;
  species_code?: string;
  dbh?: number;
}

export class VolumeService {
  private apiClient: AxiosInstance;

  constructor() {
    const processingApiUrl = process.env.PROCESSING_API_URL || 'http://localhost:8001';

    this.apiClient = axios.create({
      baseURL: processingApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Estimate DBH from height and optionally crown diameter
   */
  async estimateDbh(
    height_m: number,
    crown_diameter_m?: number,
    species_code?: string,
    method: string = 'combined'
  ): Promise<DbhEstimate> {
    const params: Record<string, string | number> = {
      height_m,
      method,
    };

    if (crown_diameter_m !== undefined) {
      params.crown_diameter_m = crown_diameter_m;
    }
    if (species_code) {
      params.species_code = species_code;
    }

    const response = await this.apiClient.post('/api/v1/estimate-dbh', null, { params });
    return response.data as DbhEstimate;
  }

  /**
   * Estimate tree volume from DBH and height
   */
  async estimateVolume(
    dbh_cm: number,
    height_m: number,
    species_code?: string
  ): Promise<VolumeEstimate> {
    const params: Record<string, string | number> = {
      dbh_cm,
      height_m,
    };

    if (species_code) {
      params.species_code = species_code;
    }

    const response = await this.apiClient.post('/api/v1/estimate-volume', null, { params });
    return response.data as VolumeEstimate;
  }

  /**
   * Estimate tree biomass and carbon from DBH
   */
  async estimateBiomass(
    dbh_cm: number,
    species_code?: string,
    include_roots: boolean = true
  ): Promise<BiomassEstimate> {
    const params: Record<string, string | number | boolean> = {
      dbh_cm,
      include_roots,
    };

    if (species_code) {
      params.species_code = species_code;
    }

    const response = await this.apiClient.post('/api/v1/estimate-biomass', null, { params });
    return response.data as BiomassEstimate;
  }

  /**
   * Get complete tree estimates from available measurements
   */
  async estimateTreeComplete(
    tree_id: string,
    height_m: number,
    crown_diameter_m?: number,
    species_code?: string,
    dbh_cm?: number
  ): Promise<TreeEstimate> {
    const params: Record<string, string | number> = {
      tree_id,
      height_m,
    };

    if (crown_diameter_m !== undefined) {
      params.crown_diameter_m = crown_diameter_m;
    }
    if (species_code) {
      params.species_code = species_code;
    }
    if (dbh_cm !== undefined) {
      params.dbh_cm = dbh_cm;
    }

    const response = await this.apiClient.post('/api/v1/estimate-tree', null, { params });
    return response.data as TreeEstimate;
  }

  /**
   * Estimate metrics for a batch of trees
   */
  async estimateBatch(
    trees: TreeInput[],
    heightField: string = 'height',
    crownField: string = 'crown_diameter',
    speciesField: string = 'species_code',
    idField: string = 'tree_id'
  ): Promise<{ trees: TreeEstimate[]; count: number; processing_time_ms: number }> {
    const response = await this.apiClient.post('/api/v1/estimate-batch', trees, {
      params: {
        height_field: heightField,
        crown_field: crownField,
        species_field: speciesField,
        id_field: idField,
      },
    });
    return response.data as { trees: TreeEstimate[]; count: number; processing_time_ms: number };
  }

  /**
   * Calculate stand-level totals from trees
   */
  async estimateStand(
    trees: TreeInput[],
    areaHectares: number,
    heightField: string = 'height',
    crownField: string = 'crown_diameter',
    speciesField: string = 'species_code',
    idField: string = 'tree_id'
  ): Promise<StandTotals> {
    const response = await this.apiClient.post('/api/v1/estimate-stand', trees, {
      params: {
        area_hectares: areaHectares,
        height_field: heightField,
        crown_field: crownField,
        species_field: speciesField,
        id_field: idField,
      },
    });
    return response.data as StandTotals;
  }

  /**
   * Get list of species with allometric equations
   */
  async getAvailableSpecies(): Promise<Array<{ code: string; common_name: string; scientific_name: string; wood_type: string }>> {
    const response = await this.apiClient.get('/api/v1/allometry/species');
    return response.data as Array<{ code: string; common_name: string; scientific_name: string; wood_type: string }>;
  }

  /**
   * Get allometric equation details for a species
   */
  async getSpeciesAllometry(speciesCode: string): Promise<SpeciesAllometry> {
    const response = await this.apiClient.get(`/api/v1/allometry/species/${speciesCode}`);
    return response.data as SpeciesAllometry;
  }

  /**
   * Calculate volume metrics for trees in an analysis
   */
  async calculateAnalysisVolumes(
    analysisId: string,
    trees: TreeInput[],
    areaHectares?: number
  ): Promise<{
    trees: TreeEstimate[];
    standTotals?: StandTotals;
    count: number;
    processingTimeMs: number;
  }> {
    const startTime = Date.now();

    // Get batch estimates
    const batchResult = await this.estimateBatch(trees);

    let standTotals: StandTotals | undefined;
    if (areaHectares && areaHectares > 0) {
      standTotals = await this.estimateStand(trees, areaHectares);
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      trees: batchResult.trees,
      standTotals,
      count: batchResult.count,
      processingTimeMs,
    };
  }

  /**
   * Convert volume from cubic meters to other units
   */
  convertVolume(volumeM3: number, toUnit: 'board_feet' | 'cords' | 'cubic_feet'): number {
    switch (toUnit) {
      case 'board_feet':
        // Approximate: 1 m3 = 424 board feet
        return volumeM3 * 424;
      case 'cords':
        // 1 cord = 3.62 m3 solid wood
        return volumeM3 / 3.62;
      case 'cubic_feet':
        // 1 m3 = 35.3147 ft3
        return volumeM3 * 35.3147;
      default:
        return volumeM3;
    }
  }

  /**
   * Convert biomass from kg to other units
   */
  convertBiomass(biomassKg: number, toUnit: 'tonnes' | 'pounds' | 'tons_us'): number {
    switch (toUnit) {
      case 'tonnes':
        return biomassKg / 1000;
      case 'pounds':
        return biomassKg * 2.20462;
      case 'tons_us':
        // US short tons
        return biomassKg / 907.185;
      default:
        return biomassKg;
    }
  }

  /**
   * Calculate carbon credits (tonnes CO2e)
   */
  calculateCarbonCredits(co2EquivalentKg: number): {
    tonnesCO2e: number;
    creditValue: { low: number; high: number };
    methodology: string;
  } {
    const tonnesCO2e = co2EquivalentKg / 1000;

    // Voluntary carbon market range (USD per tonne)
    const lowPricePerTonne = 10;
    const highPricePerTonne = 50;

    return {
      tonnesCO2e: Math.round(tonnesCO2e * 100) / 100,
      creditValue: {
        low: Math.round(tonnesCO2e * lowPricePerTonne * 100) / 100,
        high: Math.round(tonnesCO2e * highPricePerTonne * 100) / 100,
      },
      methodology: 'VCS/ARB above-ground biomass',
    };
  }
}

// Singleton instance
let volumeServiceInstance: VolumeService | null = null;

export function getVolumeService(): VolumeService {
  if (!volumeServiceInstance) {
    volumeServiceInstance = new VolumeService();
  }
  return volumeServiceInstance;
}

export default VolumeService;
