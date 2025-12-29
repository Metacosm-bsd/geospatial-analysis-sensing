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
