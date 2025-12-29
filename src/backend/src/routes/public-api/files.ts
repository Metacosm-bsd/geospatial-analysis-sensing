/**
 * Public API - Files Routes
 * Sprint 49-54: Public API
 *
 * RESTful endpoints for file management via API key.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireScopes } from '../../middleware/ratelimit.js';

const router = Router();

// ============================================================================
// Schemas
// ============================================================================

const uploadFileSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().positive(),
  mimeType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const querySchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/files
 * List files
 */
router.get('/', requireScopes('read:files'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { projectId, limit, offset, status } = querySchema.parse(req.query);

    const where = {
      project: { userId },
      ...(projectId && { projectId }),
      ...(status && { status }),
    };

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          projectId: true,
          filename: true,
          originalFilename: true,
          fileSize: true,
          mimeType: true,
          status: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.file.count({ where }),
    ]);

    res.json({
      success: true,
      data: files,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + files.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/files/upload-url
 * Get a presigned URL for file upload
 */
router.post('/upload-url', requireScopes('write:files'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const data = uploadFileSchema.parse(req.body);

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

    // Create file record
    const file = await prisma.file.create({
      data: {
        projectId: data.projectId,
        filename: data.filename,
        originalFilename: data.filename,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        status: 'PENDING',
        metadata: data.metadata || {},
      },
    });

    // Generate upload URL (placeholder - would use S3 in production)
    const uploadUrl = `https://api.lidarforest.com/upload/${file.id}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    res.status(201).json({
      success: true,
      data: {
        fileId: file.id,
        uploadUrl,
        expiresAt: expiresAt.toISOString(),
        instructions: {
          method: 'PUT',
          headers: {
            'Content-Type': data.mimeType || 'application/octet-stream',
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/files/:fileId
 * Get file details
 */
router.get('/:fileId', requireScopes('read:files'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { fileId } = req.params;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        project: { userId },
      },
      select: {
        id: true,
        projectId: true,
        filename: true,
        originalFilename: true,
        fileSize: true,
        mimeType: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    res.json({
      success: true,
      data: file,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/files/:fileId/download-url
 * Get a presigned URL for file download
 */
router.get('/:fileId/download-url', requireScopes('read:files'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { fileId } = req.params;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        project: { userId },
      },
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    // Generate download URL (placeholder - would use S3 in production)
    const downloadUrl = `https://api.lidarforest.com/download/${file.id}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    res.json({
      success: true,
      data: {
        fileId: file.id,
        filename: file.originalFilename,
        downloadUrl,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/files/:fileId
 * Delete a file
 */
router.delete('/:fileId', requireScopes('delete:files'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { fileId } = req.params;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        project: { userId },
      },
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    // Soft delete
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'DELETED' },
    });

    res.json({
      success: true,
      message: 'File deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/files/:fileId/confirm
 * Confirm file upload completion
 */
router.post('/:fileId/confirm', requireScopes('write:files'), async (req, res, next) => {
  try {
    const userId = req.apiKey!.userId;
    const { fileId } = req.params;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        project: { userId },
      },
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    if (file.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'File is not in pending state',
      });
    }

    // Update status to processing
    const updated = await prisma.file.update({
      where: { id: fileId },
      data: { status: 'PROCESSING' },
      select: {
        id: true,
        filename: true,
        status: true,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'File upload confirmed. Processing will begin shortly.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
