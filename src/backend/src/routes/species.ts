/**
 * Species Routes - Sprint 13-16
 * API endpoints for species classification, feedback, batch processing, and export
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as speciesService from '../services/species.service.js';
import * as speciesFeedbackService from '../services/speciesFeedback.service.js';
import * as speciesExportService from '../services/speciesExport.service.js';
import {
  isValidRegion,
  type SupportedRegion,
  type BatchClassificationRequest,
  type BatchProgress,
  type SpeciesExportOptions,
} from '../types/species.js';

const router = Router();

// All species routes require authentication
router.use(authenticateToken);

// ============================================================================
// Validation Schemas
// ============================================================================

const ClassifySpeciesOptionsSchema = z.object({
  minConfidence: z.number().min(0).max(1).optional(),
  includeUncertain: z.boolean().optional(),
  useEnsemble: z.boolean().optional(),
});

const ClassifySpeciesSchema = z.object({
  analysisId: z.string().uuid(),
  region: z.enum(['pnw', 'southeast', 'northeast', 'rocky_mountain']),
  options: ClassifySpeciesOptionsSchema.optional(),
});

const UpdateTreeSpeciesSchema = z.object({
  speciesCode: z.string().min(2).max(10),
  speciesName: z.string().optional(),
  verified: z.boolean().optional(),
});

// Sprint 15-16: New Schemas
const CorrectionSchema = z.object({
  treeId: z.string().uuid(),
  predictedSpecies: z.string().min(2).max(10),
  correctedSpecies: z.string().min(2).max(10),
});

const BatchClassificationSchema = z.object({
  analysisId: z.string().uuid(),
  region: z.enum(['pnw', 'southeast', 'northeast', 'rocky_mountain']),
  batchSize: z.number().min(100).max(10000).optional(),
});

// ExportOptionsSchema - used for query parameter validation in export endpoint
const _ExportOptionsSchema = z.object({
  format: z.enum(['csv', 'geojson', 'shapefile']),
  includeUncertain: z.boolean().default(false),
  minConfidence: z.number().min(0).max(1).default(0.7),
});
void _ExportOptionsSchema; // Suppress unused warning - schema available for future use

// ============================================================================
// Validation Middleware
// ============================================================================

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
 * Middleware to validate region parameter
 */
const validateRegion = (req: Request, res: Response, next: NextFunction): void => {
  const region = req.params.region;
  if (!region || !isValidRegion(region)) {
    res.status(400).json({
      success: false,
      error: 'Invalid region',
      message: 'Region must be one of: pnw, southeast, northeast, rocky_mountain',
    });
    return;
  }
  next();
};

// ============================================================================
// Species Classification Endpoints
// ============================================================================

/**
 * POST /api/v1/species/classify
 * Start species classification for an analysis
 */
router.post(
  '/classify',
  validateBody(ClassifySpeciesSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { analysisId, region, options } = req.body;

      const result = await speciesService.classifySpecies(
        analysisId,
        region as SupportedRegion,
        options ?? {},
        userId
      );

      res.status(202).json({
        success: true,
        message: 'Species classification started',
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      logger.error('Error starting species classification:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: 'The requested analysis does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to classify species for this analysis',
        });
        return;
      }

      if (message.includes('must be completed')) {
        res.status(400).json({
          success: false,
          error: 'Analysis not complete',
          message: 'Analysis must be completed before species classification',
        });
        return;
      }

      if (message.includes('does not support')) {
        res.status(400).json({
          success: false,
          error: 'Unsupported analysis type',
          message: 'This analysis type does not support species classification',
        });
        return;
      }

      if (message.includes('Invalid region')) {
        res.status(400).json({
          success: false,
          error: 'Invalid region',
          message: message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to start classification',
        message: 'An error occurred while starting species classification',
      });
    }
  }
);

// ============================================================================
// Prediction Retrieval Endpoints
// ============================================================================

/**
 * GET /api/v1/species/predictions/:analysisId
 * Get species predictions for an analysis
 */
router.get(
  '/predictions/:analysisId',
  validateUUID('analysisId'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const analysisId = req.params.analysisId!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const predictions = await speciesService.getSpeciesPredictions(analysisId, userId);

      if (!predictions) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: 'The requested analysis does not exist',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: predictions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get predictions';
      logger.error('Error getting species predictions:', error);

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this analysis',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get predictions',
        message: 'An error occurred while fetching species predictions',
      });
    }
  }
);

// ============================================================================
// Region Endpoints
// ============================================================================

/**
 * GET /api/v1/species/regions
 * List all supported regions
 */
router.get('/regions', (_req: Request, res: Response): void => {
  try {
    const regions = speciesService.getSupportedRegions();

    res.status(200).json({
      success: true,
      data: regions,
    });
  } catch (error) {
    logger.error('Error getting supported regions:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get regions',
      message: 'An error occurred while fetching supported regions',
    });
  }
});

/**
 * GET /api/v1/species/regions/:region
 * Get species list for a specific region
 */
router.get(
  '/regions/:region',
  validateRegion,
  (req: Request, res: Response): void => {
    try {
      const region = req.params.region as SupportedRegion;

      const regionInfo = speciesService.getRegionInfo(region);

      if (!regionInfo) {
        res.status(404).json({
          success: false,
          error: 'Region not found',
          message: 'The requested region does not exist',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: regionInfo,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get region';
      logger.error('Error getting region info:', error);

      if (message.includes('Invalid region')) {
        res.status(400).json({
          success: false,
          error: 'Invalid region',
          message: message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get region',
        message: 'An error occurred while fetching region information',
      });
    }
  }
);

// ============================================================================
// Tree Species Update Endpoints
// ============================================================================

/**
 * PATCH /api/v1/species/trees/:treeId
 * Manually update species for a tree
 */
router.patch(
  '/trees/:treeId',
  validateUUID('treeId'),
  validateBody(UpdateTreeSpeciesSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const treeId = req.params.treeId!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { speciesCode, speciesName } = req.body;

      const result = await speciesService.updateTreeSpecies(
        treeId,
        speciesCode,
        speciesName,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Tree species updated successfully',
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update tree species';
      logger.error('Error updating tree species:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Tree not found',
          message: 'The requested tree detection does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to update this tree',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update tree species',
        message: 'An error occurred while updating the tree species',
      });
    }
  }
);

// ============================================================================
// Sprint 15-16: Feedback Endpoints
// ============================================================================

/**
 * POST /api/v1/species/feedback/correction
 * Record a species correction
 */
router.post(
  '/feedback/correction',
  validateBody(CorrectionSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { treeId, predictedSpecies, correctedSpecies } = req.body;

      const correction = await speciesFeedbackService.recordCorrection(
        treeId,
        predictedSpecies,
        correctedSpecies,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Correction recorded successfully',
        data: correction,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record correction';
      logger.error('Error recording species correction:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Tree not found',
          message: 'The specified tree detection does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to correct this tree',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to record correction',
        message: 'An error occurred while recording the correction',
      });
    }
  }
);

/**
 * GET /api/v1/species/feedback/:analysisId
 * Get correction history for an analysis
 */
router.get(
  '/feedback/:analysisId',
  validateUUID('analysisId'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const analysisId = req.params.analysisId!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const corrections = await speciesFeedbackService.getCorrectionHistory(
        analysisId,
        userId
      );

      res.status(200).json({
        success: true,
        data: corrections,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get corrections';
      logger.error('Error getting correction history:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: 'The specified analysis does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this analysis',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get corrections',
        message: 'An error occurred while fetching correction history',
      });
    }
  }
);

/**
 * GET /api/v1/species/feedback/statistics
 * Get correction statistics
 */
router.get(
  '/feedback/statistics',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const statistics = await speciesFeedbackService.getCorrectionStatistics();

      res.status(200).json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error('Error getting correction statistics:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: 'An error occurred while fetching correction statistics',
      });
    }
  }
);

// ============================================================================
// Sprint 15-16: Batch Classification Endpoints
// ============================================================================

// Store for batch job progress (in production, use Redis)
const batchJobProgress = new Map<string, BatchProgress>();

/**
 * POST /api/v1/species/classify-batch
 * Start batch species classification
 */
router.post(
  '/classify-batch',
  validateBody(BatchClassificationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { analysisId, region, batchSize } = req.body as BatchClassificationRequest;

      // Start batch classification job
      const { queueBatchSpeciesClassification } = await import('../jobs/speciesClassification.job.js');
      const jobId = await queueBatchSpeciesClassification(
        analysisId,
        region as SupportedRegion,
        userId,
        batchSize ?? 1000
      );

      // Initialize progress tracking
      batchJobProgress.set(jobId, {
        jobId,
        status: 'queued',
        processedTrees: 0,
        totalTrees: 0,
        percentComplete: 0,
      });

      res.status(202).json({
        success: true,
        message: 'Batch classification started',
        data: {
          jobId,
          status: 'queued',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start batch classification';
      logger.error('Error starting batch classification:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: 'The specified analysis does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to classify this analysis',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to start batch classification',
        message: 'An error occurred while starting batch classification',
      });
    }
  }
);

/**
 * GET /api/v1/species/batch/:jobId/progress
 * Get batch classification progress
 */
router.get(
  '/batch/:jobId/progress',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const jobId = req.params.jobId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Job ID is required',
        });
        return;
      }

      // Get progress from job queue
      const { getBatchJobProgress } = await import('../jobs/speciesClassification.job.js');
      const progress = await getBatchJobProgress(jobId);

      if (!progress) {
        // Check in-memory cache
        const cachedProgress = batchJobProgress.get(jobId);
        if (cachedProgress) {
          res.status(200).json({
            success: true,
            data: cachedProgress,
          });
          return;
        }

        res.status(404).json({
          success: false,
          error: 'Job not found',
          message: 'The specified batch job does not exist',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: progress,
      });
    } catch (error) {
      logger.error('Error getting batch progress:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get progress',
        message: 'An error occurred while fetching batch progress',
      });
    }
  }
);

// ============================================================================
// Sprint 15-16: Export Endpoints
// ============================================================================

/**
 * GET /api/v1/species/export/:analysisId
 * Export species classification data
 */
router.get(
  '/export/:analysisId',
  validateUUID('analysisId'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const analysisId = req.params.analysisId!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Parse query params for export options
      const format = (req.query.format as string) ?? 'csv';
      const includeUncertain = req.query.includeUncertain === 'true';
      const minConfidence = parseFloat(req.query.minConfidence as string) || 0.7;

      // Validate format
      if (!['csv', 'geojson', 'shapefile'].includes(format)) {
        res.status(400).json({
          success: false,
          error: 'Invalid format',
          message: 'Format must be one of: csv, geojson, shapefile',
        });
        return;
      }

      const options: SpeciesExportOptions = {
        format: format as 'csv' | 'geojson' | 'shapefile',
        includeUncertain,
        minConfidence,
      };

      const result = await speciesExportService.exportSpeciesData(
        analysisId,
        options,
        userId
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export data';
      logger.error('Error exporting species data:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: 'The specified analysis does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to export this analysis',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to export data',
        message: 'An error occurred while exporting species data',
      });
    }
  }
);

// ============================================================================
// Sprint 15-16: Validation Metrics Endpoint
// ============================================================================

/**
 * GET /api/v1/species/validation/:region
 * Get model validation metrics for a region
 */
router.get(
  '/validation/:region',
  validateRegion,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const region = req.params.region as SupportedRegion;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Get validation metrics from Python service or use cached/simulated data
      const { getValidationMetrics } = await import('../services/species.service.js');
      const metrics = await getValidationMetrics(region);

      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Error getting validation metrics:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get validation metrics',
        message: 'An error occurred while fetching validation metrics',
      });
    }
  }
);

export default router;
