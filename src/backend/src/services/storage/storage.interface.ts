/**
 * Storage Adapter Interface
 * Defines the contract for storage adapters (local filesystem, S3, etc.)
 */

import type { Readable } from 'stream';

/**
 * Options for uploading a file
 */
export interface UploadOptions {
  /** Content type (MIME type) of the file */
  contentType?: string;
  /** Custom metadata to attach to the file */
  metadata?: Record<string, string>;
  /** Storage class for the file (S3-specific) */
  storageClass?: 'STANDARD' | 'INTELLIGENT_TIERING' | 'GLACIER';
}

/**
 * Options for initiating a multipart upload
 */
export interface InitMultipartUploadOptions {
  /** Content type (MIME type) of the file */
  contentType?: string;
  /** Custom metadata to attach to the file */
  metadata?: Record<string, string>;
}

/**
 * Result of initiating a multipart upload
 */
export interface InitMultipartUploadResult {
  /** Unique identifier for the multipart upload session */
  uploadId: string;
  /** The storage key/path where the file will be stored */
  key: string;
}

/**
 * Options for uploading a chunk
 */
export interface UploadChunkOptions {
  /** The multipart upload session ID */
  uploadId: string;
  /** The storage key/path */
  key: string;
  /** Chunk part number (1-indexed) */
  partNumber: number;
  /** The chunk data */
  body: Buffer | Readable;
}

/**
 * Result of uploading a chunk
 */
export interface UploadChunkResult {
  /** ETag of the uploaded chunk (used to verify and complete the upload) */
  eTag: string;
  /** The part number that was uploaded */
  partNumber: number;
}

/**
 * Represents a completed upload part
 */
export interface CompletedPart {
  /** ETag returned when the part was uploaded */
  eTag: string;
  /** The part number (1-indexed) */
  partNumber: number;
}

/**
 * Options for completing a multipart upload
 */
export interface CompleteMultipartUploadOptions {
  /** The multipart upload session ID */
  uploadId: string;
  /** The storage key/path */
  key: string;
  /** Array of completed parts */
  parts: CompletedPart[];
}

/**
 * Result of a complete upload
 */
export interface CompleteUploadResult {
  /** The final storage key/path */
  key: string;
  /** Location/URL of the uploaded file */
  location: string;
  /** ETag of the complete file */
  eTag?: string;
}

/**
 * Options for aborting a multipart upload
 */
export interface AbortMultipartUploadOptions {
  /** The multipart upload session ID */
  uploadId: string;
  /** The storage key/path */
  key: string;
}

/**
 * Options for downloading a file
 */
export interface DownloadOptions {
  /** Range of bytes to download (e.g., 'bytes=0-1023') */
  range?: string;
}

/**
 * Result of downloading a file
 */
export interface DownloadResult {
  /** The file content as a readable stream */
  body: Readable;
  /** Content type of the file */
  contentType?: string;
  /** Content length in bytes */
  contentLength?: number;
  /** File metadata */
  metadata?: Record<string, string>;
  /** ETag of the file */
  eTag?: string;
}

/**
 * Options for generating a signed URL
 */
export interface SignedUrlOptions {
  /** Expiration time in seconds (default: 3600) */
  expiresIn?: number;
  /** HTTP method the URL is valid for */
  method?: 'GET' | 'PUT';
  /** Content type for PUT operations */
  contentType?: string;
}

/**
 * File metadata from storage
 */
export interface FileMetadata {
  /** Storage key/path */
  key: string;
  /** File size in bytes */
  size: number;
  /** Last modified date */
  lastModified: Date;
  /** Content type */
  contentType?: string;
  /** ETag */
  eTag?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Storage adapter interface
 * All storage adapters must implement this interface
 */
export interface IStorageAdapter {
  /**
   * Upload a file in a single operation
   * @param key - Storage key/path for the file
   * @param body - File content
   * @param options - Upload options
   * @returns Promise resolving to the upload result
   */
  upload(
    key: string,
    body: Buffer | Readable,
    options?: UploadOptions
  ): Promise<CompleteUploadResult>;

  /**
   * Initialize a multipart upload session
   * @param key - Storage key/path for the file
   * @param options - Initialization options
   * @returns Promise resolving to the upload session info
   */
  initMultipartUpload(
    key: string,
    options?: InitMultipartUploadOptions
  ): Promise<InitMultipartUploadResult>;

  /**
   * Upload a single chunk of a multipart upload
   * @param options - Chunk upload options
   * @returns Promise resolving to the chunk upload result
   */
  uploadChunk(options: UploadChunkOptions): Promise<UploadChunkResult>;

  /**
   * Complete a multipart upload
   * @param options - Complete upload options
   * @returns Promise resolving to the final upload result
   */
  completeMultipartUpload(
    options: CompleteMultipartUploadOptions
  ): Promise<CompleteUploadResult>;

  /**
   * Abort a multipart upload
   * @param options - Abort options
   * @returns Promise resolving when abortion is complete
   */
  abortMultipartUpload(options: AbortMultipartUploadOptions): Promise<void>;

  /**
   * Download a file
   * @param key - Storage key/path of the file
   * @param options - Download options
   * @returns Promise resolving to the download result
   */
  download(key: string, options?: DownloadOptions): Promise<DownloadResult>;

  /**
   * Delete a file
   * @param key - Storage key/path of the file to delete
   * @returns Promise resolving when deletion is complete
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists
   * @param key - Storage key/path to check
   * @returns Promise resolving to true if file exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get file metadata
   * @param key - Storage key/path of the file
   * @returns Promise resolving to file metadata or null if not found
   */
  getMetadata(key: string): Promise<FileMetadata | null>;

  /**
   * Generate a signed URL for file access
   * @param key - Storage key/path of the file
   * @param options - Signed URL options
   * @returns Promise resolving to the signed URL
   */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;

  /**
   * List files with a given prefix
   * @param prefix - Storage key prefix to filter by
   * @param maxKeys - Maximum number of keys to return
   * @returns Promise resolving to array of file metadata
   */
  list(prefix: string, maxKeys?: number): Promise<FileMetadata[]>;
}

/**
 * Storage adapter type
 */
export type StorageType = 'local' | 's3';
