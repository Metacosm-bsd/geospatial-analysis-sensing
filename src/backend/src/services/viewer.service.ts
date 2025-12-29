/**
 * Viewer Service for Sprint 9-10
 *
 * Handles point cloud data retrieval, metadata extraction,
 * and communication with Python processing service for
 * 3D viewer endpoints.
 */

import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import type {
  PointCloudMetadata,
  PointCloudChunk,
  PointCloudBounds,
  LODLevel,
  TreeLocation,
  DetectedTreesResponse,
  TreeStatistics,
  CHMDataResponse,
  PythonPointExtractionRequest,
  PythonPointExtractionResponse,
  PythonFileMetadataResponse,
} from '../types/viewer.js';

// LOD decimation factors
const LOD_DECIMATION_FACTORS = [1, 4, 16]; // LOD 0 = full, LOD 1 = 1/4, LOD 2 = 1/16

// Default point limit per request
const DEFAULT_POINT_LIMIT = 1000000;
const MAX_POINT_LIMIT = 5000000;

/**
 * Get point cloud metadata for a file
 */
export async function getPointCloudMetadata(
  fileId: string
): Promise<PointCloudMetadata | null> {
  try {
    // Get file record from database
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return null;
    }

    // Check if file is ready
    if (file.status !== 'READY' && file.status !== 'PROCESSING') {
      throw new Error(`File is not ready for viewing. Status: ${file.status}`);
    }

    // Try to get metadata from database first
    let metadata: PointCloudMetadata | null = null;

    if (file.metadata && typeof file.metadata === 'object') {
      const storedMetadata = file.metadata as Record<string, unknown>;

      // Check if we have viewer metadata cached
      if (storedMetadata.viewerMetadata) {
        metadata = storedMetadata.viewerMetadata as PointCloudMetadata;
      }
    }

    // If no cached metadata, fetch from Python service
    if (!metadata) {
      metadata = await fetchMetadataFromPythonService(fileId, file.storagePath);

      // Cache the metadata in the database
      if (metadata) {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            metadata: {
              ...(file.metadata as Record<string, unknown> || {}),
              viewerMetadata: metadata,
            },
          },
        });
      }
    }

    return metadata;
  } catch (error) {
    logger.error(`Error getting point cloud metadata for file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Get a chunk of point cloud data
 */
export async function getPointCloudChunk(
  fileId: string,
  offset: number = 0,
  limit: number = DEFAULT_POINT_LIMIT,
  lod: number = 0,
  format: 'json' | 'binary' = 'binary'
): Promise<PointCloudChunk> {
  try {
    // Validate parameters
    if (lod < 0 || lod > 2) {
      throw new Error('LOD must be 0, 1, or 2');
    }

    if (limit < 1 || limit > MAX_POINT_LIMIT) {
      throw new Error(`Limit must be between 1 and ${MAX_POINT_LIMIT}`);
    }

    if (offset < 0) {
      throw new Error('Offset must be non-negative');
    }

    // Get file record
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.status !== 'READY' && file.status !== 'PROCESSING') {
      throw new Error(`File is not ready for viewing. Status: ${file.status}`);
    }

    // Request points from Python service
    const downsampleFactor = LOD_DECIMATION_FACTORS[lod] ?? 1;
    const response = await fetchPointsFromPythonService(
      file.storagePath,
      offset,
      limit,
      downsampleFactor,
      format
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Failed to extract points');
    }

    const chunk: PointCloudChunk = {
      fileId,
      offset,
      limit,
      count: response.count,
      format,
      lod,
      hasMore: response.hasMore,
      totalPoints: response.totalPoints,
    };

    if (format === 'json' && response.points) {
      chunk.points = response.points;
    } else if (format === 'binary' && response.binaryData) {
      chunk.binaryData = response.binaryData;
      if (response.bytesPerPoint !== undefined) {
        chunk.bytesPerPoint = response.bytesPerPoint;
      }
    }

    return chunk;
  } catch (error) {
    logger.error(`Error getting point cloud chunk for file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Get detected trees for a file
 */
export async function getDetectedTreesForFile(
  fileId: string
): Promise<DetectedTreesResponse | null> {
  try {
    // Find analyses that include this file and have tree detection results
    const analyses = await prisma.analysis.findMany({
      where: {
        files: {
          some: {
            id: fileId,
          },
        },
        status: 'COMPLETED',
        type: {
          in: ['tree_detection', 'forest_metrics', 'full_pipeline'],
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: 1,
    });

    if (analyses.length === 0) {
      return null;
    }

    const analysis = analyses[0];

    if (!analysis) {
      return null;
    }

    return extractTreesFromAnalysis(fileId, analysis.id, analysis.results);
  } catch (error) {
    logger.error(`Error getting detected trees for file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Get detected trees for an analysis
 */
export async function getDetectedTreesForAnalysis(
  analysisId: string
): Promise<DetectedTreesResponse | null> {
  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return null;
    }

    if (analysis.status !== 'COMPLETED') {
      throw new Error(`Analysis is not completed. Status: ${analysis.status}`);
    }

    return extractTreesFromAnalysis(undefined, analysisId, analysis.results);
  } catch (error) {
    logger.error(`Error getting detected trees for analysis ${analysisId}:`, error);
    throw error;
  }
}

/**
 * Get CHM data for a file
 */
export async function getCHMData(
  fileId: string,
  format: 'png' | 'array' | 'geotiff' = 'png',
  colormap: 'viridis' | 'terrain' | 'grayscale' = 'viridis'
): Promise<CHMDataResponse | null> {
  try {
    // Get file record
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return null;
    }

    // Check if we have cached CHM data
    if (file.metadata && typeof file.metadata === 'object') {
      const storedMetadata = file.metadata as Record<string, unknown>;

      if (storedMetadata.chmPath) {
        // Return URL to the CHM file
        return {
          fileId,
          width: (storedMetadata.chmWidth as number) ?? 0,
          height: (storedMetadata.chmHeight as number) ?? 0,
          resolution: (storedMetadata.chmResolution as number) ?? 1.0,
          bounds: storedMetadata.bounds as PointCloudBounds,
          noDataValue: -9999,
          minHeight: (storedMetadata.minHeight as number) ?? 0,
          maxHeight: (storedMetadata.maxHeight as number) ?? 0,
          format,
          url: storedMetadata.chmPath as string,
        };
      }
    }

    // Request CHM from Python service
    const response = await fetchCHMFromPythonService(
      file.storagePath,
      format,
      colormap
    );

    return response;
  } catch (error) {
    logger.error(`Error getting CHM data for file ${fileId}:`, error);
    throw error;
  }
}

// ============================================================================
// Python Service Communication
// ============================================================================

/**
 * Fetch metadata from Python processing service
 */
async function fetchMetadataFromPythonService(
  fileId: string,
  filePath: string
): Promise<PointCloudMetadata | null> {
  try {
    const url = `${config.processing.serviceUrl}/api/v1/file-metadata`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_path: resolveStoragePath(filePath),
        include_lod_info: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Python service error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = (await response.json()) as PythonFileMetadataResponse;

    if (!data.success || !data.metadata) {
      logger.error(`Python service returned error: ${data.error}`);
      return null;
    }

    const m = data.metadata;

    // Convert Python response to our PointCloudMetadata format
    const metadata: PointCloudMetadata = {
      fileId,
      pointCount: m.pointCount,
      bounds: m.bounds,
      crs: m.crs,
      lodLevels: m.lodLevels ?? generateDefaultLODLevels(m.pointCount),
      attributes: m.attributes,
      fileInfo: {
        filename: filePath.split('/').pop() ?? '',
        fileSize: 0, // Will be filled from file record
        fileType: 'LAS',
        lasVersion: m.lasVersion,
        pointFormat: m.pointFormat,
      },
    };

    return metadata;
  } catch (error) {
    logger.error('Error fetching metadata from Python service:', error);
    return null;
  }
}

/**
 * Fetch points from Python processing service
 */
async function fetchPointsFromPythonService(
  filePath: string,
  offset: number,
  limit: number,
  downsampleFactor: number,
  format: 'json' | 'binary'
): Promise<PythonPointExtractionResponse> {
  try {
    const url = `${config.processing.serviceUrl}/api/v1/extract-points`;

    const request: PythonPointExtractionRequest = {
      filePath: resolveStoragePath(filePath),
      offset,
      limit,
      downsampleFactor,
      format,
      attributes: ['x', 'y', 'z', 'intensity', 'classification', 'r', 'g', 'b'],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_path: request.filePath,
        offset: request.offset,
        limit: request.limit,
        downsample_factor: request.downsampleFactor,
        format: request.format,
        attributes: request.attributes,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        count: 0,
        format,
        hasMore: false,
        totalPoints: 0,
        error: `Python service error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    return data as PythonPointExtractionResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching points from Python service:', error);
    return {
      success: false,
      count: 0,
      format,
      hasMore: false,
      totalPoints: 0,
      error: errorMessage,
    };
  }
}

/**
 * Fetch CHM from Python processing service
 */
async function fetchCHMFromPythonService(
  filePath: string,
  format: 'png' | 'array' | 'geotiff',
  colormap: string
): Promise<CHMDataResponse | null> {
  try {
    const url = `${config.processing.serviceUrl}/api/v1/chm`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_path: resolveStoragePath(filePath),
        format,
        colormap,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Python service error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data as CHMDataResponse;
  } catch (error) {
    logger.error('Error fetching CHM from Python service:', error);
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve storage path to absolute path
 */
function resolveStoragePath(storagePath: string): string {
  if (config.storage.type === 'local') {
    const path = require('path');
    return path.resolve(config.storage.localPath, storagePath);
  }
  // For S3, return the key as-is
  return storagePath;
}

/**
 * Generate default LOD levels based on point count
 */
function generateDefaultLODLevels(totalPoints: number): LODLevel[] {
  return LOD_DECIMATION_FACTORS.map((factor, index) => ({
    level: index,
    pointCount: Math.ceil(totalPoints / factor),
    decimationFactor: factor,
  }));
}

/**
 * Extract trees from analysis results
 */
function extractTreesFromAnalysis(
  fileId: string | undefined,
  analysisId: string,
  results: unknown
): DetectedTreesResponse | null {
  if (!results || typeof results !== 'object') {
    return null;
  }

  const r = results as Record<string, unknown>;

  // Try to find tree detection results
  let trees: TreeLocation[] = [];
  let statistics: TreeStatistics | undefined;
  let bounds: PointCloudBounds | undefined;

  // Check for trees in various possible locations in the results
  if (r.trees && Array.isArray(r.trees)) {
    trees = (r.trees as Record<string, unknown>[]).map(normalizeTreeData);
  } else if (r.treeDetection && typeof r.treeDetection === 'object') {
    const td = r.treeDetection as Record<string, unknown>;
    if (td.trees && Array.isArray(td.trees)) {
      trees = (td.trees as Record<string, unknown>[]).map(normalizeTreeData);
    }
  } else if (r.detectedTrees && Array.isArray(r.detectedTrees)) {
    trees = (r.detectedTrees as Record<string, unknown>[]).map(normalizeTreeData);
  }

  // Extract statistics
  if (trees.length > 0) {
    const heights = trees.map(t => t.height);
    const crownDiameters = trees.map(t => t.crownDiameter).filter(d => d > 0);

    statistics = {
      averageHeight: heights.reduce((a, b) => a + b, 0) / heights.length,
      maxHeight: Math.max(...heights),
      minHeight: Math.min(...heights),
      averageCrownDiameter: crownDiameters.length > 0
        ? crownDiameters.reduce((a, b) => a + b, 0) / crownDiameters.length
        : 0,
    };

    // Calculate totals if biomass/carbon data available
    const biomassValues = trees.map(t => t.biomass).filter((b): b is number => b !== undefined);
    const carbonValues = trees.map(t => t.carbon).filter((c): c is number => c !== undefined);

    if (biomassValues.length > 0) {
      statistics.totalBiomass = biomassValues.reduce((a, b) => a + b, 0);
    }
    if (carbonValues.length > 0) {
      statistics.totalCarbon = carbonValues.reduce((a, b) => a + b, 0);
    }

    // Calculate species breakdown
    const speciesCount: Record<string, number> = {};
    for (const tree of trees) {
      if (tree.species) {
        speciesCount[tree.species] = (speciesCount[tree.species] ?? 0) + 1;
      }
    }
    if (Object.keys(speciesCount).length > 0) {
      statistics.speciesBreakdown = speciesCount;
    }
  }

  // Extract bounds if available
  if (r.bounds && typeof r.bounds === 'object') {
    bounds = r.bounds as PointCloudBounds;
  }

  const response: DetectedTreesResponse = {
    analysisId,
    treeCount: trees.length,
    trees,
  };

  if (fileId !== undefined) {
    response.fileId = fileId;
  }
  if (bounds !== undefined) {
    response.bounds = bounds;
  }
  if (statistics !== undefined) {
    response.statistics = statistics;
  }

  return response;
}

/**
 * Normalize tree data from various formats to TreeLocation
 */
function normalizeTreeData(data: Record<string, unknown>): TreeLocation {
  const tree: TreeLocation = {
    id: String(data.id ?? data.tree_id ?? data.treeId ?? crypto.randomUUID()),
    x: Number(data.x ?? 0),
    y: Number(data.y ?? 0),
    z: Number(data.z ?? data.top_z ?? data.topZ ?? 0),
    height: Number(data.height ?? data.tree_height ?? data.treeHeight ?? 0),
    crownDiameter: Number(data.crown_diameter ?? data.crownDiameter ?? data.crown_width ?? 0),
  };

  // Add optional properties only if defined
  if (data.dbh !== undefined) {
    tree.dbh = Number(data.dbh);
  } else if (data.dbh_estimated !== undefined) {
    tree.dbh = Number(data.dbh_estimated);
  }

  if (data.species !== undefined) {
    tree.species = String(data.species);
  }

  if (data.biomass !== undefined) {
    tree.biomass = Number(data.biomass);
  } else if (data.biomass_estimated !== undefined) {
    tree.biomass = Number(data.biomass_estimated);
  }

  if (data.carbon !== undefined) {
    tree.carbon = Number(data.carbon);
  }

  if (data.confidence !== undefined) {
    tree.confidence = Number(data.confidence);
  }

  if (data.crown_area !== undefined) {
    tree.crownArea = Number(data.crown_area);
  } else if (data.crownArea !== undefined) {
    tree.crownArea = Number(data.crownArea);
  }

  if (data.crown_base_height !== undefined) {
    tree.crownBaseHeight = Number(data.crown_base_height);
  } else if (data.crownBaseHeight !== undefined) {
    tree.crownBaseHeight = Number(data.crownBaseHeight);
  }

  if (data.point_count !== undefined) {
    tree.pointCount = Number(data.point_count);
  } else if (data.pointCount !== undefined) {
    tree.pointCount = Number(data.pointCount);
  }

  return tree;
}

// Import crypto for UUID generation
import crypto from 'crypto';

export const viewerService = {
  getPointCloudMetadata,
  getPointCloudChunk,
  getDetectedTreesForFile,
  getDetectedTreesForAnalysis,
  getCHMData,
};

export default viewerService;
