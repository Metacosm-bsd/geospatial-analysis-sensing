/**
 * Stand Delineation Service
 * Sprint 21-24: FIA Reports & Export
 *
 * Service for stand delineation and summary calculation.
 * Proxies requests to the Python processing service.
 */

import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

interface TreeInput {
  tree_id?: string;
  x: number;
  y: number;
  height?: number;
  height_m?: number;
  dbh_cm?: number;
  crown_diameter_m?: number;
  species_code?: string;
  volume_m3?: number;
  biomass_kg?: number;
  carbon_kg?: number;
}

interface StandSummary {
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

interface StandBoundary {
  type: 'Polygon';
  coordinates: number[][][];
}

interface Stand {
  stand_id: string;
  tree_count: number;
  area_hectares: number;
  summary: StandSummary;
  boundary: StandBoundary | null;
  centroid: [number, number];
}

interface DelineationResult {
  stands: Stand[];
  total_stands: number;
  total_trees: number;
  unassigned_trees: number;
  method: string;
  processing_time_ms: number;
}

interface SummaryResult extends StandSummary {
  stand_id: string;
  area_hectares: number;
  tree_count: number;
}

export class StandService {
  private processingServiceUrl: string;

  constructor() {
    this.processingServiceUrl = config.processingServiceUrl || 'http://localhost:8000';
  }

  /**
   * Delineate forest stands from tree data
   */
  async delineate(
    trees: TreeInput[],
    method: string = 'dbscan',
    minTrees: number = 5,
    eps: number = 20.0,
    nClusters?: number,
    gridSize: number = 50.0,
    attributeWeights?: Record<string, number>
  ): Promise<DelineationResult> {
    logger.info(`Delineating stands for ${trees.length} trees using ${method}`);

    try {
      const response = await fetch(`${this.processingServiceUrl}/api/v1/stands/delineate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trees,
          method,
          min_trees: minTrees,
          eps,
          n_clusters: nClusters,
          grid_size: gridSize,
          attribute_weights: attributeWeights,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Delineation failed: ${error}`);
      }

      const result = await response.json();
      logger.info(`Delineated ${result.total_stands} stands`);
      return result;
    } catch (error) {
      logger.error('Stand delineation error:', error);
      throw error;
    }
  }

  /**
   * Calculate stand-level summary statistics
   */
  async calculateSummary(
    trees: TreeInput[],
    areaHectares: number,
    standId: string = 'stand_1'
  ): Promise<SummaryResult> {
    logger.info(`Calculating summary for ${trees.length} trees over ${areaHectares} hectares`);

    try {
      const response = await fetch(`${this.processingServiceUrl}/api/v1/stands/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trees,
          area_hectares: areaHectares,
          stand_id: standId,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Summary calculation failed: ${error}`);
      }

      const result = await response.json();
      logger.info(`Calculated summary: ${result.stems_per_hectare} stems/ha`);
      return result;
    } catch (error) {
      logger.error('Stand summary error:', error);
      throw error;
    }
  }

  /**
   * Get GeoJSON representation of a stand
   * This is a placeholder - in production, this would fetch from a database
   */
  async getStandGeoJSON(standId: string): Promise<object | null> {
    logger.info(`Getting GeoJSON for stand ${standId}`);

    // In production, this would query a database for the stand
    // For now, return null to indicate not found
    logger.warn(`Stand ${standId} not found in cache`);
    return null;
  }
}

// Singleton instance
let standServiceInstance: StandService | null = null;

export function getStandService(): StandService {
  if (!standServiceInstance) {
    standServiceInstance = new StandService();
  }
  return standServiceInstance;
}

export default StandService;
