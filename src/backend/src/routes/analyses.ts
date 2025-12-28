import { Router, type Request, type Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import * as processingService from '../services/processing.service.js';
import type { PipelineParameters } from '../types/processing.js';

const router = Router();

// All analysis routes require authentication
router.use(authenticateToken);

// Analysis types supported by the platform
const ANALYSIS_TYPES = [
  'tree_detection',
  'canopy_height',
  'biomass_estimation',
  'species_classification',
  'change_detection',
  'terrain_analysis',
  'forest_metrics',
] as const;

// Validation middleware
const validateAnalysisCreate = [
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Analysis name is required (max 255 characters)'),
  body('type').isIn(ANALYSIS_TYPES).withMessage(`Type must be one of: ${ANALYSIS_TYPES.join(', ')}`),
  body('projectId').isUUID().withMessage('Valid project ID is required'),
  body('fileIds')
    .isArray({ min: 1 })
    .withMessage('At least one file ID is required')
    .custom((value: unknown[]) => {
      if (!value.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
        throw new Error('All file IDs must be valid UUIDs');
      }
      return true;
    }),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('bounds')
    .optional()
    .isObject()
    .withMessage('Bounds must be a GeoJSON object')
    .custom((value) => {
      if (value && !['Polygon', 'MultiPolygon'].includes(value.type)) {
        throw new Error('Bounds must be a GeoJSON Polygon or MultiPolygon');
      }
      return true;
    }),
];

// GET /api/v1/analyses
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
    query('projectId').optional().isUUID().withMessage('Invalid project ID'),
    query('type').optional().isIn(ANALYSIS_TYPES).withMessage('Invalid analysis type'),
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed'])
      .withMessage('Invalid status'),
  ],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    // TODO: Implement list analyses
    // - Get analyses for authenticated user's projects
    // - Apply pagination and filtering
    // - Include analysis progress and results summary

    res.status(501).json({
      message: 'List analyses endpoint - implementation pending',
      userId: req.user?.id,
      query: {
        page: req.query.page ?? 1,
        limit: req.query.limit ?? 20,
        projectId: req.query.projectId,
        type: req.query.type,
        status: req.query.status,
      },
    });
  }
);

// POST /api/v1/analyses
router.post('/', validateAnalysisCreate, (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  // TODO: Implement create analysis
  // - Verify user has access to project and files
  // - Create analysis record in database
  // - Queue analysis processing job
  // - Return analysis with status

  res.status(501).json({
    message: 'Create analysis endpoint - implementation pending',
    userId: req.user?.id,
    receivedData: {
      name: req.body.name,
      type: req.body.type,
      projectId: req.body.projectId,
      fileIds: req.body.fileIds,
      parameters: req.body.parameters,
      bounds: req.body.bounds,
    },
  });
});

// GET /api/v1/analyses/:id
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid analysis ID')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    // TODO: Implement get analysis by ID
    // - Verify user has access to analysis
    // - Return analysis with full results if completed
    // - Include progress information if processing

    res.status(501).json({
      message: 'Get analysis endpoint - implementation pending',
      analysisId: req.params.id,
      userId: req.user?.id,
    });
  }
);

// GET /api/v1/analyses/:id/status
router.get(
  '/:id/status',
  [param('id').isUUID().withMessage('Invalid analysis ID')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    // TODO: Implement get analysis status
    // - Return current status and progress
    // - Include estimated time remaining if processing

    res.status(501).json({
      message: 'Get analysis status endpoint - implementation pending',
      analysisId: req.params.id,
      userId: req.user?.id,
    });
  }
);

// GET /api/v1/analyses/:id/progress - Get real-time processing progress
router.get(
  '/:id/progress',
  [param('id').isUUID().withMessage('Invalid analysis ID')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const analysisId = req.params.id as string;

      // Get processing progress
      const progress = await processingService.getProcessingProgress(analysisId);

      if (!progress) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
        });
        return;
      }

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
);

// GET /api/v1/analyses/:id/results - Get processing results
router.get(
  '/:id/results',
  [
    param('id').isUUID().withMessage('Invalid analysis ID'),
    query('format').optional().isIn(['json', 'geojson', 'csv']).withMessage('Format must be json, geojson, or csv'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const analysisId = req.params.id as string;
      const format = (req.query.format as string) ?? 'json';

      // Get processing results
      const results = await processingService.getProcessingResults(analysisId);

      if (!results) {
        // Check if analysis exists but has no results yet
        const progress = await processingService.getProcessingProgress(analysisId);

        if (!progress) {
          res.status(404).json({
            success: false,
            error: 'Analysis not found',
          });
          return;
        }

        if (progress.stage !== 'completed') {
          res.status(202).json({
            success: false,
            error: 'Analysis is still processing',
            progress: {
              stage: progress.stage,
              progress: progress.progress,
              message: progress.message,
            },
          });
          return;
        }

        res.status(404).json({
          success: false,
          error: 'Results not available',
        });
        return;
      }

      // Format results based on requested format
      if (format === 'json') {
        res.json({
          success: true,
          data: results,
        });
      } else if (format === 'geojson') {
        // Convert results to GeoJSON format
        res.json({
          type: 'FeatureCollection',
          features: [],
          properties: {
            analysisId,
            ...results,
          },
        });
      } else if (format === 'csv') {
        // Convert results to CSV format
        const csvLines = [
          'metric,value',
          `treeCount,${results.treeCount ?? ''}`,
          `averageHeight,${results.averageHeight ?? ''}`,
          `maxHeight,${results.maxHeight ?? ''}`,
          `minHeight,${results.minHeight ?? ''}`,
          `canopyArea,${results.canopyArea ?? ''}`,
          `canopyCoverPercent,${results.canopyCoverPercent ?? ''}`,
          `processingTime,${results.processingTime ?? ''}`,
        ];

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analysis-${analysisId}-results.csv"`);
        res.send(csvLines.join('\n'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
);

// POST /api/v1/analyses/:id/cancel - Cancel processing job
router.post(
  '/:id/cancel',
  [param('id').isUUID().withMessage('Invalid analysis ID')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const analysisId = req.params.id as string;

      // Check if analysis exists and is still processing
      const progress = await processingService.getProcessingProgress(analysisId);

      if (!progress) {
        res.status(404).json({
          success: false,
          error: 'Analysis not found',
        });
        return;
      }

      if (progress.stage === 'completed' || progress.stage === 'failed') {
        res.status(400).json({
          success: false,
          error: `Cannot cancel analysis that is already ${progress.stage}`,
        });
        return;
      }

      // Cancel the processing
      const cancelled = await processingService.cancelProcessing(analysisId);

      if (cancelled) {
        res.json({
          success: true,
          message: 'Processing cancelled successfully',
          data: {
            analysisId,
            stage: 'failed',
            message: 'Processing cancelled by user',
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to cancel processing',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
);

// POST /api/v1/analyses/:id/start - Start processing pipeline
router.post(
  '/:id/start',
  [
    param('id').isUUID().withMessage('Invalid analysis ID'),
    body('fileIds')
      .isArray({ min: 1 })
      .withMessage('At least one file ID is required')
      .custom((value: unknown[]) => {
        if (!value.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
          throw new Error('All file IDs must be valid UUIDs');
        }
        return true;
      }),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const analysisId = req.params.id as string;
      const fileIds: string[] = req.body.fileIds;
      const parameters: PipelineParameters = req.body.parameters ?? {};
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      // Start the processing pipeline
      const jobId = await processingService.startProcessingPipeline(
        analysisId,
        fileIds,
        parameters,
        userId
      );

      res.json({
        success: true,
        message: 'Processing pipeline started',
        data: {
          analysisId,
          jobId,
          stage: 'queued',
          progress: 0,
          message: 'Processing job queued',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
);

// DELETE /api/v1/analyses/:id
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Invalid analysis ID')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    // TODO: Implement delete analysis
    // - Verify user owns analysis
    // - Delete results from storage
    // - Delete analysis record from database

    res.status(501).json({
      message: 'Delete analysis endpoint - implementation pending',
      analysisId: req.params.id,
      userId: req.user?.id,
    });
  }
);

// POST /api/v1/analyses/:id/export
router.post(
  '/:id/export',
  [
    param('id').isUUID().withMessage('Invalid analysis ID'),
    body('format').isIn(['pdf', 'geojson', 'shapefile', 'csv', 'las']).withMessage('Invalid export format'),
    body('includeVisualizations').optional().isBoolean().withMessage('includeVisualizations must be boolean'),
  ],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    // TODO: Implement export analysis
    // - Verify analysis is completed
    // - Queue export job
    // - Return export job status

    res.status(501).json({
      message: 'Export analysis endpoint - implementation pending',
      analysisId: req.params.id,
      userId: req.user?.id,
      exportOptions: {
        format: req.body.format,
        includeVisualizations: req.body.includeVisualizations ?? false,
      },
    });
  }
);

// POST /api/v1/analyses/callback - Handle progress callback from Python service
router.post(
  '/callback',
  [
    body('analysisId').isUUID().withMessage('Invalid analysis ID'),
    body('stage').isString().withMessage('Stage is required'),
    body('progress').isFloat({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100'),
    body('message').isString().withMessage('Message is required'),
    body('intermediateResults').optional().isObject(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      await processingService.handleProgressCallback({
        analysisId: req.body.analysisId,
        stage: req.body.stage,
        progress: req.body.progress,
        message: req.body.message,
        intermediateResults: req.body.intermediateResults,
      });

      res.json({
        success: true,
        message: 'Progress updated',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
);

export default router;
