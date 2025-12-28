/**
 * File Store - Sprint 5-6
 * Zustand store for managing file upload state
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  UploadFile,
  UploadStatus,
  UploadConfig,
} from '../components/FileUploader/types';
import type { ProjectFile } from '../types';

// Upload queue item for managing concurrent uploads
interface UploadQueueItem {
  fileId: string;
  priority: number;
  addedAt: Date;
}

interface FileState {
  // Uploading files (keyed by local file ID)
  uploadingFiles: Record<string, UploadFile>;

  // Uploaded files per project (keyed by project ID)
  projectFiles: Record<string, ProjectFile[]>;

  // Upload queue for managing concurrent uploads
  uploadQueue: UploadQueueItem[];

  // Currently active uploads
  activeUploads: string[];

  // Configuration
  config: UploadConfig;

  // Global error state
  globalError: string | null;

  // Actions - Upload File Management
  addUploadFile: (file: UploadFile) => void;
  updateUploadFile: (fileId: string, updates: Partial<UploadFile>) => void;
  removeUploadFile: (fileId: string) => void;
  clearUploadFiles: () => void;

  // Actions - Upload Status
  setUploadStatus: (fileId: string, status: UploadStatus) => void;
  setUploadProgress: (
    fileId: string,
    progress: number,
    uploadedChunks: number,
    uploadSpeed?: number,
    estimatedTimeRemaining?: number
  ) => void;
  setUploadError: (fileId: string, errorMessage: string) => void;
  incrementRetryCount: (fileId: string) => void;

  // Actions - Queue Management
  addToQueue: (fileId: string, priority?: number) => void;
  removeFromQueue: (fileId: string) => void;
  getNextInQueue: () => string | null;
  clearQueue: () => void;

  // Actions - Active Uploads
  addActiveUpload: (fileId: string) => void;
  removeActiveUpload: (fileId: string) => void;
  getActiveUploadsCount: () => number;
  canStartNewUpload: () => boolean;

  // Actions - Project Files
  setProjectFiles: (projectId: string, files: ProjectFile[]) => void;
  addProjectFile: (projectId: string, file: ProjectFile) => void;
  updateProjectFile: (projectId: string, fileId: string, updates: Partial<ProjectFile>) => void;
  removeProjectFile: (projectId: string, fileId: string) => void;
  clearProjectFiles: (projectId: string) => void;

  // Actions - Configuration
  setConfig: (config: Partial<UploadConfig>) => void;

  // Actions - Error Handling
  setGlobalError: (error: string | null) => void;
  clearErrors: () => void;

  // Selectors
  getUploadingFilesArray: () => UploadFile[];
  getUploadingFilesForProject: (projectId: string) => UploadFile[];
  getOverallProgress: () => number;
  getIsUploading: () => boolean;
  getCompletedUploads: () => UploadFile[];
  getFailedUploads: () => UploadFile[];
}

const defaultConfig: UploadConfig = {
  chunkSize: 5 * 1024 * 1024, // 5MB
  maxConcurrentUploads: 3,
  maxRetries: 3,
  retryDelay: 1000,
  maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
  calculateChecksum: true,
};

export const useFileStore = create<FileState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        uploadingFiles: {},
        projectFiles: {},
        uploadQueue: [],
        activeUploads: [],
        config: defaultConfig,
        globalError: null,

        // Upload File Management
        addUploadFile: (file: UploadFile) => {
          set(
            (state) => ({
              uploadingFiles: {
                ...state.uploadingFiles,
                [file.id]: file,
              },
            }),
            false,
            'addUploadFile'
          );
        },

        updateUploadFile: (fileId: string, updates: Partial<UploadFile>) => {
          set(
            (state) => {
              const existingFile = state.uploadingFiles[fileId];
              if (!existingFile) {
                return state;
              }
              return {
                uploadingFiles: {
                  ...state.uploadingFiles,
                  [fileId]: { ...existingFile, ...updates },
                },
              };
            },
            false,
            'updateUploadFile'
          );
        },

        removeUploadFile: (fileId: string) => {
          set(
            (state) => {
              const { [fileId]: removed, ...rest } = state.uploadingFiles;
              return { uploadingFiles: rest };
            },
            false,
            'removeUploadFile'
          );
        },

        clearUploadFiles: () => {
          set({ uploadingFiles: {} }, false, 'clearUploadFiles');
        },

        // Upload Status
        setUploadStatus: (fileId: string, status: UploadStatus) => {
          set(
            (state) => {
              const existingFile = state.uploadingFiles[fileId];
              if (!existingFile) {
                return state;
              }
              return {
                uploadingFiles: {
                  ...state.uploadingFiles,
                  [fileId]: {
                    ...existingFile,
                    status,
                    ...(status === 'completed' ? { completedAt: new Date() } : {}),
                    ...(status === 'uploading' && !existingFile.startedAt
                      ? { startedAt: new Date() }
                      : {}),
                  },
                },
              };
            },
            false,
            'setUploadStatus'
          );
        },

        setUploadProgress: (
          fileId: string,
          progress: number,
          uploadedChunks: number,
          uploadSpeed?: number,
          estimatedTimeRemaining?: number
        ) => {
          set(
            (state) => {
              const existingFile = state.uploadingFiles[fileId];
              if (!existingFile) {
                return state;
              }
              return {
                uploadingFiles: {
                  ...state.uploadingFiles,
                  [fileId]: {
                    ...existingFile,
                    progress,
                    uploadedChunks,
                    ...(uploadSpeed !== undefined ? { uploadSpeed } : {}),
                    ...(estimatedTimeRemaining !== undefined ? { estimatedTimeRemaining } : {}),
                  },
                },
              };
            },
            false,
            'setUploadProgress'
          );
        },

        setUploadError: (fileId: string, errorMessage: string) => {
          set(
            (state) => {
              const existingFile = state.uploadingFiles[fileId];
              if (!existingFile) {
                return state;
              }
              return {
                uploadingFiles: {
                  ...state.uploadingFiles,
                  [fileId]: {
                    ...existingFile,
                    status: 'error' as UploadStatus,
                    errorMessage,
                  },
                },
              };
            },
            false,
            'setUploadError'
          );
        },

        incrementRetryCount: (fileId: string) => {
          set(
            (state) => {
              const existingFile = state.uploadingFiles[fileId];
              if (!existingFile) {
                return state;
              }
              return {
                uploadingFiles: {
                  ...state.uploadingFiles,
                  [fileId]: {
                    ...existingFile,
                    retryCount: existingFile.retryCount + 1,
                  },
                },
              };
            },
            false,
            'incrementRetryCount'
          );
        },

        // Queue Management
        addToQueue: (fileId: string, priority: number = 0) => {
          set(
            (state) => ({
              uploadQueue: [
                ...state.uploadQueue,
                { fileId, priority, addedAt: new Date() },
              ].sort((a, b) => b.priority - a.priority || a.addedAt.getTime() - b.addedAt.getTime()),
            }),
            false,
            'addToQueue'
          );
        },

        removeFromQueue: (fileId: string) => {
          set(
            (state) => ({
              uploadQueue: state.uploadQueue.filter((item) => item.fileId !== fileId),
            }),
            false,
            'removeFromQueue'
          );
        },

        getNextInQueue: () => {
          const state = get();
          const firstItem = state.uploadQueue[0];
          if (!firstItem) return null;
          return firstItem.fileId;
        },

        clearQueue: () => {
          set({ uploadQueue: [] }, false, 'clearQueue');
        },

        // Active Uploads
        addActiveUpload: (fileId: string) => {
          set(
            (state) => ({
              activeUploads: [...state.activeUploads, fileId],
            }),
            false,
            'addActiveUpload'
          );
        },

        removeActiveUpload: (fileId: string) => {
          set(
            (state) => ({
              activeUploads: state.activeUploads.filter((id) => id !== fileId),
            }),
            false,
            'removeActiveUpload'
          );
        },

        getActiveUploadsCount: () => {
          return get().activeUploads.length;
        },

        canStartNewUpload: () => {
          const state = get();
          return state.activeUploads.length < state.config.maxConcurrentUploads;
        },

        // Project Files
        setProjectFiles: (projectId: string, files: ProjectFile[]) => {
          set(
            (state) => ({
              projectFiles: {
                ...state.projectFiles,
                [projectId]: files,
              },
            }),
            false,
            'setProjectFiles'
          );
        },

        addProjectFile: (projectId: string, file: ProjectFile) => {
          set(
            (state) => ({
              projectFiles: {
                ...state.projectFiles,
                [projectId]: [...(state.projectFiles[projectId] || []), file],
              },
            }),
            false,
            'addProjectFile'
          );
        },

        updateProjectFile: (projectId: string, fileId: string, updates: Partial<ProjectFile>) => {
          set(
            (state) => ({
              projectFiles: {
                ...state.projectFiles,
                [projectId]: (state.projectFiles[projectId] || []).map((f) =>
                  f.id === fileId ? { ...f, ...updates } : f
                ),
              },
            }),
            false,
            'updateProjectFile'
          );
        },

        removeProjectFile: (projectId: string, fileId: string) => {
          set(
            (state) => ({
              projectFiles: {
                ...state.projectFiles,
                [projectId]: (state.projectFiles[projectId] || []).filter((f) => f.id !== fileId),
              },
            }),
            false,
            'removeProjectFile'
          );
        },

        clearProjectFiles: (projectId: string) => {
          set(
            (state) => {
              const { [projectId]: removed, ...rest } = state.projectFiles;
              return { projectFiles: rest };
            },
            false,
            'clearProjectFiles'
          );
        },

        // Configuration
        setConfig: (config: Partial<UploadConfig>) => {
          set(
            (state) => ({
              config: { ...state.config, ...config },
            }),
            false,
            'setConfig'
          );
        },

        // Error Handling
        setGlobalError: (error: string | null) => {
          set({ globalError: error }, false, 'setGlobalError');
        },

        clearErrors: () => {
          set(
            (state) => ({
              globalError: null,
              uploadingFiles: Object.fromEntries(
                Object.entries(state.uploadingFiles).map(([id, file]) => {
                  // Create a new object without errorMessage to clear it
                  const { errorMessage: _removed, ...rest } = file;
                  return [id, rest as UploadFile];
                })
              ),
            }),
            false,
            'clearErrors'
          );
        },

        // Selectors
        getUploadingFilesArray: () => {
          return Object.values(get().uploadingFiles);
        },

        getUploadingFilesForProject: (_projectId: string) => {
          // Note: This would require storing projectId on UploadFile
          // For now, returns all uploading files
          return Object.values(get().uploadingFiles);
        },

        getOverallProgress: () => {
          const files = Object.values(get().uploadingFiles);
          if (files.length === 0) return 0;

          const totalSize = files.reduce((sum, f) => sum + f.size, 0);
          const uploadedSize = files.reduce((sum, f) => sum + (f.size * f.progress) / 100, 0);

          return totalSize > 0 ? Math.round((uploadedSize / totalSize) * 100) : 0;
        },

        getIsUploading: () => {
          const files = Object.values(get().uploadingFiles);
          return files.some(
            (f) => f.status === 'uploading' || f.status === 'initializing' || f.status === 'pending'
          );
        },

        getCompletedUploads: () => {
          return Object.values(get().uploadingFiles).filter((f) => f.status === 'completed');
        },

        getFailedUploads: () => {
          return Object.values(get().uploadingFiles).filter((f) => f.status === 'error');
        },
      }),
      {
        name: 'file-store',
        // Only persist projectFiles, not active uploads
        partialize: (state) => ({
          projectFiles: state.projectFiles,
          config: state.config,
        }),
      }
    ),
    { name: 'FileStore' }
  )
);
