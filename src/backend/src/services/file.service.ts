/**
 * File Service - Handles file upload and management operations
 */
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import type { FileType, FileResponse } from '../types/dto.js';

// Type alias for JSON values since Prisma types may not be generated
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

// File type mappings based on extension
const FILE_TYPE_MAP: Record<string, FileType> = {
  '.las': 'LAS',
  '.laz': 'LAZ',
  '.tif': 'GEOTIFF',
  '.tiff': 'GEOTIFF',
  '.geotiff': 'GEOTIFF',
  '.shp': 'SHAPEFILE',
  '.geojson': 'GEOJSON',
  '.json': 'GEOJSON',
};

// MIME type mappings
const MIME_TYPE_MAP: Record<string, string> = {
  '.las': 'application/vnd.las',
  '.laz': 'application/vnd.laszip',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.geotiff': 'image/tiff',
  '.shp': 'application/x-shapefile',
  '.geojson': 'application/geo+json',
  '.json': 'application/json',
};

interface UploadSession {
  id: string;
  projectId: string;
  filename: string;
  size: number;
  storagePath: string;
  fileType: FileType;
  mimeType: string;
  status: 'PENDING';
  createdAt: Date;
}

/**
 * Create an upload session for a file
 */
export async function createUploadSession(
  projectId: string,
  filename: string,
  size: number,
  mimeType?: string
): Promise<UploadSession> {
  try {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    // Validate file size
    if (size > config.storage.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed (${config.storage.maxFileSize} bytes)`);
    }

    // Determine file type from extension
    const ext = path.extname(filename).toLowerCase();
    const fileType = FILE_TYPE_MAP[ext] || 'OTHER';
    const detectedMimeType = mimeType || MIME_TYPE_MAP[ext] || 'application/octet-stream';

    // Generate unique storage path
    const uniqueId = crypto.randomUUID();
    const sanitizedFilename = sanitizeFilename(filename);
    const storagePath = path.join(
      projectId,
      uniqueId,
      sanitizedFilename
    );

    // Create file record in pending state
    const file = await prisma.file.create({
      data: {
        name: filename,
        storagePath,
        mimeType: detectedMimeType,
        size: BigInt(size),
        fileType,
        status: 'PENDING',
        projectId,
      },
    });

    logger.info(`Upload session created: ${file.id} for project: ${projectId}`);

    return {
      id: file.id,
      projectId,
      filename,
      size,
      storagePath,
      fileType,
      mimeType: detectedMimeType,
      status: 'PENDING',
      createdAt: file.createdAt,
    };
  } catch (error) {
    logger.error('Error creating upload session:', error);
    throw error;
  }
}

/**
 * Complete an upload and trigger validation
 */
export async function completeUpload(
  fileId: string,
  checksum?: string
): Promise<FileResponse> {
  try {
    // Find the file
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.status !== 'PENDING') {
      throw new Error(`Cannot complete upload: file status is ${file.status}`);
    }

    // Update file status to processing
    await prisma.file.update({
      where: { id: fileId },
      data: {
        status: 'PROCESSING',
        checksum,
      },
    });

    logger.info(`Upload completed, processing started: ${fileId}`);

    // In a real application, you would queue a processing job here
    // For now, we'll just mark it as ready after a brief delay simulation
    // await queueFileProcessing(fileId);

    // For demonstration, immediately mark as ready
    // In production, this would be done by the processing worker
    const readyFile = await prisma.file.update({
      where: { id: fileId },
      data: {
        status: 'READY',
        processedAt: new Date(),
      },
    });

    return readyFile;
  } catch (error) {
    logger.error('Error completing upload:', error);
    throw error;
  }
}

/**
 * Get file metadata by ID
 */
export async function getFileMetadata(fileId: string): Promise<FileResponse | null> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    return file;
  } catch (error) {
    logger.error('Error getting file metadata:', error);
    throw error;
  }
}

/**
 * Get file with project info for ownership verification
 */
export async function getFileWithProject(fileId: string) {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    return file;
  } catch (error) {
    logger.error('Error getting file with project:', error);
    throw error;
  }
}

/**
 * Delete a file from storage and database
 */
export async function deleteFile(fileId: string): Promise<void> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // In a real application, you would delete from storage here
    // await deleteFromStorage(file.storagePath);

    // Delete from database
    await prisma.file.delete({
      where: { id: fileId },
    });

    logger.info(`File deleted: ${fileId}`);
  } catch (error) {
    logger.error('Error deleting file:', error);
    throw error;
  }
}

/**
 * Update file processing status
 */
export async function updateFileStatus(
  fileId: string,
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR',
  error?: string
): Promise<FileResponse> {
  try {
    const updateData: Record<string, unknown> = {
      status,
      ...(status === 'READY' && { processedAt: new Date() }),
      ...(status === 'ERROR' && { processingError: error }),
    };

    const file = await prisma.file.update({
      where: { id: fileId },
      data: updateData,
    });

    logger.info(`File status updated: ${fileId} -> ${status}`);
    return file;
  } catch (error) {
    logger.error('Error updating file status:', error);
    throw error;
  }
}

/**
 * Update file metadata after processing
 */
export async function updateFileMetadata(
  fileId: string,
  metadata: {
    bounds?: unknown;
    crs?: string;
    pointCount?: number;
    resolution?: number;
    metadata?: unknown;
  }
): Promise<FileResponse> {
  try {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: {
        bounds: metadata.bounds as JsonValue,
        crs: metadata.crs,
        pointCount: metadata.pointCount ? BigInt(metadata.pointCount) : undefined,
        resolution: metadata.resolution,
        metadata: metadata.metadata as JsonValue,
      },
    });

    logger.info(`File metadata updated: ${fileId}`);
    return file;
  } catch (error) {
    logger.error('Error updating file metadata:', error);
    throw error;
  }
}

/**
 * Get files by project ID
 */
export async function getFilesByProject(projectId: string): Promise<FileResponse[]> {
  try {
    const files = await prisma.file.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return files;
  } catch (error) {
    logger.error('Error getting files by project:', error);
    throw error;
  }
}

/**
 * Get file owner ID (through project)
 */
export async function getFileOwnerId(fileId: string): Promise<string | null> {
  try {
    const file = await getFileWithProject(fileId);
    return file?.project?.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if user owns a file (through project ownership)
 */
export async function isFileOwner(fileId: string, userId: string): Promise<boolean> {
  try {
    const ownerId = await getFileOwnerId(fileId);
    return ownerId === userId;
  } catch {
    return false;
  }
}

/**
 * Generate a pre-signed URL for file download
 * In production, this would generate a cloud storage signed URL
 */
export async function generateDownloadUrl(fileId: string): Promise<string> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // In production, generate a signed URL from cloud storage
    // For now, return a placeholder
    const baseUrl = config.isDevelopment
      ? `http://localhost:${config.port}`
      : 'https://api.example.com';

    return `${baseUrl}/api/v1/files/${fileId}/download`;
  } catch (error) {
    logger.error('Error generating download URL:', error);
    throw error;
  }
}

/**
 * Clean up orphaned upload sessions (files that never completed)
 */
export async function cleanupOrphanedUploads(maxAgeHours: number = 24): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

    const result = await prisma.file.deleteMany({
      where: {
        status: 'PENDING',
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Cleaned up ${result.count} orphaned upload sessions`);
    return result.count;
  } catch (error) {
    logger.error('Error cleaning up orphaned uploads:', error);
    throw error;
  }
}

/**
 * Sanitize filename to prevent path traversal and invalid characters
 */
function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = path.basename(filename);

  // Replace problematic characters
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

/**
 * Validate file extension is allowed
 */
export function isAllowedFileType(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ext in FILE_TYPE_MAP;
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(FILE_TYPE_MAP);
}

export const fileService = {
  createUploadSession,
  completeUpload,
  getFileMetadata,
  getFileWithProject,
  deleteFile,
  updateFileStatus,
  updateFileMetadata,
  getFilesByProject,
  getFileOwnerId,
  isFileOwner,
  generateDownloadUrl,
  cleanupOrphanedUploads,
  isAllowedFileType,
  getSupportedExtensions,
};

export default fileService;
