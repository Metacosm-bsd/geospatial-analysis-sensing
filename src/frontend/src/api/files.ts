/**
 * Files API Module - Sprint 5-6
 * Handles chunked file upload operations
 */

import apiClient, { getErrorMessage } from './client';
import type {
  InitUploadRequest,
  InitUploadResponse,
  UploadChunkResponse,
  CompleteUploadRequest,
  CompleteUploadResponse,
  FileStatusResponse,
} from '../components/FileUploader/types';
import type { ProjectFile, PaginatedResponse, PaginationParams } from '../types';

const FILES_BASE_URL = '/v1/files';

/**
 * Initialize a chunked file upload
 * Creates a new file record and returns upload credentials
 */
export async function initUpload(
  projectId: string,
  filename: string,
  size: number,
  mimeType: string,
  totalChunks: number
): Promise<InitUploadResponse> {
  try {
    const payload: InitUploadRequest = {
      projectId,
      filename,
      size,
      mimeType,
      totalChunks,
    };

    const response = await apiClient.post<InitUploadResponse>(
      `${FILES_BASE_URL}/init-upload`,
      payload
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Upload a single chunk of a file
 * Uses FormData for binary chunk upload
 */
export async function uploadChunk(
  fileId: string,
  chunkIndex: number,
  chunk: Blob,
  onProgress?: (progress: number) => void
): Promise<UploadChunkResponse> {
  try {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('chunkIndex', String(chunkIndex));

    const response = await apiClient.put<UploadChunkResponse>(
      `${FILES_BASE_URL}/${fileId}/chunks/${chunkIndex}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
        // Extended timeout for large chunks
        timeout: 120000, // 2 minutes
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Complete a chunked upload
 * Triggers server-side file assembly and processing
 */
export async function completeUpload(
  fileId: string,
  checksum?: string
): Promise<CompleteUploadResponse> {
  try {
    const payload: CompleteUploadRequest = {
      fileId,
      ...(checksum !== undefined && { checksum }),
    };

    const response = await apiClient.post<CompleteUploadResponse>(
      `${FILES_BASE_URL}/${fileId}/complete`,
      payload
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get the current status of a file upload
 * Used for polling during upload and processing
 */
export async function getFileStatus(fileId: string): Promise<FileStatusResponse> {
  try {
    const response = await apiClient.get<FileStatusResponse>(
      `${FILES_BASE_URL}/${fileId}/status`
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Delete a file
 * Removes file and all associated chunks
 */
export async function deleteFile(fileId: string): Promise<void> {
  try {
    await apiClient.delete(`${FILES_BASE_URL}/${fileId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get all files for a project
 * Supports pagination and sorting
 */
export async function getProjectFiles(
  projectId: string,
  params?: PaginationParams
): Promise<PaginatedResponse<ProjectFile>> {
  try {
    const response = await apiClient.get<PaginatedResponse<ProjectFile>>(
      `/v1/projects/${projectId}/files`,
      {
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          sortBy: params?.sortBy ?? 'uploadedAt',
          sortOrder: params?.sortOrder ?? 'desc',
        },
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get a single file's details
 */
export async function getFile(fileId: string): Promise<ProjectFile> {
  try {
    const response = await apiClient.get<ProjectFile>(`${FILES_BASE_URL}/${fileId}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Cancel an in-progress upload
 * Cleans up partial uploads on the server
 */
export async function cancelUpload(fileId: string): Promise<void> {
  try {
    await apiClient.post(`${FILES_BASE_URL}/${fileId}/cancel`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Resume a paused or failed upload
 * Returns the chunks that still need to be uploaded
 */
export async function getUploadProgress(fileId: string): Promise<{
  uploadedChunks: number[];
  missingChunks: number[];
  totalChunks: number;
}> {
  try {
    const response = await apiClient.get<{
      uploadedChunks: number[];
      missingChunks: number[];
      totalChunks: number;
    }>(`${FILES_BASE_URL}/${fileId}/progress`);

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get presigned URL for direct download
 */
export async function getDownloadUrl(fileId: string): Promise<{ url: string; expiresAt: string }> {
  try {
    const response = await apiClient.get<{ url: string; expiresAt: string }>(
      `${FILES_BASE_URL}/${fileId}/download-url`
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
