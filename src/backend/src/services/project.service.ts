/**
 * Project Service - Handles project-related database operations
 */
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type {
  CreateProjectDto,
  UpdateProjectDto,
  ProjectFilter,
  ProjectResponse,
  PaginatedResult,
  CreateFileDto,
} from '../types/dto.js';

// Type alias for JSON values since Prisma types may not be generated
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

/**
 * Create a new project for a user
 */
export async function create(userId: string, data: CreateProjectDto): Promise<ProjectResponse> {
  try {
    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        bounds: data.bounds as JsonValue,
        metadata: data.metadata as JsonValue,
        userId,
      },
      include: {
        _count: {
          select: {
            files: true,
            analyses: true,
          },
        },
      },
    });

    logger.info(`Project created: ${project.id} by user: ${userId}`);
    return project;
  } catch (error) {
    logger.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Find all projects for a user with filtering and pagination
 */
export async function findAll(
  userId: string,
  filters: ProjectFilter
): Promise<PaginatedResult<ProjectResponse>> {
  try {
    const { page, limit, status, search, sortBy, sortOrder } = filters;
    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      userId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    // Build order by clause
    const orderBy = {
      [sortBy]: sortOrder,
    };

    // Execute queries in parallel
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
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

    const totalPages = Math.ceil(total / limit);

    logger.debug(`Found ${projects.length} projects for user: ${userId}`);

    return {
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  } catch (error) {
    logger.error('Error finding projects:', error);
    throw error;
  }
}

/**
 * Find a project by ID with related data
 */
export async function findById(id: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        files: {
          orderBy: { createdAt: 'desc' },
        },
        analyses: {
          orderBy: { createdAt: 'desc' },
          include: {
            resultFiles: true,
          },
        },
        _count: {
          select: {
            files: true,
            analyses: true,
          },
        },
      },
    });

    return project;
  } catch (error) {
    logger.error('Error finding project by ID:', error);
    throw error;
  }
}

/**
 * Find a project by ID (basic, for ownership checks)
 */
export async function findByIdBasic(id: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id },
    });

    return project;
  } catch (error) {
    logger.error('Error finding project by ID:', error);
    throw error;
  }
}

/**
 * Update a project (with ownership verification)
 */
export async function update(
  id: string,
  userId: string,
  data: UpdateProjectDto
): Promise<ProjectResponse> {
  try {
    // Verify ownership
    const existingProject = await findByIdBasic(id);
    if (!existingProject) {
      throw new Error('Project not found');
    }
    if (existingProject.userId !== userId) {
      throw new Error('Access denied: You do not own this project');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.bounds !== undefined) updateData.bounds = data.bounds as JsonValue;
    if (data.metadata !== undefined) updateData.metadata = data.metadata as JsonValue;

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            files: true,
            analyses: true,
          },
        },
      },
    });

    logger.info(`Project updated: ${project.id} by user: ${userId}`);
    return project;
  } catch (error) {
    logger.error('Error updating project:', error);
    throw error;
  }
}

/**
 * Delete a project (soft delete by archiving, or hard delete)
 */
export async function deleteProject(
  id: string,
  userId: string,
  hardDelete: boolean = false
): Promise<void> {
  try {
    // Verify ownership
    const existingProject = await findByIdBasic(id);
    if (!existingProject) {
      throw new Error('Project not found');
    }
    if (existingProject.userId !== userId) {
      throw new Error('Access denied: You do not own this project');
    }

    if (hardDelete) {
      // Hard delete - cascade will handle related records
      await prisma.project.delete({
        where: { id },
      });
      logger.info(`Project deleted (hard): ${id} by user: ${userId}`);
    } else {
      // Soft delete - archive the project
      await prisma.project.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
      logger.info(`Project archived: ${id} by user: ${userId}`);
    }
  } catch (error) {
    logger.error('Error deleting project:', error);
    throw error;
  }
}

/**
 * Add a file to a project
 */
export async function addFile(projectId: string, fileData: CreateFileDto) {
  try {
    // Verify project exists
    const project = await findByIdBasic(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const file = await prisma.file.create({
      data: {
        name: fileData.name,
        mimeType: fileData.mimeType,
        size: BigInt(fileData.size),
        fileType: fileData.fileType,
        storagePath: fileData.storagePath || '',
        checksum: fileData.checksum,
        projectId,
        status: 'PENDING',
      },
    });

    logger.info(`File added to project: ${file.id} -> ${projectId}`);
    return file;
  } catch (error) {
    logger.error('Error adding file to project:', error);
    throw error;
  }
}

/**
 * Get project files
 */
export async function getProjectFiles(projectId: string) {
  try {
    const files = await prisma.file.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return files;
  } catch (error) {
    logger.error('Error getting project files:', error);
    throw error;
  }
}

/**
 * Get project statistics
 */
export async function getProjectStats(projectId: string) {
  try {
    const [fileStats, analysisStats] = await Promise.all([
      prisma.file.groupBy({
        by: ['status'],
        where: { projectId },
        _count: true,
      }),
      prisma.analysis.groupBy({
        by: ['status'],
        where: { projectId },
        _count: true,
      }),
    ]);

    const totalFiles = fileStats.reduce((sum: number, stat: { _count: number }) => sum + stat._count, 0);
    const totalAnalyses = analysisStats.reduce((sum: number, stat: { _count: number }) => sum + stat._count, 0);

    return {
      files: {
        total: totalFiles,
        byStatus: Object.fromEntries(
          fileStats.map((stat: { status: string; _count: number }) => [stat.status, stat._count])
        ),
      },
      analyses: {
        total: totalAnalyses,
        byStatus: Object.fromEntries(
          analysisStats.map((stat: { status: string; _count: number }) => [stat.status, stat._count])
        ),
      },
    };
  } catch (error) {
    logger.error('Error getting project stats:', error);
    throw error;
  }
}

/**
 * Check if user owns a project
 */
export async function isOwner(projectId: string, userId: string): Promise<boolean> {
  try {
    const project = await findByIdBasic(projectId);
    return project?.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Get project owner ID
 */
export async function getOwnerId(projectId: string): Promise<string | null> {
  try {
    const project = await findByIdBasic(projectId);
    return project?.userId ?? null;
  } catch {
    return null;
  }
}

export const projectService = {
  create,
  findAll,
  findById,
  findByIdBasic,
  update,
  delete: deleteProject,
  addFile,
  getProjectFiles,
  getProjectStats,
  isOwner,
  getOwnerId,
};

export default projectService;
