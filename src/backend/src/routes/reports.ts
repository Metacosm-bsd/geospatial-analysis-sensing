/**
 * Reports Routes - Sprint 11-12
 * API endpoints for report generation and management
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as reportService from '../services/report.service.js';

const router = Router();

// All report routes require authentication
router.use(authenticateToken);

// ============================================================================
// Validation Schemas
// ============================================================================

const ReportOptionsSchema = z.object({
  format: z.enum(['pdf', 'excel', 'both']),
  includeCharts: z.boolean().default(true),
  includeTreeList: z.boolean().default(true),
  includeMethodology: z.boolean().default(false),
  units: z.enum(['metric', 'imperial']).default('metric'),
  title: z.string().optional(),
});

const GenerateReportSchema = z.object({
  analysisId: z.string().uuid(),
  options: ReportOptionsSchema,
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
 * Middleware to validate format parameter
 */
const validateFormat = (req: Request, res: Response, next: NextFunction): void => {
  const format = req.params.format;
  if (format !== 'pdf' && format !== 'excel') {
    res.status(400).json({
      success: false,
      error: 'Invalid format',
      message: 'Format must be "pdf" or "excel"',
    });
    return;
  }
  next();
};

// ============================================================================
// Report Generation Endpoints
// ============================================================================

/**
 * POST /api/v1/reports/generate
 * Start report generation for an analysis
 */
router.post(
  '/generate',
  validateBody(GenerateReportSchema),
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

      const { analysisId, options } = req.body;

      const result = await reportService.generateReport(analysisId, options, userId);

      res.status(202).json({
        success: true,
        message: 'Report generation started',
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report generation failed';
      logger.error('Error generating report:', error);

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
          message: 'You do not have permission to generate a report for this analysis',
        });
        return;
      }

      if (message.includes('must be completed')) {
        res.status(400).json({
          success: false,
          error: 'Analysis not complete',
          message: 'Analysis must be completed before generating a report',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to generate report',
        message: 'An error occurred while starting report generation',
      });
    }
  }
);

// ============================================================================
// Report Retrieval Endpoints
// ============================================================================

/**
 * GET /api/v1/reports/:id
 * Get report metadata and status
 */
router.get(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const reportId = req.params.id!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const report = await reportService.getReportStatus(reportId, userId);

      if (!report) {
        res.status(404).json({
          success: false,
          error: 'Report not found',
          message: 'The requested report does not exist',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get report';
      logger.error('Error getting report:', error);

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this report',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get report',
        message: 'An error occurred while fetching the report',
      });
    }
  }
);

/**
 * GET /api/v1/reports/:id/download/:format
 * Get signed download URL for report file
 */
router.get(
  '/:id/download/:format',
  validateUUID('id'),
  validateFormat,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const reportId = req.params.id!;
      const format = req.params.format as 'pdf' | 'excel';

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const downloadInfo = await reportService.getReportDownloadUrl(reportId, format, userId);

      res.status(200).json({
        success: true,
        data: downloadInfo,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get download URL';
      logger.error('Error getting download URL:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Report not found',
          message: 'The requested report does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to download this report',
        });
        return;
      }

      if (message.includes('not ready')) {
        res.status(400).json({
          success: false,
          error: 'Report not ready',
          message: 'Report generation has not completed yet',
        });
        return;
      }

      if (message.includes('not available')) {
        res.status(404).json({
          success: false,
          error: 'Format not available',
          message: message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get download URL',
        message: 'An error occurred while generating the download URL',
      });
    }
  }
);

// ============================================================================
// Project Reports Endpoints
// ============================================================================

/**
 * GET /api/v1/projects/:projectId/reports
 * List all reports for a project
 */
router.get(
  '/projects/:projectId/reports',
  validateUUID('projectId'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.projectId!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const reports = await reportService.listProjectReports(projectId, userId);

      res.status(200).json({
        success: true,
        data: reports,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list reports';
      logger.error('Error listing reports:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Project not found',
          message: 'The requested project does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this project',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to list reports',
        message: 'An error occurred while fetching reports',
      });
    }
  }
);

// ============================================================================
// Report Deletion Endpoint
// ============================================================================

/**
 * DELETE /api/v1/reports/:id
 * Delete a report and its files
 */
router.delete(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const reportId = req.params.id!;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      await reportService.deleteReport(reportId, userId);

      res.status(200).json({
        success: true,
        message: 'Report deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete report';
      logger.error('Error deleting report:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Report not found',
          message: 'The requested report does not exist',
        });
        return;
      }

      if (message.includes('Access denied')) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to delete this report',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete report',
        message: 'An error occurred while deleting the report',
      });
    }
  }
);

export default router;
