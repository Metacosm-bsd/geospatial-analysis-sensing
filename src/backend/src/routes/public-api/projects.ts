/**
 * Public API - Projects Routes
 * Sprint 49-54: Public API
 *
 * RESTful endpoints for project management via API key.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireScopes } from '../../middleware/ratelimit.js';

const router = Router();

// ============================================================================
// Schemas
// ============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/projects
 * List projects
 */
router.get('/', requireScopes('read:projects'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { limit, offset, search, sortBy, sortOrder } = querySchema.parse(req.query);

    const where = {
      userId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          description: true,
          location: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              files: true,
              analyses: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      success: true,
      data: projects.map((p) => ({
        ...p,
        fileCount: p._count.files,
        analysisCount: p._count.analyses,
        _count: undefined,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + projects.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/projects
 * Create a new project
 */
router.post('/', requireScopes('write:projects'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const data = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        location: data.location,
        metadata: data.metadata || {},
      },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/projects/:projectId
 * Get a specific project
 */
router.get('/:projectId', requireScopes('read:projects'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        files: {
          select: {
            id: true,
            filename: true,
            fileSize: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        analyses: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/projects/:projectId
 * Update a project
 */
router.patch('/:projectId', requireScopes('write:projects'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const existing = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        description: data.description,
        location: data.location,
        metadata: data.metadata,
      },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/projects/:projectId
 * Delete a project
 */
router.delete('/:projectId', requireScopes('delete:projects'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId } = req.params;

    const existing = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Soft delete by updating status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'DELETED' },
    });

    res.json({
      success: true,
      message: 'Project deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/projects/:projectId/summary
 * Get project summary statistics
 */
router.get('/:projectId/summary', requireScopes('read:projects'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        _count: {
          select: {
            files: true,
            analyses: true,
            reports: true,
          },
        },
        files: {
          select: { fileSize: true },
        },
        analyses: {
          where: { status: 'COMPLETED' },
          select: { id: true },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const totalFileSize = project.files.reduce((sum, f) => sum + (f.fileSize || 0), 0);

    res.json({
      success: true,
      data: {
        projectId: project.id,
        name: project.name,
        status: project.status,
        statistics: {
          fileCount: project._count.files,
          analysisCount: project._count.analyses,
          completedAnalyses: project.analyses.length,
          reportCount: project._count.reports,
          totalFileSizeBytes: totalFileSize,
        },
        timestamps: {
          created: project.createdAt,
          updated: project.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
