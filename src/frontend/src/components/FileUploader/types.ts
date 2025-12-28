/**
 * FileUploader Types - Sprint 5-6
 * TypeScript types for chunked file upload functionality
 */

// Supported file types for geospatial data
export type SupportedFileType = 'las' | 'laz' | 'tif' | 'tiff' | 'shp' | 'geojson' | 'json';

// File extension to MIME type mapping
export const FILE_TYPE_MAP: Record<SupportedFileType, string> = {
  las: 'application/octet-stream',
  laz: 'application/octet-stream',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  shp: 'application/x-shapefile',
  geojson: 'application/geo+json',
  json: 'application/json',
};

// Accepted file extensions for validation
export const ACCEPTED_FILE_EXTENSIONS = ['.las', '.laz', '.tif', '.tiff', '.shp', '.geojson'];

// Upload status states
export type UploadStatus =
  | 'pending'
  | 'initializing'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'completed'
  | 'error'
  | 'cancelled';

// Individual file upload state
export interface UploadFile {
  id: string;
  file: File;
  filename: string;
  size: number;
  mimeType: string;
  fileType: SupportedFileType | 'unknown';
  status: UploadStatus;
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  uploadSpeed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
  checksum?: string;
  errorMessage?: string;
  retryCount: number;
  startedAt?: Date;
  completedAt?: Date;
  serverId?: string; // ID assigned by server after init
}

// Chunk upload tracking
export interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
  uploaded: boolean;
  retries: number;
}

// Upload configuration
export interface UploadConfig {
  chunkSize: number; // Default: 5MB
  maxConcurrentUploads: number;
  maxRetries: number;
  retryDelay: number; // milliseconds
  maxFileSize: number; // Default: 10GB
  calculateChecksum: boolean;
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  chunkSize: 5 * 1024 * 1024, // 5MB
  maxConcurrentUploads: 3,
  maxRetries: 3,
  retryDelay: 1000,
  maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
  calculateChecksum: true,
};

// API Request/Response types
export interface InitUploadRequest {
  projectId: string;
  filename: string;
  size: number;
  mimeType: string;
  totalChunks: number;
}

export interface InitUploadResponse {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface UploadChunkRequest {
  fileId: string;
  chunkIndex: number;
  chunk: Blob;
  checksum?: string;
}

export interface UploadChunkResponse {
  chunkIndex: number;
  received: boolean;
  bytesReceived: number;
}

export interface CompleteUploadRequest {
  fileId: string;
  checksum?: string;
}

export interface CompleteUploadResponse {
  fileId: string;
  filename: string;
  size: number;
  status: 'processing' | 'ready';
  processedAt?: string;
}

export interface FileStatusResponse {
  fileId: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  errorMessage?: string;
}

// Hook return types
export interface UseFileUploadReturn {
  // State
  files: UploadFile[];
  isUploading: boolean;
  overallProgress: number;

  // Actions
  addFiles: (files: FileList | File[]) => void;
  removeFile: (fileId: string) => void;
  startUpload: (fileId: string) => Promise<void>;
  startAllUploads: () => Promise<void>;
  pauseUpload: (fileId: string) => void;
  resumeUpload: (fileId: string) => void;
  cancelUpload: (fileId: string) => void;
  retryUpload: (fileId: string) => Promise<void>;
  clearCompleted: () => void;
  clearAll: () => void;
}

// Component prop types
export interface FileUploaderProps {
  projectId: string;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: SupportedFileType[];
  onUploadComplete?: (file: UploadFile) => void;
  onUploadError?: (file: UploadFile, error: Error) => void;
  onAllUploadsComplete?: () => void;
  disabled?: boolean;
  className?: string;
}

export interface FileUploadItemProps {
  file: UploadFile;
  onPause: (fileId: string) => void;
  onResume: (fileId: string) => void;
  onCancel: (fileId: string) => void;
  onRetry: (fileId: string) => void;
  onRemove: (fileId: string) => void;
}

// Utility types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface UploadProgressEvent {
  fileId: string;
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  uploadSpeed: number;
  estimatedTimeRemaining: number;
}
