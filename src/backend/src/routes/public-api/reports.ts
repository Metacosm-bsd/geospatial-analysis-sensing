/**
 * Public API - Reports Routes
 * Sprint 49-54: Public API
 *
 * RESTful endpoints for report management via API key.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireScopes } from '../../middleware/ratelimit.js';
import { triggerWebhooks } from '../../services/webhook.service.js';

const router = Router();

// ============================================================================
// Schemas
// ============================================================================

const generateReportSchema = z.object({
  analysisId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(['INVENTORY', 'CARBON', 'TIMBER_VALUE', 'GROWTH_PROJECTION', 'FULL']),
  format: z.enum(['PDF', 'EXCEL', 'CSV', 'JSON']).default('PDF'),
  options: z.object({
    includeCharts: z.boolean().default(true),
    includeMaps: z.boolean().default(true),
    includeAppendix: z.boolean().default(false),
    language: z.string().default('en'),
    units: z.enum(['metric', 'imperial']).default('metric'),
  }).optional(),
});

const querySchema = z.object({
  projectId: z.string().uuid().optional(),
  analysisId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  type: z.enum(['INVENTORY', 'CARBON', 'TIMBER_VALUE', 'GROWTH_PROJECTION', 'FULL']).optional(),
  format: z.enum(['PDF', 'EXCEL', 'CSV', 'JSON']).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/reports
 * List reports
 */
router.get('/', requireScopes('read:reports'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId, analysisId, limit, offset, type, format } = querySchema.parse(req.query);

    const where = {
      analysis: {
        project: { userId },
        ...(projectId && { projectId }),
      },
      ...(analysisId && { analysisId }),
      ...(type && { type }),
      ...(format && { format }),
    };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          analysisId: true,
          name: true,
          type: true,
          format: true,
          status: true,
          fileSize: true,
          createdAt: true,
          expiresAt: true,
          analysis: {
            select: {
              projectId: true,
              name: true,
            },
          },
        },
      }),
      prisma.report.count({ where }),
    ]);

    res.json({
      success: true,
      data: reports.map((r) => ({
        ...r,
        projectId: r.analysis.projectId,
        analysisName: r.analysis.name,
        analysis: undefined,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + reports.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/reports
 * Generate a new report
 */
router.post('/', requireScopes('write:reports'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const organizationId = req.apiKey!.organizationId;
    const data = generateReportSchema.parse(req.body);

    // Verify analysis ownership and completion
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: data.analysisId,
        project: { userId },
      },
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found',
      });
    }

    if (analysis.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'Analysis must be completed before generating a report',
        analysisStatus: analysis.status,
      });
    }

    // Create report
    const report = await prisma.report.create({
      data: {
        analysisId: data.analysisId,
        name: data.name,
        type: data.type,
        format: data.format,
        status: 'GENERATING',
        options: data.options || {},
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      select: {
        id: true,
        analysisId: true,
        name: true,
        type: true,
        format: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    // Trigger webhook
    await triggerWebhooks('report.generated', {
      reportId: report.id,
      analysisId: report.analysisId,
      name: report.name,
      type: report.type,
      format: report.format,
    }, { userId, organizationId });

    res.status(201).json({
      success: true,
      data: report,
      message: 'Report generation started. You will receive a webhook when ready.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/reports/:reportId
 * Get report details
 */
router.get('/:reportId', requireScopes('read:reports'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        analysis: {
          project: { userId },
        },
      },
      select: {
        id: true,
        analysisId: true,
        name: true,
        type: true,
        format: true,
        status: true,
        fileSize: true,
        options: true,
        createdAt: true,
        generatedAt: true,
        expiresAt: true,
        analysis: {
          select: {
            id: true,
            name: true,
            projectId: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/reports/:reportId/download
 * Get download URL for a report
 */
router.get('/:reportId/download', requireScopes('read:reports'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const organizationId = req.apiKey!.organizationId;
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        analysis: {
          project: { userId },
        },
      },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    if (report.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'Report is not ready for download',
        status: report.status,
      });
    }

    // Check expiration
    if (report.expiresAt && new Date() > report.expiresAt) {
      return res.status(410).json({
        success: false,
        error: 'Report has expired',
        expiredAt: report.expiresAt.toISOString(),
      });
    }

    // Update download count
    await prisma.report.update({
      where: { id: reportId },
      data: { downloadCount: { increment: 1 } },
    });

    // Trigger webhook
    await triggerWebhooks('report.downloaded', {
      reportId: report.id,
      name: report.name,
    }, { userId, organizationId });

    // Generate download URL (placeholder - would use S3 in production)
    const downloadUrl = `https://api.lidarforest.com/downloads/reports/${report.id}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    res.json({
      success: true,
      data: {
        reportId: report.id,
        name: report.name,
        format: report.format,
        fileSize: report.fileSize,
        downloadUrl,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/reports/:reportId
 * Delete a report
 */
router.delete('/:reportId', requireScopes('write:reports'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        analysis: {
          project: { userId },
        },
      },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    await prisma.report.delete({
      where: { id: reportId },
    });

    res.json({
      success: true,
      message: 'Report deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/reports/types
 * Get available report types with descriptions
 */
router.get('/types/available', requireScopes('read:reports'), async (_req, res) => {
  res.json({
    success: true,
    data: {
      INVENTORY: {
        name: 'Forest Inventory Report',
        description: 'Complete tree inventory with species, DBH, height, and location data',
        formats: ['PDF', 'EXCEL', 'CSV', 'JSON'],
      },
      CARBON: {
        name: 'Carbon Stock Report',
        description: 'Carbon sequestration analysis with biomass calculations',
        formats: ['PDF', 'EXCEL', 'JSON'],
      },
      TIMBER_VALUE: {
        name: 'Timber Valuation Report',
        description: 'Estimated timber value based on species and market rates',
        formats: ['PDF', 'EXCEL'],
      },
      GROWTH_PROJECTION: {
        name: 'Growth Projection Report',
        description: 'Projected forest growth over time',
        formats: ['PDF', 'EXCEL'],
      },
      FULL: {
        name: 'Comprehensive Report',
        description: 'Complete analysis including inventory, carbon, and timber value',
        formats: ['PDF'],
      },
    },
  });
});

export default router;
