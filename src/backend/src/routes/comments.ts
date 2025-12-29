/**
 * Comments & Annotations Routes
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Handles comments on projects/analyses and 3D viewer annotations.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as commentService from '../services/comment.service.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  targetType: z.enum(['PROJECT', 'ANALYSIS', 'REPORT', 'FILE']),
  targetId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).optional(),
});

const UpdateCommentSchema = z.object({
  content: z.string().min(1).max(10000),
});

const CreateAnnotationSchema = z.object({
  analysisId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  cameraState: z.object({
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    target: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  }).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().default(true),
});

const UpdateAnnotationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().optional(),
});

// ============================================================================
// Middleware
// ============================================================================

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

// ============================================================================
// Comments
// ============================================================================

/**
 * GET /api/v1/comments
 * Get comments for a target (project, analysis, etc.)
 */
router.get(
  '/',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { targetType, targetId, limit = '50', offset = '0' } = req.query;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      if (!targetType || !targetId) {
        res.status(400).json({ success: false, error: 'targetType and targetId are required' });
        return;
      }

      const comments = await commentService.getComments(
        userId,
        targetType as string,
        targetId as string,
        parseInt(limit as string, 10),
        parseInt(offset as string, 10)
      );

      res.status(200).json({
        success: true,
        data: { comments },
      });
    } catch (error) {
      logger.error('Get comments error:', error);
      res.status(500).json({ success: false, error: 'Failed to get comments' });
    }
  }
);

/**
 * POST /api/v1/comments
 * Create a new comment
 */
router.post(
  '/',
  authenticateToken,
  validateBody(CreateCommentSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const comment = await commentService.createComment(userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Comment created successfully',
        data: { comment },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create comment';
      logger.error('Create comment error:', error);

      if (message.includes('permission') || message.includes('access')) {
        res.status(403).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * PATCH /api/v1/comments/:commentId
 * Update a comment
 */
router.patch(
  '/:commentId',
  authenticateToken,
  validateBody(UpdateCommentSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { commentId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const comment = await commentService.updateComment(commentId, userId, req.body.content);

      res.status(200).json({
        success: true,
        message: 'Comment updated successfully',
        data: { comment },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update comment';
      logger.error('Update comment error:', error);

      if (message.includes('permission') || message.includes('own')) {
        res.status(403).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * DELETE /api/v1/comments/:commentId
 * Delete a comment
 */
router.delete(
  '/:commentId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { commentId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await commentService.deleteComment(commentId, userId);

      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete comment';
      logger.error('Delete comment error:', error);

      if (message.includes('permission')) {
        res.status(403).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

// ============================================================================
// Annotations
// ============================================================================

/**
 * GET /api/v1/comments/annotations
 * Get annotations for an analysis
 */
router.get(
  '/annotations',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { analysisId } = req.query;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      if (!analysisId) {
        res.status(400).json({ success: false, error: 'analysisId is required' });
        return;
      }

      const annotations = await commentService.getAnnotations(userId, analysisId as string);

      res.status(200).json({
        success: true,
        data: { annotations },
      });
    } catch (error) {
      logger.error('Get annotations error:', error);
      res.status(500).json({ success: false, error: 'Failed to get annotations' });
    }
  }
);

/**
 * POST /api/v1/comments/annotations
 * Create a new annotation
 */
router.post(
  '/annotations',
  authenticateToken,
  validateBody(CreateAnnotationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const annotation = await commentService.createAnnotation(userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Annotation created successfully',
        data: { annotation },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create annotation';
      logger.error('Create annotation error:', error);
      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * PATCH /api/v1/comments/annotations/:annotationId
 * Update an annotation
 */
router.patch(
  '/annotations/:annotationId',
  authenticateToken,
  validateBody(UpdateAnnotationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { annotationId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const annotation = await commentService.updateAnnotation(annotationId, userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Annotation updated successfully',
        data: { annotation },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update annotation';
      logger.error('Update annotation error:', error);
      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * DELETE /api/v1/comments/annotations/:annotationId
 * Delete an annotation
 */
router.delete(
  '/annotations/:annotationId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { annotationId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await commentService.deleteAnnotation(annotationId, userId);

      res.status(200).json({
        success: true,
        message: 'Annotation deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete annotation';
      logger.error('Delete annotation error:', error);
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
