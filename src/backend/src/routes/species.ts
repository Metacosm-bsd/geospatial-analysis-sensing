/**
 * Species Routes - Sprint 13-14
 * API endpoints for species classification and management
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as speciesService from '../services/species.service.js';
import { isValidRegion, type SupportedRegion } from '../types/species.js';

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

export default router;
