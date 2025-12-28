/**
 * Local Filesystem Storage Adapter
 * Implements IStorageAdapter for local development using the filesystem
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { logger } from '../../config/logger.js';
import type {
  IStorageAdapter,
  UploadOptions,
  InitMultipartUploadOptions,
  InitMultipartUploadResult,
  UploadChunkOptions,
  UploadChunkResult,
  CompleteMultipartUploadOptions,
  CompleteUploadResult,
  AbortMultipartUploadOptions,
  DownloadOptions,
  DownloadResult,
  SignedUrlOptions,
  FileMetadata,
} from './storage.interface.js';

/**
 * Metadata file structure for tracking multipart uploads
 */
interface MultipartUploadMetadata {
  uploadId: string;
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
  parts: Array<{
    partNumber: number;
    eTag: string;
    size: number;
  }>;
  createdAt: string;
}

/**
 * File metadata stored alongside files
 */
interface StoredFileMetadata {
  contentType?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  size: number;
}

/**
 * Local filesystem storage adapter
 */
export class LocalStorageAdapter implements IStorageAdapter {
  private readonly basePath: string;
  private readonly uploadsPath: string;
  private readonly metadataPath: string;
  private readonly baseUrl: string;

  constructor(basePath: string, baseUrl = 'http://localhost:3000') {
    this.basePath = path.resolve(basePath);
    this.uploadsPath = path.join(this.basePath, '.uploads');
    this.metadataPath = path.join(this.basePath, '.metadata');
    this.baseUrl = baseUrl;

    // Ensure directories exist
    this.ensureDirectoriesExist();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectoriesExist(): void {
    const dirs = [this.basePath, this.uploadsPath, this.metadataPath];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Get the full file path for a key
   */
  private getFilePath(key: string): string {
    // Sanitize key to prevent path traversal
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.basePath, sanitizedKey);
  }

  /**
   * Get the metadata file path for a key
   */
  private getMetadataFilePath(key: string): string {
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\/+/, '').replace(/\//g, '_');
    return path.join(this.metadataPath, `${sanitizedKey}.json`);
  }

  /**
   * Get the multipart upload directory for an upload session
   */
  private getMultipartDir(uploadId: string): string {
    return path.join(this.uploadsPath, uploadId);
  }

  /**
   * Calculate MD5 hash (used as ETag)
   */
  private calculateETag(data: Buffer): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Convert Readable stream to Buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Save file metadata
   */
  private async saveMetadata(key: string, metadata: StoredFileMetadata): Promise<void> {
    const metadataPath = this.getMetadataFilePath(key);
    await fsp.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load file metadata
   */
  private async loadMetadata(key: string): Promise<StoredFileMetadata | null> {
    try {
      const metadataPath = this.getMetadataFilePath(key);
      const content = await fsp.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as StoredFileMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Upload a file in a single operation
   */
  async upload(
    key: string,
    body: Buffer | Readable,
    options?: UploadOptions
  ): Promise<CompleteUploadResult> {
    try {
      const filePath = this.getFilePath(key);
      const dir = path.dirname(filePath);

      // Ensure directory exists
      await fsp.mkdir(dir, { recursive: true });

      // Convert stream to buffer if needed
      const data = Buffer.isBuffer(body) ? body : await this.streamToBuffer(body);

      // Write file
      await fsp.writeFile(filePath, data);

      // Save metadata
      const storedMeta: StoredFileMetadata = {
        createdAt: new Date().toISOString(),
        size: data.length,
      };
      if (options?.contentType !== undefined) storedMeta.contentType = options.contentType;
      if (options?.metadata !== undefined) storedMeta.metadata = options.metadata;
      await this.saveMetadata(key, storedMeta);

      const eTag = this.calculateETag(data);

      logger.debug(`Local storage: uploaded ${key} (${data.length} bytes)`);

      return {
        key,
        location: `${this.baseUrl}/files/${encodeURIComponent(key)}`,
        eTag,
      };
    } catch (error) {
      logger.error(`Local storage: failed to upload ${key}`, error);
      throw error;
    }
  }

  /**
   * Initialize a multipart upload session
   */
  async initMultipartUpload(
    key: string,
    options?: InitMultipartUploadOptions
  ): Promise<InitMultipartUploadResult> {
    const uploadId = crypto.randomUUID();
    const uploadDir = this.getMultipartDir(uploadId);

    // Create upload directory
    await fsp.mkdir(uploadDir, { recursive: true });

    // Save upload metadata
    const metadata: MultipartUploadMetadata = {
      uploadId,
      key,
      parts: [],
      createdAt: new Date().toISOString(),
    };
    if (options?.contentType !== undefined) metadata.contentType = options.contentType;
    if (options?.metadata !== undefined) metadata.metadata = options.metadata;

    await fsp.writeFile(
      path.join(uploadDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    logger.debug(`Local storage: initiated multipart upload ${uploadId} for ${key}`);

    return { uploadId, key };
  }

  /**
   * Upload a single chunk
   */
  async uploadChunk(options: UploadChunkOptions): Promise<UploadChunkResult> {
    const { uploadId, partNumber, body } = options;
    const uploadDir = this.getMultipartDir(uploadId);

    // Verify upload exists
    const metadataPath = path.join(uploadDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Multipart upload ${uploadId} not found`);
    }

    // Convert stream to buffer if needed
    const data = Buffer.isBuffer(body) ? body : await this.streamToBuffer(body);

    // Write chunk
    const chunkPath = path.join(uploadDir, `part-${partNumber.toString().padStart(5, '0')}`);
    await fsp.writeFile(chunkPath, data);

    const eTag = this.calculateETag(data);

    // Update metadata
    const metadataContent = await fsp.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as MultipartUploadMetadata;

    // Remove existing part if re-uploading
    metadata.parts = metadata.parts.filter((p) => p.partNumber !== partNumber);
    metadata.parts.push({ partNumber, eTag, size: data.length });
    metadata.parts.sort((a, b) => a.partNumber - b.partNumber);

    await fsp.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    logger.debug(
      `Local storage: uploaded chunk ${partNumber} for upload ${uploadId} (${data.length} bytes)`
    );

    return { eTag, partNumber };
  }

  /**
   * Complete a multipart upload
   */
  async completeMultipartUpload(
    options: CompleteMultipartUploadOptions
  ): Promise<CompleteUploadResult> {
    const { uploadId, key, parts } = options;
    const uploadDir = this.getMultipartDir(uploadId);

    // Load upload metadata
    const metadataPath = path.join(uploadDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Multipart upload ${uploadId} not found`);
    }

    const metadataContent = await fsp.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as MultipartUploadMetadata;

    // Verify all parts are present
    const uploadedParts = new Map(metadata.parts.map((p) => [p.partNumber, p]));
    for (const part of parts) {
      const uploadedPart = uploadedParts.get(part.partNumber);
      if (!uploadedPart) {
        throw new Error(`Part ${part.partNumber} not found`);
      }
      if (uploadedPart.eTag !== part.eTag) {
        throw new Error(`ETag mismatch for part ${part.partNumber}`);
      }
    }

    // Combine all chunks
    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });

    const writeStream = fs.createWriteStream(filePath);
    let totalSize = 0;

    // Sort parts by part number and combine
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    for (const part of sortedParts) {
      const chunkPath = path.join(
        uploadDir,
        `part-${part.partNumber.toString().padStart(5, '0')}`
      );
      const chunkData = await fsp.readFile(chunkPath);
      writeStream.write(chunkData);
      totalSize += chunkData.length;
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    // Calculate final ETag
    const fileData = await fsp.readFile(filePath);
    const eTag = this.calculateETag(fileData);

    // Save file metadata
    const storedMeta: StoredFileMetadata = {
      createdAt: new Date().toISOString(),
      size: totalSize,
    };
    if (metadata.contentType !== undefined) storedMeta.contentType = metadata.contentType;
    if (metadata.metadata !== undefined) storedMeta.metadata = metadata.metadata;
    await this.saveMetadata(key, storedMeta);

    // Clean up upload directory
    await fsp.rm(uploadDir, { recursive: true, force: true });

    logger.debug(
      `Local storage: completed multipart upload ${uploadId} for ${key} (${totalSize} bytes)`
    );

    return {
      key,
      location: `${this.baseUrl}/files/${encodeURIComponent(key)}`,
      eTag,
    };
  }

  /**
   * Abort a multipart upload
   */
  async abortMultipartUpload(options: AbortMultipartUploadOptions): Promise<void> {
    const { uploadId } = options;
    const uploadDir = this.getMultipartDir(uploadId);

    if (fs.existsSync(uploadDir)) {
      await fsp.rm(uploadDir, { recursive: true, force: true });
      logger.debug(`Local storage: aborted multipart upload ${uploadId}`);
    }
  }

  /**
   * Download a file
   */
  async download(key: string, options?: DownloadOptions): Promise<DownloadResult> {
    const filePath = this.getFilePath(key);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }

    const stats = await fsp.stat(filePath);
    const metadata = await this.loadMetadata(key);

    let readStream: Readable;

    if (options?.range) {
      // Parse range header
      const rangeMatch = options.range.match(/bytes=(\d+)-(\d*)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1] ?? '0', 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : stats.size - 1;
        readStream = fs.createReadStream(filePath, { start, end });
      } else {
        readStream = fs.createReadStream(filePath);
      }
    } else {
      readStream = fs.createReadStream(filePath);
    }

    const fileData = await fsp.readFile(filePath);
    const eTag = this.calculateETag(fileData);

    const downloadResult: DownloadResult = {
      body: readStream,
      contentType: metadata?.contentType ?? 'application/octet-stream',
      contentLength: stats.size,
      eTag,
    };
    if (metadata?.metadata !== undefined) downloadResult.metadata = metadata.metadata;
    return downloadResult;
  }

  /**
   * Delete a file
   */
  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const metadataFilePath = this.getMetadataFilePath(key);

    try {
      if (fs.existsSync(filePath)) {
        await fsp.unlink(filePath);
      }
      if (fs.existsSync(metadataFilePath)) {
        await fsp.unlink(metadataFilePath);
      }
      logger.debug(`Local storage: deleted ${key}`);
    } catch (error) {
      logger.error(`Local storage: failed to delete ${key}`, error);
      throw error;
    }
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<FileMetadata | null> {
    const filePath = this.getFilePath(key);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const stats = await fsp.stat(filePath);
      const storedMetadata = await this.loadMetadata(key);
      const fileData = await fsp.readFile(filePath);

      const fileMeta: FileMetadata = {
        key,
        size: stats.size,
        lastModified: stats.mtime,
        eTag: this.calculateETag(fileData),
      };
      if (storedMetadata?.contentType !== undefined) fileMeta.contentType = storedMetadata.contentType;
      if (storedMetadata?.metadata !== undefined) fileMeta.metadata = storedMetadata.metadata;
      return fileMeta;
    } catch {
      return null;
    }
  }

  /**
   * Generate a signed URL (for local dev, returns a simple URL)
   */
  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    // For local development, we generate a simple signed token
    const expiresIn = options?.expiresIn ?? 3600;
    const expiresAt = Date.now() + expiresIn * 1000;
    const method = options?.method ?? 'GET';

    // Create a simple signature
    const payload = `${key}:${method}:${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', 'local-dev-secret')
      .update(payload)
      .digest('hex');

    const params = new URLSearchParams({
      expires: expiresAt.toString(),
      signature,
    });

    return `${this.baseUrl}/files/${encodeURIComponent(key)}?${params.toString()}`;
  }

  /**
   * List files with a given prefix
   */
  async list(prefix: string, maxKeys = 1000): Promise<FileMetadata[]> {
    const results: FileMetadata[] = [];
    const baseDir = this.getFilePath(prefix);

    if (!fs.existsSync(baseDir)) {
      return results;
    }

    const walkDir = async (dir: string): Promise<void> => {
      if (results.length >= maxKeys) return;

      const entries = await fsp.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxKeys) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories
          if (!entry.name.startsWith('.')) {
            await walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          const relativePath = path.relative(this.basePath, fullPath);
          const metadata = await this.getMetadata(relativePath);
          if (metadata) {
            results.push(metadata);
          }
        }
      }
    };

    try {
      const stats = await fsp.stat(baseDir);
      if (stats.isDirectory()) {
        await walkDir(baseDir);
      } else {
        const metadata = await this.getMetadata(prefix);
        if (metadata) {
          results.push(metadata);
        }
      }
    } catch {
      // Directory doesn't exist or error reading
    }

    return results;
  }
}

export default LocalStorageAdapter;
