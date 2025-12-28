/**
 * FileUploadItem Component - Sprint 5-6
 * Displays individual file upload progress with controls
 */

import React, { useMemo } from 'react';
import type { FileUploadItemProps, UploadStatus, SupportedFileType } from './types';

// Format bytes to human readable string
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format seconds to human readable time
function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// Get file type icon based on extension
function FileTypeIcon({ fileType, className = '' }: { fileType: SupportedFileType | 'unknown'; className?: string }) {
  const iconClass = `${className} flex-shrink-0`;

  switch (fileType) {
    case 'las':
    case 'laz':
      // Point cloud icon
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="6" cy="8" r="1" fill="currentColor" />
          <circle cx="18" cy="8" r="1" fill="currentColor" />
          <circle cx="8" cy="16" r="1" fill="currentColor" />
          <circle cx="16" cy="16" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="0.75" fill="currentColor" />
          <circle cx="20" cy="12" r="0.75" fill="currentColor" />
          <circle cx="12" cy="4" r="0.75" fill="currentColor" />
          <circle cx="12" cy="20" r="0.75" fill="currentColor" />
          <circle cx="8" cy="6" r="0.5" fill="currentColor" />
          <circle cx="16" cy="6" r="0.5" fill="currentColor" />
          <circle cx="5" cy="16" r="0.5" fill="currentColor" />
          <circle cx="19" cy="16" r="0.5" fill="currentColor" />
        </svg>
      );
    case 'tif':
    case 'tiff':
      // Raster/image icon
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
          <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'shp':
      // Vector/polygon icon
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" strokeLinejoin="round" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="2" y1="8.5" x2="22" y2="8.5" />
        </svg>
      );
    case 'geojson':
    case 'json':
      // GeoJSON icon
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      );
    default:
      // Generic file icon
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      );
  }
}

// Status badge component
function StatusBadge({ status }: { status: UploadStatus }) {
  const config: Record<UploadStatus, { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-gray-100 text-gray-600',
    },
    initializing: {
      label: 'Initializing',
      className: 'bg-blue-100 text-blue-600',
    },
    uploading: {
      label: 'Uploading',
      className: 'bg-blue-100 text-blue-600 animate-pulse',
    },
    paused: {
      label: 'Paused',
      className: 'bg-yellow-100 text-yellow-700',
    },
    processing: {
      label: 'Processing',
      className: 'bg-purple-100 text-purple-600 animate-pulse',
    },
    completed: {
      label: 'Ready',
      className: 'bg-green-100 text-green-600',
    },
    error: {
      label: 'Error',
      className: 'bg-red-100 text-red-600',
    },
    cancelled: {
      label: 'Cancelled',
      className: 'bg-gray-100 text-gray-500',
    },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// Action button component
function ActionButton({
  onClick,
  disabled = false,
  variant = 'default',
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'success';
  title: string;
  children: React.ReactNode;
}) {
  const variantClasses: Record<string, string> = {
    default: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
    danger: 'text-red-500 hover:text-red-700 hover:bg-red-50',
    success: 'text-green-500 hover:text-green-700 hover:bg-green-50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]}`}
    >
      {children}
    </button>
  );
}

export function FileUploadItem({
  file,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
}: FileUploadItemProps) {
  // Calculate progress bar color based on status
  const progressBarColor = useMemo(() => {
    switch (file.status) {
      case 'uploading':
        return 'bg-blue-500';
      case 'processing':
        return 'bg-purple-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'paused':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-300';
    }
  }, [file.status]);

  // Format upload speed
  const uploadSpeedText = useMemo(() => {
    if (file.status !== 'uploading' || file.uploadSpeed === 0) return null;
    return `${formatBytes(file.uploadSpeed)}/s`;
  }, [file.status, file.uploadSpeed]);

  // Format ETA
  const etaText = useMemo(() => {
    if (file.status !== 'uploading' || file.estimatedTimeRemaining === 0) return null;
    return formatTime(file.estimatedTimeRemaining);
  }, [file.status, file.estimatedTimeRemaining]);

  // Determine which actions to show
  const showPause = file.status === 'uploading';
  const showResume = file.status === 'paused';
  const showCancel = ['uploading', 'paused', 'initializing', 'pending'].includes(file.status);
  const showRetry = ['error', 'cancelled'].includes(file.status);
  const showRemove = ['completed', 'error', 'cancelled'].includes(file.status);

  return (
    <div className="group bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        {/* File type icon */}
        <div className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-lg text-gray-500">
          <FileTypeIcon fileType={file.fileType} className="w-6 h-6" />
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          {/* Filename and status */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-900 truncate" title={file.filename}>
              {file.filename}
            </h4>
            <StatusBadge status={file.status} />
          </div>

          {/* File size and progress info */}
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <span>{formatBytes(file.size)}</span>
            {file.status === 'uploading' && (
              <>
                <span className="text-gray-300">|</span>
                <span>{file.progress}%</span>
                {uploadSpeedText && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span>{uploadSpeedText}</span>
                  </>
                )}
                {etaText && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span>~{etaText} remaining</span>
                  </>
                )}
              </>
            )}
            {file.status === 'processing' && (
              <>
                <span className="text-gray-300">|</span>
                <span>Processing file...</span>
              </>
            )}
          </div>

          {/* Progress bar */}
          {['uploading', 'processing', 'paused', 'pending', 'initializing'].includes(file.status) && (
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
                style={{ width: `${file.status === 'processing' ? 100 : file.progress}%` }}
              />
            </div>
          )}

          {/* Error message */}
          {file.status === 'error' && file.errorMessage && (
            <p className="mt-1 text-xs text-red-600 truncate" title={file.errorMessage}>
              {file.errorMessage}
            </p>
          )}

          {/* Retry count */}
          {file.retryCount > 0 && file.status === 'error' && (
            <p className="mt-1 text-xs text-gray-400">
              Attempted {file.retryCount} {file.retryCount === 1 ? 'retry' : 'retries'}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {showPause && (
            <ActionButton onClick={() => onPause(file.id)} title="Pause upload">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </ActionButton>
          )}

          {showResume && (
            <ActionButton onClick={() => onResume(file.id)} title="Resume upload" variant="success">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </ActionButton>
          )}

          {showRetry && (
            <ActionButton onClick={() => onRetry(file.id)} title="Retry upload" variant="success">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </ActionButton>
          )}

          {showCancel && (
            <ActionButton onClick={() => onCancel(file.id)} title="Cancel upload" variant="danger">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </ActionButton>
          )}

          {showRemove && (
            <ActionButton onClick={() => onRemove(file.id)} title="Remove from list" variant="danger">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileUploadItem;
