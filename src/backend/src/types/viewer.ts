/**
 * Viewer Types for Sprint 9-10
 *
 * Type definitions for 3D point cloud viewer endpoints,
 * point cloud data streaming, and tree visualization.
 */

// ============================================================================
// Point Cloud Metadata Types
// ============================================================================

/**
 * Metadata for a point cloud file
 */
export interface PointCloudMetadata {
  fileId: string;
  pointCount: number;
  bounds: PointCloudBounds;
  crs: string;
  lodLevels: LODLevel[];
  attributes: PointCloudAttributes;
  fileInfo: {
    filename: string;
    fileSize: number;
    fileType: string;
    lasVersion?: string;
    pointFormat?: number;
  };
}

/**
 * 3D bounds for point cloud data
 */
export interface PointCloudBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Level of Detail (LOD) information
 */
export interface LODLevel {
  level: number;
  pointCount: number;
  decimationFactor: number;
}

/**
 * Available attributes in the point cloud
 */
export interface PointCloudAttributes {
  hasIntensity: boolean;
  hasRGB: boolean;
  hasClassification: boolean;
  hasReturnNumber: boolean;
  hasNormalizedHeight: boolean;
}

// ============================================================================
// Point Cloud Data Types
// ============================================================================

/**
 * Point data chunk response
 */
export interface PointCloudChunk {
  fileId: string;
  offset: number;
  limit: number;
  count: number;
  format: 'json' | 'binary';
  lod: number;
  points?: PointData[];
  binaryData?: string; // Base64 encoded binary data
  bytesPerPoint?: number;
  hasMore: boolean;
  totalPoints: number;
}

/**
 * Individual point data (JSON format)
 */
export interface PointData {
  x: number;
  y: number;
  z: number;
  intensity?: number;
  classification?: number;
  r?: number;
  g?: number;
  b?: number;
  returnNumber?: number;
  normalizedHeight?: number;
}

/**
 * Request parameters for point cloud data
 */
export interface PointCloudRequest {
  fileId: string;
  lod?: number; // 0 = full, 1 = 1/4, 2 = 1/16
  format?: 'json' | 'binary';
  offset?: number;
  limit?: number;
}

// ============================================================================
// Tree Location Types
// ============================================================================

/**
 * Tree location with full metrics
 */
export interface TreeLocation {
  id: string;
  x: number;
  y: number;
  z: number;
  height: number;
  crownDiameter: number;
  dbh?: number;
  species?: string;
  biomass?: number;
  carbon?: number;
  confidence?: number;
  crownArea?: number;
  crownBaseHeight?: number;
  pointCount?: number;
}

/**
 * Detected trees response
 */
export interface DetectedTreesResponse {
  fileId?: string;
  analysisId?: string;
  treeCount: number;
  trees: TreeLocation[];
  bounds?: PointCloudBounds;
  statistics?: TreeStatistics;
}

/**
 * Tree detection statistics
 */
export interface TreeStatistics {
  averageHeight: number;
  maxHeight: number;
  minHeight: number;
  averageCrownDiameter: number;
  totalBiomass?: number;
  totalCarbon?: number;
  speciesBreakdown?: Record<string, number>;
}

// ============================================================================
// CHM (Canopy Height Model) Types
// ============================================================================

/**
 * CHM data response
 */
export interface CHMDataResponse {
  fileId: string;
  width: number;
  height: number;
  resolution: number;
  bounds: PointCloudBounds;
  noDataValue: number;
  minHeight: number;
  maxHeight: number;
  format: 'png' | 'array' | 'geotiff';
  data?: number[][] | string; // Array data or base64 encoded image/geotiff
  url?: string; // URL to download the CHM file
}

/**
 * CHM request parameters
 */
export interface CHMRequest {
  fileId: string;
  format?: 'png' | 'array' | 'geotiff';
  colormap?: 'viridis' | 'terrain' | 'grayscale';
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Query parameters for point cloud endpoint
 */
export interface PointCloudQueryParams {
  lod?: string;
  format?: 'json' | 'binary';
  offset?: string;
  limit?: string;
}

/**
 * Query parameters for CHM endpoint
 */
export interface CHMQueryParams {
  format?: 'png' | 'array' | 'geotiff';
  colormap?: 'viridis' | 'terrain' | 'grayscale';
}

// ============================================================================
// Python Service Communication Types
// ============================================================================

/**
 * Request to Python service for point extraction
 */
export interface PythonPointExtractionRequest {
  filePath: string;
  offset: number;
  limit: number;
  downsampleFactor: number;
  format: 'json' | 'binary';
  attributes?: string[];
}

/**
 * Response from Python service for point extraction
 */
export interface PythonPointExtractionResponse {
  success: boolean;
  count: number;
  format: 'json' | 'binary';
  points?: PointData[];
  binaryData?: string;
  bytesPerPoint?: number;
  hasMore: boolean;
  totalPoints: number;
  error?: string;
}

/**
 * Request to Python service for file metadata
 */
export interface PythonFileMetadataRequest {
  filePath: string;
  includeLODInfo?: boolean;
}

/**
 * Response from Python service for file metadata
 */
export interface PythonFileMetadataResponse {
  success: boolean;
  metadata?: {
    pointCount: number;
    bounds: PointCloudBounds;
    crs: string;
    lasVersion: string;
    pointFormat: number;
    attributes: PointCloudAttributes;
    lodLevels?: LODLevel[];
  };
  error?: string;
}
