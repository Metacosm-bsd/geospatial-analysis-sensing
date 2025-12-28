/**
 * AWS S3 Storage Adapter
 * Implements IStorageAdapter for production use with AWS S3
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart as S3CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
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
 * S3 adapter configuration
 */
export interface S3AdapterConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/**
 * Convert Readable stream to Buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/**
 * AWS S3 storage adapter
 */
export class S3StorageAdapter implements IStorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(config: S3AdapterConfig) {
    this.bucket = config.bucket;
    this.region = config.region;

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.region,
    };

    // Add credentials if provided (otherwise uses default credential chain)
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    // Support for S3-compatible services (MinIO, LocalStack, etc.)
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? true;
    }

    this.client = new S3Client(clientConfig);

    logger.info(`S3 storage adapter initialized for bucket: ${this.bucket}`);
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
      // Convert stream to buffer for single-part upload
      const data = Buffer.isBuffer(body) ? body : await streamToBuffer(body);

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
        StorageClass: options?.storageClass,
      });

      const response = await this.client.send(command);

      logger.debug(`S3: uploaded ${key} (${data.length} bytes)`);

      const result: CompleteUploadResult = {
        key,
        location: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(key)}`,
      };
      if (response.ETag !== undefined) result.eTag = response.ETag.replace(/"/g, '');
      return result;
    } catch (error) {
      logger.error(`S3: failed to upload ${key}`, error);
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
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
      });

      const response = await this.client.send(command);

      if (!response.UploadId) {
        throw new Error('Failed to get upload ID from S3');
      }

      logger.debug(`S3: initiated multipart upload ${response.UploadId} for ${key}`);

      return {
        uploadId: response.UploadId,
        key,
      };
    } catch (error) {
      logger.error(`S3: failed to initiate multipart upload for ${key}`, error);
      throw error;
    }
  }

  /**
   * Upload a single chunk
   */
  async uploadChunk(options: UploadChunkOptions): Promise<UploadChunkResult> {
    try {
      const { uploadId, key, partNumber, body } = options;

      // Convert stream to buffer if needed
      const data = Buffer.isBuffer(body) ? body : await streamToBuffer(body);

      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: data,
      });

      const response = await this.client.send(command);

      if (!response.ETag) {
        throw new Error('Failed to get ETag from S3');
      }

      logger.debug(
        `S3: uploaded part ${partNumber} for upload ${uploadId} (${data.length} bytes)`
      );

      return {
        eTag: response.ETag.replace(/"/g, ''),
        partNumber,
      };
    } catch (error) {
      logger.error(`S3: failed to upload chunk`, error);
      throw error;
    }
  }

  /**
   * Complete a multipart upload
   */
  async completeMultipartUpload(
    options: CompleteMultipartUploadOptions
  ): Promise<CompleteUploadResult> {
    try {
      const { uploadId, key, parts } = options;

      // Convert to S3 format
      const s3Parts: S3CompletedPart[] = parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((part) => ({
          ETag: `"${part.eTag}"`,
          PartNumber: part.partNumber,
        }));

      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: s3Parts,
        },
      });

      const response = await this.client.send(command);

      logger.debug(`S3: completed multipart upload ${uploadId} for ${key}`);

      const result: CompleteUploadResult = {
        key,
        location:
          response.Location ??
          `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(key)}`,
      };
      if (response.ETag !== undefined) result.eTag = response.ETag.replace(/"/g, '');
      return result;
    } catch (error) {
      logger.error(`S3: failed to complete multipart upload`, error);
      throw error;
    }
  }

  /**
   * Abort a multipart upload
   */
  async abortMultipartUpload(options: AbortMultipartUploadOptions): Promise<void> {
    try {
      const { uploadId, key } = options;

      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      });

      await this.client.send(command);

      logger.debug(`S3: aborted multipart upload ${uploadId}`);
    } catch (error) {
      logger.error(`S3: failed to abort multipart upload`, error);
      throw error;
    }
  }

  /**
   * Download a file
   */
  async download(key: string, options?: DownloadOptions): Promise<DownloadResult> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: options?.range,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error(`No body in S3 response for ${key}`);
      }

      const downloadResult: DownloadResult = {
        body: response.Body as Readable,
      };
      if (response.ContentType !== undefined) downloadResult.contentType = response.ContentType;
      if (response.ContentLength !== undefined) downloadResult.contentLength = response.ContentLength;
      if (response.Metadata !== undefined) downloadResult.metadata = response.Metadata;
      if (response.ETag !== undefined) downloadResult.eTag = response.ETag.replace(/"/g, '');
      return downloadResult;
    } catch (error) {
      logger.error(`S3: failed to download ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);

      logger.debug(`S3: deleted ${key}`);
    } catch (error) {
      logger.error(`S3: failed to delete ${key}`, error);
      throw error;
    }
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      const typedError = error as { name?: string };
      if (typedError.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<FileMetadata | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      const fileMeta: FileMetadata = {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
      };
      if (response.ContentType !== undefined) fileMeta.contentType = response.ContentType;
      if (response.ETag !== undefined) fileMeta.eTag = response.ETag.replace(/"/g, '');
      if (response.Metadata !== undefined) fileMeta.metadata = response.Metadata;
      return fileMeta;
    } catch (error: unknown) {
      const typedError = error as { name?: string };
      if (typedError.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Generate a signed URL
   */
  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    try {
      const expiresIn = options?.expiresIn ?? 3600;
      const method = options?.method ?? 'GET';

      let command;
      if (method === 'PUT') {
        command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: options?.contentType,
        });
      } else {
        command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
      }

      const url = await awsGetSignedUrl(this.client, command, { expiresIn });

      return url;
    } catch (error) {
      logger.error(`S3: failed to generate signed URL for ${key}`, error);
      throw error;
    }
  }

  /**
   * List files with a given prefix
   */
  async list(prefix: string, maxKeys = 1000): Promise<FileMetadata[]> {
    try {
      const results: FileMetadata[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: Math.min(maxKeys - results.length, 1000),
          ContinuationToken: continuationToken,
        });

        const response = await this.client.send(command);

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Key) {
              const fileMeta: FileMetadata = {
                key: object.Key,
                size: object.Size ?? 0,
                lastModified: object.LastModified ?? new Date(),
              };
              if (object.ETag !== undefined) fileMeta.eTag = object.ETag.replace(/"/g, '');
              results.push(fileMeta);
            }
          }
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken && results.length < maxKeys);

      return results;
    } catch (error) {
      logger.error(`S3: failed to list objects with prefix ${prefix}`, error);
      throw error;
    }
  }
}

export default S3StorageAdapter;
