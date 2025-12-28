/**
 * FileUploader Component - Sprint 5-6
 * Main file upload component with drag-and-drop support
 */

import React, { useCallback, useState, useRef, useMemo } from 'react';
import { useFileUpload } from './useFileUpload';
import { FileUploadItem } from './FileUploadItem';
import type { FileUploaderProps, SupportedFileType } from './types';

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// File type display names
const FILE_TYPE_LABELS: Record<SupportedFileType, string> = {
  las: 'LAS',
  laz: 'LAZ',
  tif: 'TIF',
  tiff: 'TIFF',
  shp: 'SHP',
  geojson: 'GeoJSON',
  json: 'JSON',
};

// Cloud upload icon
function CloudUploadIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
      />
    </svg>
  );
}

// Check icon for completed state
function CheckCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export function FileUploader({
  projectId,
  maxFiles = 10,
  maxFileSize = 10 * 1024 * 1024 * 1024, // 10GB
  acceptedFileTypes = ['las', 'laz', 'tif', 'tiff', 'shp', 'geojson'],
  onUploadComplete,
  onUploadError,
  onAllUploadsComplete,
  disabled = false,
  className = '',
}: FileUploaderProps) {
  // Drag state
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload hook
  const {
    files,
    isUploading,
    overallProgress,
    addFiles,
    removeFile,
    startAllUploads,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    clearCompleted,
    clearAll,
  } = useFileUpload({
    projectId,
    maxFileSize,
    acceptedTypes: acceptedFileTypes,
    ...(onUploadComplete && { onUploadComplete }),
    ...(onUploadError && { onUploadError }),
    ...(onAllUploadsComplete && { onAllUploadsComplete }),
  });

  // Accept string for file input
  const acceptString = useMemo(() => {
    const extensions = acceptedFileTypes.map((type) => `.${type}`);
    return extensions.join(',');
  }, [acceptedFileTypes]);

  // File type labels for display
  const fileTypeLabels = useMemo(() => {
    return acceptedFileTypes.map((type) => FILE_TYPE_LABELS[type] || type.toUpperCase()).join(', ');
  }, [acceptedFileTypes]);

  // Stats
  const stats = useMemo(() => {
    const pending = files.filter((f) => f.status === 'pending').length;
    const uploading = files.filter((f) => ['uploading', 'initializing'].includes(f.status)).length;
    const completed = files.filter((f) => f.status === 'completed').length;
    const failed = files.filter((f) => f.status === 'error').length;
    const processing = files.filter((f) => f.status === 'processing').length;

    return { pending, uploading, completed, failed, processing, total: files.length };
  }, [files]);

  // Handle drag events
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounterRef.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragActive(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      dragCounterRef.current = 0;

      if (disabled) return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles && droppedFiles.length > 0) {
        // Check max files limit
        const remainingSlots = maxFiles - files.length;
        if (remainingSlots <= 0) {
          alert(`Maximum ${maxFiles} files allowed`);
          return;
        }

        const filesToAdd = Array.from(droppedFiles).slice(0, remainingSlots);
        addFiles(filesToAdd);
      }
    },
    [disabled, files.length, maxFiles, addFiles]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        const remainingSlots = maxFiles - files.length;
        if (remainingSlots <= 0) {
          alert(`Maximum ${maxFiles} files allowed`);
          return;
        }

        const filesToAdd = Array.from(selectedFiles).slice(0, remainingSlots);
        addFiles(filesToAdd);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [files.length, maxFiles, addFiles]
  );

  // Open file dialog
  const openFileDialog = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  // Handle upload all
  const handleUploadAll = useCallback(() => {
    startAllUploads();
  }, [startAllUploads]);

  // Check if can add more files
  const canAddFiles = files.length < maxFiles && !disabled;

  return (
    <div className={`w-full ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptString}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={canAddFiles ? openFileDialog : undefined}
        className={`
          relative border-2 border-dashed rounded-xl p-8 transition-all duration-200
          ${isDragActive
            ? 'border-forest-500 bg-forest-50'
            : disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 bg-white hover:border-forest-400 hover:bg-gray-50 cursor-pointer'
          }
        `}
      >
        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 bg-forest-500/10 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <CloudUploadIcon className="w-12 h-12 text-forest-500 mx-auto mb-2" />
              <p className="text-forest-700 font-medium">Drop files here</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={`text-center ${isDragActive ? 'invisible' : ''}`}>
          <CloudUploadIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />

          <div className="mb-2">
            <span className="text-gray-700 font-medium">Drop files here or </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFileDialog();
              }}
              disabled={!canAddFiles}
              className="text-forest-600 font-medium hover:text-forest-700 disabled:text-gray-400"
            >
              browse
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-1">
            Supported formats: {fileTypeLabels}
          </p>

          <p className="text-xs text-gray-400">
            Maximum file size: {formatBytes(maxFileSize)} | Up to {maxFiles} files
          </p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4">
          {/* Header with stats and actions */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-700 font-medium">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>

              {stats.uploading > 0 && (
                <span className="text-blue-600">
                  {stats.uploading} uploading
                </span>
              )}

              {stats.processing > 0 && (
                <span className="text-purple-600">
                  {stats.processing} processing
                </span>
              )}

              {stats.completed > 0 && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4" />
                  {stats.completed} ready
                </span>
              )}

              {stats.failed > 0 && (
                <span className="text-red-600">
                  {stats.failed} failed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Start all uploads button */}
              {stats.pending > 0 && !isUploading && (
                <button
                  type="button"
                  onClick={handleUploadAll}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-forest-600 rounded-md hover:bg-forest-700 transition-colors"
                >
                  Upload All ({stats.pending})
                </button>
              )}

              {/* Clear completed button */}
              {stats.completed > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Clear Completed
                </button>
              )}

              {/* Clear all button */}
              {files.length > 0 && !isUploading && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Overall progress bar */}
          {isUploading && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1 text-sm">
                <span className="text-gray-600">Overall Progress</span>
                <span className="text-gray-700 font-medium">{overallProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-forest-500 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* File list */}
          <div className="space-y-2">
            {files.map((file) => (
              <FileUploadItem
                key={file.id}
                file={file}
                onPause={pauseUpload}
                onResume={resumeUpload}
                onCancel={cancelUpload}
                onRetry={retryUpload}
                onRemove={removeFile}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default FileUploader;
