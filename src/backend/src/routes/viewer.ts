/**
 * Viewer Routes for Sprint 9-10
 *
 * API endpoints for 3D point cloud viewer data,
 * including point cloud streaming, metadata, tree locations, and CHM data.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as viewerService from '../services/viewer.service.js';
import * as fileService from '../services/file.service.js';

const router = Router();

// All viewer routes require authentication
router.use(authenticateToken);

// ============================================================================
// Validation Schemas
// ============================================================================

const PointCloudQuerySchema = z.object({
  lod: z.enum(['0', '1', '2']).optional().default('0'),
  format: z.enum(['json', 'binary']).optional().default('binary'),
  offset: z.string().regex(/^\d+$/).optional().default('0'),
  limit: z.string().regex(/^\d+$/).optional().default('1000000'),
});

const CHMQuerySchema = z.object({
  format: z.enum(['png', 'array', 'geotiff']).optional().default('png'),
  colormap: z.enum(['viridis', 'terrain', 'grayscale']).optional().default('viridis'),
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * Validate UUID parameter
 */
const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!value || !uuidRegex.test(value)) {
      res.status(400).json({
        success: false,
        error: 'Invalid parameter',
        message: `Invalid ${paramName} format`,
      });
      return;
    }
    next();
  };
};

/**
 * Verify file ownership (through project)
 */
const verifyFileAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const fileId = req.params.fileId!;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const isOwner = await fileService.isFileOwner(fileId, userId);
    if (!isOwner && req.user?.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You do not have permission to access this file',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Error verifying file access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify access',
      message: 'An error occurred while verifying file access',
    });
  }
};

// ============================================================================
// Point Cloud Endpoints
// ============================================================================

/**
 * GET /viewer/files/:fileId/points
 * Get point cloud data in chunks
 *
 * Query params:
 * - lod: 0|1|2 (Level of Detail - 0=full, 1=1/4, 2=1/16)
 * - format: binary|json (default: binary)
 * - offset: number (starting point index)
 * - limit: number (max points to return)
 */
router.get(
  '/files/:fileId/points',
  validateUUID('fileId'),
  verifyFileAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;
      const queryResult = PointCloudQuerySchema.safeParse(req.query);

      if (!queryResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: queryResult.error.flatten().fieldErrors,
        });
        return;
      }

      const { lod, format, offset, limit } = queryResult.data;

      const chunk = await viewerService.getPointCloudChunk(
        fileId,
        parseInt(offset, 10),
        parseInt(limit, 10),
        parseInt(lod, 10),
        format
      );

      // For binary format, return appropriate content type
      if (format === 'binary' && chunk.binaryData) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Point-Count', chunk.count.toString());
        res.setHeader('X-Total-Points', chunk.totalPoints.toString());
        res.setHeader('X-Has-More', chunk.hasMore.toString());
        res.setHeader('X-Bytes-Per-Point', (chunk.bytesPerPoint ?? 0).toString());
        res.setHeader('X-LOD', chunk.lod.toString());

        // Decode base64 and send as binary
        const buffer = Buffer.from(chunk.binaryData, 'base64');
        res.send(buffer);
        return;
      }

      // JSON format
      res.status(200).json({
        success: true,
        data: chunk,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get points';
      logger.error('Error getting point cloud data:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: 'The requested file does not exist',
        });
        return;
      }

      if (message.includes('not ready')) {
        res.status(400).json({
          success: false,
          error: 'File not ready',
          message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get point cloud data',
        message: 'An error occurred while retrieving point cloud data',
      });
    }
  }
);

/**
 * GET /viewer/files/:fileId/metadata
 * Get point cloud metadata including bounds, point count, and available LODs
 */
router.get(
  '/files/:fileId/metadata',
  validateUUID('fileId'),
  verifyFileAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;

      const metadata = await viewerService.getPointCloudMetadata(fileId);

      if (!metadata) {
        res.status(404).json({
          success: false,
          error: 'Metadata not found',
          message: 'Point cloud metadata not available for this file',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: metadata,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get metadata';
      logger.error('Error getting point cloud metadata:', error);

      if (message.includes('not ready')) {
        res.status(400).json({
          success: false,
          error: 'File not ready',
          message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get metadata',
        message: 'An error occurred while retrieving point cloud metadata',
      });
    }
  }
);

// ============================================================================
// Tree Detection Endpoints
// ============================================================================

/**
 * GET /viewer/files/:fileId/trees
 * Get detected trees for a specific file
 */
router.get(
  '/files/:fileId/trees',
  validateUUID('fileId'),
  verifyFileAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;

      const trees = await viewerService.getDetectedTreesForFile(fileId);

      if (!trees) {
        res.status(404).json({
          success: false,
          error: 'No tree data',
          message: 'No tree detection results available for this file. Run tree detection analysis first.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: trees,
      });
    } catch (error) {
      logger.error('Error getting detected trees:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tree data',
        message: 'An error occurred while retrieving detected trees',
      });
    }
  }
);

/**
 * GET /viewer/analyses/:analysisId/trees
 * Get all detected trees with full metrics from an analysis
 */
router.get(
  '/analyses/:analysisId/trees',
  validateUUID('analysisId'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const analysisId = req.params.analysisId!;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Note: Analysis access verification would be done through project ownership
      // For now, we rely on the service to handle authorization

      const trees = await viewerService.getDetectedTreesForAnalysis(analysisId);

      if (!trees) {
        res.status(404).json({
          success: false,
          error: 'No tree data',
          message: 'No tree detection results available for this analysis',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: trees,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get trees';
      logger.error('Error getting detected trees for analysis:', error);

      if (message.includes('not completed')) {
        res.status(400).json({
          success: false,
          error: 'Analysis not complete',
          message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get tree data',
        message: 'An error occurred while retrieving detected trees',
      });
    }
  }
);

// ============================================================================
// CHM (Canopy Height Model) Endpoints
// ============================================================================

/**
 * GET /viewer/files/:fileId/chm
 * Get CHM raster data as image or array
 *
 * Query params:
 * - format: png|array|geotiff (default: png)
 * - colormap: viridis|terrain|grayscale (default: viridis)
 */
router.get(
  '/files/:fileId/chm',
  validateUUID('fileId'),
  verifyFileAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;
      const queryResult = CHMQuerySchema.safeParse(req.query);

      if (!queryResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: queryResult.error.flatten().fieldErrors,
        });
        return;
      }

      const { format, colormap } = queryResult.data;

      const chmData = await viewerService.getCHMData(fileId, format, colormap);

      if (!chmData) {
        res.status(404).json({
          success: false,
          error: 'CHM not available',
          message: 'CHM data not available for this file. Run canopy height analysis first.',
        });
        return;
      }

      // If returning raw image data, set appropriate content type
      if (format === 'png' && typeof chmData.data === 'string' && !chmData.url) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('X-Width', chmData.width.toString());
        res.setHeader('X-Height', chmData.height.toString());
        res.setHeader('X-Resolution', chmData.resolution.toString());
        res.setHeader('X-Min-Height', chmData.minHeight.toString());
        res.setHeader('X-Max-Height', chmData.maxHeight.toString());

        const buffer = Buffer.from(chmData.data, 'base64');
        res.send(buffer);
        return;
      }

      if (format === 'geotiff' && typeof chmData.data === 'string' && !chmData.url) {
        res.setHeader('Content-Type', 'image/tiff');
        res.setHeader('Content-Disposition', `attachment; filename="chm_${fileId}.tif"`);

        const buffer = Buffer.from(chmData.data, 'base64');
        res.send(buffer);
        return;
      }

      // JSON response for array format or when URL is provided
      res.status(200).json({
        success: true,
        data: chmData,
      });
    } catch (error) {
      logger.error('Error getting CHM data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get CHM data',
        message: 'An error occurred while retrieving CHM data',
      });
    }
  }
);

export default router;
