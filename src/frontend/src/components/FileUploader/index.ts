/**
 * FileUploader Component - Sprint 5-6
 * Barrel export for file upload functionality
 */

// Main component
export { FileUploader } from './FileUploader';
export { default } from './FileUploader';

// Sub-component
export { FileUploadItem } from './FileUploadItem';

// Hook
export { useFileUpload } from './useFileUpload';

// Types
export type {
  // File types
  SupportedFileType,
  UploadStatus,
  UploadFile,
  ChunkInfo,

  // Config types
  UploadConfig,

  // API types
  InitUploadRequest,
  InitUploadResponse,
  UploadChunkRequest,
  UploadChunkResponse,
  CompleteUploadRequest,
  CompleteUploadResponse,
  FileStatusResponse,

  // Hook types
  UseFileUploadReturn,

  // Component prop types
  FileUploaderProps,
  FileUploadItemProps,

  // Utility types
  ValidationResult,
  UploadProgressEvent,
} from './types';

// Constants
export {
  FILE_TYPE_MAP,
  ACCEPTED_FILE_EXTENSIONS,
  DEFAULT_UPLOAD_CONFIG,
} from './types';
