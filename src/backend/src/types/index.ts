/**
 * Common type definitions for the LiDAR Forest Analysis API
 */

// ============================================================================
// GeoJSON Types
// ============================================================================

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number] | [number, number, number]; // [lng, lat] or [lng, lat, alt]
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // Array of linear rings
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface GeoJsonBBox {
  type: 'Polygon';
  coordinates: number[][][];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon;

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// Analysis Types
// ============================================================================

export type AnalysisType =
  | 'tree_detection'
  | 'canopy_height'
  | 'biomass_estimation'
  | 'species_classification'
  | 'change_detection'
  | 'terrain_analysis'
  | 'forest_metrics';

export interface TreeDetectionParams {
  minHeight?: number; // Minimum tree height in meters
  maxHeight?: number; // Maximum tree height in meters
  windowSize?: number; // Detection window size in meters
  smoothingFactor?: number;
}

export interface CanopyHeightParams {
  resolution?: number; // Output resolution in meters
  interpolationMethod?: 'idw' | 'kriging' | 'nearest';
  groundFilterMethod?: 'pmf' | 'csf' | 'smrf';
}

export interface BiomassEstimationParams {
  model?: 'allometric' | 'random_forest' | 'neural_network';
  speciesMap?: string; // File ID for species classification
  customEquations?: Record<string, string>;
}

export interface ChangeDetectionParams {
  comparisonFileIds: string[];
  changeThreshold?: number; // Minimum change in meters
  changeTypes?: ('growth' | 'loss' | 'disturbance')[];
}

export interface TerrainAnalysisParams {
  outputs?: ('dem' | 'slope' | 'aspect' | 'hillshade' | 'curvature')[];
  resolution?: number;
  slopUnits?: 'degrees' | 'percent';
}

export interface ForestMetricsParams {
  metrics?: (
    | 'height_percentiles'
    | 'canopy_cover'
    | 'gap_fraction'
    | 'lai'
    | 'density'
  )[];
  gridSize?: number; // Grid cell size in meters
  heightBreaks?: number[]; // Height class breaks
}

export type AnalysisParameters =
  | TreeDetectionParams
  | CanopyHeightParams
  | BiomassEstimationParams
  | ChangeDetectionParams
  | TerrainAnalysisParams
  | ForestMetricsParams;

// ============================================================================
// File Types
// ============================================================================

export interface FileMetadata {
  originalName: string;
  encoding: string;
  mimeType: string;
  size: number;
  checksum?: string;
}

export interface LidarMetadata {
  pointCount: number;
  bounds: GeoJsonBBox;
  crs: string;
  pointDensity: number; // Points per square meter
  classifications: Record<number, number>; // Classification ID to count
  returnCounts: Record<number, number>; // Return number to count
  intensity: {
    min: number;
    max: number;
    mean: number;
  };
}

export interface RasterMetadata {
  width: number;
  height: number;
  bounds: GeoJsonBBox;
  crs: string;
  resolution: [number, number]; // [x, y] in CRS units
  bands: number;
  dataType: string;
  noDataValue?: number;
}

// ============================================================================
// Job Queue Types
// ============================================================================

export interface ProcessingJobData {
  type: 'lidar_processing' | 'analysis' | 'export';
  fileId?: string;
  analysisId?: string;
  userId: string;
  parameters?: Record<string, unknown>;
}

export interface JobProgress {
  percent: number;
  message: string;
  stage?: string;
}

export interface JobResult {
  success: boolean;
  outputFiles?: string[];
  statistics?: Record<string, unknown>;
  error?: string;
}

// Re-export DTOs
export * from './dto.js';

// Re-export processing types (Sprint 7-8)
export * from './processing.js';

// Re-export viewer types (Sprint 9-10)
export * from './viewer.js';

// Re-export report types (Sprint 11-12)
export * from './report.js';

// Re-export species types (Sprint 13-14)
export * from './species.js';
