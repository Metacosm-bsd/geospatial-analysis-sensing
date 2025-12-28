import apiClient, { getErrorMessage } from './client';
import type { StageType, StageStatus } from '../components/ProcessingStatus';

// Processing API types
export interface ProcessingStageInfo {
  type: StageType;
  status: StageStatus;
  progress: number;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ProcessingProgress {
  analysisId: string;
  projectId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  overallProgress: number;
  currentStage?: StageType;
  currentStageProgress?: number;
  stages: ProcessingStageInfo[];
  estimatedTimeRemaining?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ProcessingResultsResponse {
  analysisId: string;
  projectId: string;
  treeCount: number;
  averageHeight: number;
  maxHeight: number;
  minHeight: number;
  canopyCoverage: number;
  processingTimeSeconds: number;
  completedAt: string;
  detailedMetrics?: {
    heightDistribution: Record<string, number>;
    speciesBreakdown?: Record<string, number>;
    biomassEstimate?: number;
    carbonStock?: number;
  };
}

// API endpoints
const PROCESSING_ENDPOINTS = {
  progress: (analysisId: string) => `/processing/${analysisId}/progress`,
  cancel: (analysisId: string) => `/processing/${analysisId}/cancel`,
  results: (analysisId: string) => `/processing/${analysisId}/results`,
  downloadReport: (analysisId: string) => `/processing/${analysisId}/report`,
};

/**
 * Get the current processing progress for an analysis
 */
export async function getProcessingProgress(analysisId: string): Promise<ProcessingProgress> {
  try {
    const response = await apiClient.get<{ progress: ProcessingProgress }>(
      PROCESSING_ENDPOINTS.progress(analysisId)
    );
    return response.data.progress;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Cancel an in-progress analysis
 */
export async function cancelProcessing(analysisId: string): Promise<void> {
  try {
    await apiClient.post(PROCESSING_ENDPOINTS.cancel(analysisId));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get the results of a completed analysis
 */
export async function getProcessingResults(
  analysisId: string
): Promise<ProcessingResultsResponse> {
  try {
    const response = await apiClient.get<{ results: ProcessingResultsResponse }>(
      PROCESSING_ENDPOINTS.results(analysisId)
    );
    return response.data.results;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get the download URL for an analysis report
 */
export async function getReportDownloadUrl(
  analysisId: string,
  format: 'pdf' | 'excel' = 'pdf'
): Promise<string> {
  try {
    const response = await apiClient.get<{ downloadUrl: string }>(
      `${PROCESSING_ENDPOINTS.downloadReport(analysisId)}?format=${format}`
    );
    return response.data.downloadUrl;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Trigger report generation for an analysis
 */
export async function generateReport(
  analysisId: string,
  format: 'pdf' | 'excel' = 'pdf'
): Promise<{ reportId: string; downloadUrl?: string }> {
  try {
    const response = await apiClient.post<{ reportId: string; downloadUrl?: string }>(
      PROCESSING_ENDPOINTS.downloadReport(analysisId),
      { format }
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
