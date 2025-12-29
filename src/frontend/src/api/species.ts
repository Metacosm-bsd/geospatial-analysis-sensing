/**
 * Species Classification API
 * Sprint 13-14: Species Classification UI
 */

import apiClient, { getErrorMessage } from './client';

// Types
export interface SpeciesClassificationOptions {
  confidenceThreshold?: number;
  useEnsemble?: boolean;
  includeNative?: boolean;
  modelVersion?: string;
}

export interface SpeciesPrediction {
  treeId: string;
  speciesCode: string;
  speciesName: string;
  confidence: number;
  alternativePredictions?: Array<{
    speciesCode: string;
    speciesName: string;
    confidence: number;
  }>;
}

export interface SpeciesClassificationResult {
  analysisId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  treesProcessed: number;
  totalTrees: number;
  predictions: SpeciesPrediction[];
  speciesBreakdown: SpeciesBreakdownItem[];
  averageConfidence: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface SpeciesBreakdownItem {
  speciesCode: string;
  speciesName: string;
  count: number;
  percentage: number;
  averageHeight: number;
  averageDbh: number;
  averageConfidence: number;
  color: string;
}

export interface Region {
  code: string;
  name: string;
  description?: string;
  defaultSpecies: string[];
}

export interface SpeciesInfo {
  code: string;
  commonName: string;
  scientificName: string;
  family: string;
  nativeRegions: string[];
  color: string;
  averageMaxHeight: number;
  averageMaxDbh: number;
  growthRate: 'slow' | 'moderate' | 'fast';
}

export interface UpdateTreeSpeciesRequest {
  speciesCode: string;
  confidence?: number;
  manualOverride?: boolean;
}

export interface ClassifySpeciesResponse {
  jobId: string;
  status: 'queued' | 'processing';
  message: string;
}

/**
 * Start species classification for an analysis
 */
export async function classifySpecies(
  analysisId: string,
  region: string,
  options?: SpeciesClassificationOptions
): Promise<ClassifySpeciesResponse> {
  try {
    const response = await apiClient.post<ClassifySpeciesResponse>(
      `/analyses/${analysisId}/species/classify`,
      {
        region,
        ...options,
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get species predictions for an analysis
 */
export async function getSpeciesPredictions(
  analysisId: string
): Promise<SpeciesClassificationResult> {
  try {
    const response = await apiClient.get<SpeciesClassificationResult>(
      `/analyses/${analysisId}/species`
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get list of supported regions for species classification
 */
export async function getSupportedRegions(): Promise<Region[]> {
  try {
    const response = await apiClient.get<{ regions: Region[] }>('/species/regions');
    return response.data.regions;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get species list for a specific region
 */
export async function getRegionSpecies(region: string): Promise<SpeciesInfo[]> {
  try {
    const response = await apiClient.get<{ species: SpeciesInfo[] }>(
      `/species/regions/${region}/species`
    );
    return response.data.species;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Update species classification for a specific tree
 */
export async function updateTreeSpecies(
  treeId: string,
  data: UpdateTreeSpeciesRequest
): Promise<SpeciesPrediction> {
  try {
    const response = await apiClient.patch<SpeciesPrediction>(
      `/trees/${treeId}/species`,
      data
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get all species for a project (combined from all analyses)
 */
export async function getProjectSpeciesBreakdown(
  projectId: string
): Promise<SpeciesBreakdownItem[]> {
  try {
    const response = await apiClient.get<{ breakdown: SpeciesBreakdownItem[] }>(
      `/projects/${projectId}/species/breakdown`
    );
    return response.data.breakdown;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Poll for classification status
 */
export async function pollClassificationStatus(
  analysisId: string,
  intervalMs: number = 2000,
  maxAttempts: number = 150
): Promise<SpeciesClassificationResult> {
  let attempts = 0;

  const poll = async (): Promise<SpeciesClassificationResult> => {
    attempts++;
    const result = await getSpeciesPredictions(analysisId);

    if (result.status === 'completed' || result.status === 'failed') {
      return result;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Classification polling timeout');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    return poll();
  };

  return poll();
}

// ============================================================
// Sprint 15-16: Species Enhancement Functions
// ============================================================

/**
 * Species correction record
 */
export interface SpeciesCorrection {
  id: string;
  treeId: string;
  predictedSpecies: string;
  correctedSpecies: string;
  userId: string;
  userName: string;
  createdAt: string;
  analysisId?: string;
}

/**
 * Correction statistics
 */
export interface CorrectionStatistics {
  totalCorrections: number;
  correctionsBySpecies: Array<{
    predictedSpecies: string;
    correctedSpecies: string;
    count: number;
  }>;
  mostCorrectedSpecies: Array<{
    speciesCode: string;
    speciesName: string;
    correctionCount: number;
  }>;
  averageCorrectionsPerDay: number;
  lastCorrectionAt?: string;
}

/**
 * Batch classification job
 */
export interface BatchClassificationJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  treesProcessed: number;
  totalTrees: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Species export options
 */
export interface SpeciesExportOptions {
  format: 'csv' | 'geojson' | 'shapefile';
  confidenceThreshold?: number;
  includeUncertain?: boolean;
  speciesFilter?: string[];
}

/**
 * Validation metrics for species classification
 */
export interface ValidationMetrics {
  overallAccuracy: number;
  validationDate: string;
  totalValidated: number;
  perSpeciesMetrics: Array<{
    speciesCode: string;
    speciesName: string;
    precision: number;
    recall: number;
    f1Score: number;
    support: number;
  }>;
  confusionMatrix: {
    labels: string[];
    matrix: number[][];
  };
  recommendations: string[];
}

/**
 * Record a species correction from user feedback
 */
export async function recordSpeciesCorrection(
  treeId: string,
  predictedSpecies: string,
  correctedSpecies: string
): Promise<SpeciesCorrection> {
  try {
    const response = await apiClient.post<SpeciesCorrection>(
      `/trees/${treeId}/species/correction`,
      {
        predictedSpecies,
        correctedSpecies,
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get correction history for an analysis
 */
export async function getCorrectionHistory(
  analysisId: string
): Promise<SpeciesCorrection[]> {
  try {
    const response = await apiClient.get<{ corrections: SpeciesCorrection[] }>(
      `/analyses/${analysisId}/species/corrections`
    );
    return response.data.corrections;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get overall correction statistics
 */
export async function getCorrectionStatistics(): Promise<CorrectionStatistics> {
  try {
    const response = await apiClient.get<CorrectionStatistics>(
      '/species/corrections/statistics'
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Start a batch species classification job
 */
export async function startBatchClassification(
  analysisId: string,
  region: string
): Promise<BatchClassificationJob> {
  try {
    const response = await apiClient.post<BatchClassificationJob>(
      `/analyses/${analysisId}/species/batch-classify`,
      { region }
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get batch classification job progress
 */
export async function getBatchProgress(
  jobId: string
): Promise<BatchClassificationJob> {
  try {
    const response = await apiClient.get<BatchClassificationJob>(
      `/species/batch-jobs/${jobId}`
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Export species data in various formats
 */
export async function exportSpeciesData(
  analysisId: string,
  options: SpeciesExportOptions
): Promise<Blob> {
  try {
    const response = await apiClient.post(
      `/analyses/${analysisId}/species/export`,
      options,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get validation metrics for a region
 */
export async function getValidationMetrics(
  region: string
): Promise<ValidationMetrics> {
  try {
    const response = await apiClient.get<ValidationMetrics>(
      `/species/regions/${region}/validation`
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
