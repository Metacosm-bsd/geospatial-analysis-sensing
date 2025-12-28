/**
 * useFileUpload Hook - Sprint 5-6
 * Custom hook for managing chunked file uploads with progress tracking
 */

import { useCallback, useRef, useEffect } from 'react';
import { useFileStore } from '../../store/fileStore';
import * as filesApi from '../../api/files';
import type {
  UploadFile,
  SupportedFileType,
  UseFileUploadReturn,
  ValidationResult,
  ChunkInfo,
} from './types';

// File extension mappings
const EXTENSION_TO_TYPE: Record<string, SupportedFileType> = {
  '.las': 'las',
  '.laz': 'laz',
  '.tif': 'tif',
  '.tiff': 'tiff',
  '.shp': 'shp',
  '.geojson': 'geojson',
  '.json': 'json',
};

const MIME_TYPE_MAP: Record<SupportedFileType | 'unknown', string> = {
  las: 'application/octet-stream',
  laz: 'application/octet-stream',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  shp: 'application/x-shapefile',
  geojson: 'application/geo+json',
  json: 'application/json',
  unknown: 'application/octet-stream',
};

const ACCEPTED_EXTENSIONS = ['.las', '.laz', '.tif', '.tiff', '.shp', '.geojson'];

// Generate unique ID for local file tracking
function generateFileId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Calculate file checksum using Web Crypto API
async function calculateChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Get file extension
function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex !== -1 ? filename.substring(lastDotIndex).toLowerCase() : '';
}

// Get file type from extension
function getFileType(filename: string): SupportedFileType | 'unknown' {
  const ext = getFileExtension(filename);
  return EXTENSION_TO_TYPE[ext] || 'unknown';
}

// Validate a single file
function validateFile(
  file: File,
  maxFileSize: number,
  acceptedTypes: SupportedFileType[]
): ValidationResult {
  const errors: string[] = [];
  const ext = getFileExtension(file.name);
  const fileType = getFileType(file.name);

  // Check file size
  if (file.size > maxFileSize) {
    const maxSizeGB = (maxFileSize / (1024 * 1024 * 1024)).toFixed(1);
    errors.push(`File size exceeds maximum of ${maxSizeGB}GB`);
  }

  // Check file type
  if (fileType === 'unknown' || !acceptedTypes.includes(fileType)) {
    errors.push(`File type ${ext || 'unknown'} is not supported. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Create chunk info array
function createChunks(fileSize: number, chunkSize: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  let start = 0;
  let index = 0;

  while (start < fileSize) {
    const end = Math.min(start + chunkSize, fileSize);
    chunks.push({
      index,
      start,
      end,
      size: end - start,
      uploaded: false,
      retries: 0,
    });
    start = end;
    index++;
  }

  return chunks;
}

interface UseFileUploadOptions {
  projectId: string;
  maxFileSize?: number;
  acceptedTypes?: SupportedFileType[];
  onUploadComplete?: (file: UploadFile) => void;
  onUploadError?: (file: UploadFile, error: Error) => void;
  onAllUploadsComplete?: () => void;
}

export function useFileUpload({
  projectId,
  maxFileSize = 10 * 1024 * 1024 * 1024, // 10GB default
  acceptedTypes = ['las', 'laz', 'tif', 'tiff', 'shp', 'geojson'],
  onUploadComplete,
  onUploadError,
  onAllUploadsComplete,
}: UseFileUploadOptions): UseFileUploadReturn {
  // Store access
  const {
    uploadingFiles,
    config,
    addUploadFile,
    updateUploadFile,
    removeUploadFile,
    clearUploadFiles,
    setUploadStatus,
    setUploadProgress,
    setUploadError,
    incrementRetryCount,
    addToQueue,
    removeFromQueue,
    addActiveUpload,
    removeActiveUpload,
    canStartNewUpload,
    getUploadingFilesArray,
    getOverallProgress,
    getIsUploading,
  } = useFileStore();

  // Refs for tracking abort controllers
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const pausedFiles = useRef<Set<string>>(new Set());

  // Clean up abort controllers on unmount
  useEffect(() => {
    return () => {
      abortControllers.current.forEach((controller) => controller.abort());
      abortControllers.current.clear();
    };
  }, []);

  // Add files to upload queue
  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);

      files.forEach((file) => {
        const validation = validateFile(file, maxFileSize, acceptedTypes);

        if (!validation.isValid) {
          // Create upload file entry with error status
          const uploadFile: UploadFile = {
            id: generateFileId(),
            file,
            filename: file.name,
            size: file.size,
            mimeType: file.type || MIME_TYPE_MAP[getFileType(file.name)] || 'application/octet-stream',
            fileType: getFileType(file.name),
            status: 'error',
            progress: 0,
            uploadedChunks: 0,
            totalChunks: 0,
            uploadSpeed: 0,
            estimatedTimeRemaining: 0,
            errorMessage: validation.errors.join('. '),
            retryCount: 0,
          };
          addUploadFile(uploadFile);
          return;
        }

        const totalChunks = Math.ceil(file.size / config.chunkSize);
        const fileType = getFileType(file.name);

        const uploadFile: UploadFile = {
          id: generateFileId(),
          file,
          filename: file.name,
          size: file.size,
          mimeType: file.type || MIME_TYPE_MAP[fileType] || 'application/octet-stream',
          fileType,
          status: 'pending',
          progress: 0,
          uploadedChunks: 0,
          totalChunks,
          uploadSpeed: 0,
          estimatedTimeRemaining: 0,
          retryCount: 0,
        };

        addUploadFile(uploadFile);
        addToQueue(uploadFile.id);
      });
    },
    [maxFileSize, acceptedTypes, config.chunkSize, addUploadFile, addToQueue]
  );

  // Remove file from list
  const removeFile = useCallback(
    (fileId: string) => {
      // Cancel if uploading
      const controller = abortControllers.current.get(fileId);
      if (controller) {
        controller.abort();
        abortControllers.current.delete(fileId);
      }

      removeFromQueue(fileId);
      removeActiveUpload(fileId);
      removeUploadFile(fileId);
      pausedFiles.current.delete(fileId);
    },
    [removeFromQueue, removeActiveUpload, removeUploadFile]
  );

  // Upload a single chunk
  const uploadChunk = useCallback(
    async (
      _fileId: string,
      serverId: string,
      chunkIndex: number,
      chunk: Blob,
      signal: AbortSignal
    ): Promise<boolean> => {
      try {
        await filesApi.uploadChunk(serverId, chunkIndex, chunk);
        return true;
      } catch (error) {
        if (signal.aborted) {
          return false;
        }
        throw error;
      }
    },
    []
  );

  // Start upload for a single file
  const startUpload = useCallback(
    async (fileId: string) => {
      const file = uploadingFiles[fileId];
      if (!file || file.status === 'uploading' || file.status === 'completed') {
        return;
      }

      // Create abort controller
      const controller = new AbortController();
      abortControllers.current.set(fileId, controller);

      setUploadStatus(fileId, 'initializing');
      addActiveUpload(fileId);
      removeFromQueue(fileId);

      try {
        // Initialize upload with server
        const initResponse = await filesApi.initUpload(
          projectId,
          file.filename,
          file.size,
          file.mimeType,
          file.totalChunks
        );

        // Store server ID
        updateUploadFile(fileId, { serverId: initResponse.fileId });

        setUploadStatus(fileId, 'uploading');

        // Create chunks
        const chunks = createChunks(file.size, config.chunkSize);
        let uploadedChunks = 0;
        const startTime = Date.now();
        let bytesUploaded = 0;

        // Upload chunks sequentially (can be modified for parallel)
        for (const chunk of chunks) {
          // Check if paused or cancelled
          if (controller.signal.aborted) {
            setUploadStatus(fileId, 'cancelled');
            return;
          }

          if (pausedFiles.current.has(fileId)) {
            setUploadStatus(fileId, 'paused');
            return;
          }

          const chunkBlob = file.file.slice(chunk.start, chunk.end);

          let retries = 0;
          let chunkUploaded = false;

          while (!chunkUploaded && retries < config.maxRetries) {
            try {
              await uploadChunk(fileId, initResponse.fileId, chunk.index, chunkBlob, controller.signal);
              chunkUploaded = true;
              uploadedChunks++;
              bytesUploaded += chunk.size;

              // Calculate progress and speed
              const progress = Math.round((uploadedChunks / file.totalChunks) * 100);
              const elapsedSeconds = (Date.now() - startTime) / 1000;
              const uploadSpeed = elapsedSeconds > 0 ? bytesUploaded / elapsedSeconds : 0;
              const remainingBytes = file.size - bytesUploaded;
              const estimatedTimeRemaining = uploadSpeed > 0 ? remainingBytes / uploadSpeed : 0;

              setUploadProgress(fileId, progress, uploadedChunks, uploadSpeed, estimatedTimeRemaining);
            } catch (error) {
              retries++;
              if (retries >= config.maxRetries) {
                throw error;
              }
              // Wait before retry
              await new Promise((resolve) => setTimeout(resolve, config.retryDelay * retries));
            }
          }
        }

        // Calculate checksum if enabled
        let checksum: string | undefined;
        if (config.calculateChecksum) {
          try {
            // For large files, skip full file checksum (too slow)
            if (file.size < 100 * 1024 * 1024) {
              // Only for files < 100MB
              checksum = await calculateChecksum(file.file);
            }
          } catch (e) {
            console.warn('Could not calculate checksum:', e);
          }
        }

        // Complete upload
        await filesApi.completeUpload(initResponse.fileId, checksum);

        if (checksum) {
          updateUploadFile(fileId, { checksum });
        }
        setUploadStatus(fileId, 'processing');

        // Poll for processing completion
        let processingComplete = false;
        let pollCount = 0;
        const maxPolls = 300; // 5 minutes with 1s interval

        while (!processingComplete && pollCount < maxPolls) {
          if (controller.signal.aborted) {
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollCount++;

          try {
            const status = await filesApi.getFileStatus(initResponse.fileId);

            if (status.status === 'ready') {
              processingComplete = true;
              setUploadStatus(fileId, 'completed');
              updateUploadFile(fileId, { completedAt: new Date() });

              const completedFile = uploadingFiles[fileId];
              if (onUploadComplete && completedFile) {
                onUploadComplete(completedFile);
              }
            } else if (status.status === 'error') {
              throw new Error(status.errorMessage || 'Processing failed');
            }
          } catch (error) {
            // Continue polling on transient errors
            console.warn('Status poll error:', error);
          }
        }

        if (!processingComplete) {
          setUploadStatus(fileId, 'completed');
          const completedFile = uploadingFiles[fileId];
          if (onUploadComplete && completedFile) {
            onUploadComplete(completedFile);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setUploadError(fileId, errorMessage);

        const errorFile = uploadingFiles[fileId];
        if (onUploadError && errorFile) {
          onUploadError(errorFile, error instanceof Error ? error : new Error(errorMessage));
        }
      } finally {
        removeActiveUpload(fileId);
        abortControllers.current.delete(fileId);

        // Check if all uploads are complete
        const allFiles = getUploadingFilesArray();
        const hasActiveUploads = allFiles.some(
          (f) => f.status === 'uploading' || f.status === 'pending' || f.status === 'processing'
        );

        if (!hasActiveUploads && onAllUploadsComplete) {
          onAllUploadsComplete();
        }
      }
    },
    [
      uploadingFiles,
      projectId,
      config,
      setUploadStatus,
      addActiveUpload,
      removeFromQueue,
      updateUploadFile,
      setUploadProgress,
      setUploadError,
      removeActiveUpload,
      uploadChunk,
      getUploadingFilesArray,
      onUploadComplete,
      onUploadError,
      onAllUploadsComplete,
    ]
  );

  // Start all pending uploads
  const startAllUploads = useCallback(async () => {
    const files = getUploadingFilesArray();
    const pendingFiles = files.filter((f) => f.status === 'pending');

    for (const file of pendingFiles) {
      if (canStartNewUpload()) {
        startUpload(file.id);
        // Small delay to prevent overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }, [getUploadingFilesArray, canStartNewUpload, startUpload]);

  // Pause upload
  const pauseUpload = useCallback(
    (fileId: string) => {
      pausedFiles.current.add(fileId);
      setUploadStatus(fileId, 'paused');
    },
    [setUploadStatus]
  );

  // Resume upload
  const resumeUpload = useCallback(
    (fileId: string) => {
      pausedFiles.current.delete(fileId);
      const file = uploadingFiles[fileId];

      if (file && file.status === 'paused') {
        startUpload(fileId);
      }
    },
    [uploadingFiles, startUpload]
  );

  // Cancel upload
  const cancelUpload = useCallback(
    (fileId: string) => {
      const controller = abortControllers.current.get(fileId);
      if (controller) {
        controller.abort();
      }

      const file = uploadingFiles[fileId];
      if (file?.serverId) {
        // Cancel on server
        filesApi.cancelUpload(file.serverId).catch(console.error);
      }

      setUploadStatus(fileId, 'cancelled');
      removeActiveUpload(fileId);
      pausedFiles.current.delete(fileId);
    },
    [uploadingFiles, setUploadStatus, removeActiveUpload]
  );

  // Retry failed upload
  const retryUpload = useCallback(
    async (fileId: string) => {
      const file = uploadingFiles[fileId];
      if (!file || (file.status !== 'error' && file.status !== 'cancelled')) {
        return;
      }

      // Reset file state - create a clean version without error/server state
      const resetUpdates: Partial<UploadFile> = {
        status: 'pending',
        progress: 0,
        uploadedChunks: 0,
      };
      // Remove the optional properties by not including them
      updateUploadFile(fileId, resetUpdates);
      incrementRetryCount(fileId);

      await startUpload(fileId);
    },
    [uploadingFiles, updateUploadFile, incrementRetryCount, startUpload]
  );

  // Clear completed uploads
  const clearCompleted = useCallback(() => {
    const files = getUploadingFilesArray();
    files.filter((f) => f.status === 'completed').forEach((f) => removeUploadFile(f.id));
  }, [getUploadingFilesArray, removeUploadFile]);

  // Clear all uploads
  const clearAll = useCallback(() => {
    // Cancel all active uploads
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    pausedFiles.current.clear();
    clearUploadFiles();
  }, [clearUploadFiles]);

  return {
    files: getUploadingFilesArray(),
    isUploading: getIsUploading(),
    overallProgress: getOverallProgress(),
    addFiles,
    removeFile,
    startUpload,
    startAllUploads,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    clearCompleted,
    clearAll,
  };
}

export default useFileUpload;
