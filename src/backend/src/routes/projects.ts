import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as projectService from '../services/project.service.js';
import {
  CreateProjectDtoSchema,
  UpdateProjectDtoSchema,
  ProjectFilterSchema,
  InitUploadDtoSchema,
} from '../types/dto.js';
import * as fileService from '../services/file.service.js';

const router = Router();

// All project routes require authentication
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
 * Middleware to validate query parameters with Zod schema
 */
const validateQuery = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.query = result.data as typeof req.query;
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
 * GET /api/v1/projects
 * List all projects for the authenticated user
 */
router.get(
  '/',
  validateQuery(ProjectFilterSchema),
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

      const filters = req.query as z.infer<typeof ProjectFilterSchema>;
      const result = await projectService.findAll(userId, filters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error('Error listing projects:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list projects',
        message: 'An error occurred while fetching projects',
      });
    }
  }
);

/**
 * POST /api/v1/projects
 * Create a new project
 */
router.post(
  '/',
  validateBody(CreateProjectDtoSchema),
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

      const project = await projectService.create(userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Project created successfully',
        data: project,
      });
    } catch (error) {
      logger.error('Error creating project:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create project',
        message: 'An error occurred while creating the project',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:id
 * Get a specific project by ID
 */
router.get(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const project = await projectService.findById(projectId);

      if (!project) {
        res.status(404).json({
          success: false,
          error: 'Project not found',
          message: 'The requested project does not exist',
        });
        return;
      }

      // Verify ownership (unless admin)
      if (project.userId !== userId && req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this project',
        });
        return;
      }

      // Get project statistics
      const stats = await projectService.getProjectStats(projectId);

      res.status(200).json({
        success: true,
        data: {
          ...project,
          stats,
        },
      });
    } catch (error) {
      logger.error('Error getting project:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get project',
        message: 'An error occurred while fetching the project',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:id
 * Update a project
 */
router.put(
  '/:id',
  validateUUID('id'),
  validateBody(UpdateProjectDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const project = await projectService.update(projectId, userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Project updated successfully',
        data: project,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      logger.error('Error updating project:', error);

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
          message: 'You do not have permission to update this project',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update project',
        message: 'An error occurred while updating the project',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:id
 * Delete or archive a project
 */
router.delete(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id;
      const hardDelete = req.query.permanent === 'true';

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      await projectService.delete(projectId, userId, hardDelete);

      res.status(200).json({
        success: true,
        message: hardDelete
          ? 'Project deleted permanently'
          : 'Project archived successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      logger.error('Error deleting project:', error);

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
          message: 'You do not have permission to delete this project',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete project',
        message: 'An error occurred while deleting the project',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:id/files
 * Initialize file upload for a project
 */
router.post(
  '/:id/files',
  validateUUID('id'),
  validateBody(InitUploadDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Verify ownership
      const isOwner = await projectService.isOwner(projectId, userId);
      if (!isOwner && req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to upload files to this project',
        });
        return;
      }

      const { filename, size, mimeType } = req.body;

      // Validate file type
      if (!fileService.isAllowedFileType(filename)) {
        res.status(400).json({
          success: false,
          error: 'Invalid file type',
          message: `Allowed file types: ${fileService.getSupportedExtensions().join(', ')}`,
        });
        return;
      }

      const uploadSession = await fileService.createUploadSession(
        projectId,
        filename,
        size,
        mimeType
      );

      res.status(201).json({
        success: true,
        message: 'Upload session created',
        data: {
          fileId: uploadSession.id,
          storagePath: uploadSession.storagePath,
          fileType: uploadSession.fileType,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload init failed';
      logger.error('Error initializing upload:', error);

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Project not found',
          message: 'The requested project does not exist',
        });
        return;
      }

      if (message.includes('exceeds maximum')) {
        res.status(400).json({
          success: false,
          error: 'File too large',
          message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to initialize upload',
        message: 'An error occurred while initializing the upload',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:id/files
 * List all files in a project
 */
router.get(
  '/:id/files',
  validateUUID('id'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Verify ownership
      const isOwner = await projectService.isOwner(projectId, userId);
      if (!isOwner && req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this project',
        });
        return;
      }

      const files = await fileService.getFilesByProject(projectId);

      // Convert BigInt to string for JSON serialization
      const serializedFiles = files.map((file) => ({
        ...file,
        size: file.size.toString(),
        pointCount: file.pointCount?.toString() ?? null,
      }));

      res.status(200).json({
        success: true,
        data: serializedFiles,
      });
    } catch (error) {
      logger.error('Error listing files:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list files',
        message: 'An error occurred while fetching files',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:id/stats
 * Get project statistics
 */
router.get(
  '/:id/stats',
  validateUUID('id'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Verify ownership
      const isOwner = await projectService.isOwner(projectId, userId);
      if (!isOwner && req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to access this project',
        });
        return;
      }

      const stats = await projectService.getProjectStats(projectId);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting project stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: 'An error occurred while fetching statistics',
      });
    }
  }
);

export default router;
