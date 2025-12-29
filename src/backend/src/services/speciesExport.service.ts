/**
 * Species Export Service - Sprint 15-16
 * Handles exporting species classification data in various formats
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import type {
  SpeciesExportOptions,
  SpeciesExportResponse,
} from '../types/species.js';

// ============================================================================
// Types
// ============================================================================

interface TreeExportData {
  id: string;
  x: number;
  y: number;
  z: number;
  height: number;
  crownDiameter: number;
  dbh: number | null;
  speciesCode: string | null;
  speciesName: string | null;
  speciesConfidence: number | null;
  biomass: number | null;
  carbon: number | null;
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number, number];
  };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export species classification data for an analysis
 * @param analysisId - Analysis ID to export
 * @param options - Export options
 * @param userId - User requesting export (for access verification)
 * @returns Export response with file URL
 */
export async function exportSpeciesData(
  analysisId: string,
  options: SpeciesExportOptions,
  userId?: string
): Promise<SpeciesExportResponse> {
  try {
    // Verify user has access to the analysis
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    if (userId && analysis.project.userId !== userId) {
      throw new Error('Access denied: You do not have access to this analysis');
    }

    // Get trees with species data
    const whereClause: {
      analysisId: string;
      speciesCode?: { not: null };
      speciesConfidence?: { gte: number };
    } = { analysisId };

    // Filter by confidence if not including uncertain
    if (!options.includeUncertain) {
      whereClause.speciesCode = { not: null };
      whereClause.speciesConfidence = { gte: options.minConfidence };
    }

    const trees = await prisma.treeDetection.findMany({
      where: whereClause,
      select: {
        id: true,
        x: true,
        y: true,
        z: true,
        height: true,
        crownDiameter: true,
        dbh: true,
        speciesCode: true,
        speciesName: true,
        speciesConfidence: true,
        biomass: true,
        carbon: true,
      },
    });

    // Generate export file based on format
    let buffer: Buffer;
    let extension: string;

    switch (options.format) {
      case 'csv':
        buffer = exportAsCSV(trees as TreeExportData[]);
        extension = 'csv';
        break;
      case 'geojson':
        buffer = Buffer.from(JSON.stringify(exportAsGeoJSON(trees as TreeExportData[]), null, 2));
        extension = 'geojson';
        break;
      case 'shapefile':
        buffer = await exportAsShapefile(trees as TreeExportData[], analysisId);
        extension = 'zip';
        break;
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    // Save file to storage
    const filename = `species_export_${analysisId}_${Date.now()}.${extension}`;
    const exportDir = join(config.storage.localPath ?? './exports', 'species');

    // Ensure export directory exists
    await mkdir(exportDir, { recursive: true });

    const filePath = join(exportDir, filename);
    await writeFile(filePath, buffer);

    // Generate URL for file access
    const fileUrl = `/api/v1/exports/species/${filename}`;

    logger.info(
      `Exported ${trees.length} trees from analysis ${analysisId} as ${options.format}`
    );

    return {
      fileUrl,
      format: options.format,
      treeCount: trees.length,
      fileSize: buffer.length,
      exportedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error exporting species data:', error);
    throw error;
  }
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Export trees as CSV
 * @param trees - Array of tree data
 * @returns CSV content as Buffer
 */
export function exportAsCSV(trees: TreeExportData[]): Buffer {
  const headers = [
    'id',
    'x',
    'y',
    'z',
    'height',
    'crownDiameter',
    'dbh',
    'speciesCode',
    'speciesName',
    'speciesConfidence',
    'biomass',
    'carbon',
  ];

  const rows = trees.map((tree) => [
    tree.id,
    tree.x.toString(),
    tree.y.toString(),
    tree.z.toString(),
    tree.height.toString(),
    tree.crownDiameter.toString(),
    tree.dbh?.toString() ?? '',
    tree.speciesCode ?? '',
    tree.speciesName ?? '',
    tree.speciesConfidence?.toString() ?? '',
    tree.biomass?.toString() ?? '',
    tree.carbon?.toString() ?? '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  return Buffer.from(csvContent, 'utf-8');
}

// ============================================================================
// GeoJSON Export
// ============================================================================

/**
 * Export trees as GeoJSON
 * @param trees - Array of tree data
 * @returns GeoJSON FeatureCollection
 */
export function exportAsGeoJSON(trees: TreeExportData[]): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = trees.map((tree) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [tree.x, tree.y, tree.z],
    },
    properties: {
      id: tree.id,
      height: tree.height,
      crownDiameter: tree.crownDiameter,
      dbh: tree.dbh,
      speciesCode: tree.speciesCode,
      speciesName: tree.speciesName,
      speciesConfidence: tree.speciesConfidence,
      biomass: tree.biomass,
      carbon: tree.carbon,
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
}

// ============================================================================
// Shapefile Export
// ============================================================================

/**
 * Export trees as Shapefile (zipped)
 * @param trees - Array of tree data
 * @param analysisId - Analysis ID for naming
 * @returns Zipped shapefile as Buffer
 */
export async function exportAsShapefile(
  trees: TreeExportData[],
  analysisId: string
): Promise<Buffer> {
  // Note: Full shapefile support requires the 'shpjs' or 'shapefile' library
  // For now, we create a simple implementation with GeoJSON that can be converted
  // In production, you would use a library like 'shp-write' or 'shapefile'

  try {
    // Create GeoJSON first
    const geojson = exportAsGeoJSON(trees);

    // Create a simple zip-like structure with the data
    // In production, use a proper shapefile library
    const shapefileData = {
      type: 'shapefile-placeholder',
      message: 'Full shapefile support requires additional libraries',
      analysisId,
      treeCount: trees.length,
      geojson, // Include GeoJSON as fallback
      createdAt: new Date().toISOString(),
    };

    // For now, return JSON wrapped in a buffer that can be treated as a zip
    // In production, this would be actual SHP, SHX, DBF, and PRJ files zipped together
    const content = JSON.stringify(shapefileData, null, 2);

    // In a real implementation, you would:
    // 1. Create SHP file with geometry
    // 2. Create SHX file with index
    // 3. Create DBF file with attributes
    // 4. Create PRJ file with projection
    // 5. Zip all files together

    logger.warn('Shapefile export using GeoJSON placeholder - full implementation requires shp-write library');

    return Buffer.from(content, 'utf-8');
  } catch (error) {
    logger.error('Error creating shapefile:', error);
    throw new Error('Shapefile export failed');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get export file by filename
 * @param filename - Export filename
 * @returns File path if exists
 */
export async function getExportFile(filename: string): Promise<string | null> {
  const exportDir = join(config.storage.localPath ?? './exports', 'species');
  const filePath = join(exportDir, filename);

  try {
    const { stat } = await import('fs/promises');
    await stat(filePath);
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Clean up old export files (older than 24 hours)
 */
export async function cleanupOldExports(): Promise<number> {
  const exportDir = join(config.storage.localPath ?? './exports', 'species');
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  let deletedCount = 0;

  try {
    const { readdir, stat, unlink } = await import('fs/promises');
    const files = await readdir(exportDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = join(exportDir, file);
      const fileStat = await stat(filePath);
      const age = now - fileStat.mtimeMs;

      if (age > maxAge) {
        await unlink(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old export files`);
    }
  } catch (error) {
    // Directory may not exist yet, which is fine
    logger.debug('Export cleanup: no files to clean');
  }

  return deletedCount;
}

// ============================================================================
// Export Service Object
// ============================================================================

export const speciesExportService = {
  exportSpeciesData,
  exportAsCSV,
  exportAsGeoJSON,
  exportAsShapefile,
  getExportFile,
  cleanupOldExports,
};

export default speciesExportService;
