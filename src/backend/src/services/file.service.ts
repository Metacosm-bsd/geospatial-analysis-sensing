/**
 * File Service - Handles file upload and management operations
 */
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { getStorageAdapter } from './storage/index.js';
import type { FileType, FileResponse } from '../types/dto.js';
import type { CompletedPart } from './storage/storage.interface.js';

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
 * Multipart upload session info
 */
export interface MultipartUploadSession {
  fileId: string;
  uploadId: string;
  storagePath: string;
  projectId: string;
  filename: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  parts: CompletedPart[];
  createdAt: Date;
}

/**
 * Chunk upload result
 */
export interface ChunkUploadResult {
  partNumber: number;
  eTag: string;
  uploadedChunks: number;
  totalChunks: number;
  progress: number;
}

/**
 * Upload status info
 */
export interface UploadStatus {
  fileId: string;
  filename: string;
  totalSize: number;
  uploadedSize: number;
  progress: number;
  totalChunks: number;
  uploadedChunks: number[];
  status: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * In-memory store for multipart upload sessions
 * In production, this should be stored in Redis for persistence
 */
const uploadSessions = new Map<string, MultipartUploadSession>();

/**
 * Get the storage adapter instance
 */
function getStorage() {
  return getStorageAdapter();
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
 * Uses the storage adapter to generate signed URLs
 */
export async function generateDownloadUrl(fileId: string, expiresIn = 3600): Promise<string> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    const storage = getStorage();
    return await storage.getSignedUrl(file.storagePath, {
      expiresIn,
      method: 'GET',
    });
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

// ============================================================================
// Multipart Upload Functions
// ============================================================================

/**
 * Initialize a multipart upload session
 */
export async function initMultipartUpload(
  projectId: string,
  filename: string,
  totalSize: number,
  mimeType?: string
): Promise<MultipartUploadSession> {
  try {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    // Validate file size
    if (totalSize > config.storage.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed (${config.storage.maxFileSize} bytes)`);
    }

    // Determine file type from extension
    const ext = path.extname(filename).toLowerCase();
    const fileType = FILE_TYPE_MAP[ext] || 'OTHER';
    const detectedMimeType = mimeType || MIME_TYPE_MAP[ext] || 'application/octet-stream';

    // Generate unique storage path
    const uniqueId = crypto.randomUUID();
    const sanitizedFilename = sanitizeFilename(filename);
    const storagePath = path.join(projectId, uniqueId, sanitizedFilename);

    // Create file record in pending state
    const file = await prisma.file.create({
      data: {
        name: filename,
        storagePath,
        mimeType: detectedMimeType,
        size: BigInt(totalSize),
        fileType,
        status: 'PENDING',
        projectId,
      },
    });

    // Initialize multipart upload with storage adapter
    const storage = getStorage();
    const { uploadId } = await storage.initMultipartUpload(storagePath, {
      contentType: detectedMimeType,
      metadata: {
        fileId: file.id,
        projectId,
        originalFilename: filename,
      },
    });

    // Calculate chunk info
    const chunkSize = config.storage.chunkSize;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    // Store session info
    const session: MultipartUploadSession = {
      fileId: file.id,
      uploadId,
      storagePath,
      projectId,
      filename,
      totalSize,
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      parts: [],
      createdAt: new Date(),
    };

    uploadSessions.set(file.id, session);

    logger.info(`Multipart upload initialized: ${file.id} for project: ${projectId} (${totalChunks} chunks)`);

    return session;
  } catch (error) {
    logger.error('Error initializing multipart upload:', error);
    throw error;
  }
}

/**
 * Upload a chunk of a file
 */
export async function uploadChunk(
  fileId: string,
  chunkIndex: number,
  data: Buffer | Readable
): Promise<ChunkUploadResult> {
  try {
    const session = uploadSessions.get(fileId);
    if (!session) {
      throw new Error(`Upload session not found for file: ${fileId}`);
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}. Expected 0-${session.totalChunks - 1}`);
    }

    // Check if chunk already uploaded
    if (session.uploadedChunks.includes(chunkIndex)) {
      const existingPart = session.parts.find((p) => p.partNumber === chunkIndex + 1);
      if (existingPart) {
        return {
          partNumber: chunkIndex + 1,
          eTag: existingPart.eTag,
          uploadedChunks: session.uploadedChunks.length,
          totalChunks: session.totalChunks,
          progress: (session.uploadedChunks.length / session.totalChunks) * 100,
        };
      }
    }

    // Upload chunk to storage
    const storage = getStorage();
    const partNumber = chunkIndex + 1; // S3 uses 1-based part numbers

    const result = await storage.uploadChunk({
      uploadId: session.uploadId,
      key: session.storagePath,
      partNumber,
      body: data,
    });

    // Update session
    session.uploadedChunks.push(chunkIndex);
    session.parts.push({
      partNumber: result.partNumber,
      eTag: result.eTag,
    });

    const progress = (session.uploadedChunks.length / session.totalChunks) * 100;

    logger.debug(
      `Chunk ${chunkIndex + 1}/${session.totalChunks} uploaded for file ${fileId} (${progress.toFixed(1)}%)`
    );

    return {
      partNumber: result.partNumber,
      eTag: result.eTag,
      uploadedChunks: session.uploadedChunks.length,
      totalChunks: session.totalChunks,
      progress,
    };
  } catch (error) {
    logger.error('Error uploading chunk:', error);
    throw error;
  }
}

/**
 * Complete a multipart upload
 */
export async function completeMultipartUpload(
  fileId: string,
  checksum?: string
): Promise<FileResponse> {
  try {
    const session = uploadSessions.get(fileId);
    if (!session) {
      throw new Error(`Upload session not found for file: ${fileId}`);
    }

    // Verify all chunks are uploaded
    if (session.uploadedChunks.length < session.totalChunks) {
      const missingChunks = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.uploadedChunks.includes(i)) {
          missingChunks.push(i);
        }
      }
      throw new Error(`Missing chunks: ${missingChunks.join(', ')}`);
    }

    // Complete the multipart upload
    const storage = getStorage();
    await storage.completeMultipartUpload({
      uploadId: session.uploadId,
      key: session.storagePath,
      parts: session.parts.sort((a, b) => a.partNumber - b.partNumber),
    });

    // Update file status to processing
    const file = await prisma.file.update({
      where: { id: fileId },
      data: {
        status: 'PROCESSING',
        checksum,
      },
    });

    // Clean up session
    uploadSessions.delete(fileId);

    logger.info(`Multipart upload completed for file: ${fileId}`);

    return file;
  } catch (error) {
    logger.error('Error completing multipart upload:', error);
    throw error;
  }
}

/**
 * Abort a multipart upload
 */
export async function abortMultipartUpload(fileId: string): Promise<void> {
  try {
    const session = uploadSessions.get(fileId);
    if (!session) {
      // Session might not exist, just clean up the database
      await prisma.file.delete({
        where: { id: fileId },
      });
      return;
    }

    // Abort the multipart upload in storage
    const storage = getStorage();
    await storage.abortMultipartUpload({
      uploadId: session.uploadId,
      key: session.storagePath,
    });

    // Delete the file record
    await prisma.file.delete({
      where: { id: fileId },
    });

    // Clean up session
    uploadSessions.delete(fileId);

    logger.info(`Multipart upload aborted for file: ${fileId}`);
  } catch (error) {
    logger.error('Error aborting multipart upload:', error);
    throw error;
  }
}

/**
 * Get upload status for a file
 */
export async function getUploadStatus(fileId: string): Promise<UploadStatus | null> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return null;
    }

    const session = uploadSessions.get(fileId);

    if (session) {
      // Active upload session
      const uploadedSize = session.uploadedChunks.length * session.chunkSize;
      const progress = (session.uploadedChunks.length / session.totalChunks) * 100;

      return {
        fileId: file.id,
        filename: file.name,
        totalSize: Number(file.size),
        uploadedSize: Math.min(uploadedSize, Number(file.size)),
        progress,
        totalChunks: session.totalChunks,
        uploadedChunks: session.uploadedChunks,
        status: file.status,
        createdAt: file.createdAt,
        expiresAt: new Date(session.createdAt.getTime() + 24 * 60 * 60 * 1000), // 24 hours
      };
    }

    // No active session, return file status
    return {
      fileId: file.id,
      filename: file.name,
      totalSize: Number(file.size),
      uploadedSize: file.status === 'PENDING' ? 0 : Number(file.size),
      progress: file.status === 'PENDING' ? 0 : 100,
      totalChunks: 0,
      uploadedChunks: [],
      status: file.status,
      createdAt: file.createdAt,
    };
  } catch (error) {
    logger.error('Error getting upload status:', error);
    throw error;
  }
}

/**
 * Download a file from storage
 */
export async function downloadFile(
  fileId: string
): Promise<{ stream: Readable; contentType: string; contentLength: number; filename: string }> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.status !== 'READY' && file.status !== 'PROCESSING') {
      throw new Error(`File is not ready for download. Current status: ${file.status}`);
    }

    const storage = getStorage();
    const result = await storage.download(file.storagePath);

    return {
      stream: result.body,
      contentType: result.contentType ?? file.mimeType,
      contentLength: result.contentLength ?? Number(file.size),
      filename: file.name,
    };
  } catch (error) {
    logger.error('Error downloading file:', error);
    throw error;
  }
}

/**
 * Generate an upload URL for direct upload (for smaller files)
 */
export async function generateUploadUrl(
  fileId: string,
  expiresIn = 3600
): Promise<string> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.status !== 'PENDING') {
      throw new Error(`Cannot generate upload URL for file with status: ${file.status}`);
    }

    const storage = getStorage();
    return await storage.getSignedUrl(file.storagePath, {
      expiresIn,
      method: 'PUT',
      contentType: file.mimeType,
    });
  } catch (error) {
    logger.error('Error generating upload URL:', error);
    throw error;
  }
}

/**
 * Upload a file directly (for smaller files, not chunked)
 */
export async function uploadFileDirect(
  fileId: string,
  data: Buffer | Readable
): Promise<FileResponse> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.status !== 'PENDING') {
      throw new Error(`Cannot upload to file with status: ${file.status}`);
    }

    const storage = getStorage();
    await storage.upload(file.storagePath, data, {
      contentType: file.mimeType,
      metadata: {
        fileId: file.id,
        projectId: file.projectId,
        originalFilename: file.name,
      },
    });

    // Update file status
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: {
        status: 'PROCESSING',
      },
    });

    logger.info(`Direct upload completed for file: ${fileId}`);

    return updatedFile;
  } catch (error) {
    logger.error('Error uploading file directly:', error);
    throw error;
  }
}

/**
 * Clean up expired multipart upload sessions
 */
export async function cleanupExpiredUploadSessions(maxAgeHours: number = 24): Promise<number> {
  const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let cleanedCount = 0;
  const storage = getStorage();

  for (const [fileId, session] of uploadSessions.entries()) {
    if (session.createdAt.getTime() < cutoffTime) {
      try {
        await storage.abortMultipartUpload({
          uploadId: session.uploadId,
          key: session.storagePath,
        });
        uploadSessions.delete(fileId);
        cleanedCount++;
      } catch (error) {
        logger.error(`Error cleaning up upload session ${fileId}:`, error);
      }
    }
  }

  logger.info(`Cleaned up ${cleanedCount} expired upload sessions`);
  return cleanedCount;
}

export const fileService = {
  // Basic file operations
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
  // Multipart upload operations
  initMultipartUpload,
  uploadChunk,
  completeMultipartUpload,
  abortMultipartUpload,
  getUploadStatus,
  downloadFile,
  generateUploadUrl,
  uploadFileDirect,
  cleanupExpiredUploadSessions,
};

export default fileService;
