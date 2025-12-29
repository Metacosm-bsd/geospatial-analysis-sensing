/**
 * Spatial Export Service
 * Sprint 21-24: FIA Reports & Export
 *
 * Service for exporting trees and stands to various spatial formats.
 * Proxies requests to the Python processing service.
 */

import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

interface TreeInput {
  tree_id?: string;
  x: number;
  y: number;
  height_m?: number;
  dbh_cm?: number;
  crown_diameter_m?: number;
  species_code?: string;
  volume_m3?: number;
  biomass_kg?: number;
  carbon_kg?: number;
}

interface StandInput {
  stand_id: string;
  boundary?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  tree_count?: number;
  area_hectares?: number;
  summary?: {
    stems_per_hectare?: number;
    basal_area_m2_ha?: number;
    volume_m3_ha?: number;
    biomass_kg_ha?: number;
    carbon_kg_ha?: number;
    mean_height_m?: number;
    dominant_height_m?: number;
    mean_dbh_cm?: number;
    dominant_species?: string;
  };
}

interface ExportResult {
  data?: object | string;
  file_path?: string;
  format: string;
  feature_count: number;
}

interface FIATreeRecord {
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

interface FIASpeciesSummary {
  fia_species_code: string;
  species_common: string;
  tree_count: number;
  basal_area_sqft_ac: number;
  volume_cuft_ac: number;
  biomass_lb_ac: number;
  mean_dbh_inches: number;
  mean_height_feet: number;
}

interface FIAReport {
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

interface FIASpeciesCodes {
  species_codes: Record<string, { code: string; common_name: string }>;
  description: string;
}

export class ExportService {
  private processingServiceUrl: string;

  constructor() {
    this.processingServiceUrl = config.processingServiceUrl || 'http://localhost:8000';
  }

  /**
   * Export trees to spatial format
   */
  async exportTrees(
    trees: TreeInput[],
    format: string = 'geojson',
    crs: string = 'EPSG:4326',
    outputPath?: string
  ): Promise<ExportResult> {
    logger.info(`Exporting ${trees.length} trees to ${format}`);

    try {
      const response = await fetch(`${this.processingServiceUrl}/api/v1/export/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trees,
          format,
          crs,
          output_path: outputPath,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Tree export failed: ${error}`);
      }

      // Handle different response types
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json') || format === 'geojson') {
        const data = await response.json();
        return {
          data,
          format,
          feature_count: trees.length,
        };
      } else if (contentType.includes('application/zip')) {
        // For shapefile, return file path from JSON response
        const data = await response.json();
        return {
          file_path: data.file_path,
          format,
          feature_count: trees.length,
        };
      } else {
        // KML or CSV - return as text
        const data = await response.text();
        return {
          data,
          format,
          feature_count: trees.length,
        };
      }
    } catch (error) {
      logger.error('Tree export error:', error);
      throw error;
    }
  }

  /**
   * Export stands to spatial format
   */
  async exportStands(
    stands: StandInput[],
    format: string = 'geojson',
    crs: string = 'EPSG:4326',
    outputPath?: string
  ): Promise<ExportResult> {
    logger.info(`Exporting ${stands.length} stands to ${format}`);

    try {
      const response = await fetch(`${this.processingServiceUrl}/api/v1/export/stands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stands,
          format,
          crs,
          output_path: outputPath,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stand export failed: ${error}`);
      }

      // Handle different response types
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json') || format === 'geojson') {
        const data = await response.json();
        return {
          data,
          format,
          feature_count: stands.length,
        };
      } else if (contentType.includes('application/zip')) {
        const data = await response.json();
        return {
          file_path: data.file_path,
          format,
          feature_count: stands.length,
        };
      } else {
        const data = await response.text();
        return {
          data,
          format,
          feature_count: stands.length,
        };
      }
    } catch (error) {
      logger.error('Stand export error:', error);
      throw error;
    }
  }

  /**
   * Generate FIA-compliant report
   */
  async generateFIAReport(
    trees: TreeInput[],
    plotId: string = 'PLOT001',
    stateCode: string = '41',
    countyCode: string = '001',
    plotAreaAcres: number = 0.25
  ): Promise<FIAReport> {
    logger.info(`Generating FIA report for ${trees.length} trees`);

    try {
      const response = await fetch(`${this.processingServiceUrl}/api/v1/fia/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trees,
          plot_id: plotId,
          state_code: stateCode,
          county_code: countyCode,
          plot_area_acres: plotAreaAcres,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`FIA report generation failed: ${error}`);
      }

      const result = await response.json();
      logger.info(`Generated FIA report with ${result.total_trees} trees`);
      return result;
    } catch (error) {
      logger.error('FIA report error:', error);
      throw error;
    }
  }

  /**
   * Get FIA species code mapping
   */
  async getFIASpeciesCodes(): Promise<FIASpeciesCodes> {
    logger.info('Fetching FIA species codes');

    try {
      const response = await fetch(`${this.processingServiceUrl}/api/v1/fia/species-codes`);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get FIA species codes: ${error}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('FIA species codes error:', error);
      throw error;
    }
  }
}

// Singleton instance
let exportServiceInstance: ExportService | null = null;

export function getExportService(): ExportService {
  if (!exportServiceInstance) {
    exportServiceInstance = new ExportService();
  }
  return exportServiceInstance;
}

export default ExportService;
