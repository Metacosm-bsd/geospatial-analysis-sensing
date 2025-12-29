/**
 * Public API - Analyses Routes
 * Sprint 49-54: Public API
 *
 * RESTful endpoints for analysis management via API key.
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

const createAnalysisSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(['TREE_DETECTION', 'SPECIES_CLASSIFICATION', 'CARBON_ESTIMATE', 'FULL_INVENTORY']),
  fileIds: z.array(z.string().uuid()).min(1),
  parameters: z.record(z.unknown()).optional(),
});

const querySchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  type: z.enum(['TREE_DETECTION', 'SPECIES_CLASSIFICATION', 'CARBON_ESTIMATE', 'FULL_INVENTORY']).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/analyses
 * List analyses
 */
router.get('/', requireScopes('read:analyses'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId, limit, offset, status, type } = querySchema.parse(req.query);

    const where = {
      project: { userId },
      ...(projectId && { projectId }),
      ...(status && { status }),
      ...(type && { type }),
    };

    const [analyses, total] = await Promise.all([
      prisma.analysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
          status: true,
          progress: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.analysis.count({ where }),
    ]);

    res.json({
      success: true,
      data: analyses,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + analyses.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/analyses
 * Start a new analysis
 */
router.post('/', requireScopes('write:analyses'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const organizationId = req.apiKey!.organizationId;
    const data = createAnalysisSchema.parse(req.body);

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, userId },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Verify file ownership
    const files = await prisma.file.findMany({
      where: {
        id: { in: data.fileIds },
        projectId: data.projectId,
      },
    });

    if (files.length !== data.fileIds.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more files not found in the project',
      });
    }

    // Check files are ready
    const notReady = files.filter((f) => f.status !== 'COMPLETED');
    if (notReady.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'One or more files are not ready for analysis',
        filesNotReady: notReady.map((f) => ({ id: f.id, status: f.status })),
      });
    }

    // Create analysis
    const analysis = await prisma.analysis.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        type: data.type,
        status: 'PENDING',
        parameters: data.parameters || {},
        files: {
          connect: data.fileIds.map((id) => ({ id })),
        },
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        type: true,
        status: true,
        parameters: true,
        createdAt: true,
      },
    });

    // Trigger webhook
    await triggerWebhooks('analysis.started', {
      analysisId: analysis.id,
      projectId: analysis.projectId,
      name: analysis.name,
      type: analysis.type,
    }, { userId, organizationId });

    res.status(201).json({
      success: true,
      data: analysis,
      message: 'Analysis started. You will receive a webhook when it completes.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/analyses/:analysisId
 * Get analysis details
 */
router.get('/:analysisId', requireScopes('read:analyses'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { analysisId } = req.params;

    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        project: { userId },
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        type: true,
        status: true,
        progress: true,
        parameters: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        files: {
          select: {
            id: true,
            filename: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found',
      });
    }

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/analyses/:analysisId/results
 * Get analysis results
 */
router.get('/:analysisId/results', requireScopes('read:analyses'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { analysisId } = req.params;

    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        project: { userId },
      },
      select: {
        id: true,
        status: true,
        results: true,
        type: true,
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
        error: 'Analysis has not completed yet',
        status: analysis.status,
      });
    }

    res.json({
      success: true,
      data: {
        analysisId: analysis.id,
        type: analysis.type,
        results: analysis.results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/analyses/:analysisId
 * Cancel/delete an analysis
 */
router.delete('/:analysisId', requireScopes('delete:analyses'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { analysisId } = req.params;

    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        project: { userId },
      },
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found',
      });
    }

    // Can only cancel pending or processing analyses
    if (['PENDING', 'PROCESSING'].includes(analysis.status)) {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { status: 'CANCELLED' },
      });

      return res.json({
        success: true,
        message: 'Analysis cancelled',
      });
    }

    // Delete completed/failed analyses
    await prisma.analysis.delete({
      where: { id: analysisId },
    });

    res.json({
      success: true,
      message: 'Analysis deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/analyses/:analysisId/trees
 * Get detected trees from analysis
 */
router.get('/:analysisId/trees', requireScopes('read:inventory'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { analysisId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        project: { userId },
        status: 'COMPLETED',
      },
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found or not completed',
      });
    }

    // Get trees from analysis results
    const [trees, total] = await Promise.all([
      prisma.tree.findMany({
        where: { analysisId },
        take: limit,
        skip: offset,
        select: {
          id: true,
          species: true,
          dbh: true,
          height: true,
          crownDiameter: true,
          latitude: true,
          longitude: true,
          confidence: true,
          carbonStock: true,
        },
      }),
      prisma.tree.count({ where: { analysisId } }),
    ]);

    res.json({
      success: true,
      data: trees,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + trees.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/analyses/:analysisId/stands
 * Get stand summaries from analysis
 */
router.get('/:analysisId/stands', requireScopes('read:inventory'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { analysisId } = req.params;

    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        project: { userId },
        status: 'COMPLETED',
      },
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found or not completed',
      });
    }

    const stands = await prisma.stand.findMany({
      where: { analysisId },
      select: {
        id: true,
        name: true,
        areaHectares: true,
        treeCount: true,
        basalArea: true,
        volumePerHectare: true,
        dominantSpecies: true,
        meanDbh: true,
        meanHeight: true,
        carbonStockPerHectare: true,
      },
    });

    res.json({
      success: true,
      data: stands,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
