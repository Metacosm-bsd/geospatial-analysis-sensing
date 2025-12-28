import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as fileService from '../services/file.service.js';
import { CompleteUploadDtoSchema } from '../types/dto.js';

const router = Router();

// All file routes require authentication
router.use(authenticateToken);

/**
 * Middleware to validate request body with Zod schema
 */
const validateBody = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
};

/**
 * Middleware to validate UUID parameter
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
 * Middleware to verify file ownership
 */
const verifyFileOwnership = async (
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
    logger.error('Error verifying file ownership:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify access',
      message: 'An error occurred while verifying file access',
    });
  }
};

/**
 * POST /api/v1/files/upload/:fileId/complete
 * Complete file upload and trigger processing
 */
router.post(
  '/upload/:fileId/complete',
  validateUUID('fileId'),
  verifyFileOwnership,
  validateBody(CompleteUploadDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;
      const { checksum } = req.body;

      const file = await fileService.completeUpload(fileId, checksum);

      // Convert BigInt to string for JSON serialization
      const serializedFile = {
        ...file,
        size: file.size.toString(),
        pointCount: file.pointCount?.toString() ?? null,
      };

      res.status(200).json({
        success: true,
        message: 'Upload completed successfully',
        data: serializedFile,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload completion failed';
      logger.error('Error completing upload:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: 'The requested file does not exist',
        });
        return;
      }

      if (message.includes('Cannot complete')) {
        res.status(400).json({
          success: false,
          error: 'Invalid file status',
          message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to complete upload',
        message: 'An error occurred while completing the upload',
      });
    }
  }
);

/**
 * GET /api/v1/files/:fileId
 * Get file metadata
 */
router.get(
  '/:fileId',
  validateUUID('fileId'),
  verifyFileOwnership,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;

      const file = await fileService.getFileMetadata(fileId);

      if (!file) {
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: 'The requested file does not exist',
        });
        return;
      }

      // Convert BigInt to string for JSON serialization
      const serializedFile = {
        ...file,
        size: file.size.toString(),
        pointCount: file.pointCount?.toString() ?? null,
      };

      res.status(200).json({
        success: true,
        data: serializedFile,
      });
    } catch (error) {
      logger.error('Error getting file metadata:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get file',
        message: 'An error occurred while fetching file metadata',
      });
    }
  }
);

/**
 * DELETE /api/v1/files/:fileId
 * Delete a file
 */
router.delete(
  '/:fileId',
  validateUUID('fileId'),
  verifyFileOwnership,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;

      await fileService.deleteFile(fileId);

      res.status(200).json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      logger.error('Error deleting file:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: 'The requested file does not exist',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete file',
        message: 'An error occurred while deleting the file',
      });
    }
  }
);

/**
 * GET /api/v1/files/:fileId/download
 * Get download URL for a file
 */
router.get(
  '/:fileId/download',
  validateUUID('fileId'),
  verifyFileOwnership,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fileId = req.params.fileId!;

      const downloadUrl = await fileService.generateDownloadUrl(fileId);

      res.status(200).json({
        success: true,
        data: {
          downloadUrl,
          expiresIn: 3600, // 1 hour
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      logger.error('Error generating download URL:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: 'The requested file does not exist',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to generate download URL',
        message: 'An error occurred while generating the download URL',
      });
    }
  }
);

/**
 * GET /api/v1/files/types
 * Get supported file types
 */
router.get('/types', (_req: Request, res: Response): void => {
  const supportedExtensions = fileService.getSupportedExtensions();

  res.status(200).json({
    success: true,
    data: {
      extensions: supportedExtensions,
      types: {
        LAS: { extension: '.las', description: 'LAS point cloud file' },
        LAZ: { extension: '.laz', description: 'Compressed LAS file' },
        GEOTIFF: { extension: '.tif, .tiff', description: 'GeoTIFF raster file' },
        SHAPEFILE: { extension: '.shp', description: 'Shapefile (zipped)' },
        GEOJSON: { extension: '.geojson, .json', description: 'GeoJSON vector file' },
        COG: { extension: '.tif', description: 'Cloud Optimized GeoTIFF' },
      },
    },
  });
});

export default router;
