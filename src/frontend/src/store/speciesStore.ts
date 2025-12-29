/**
 * Species Store - Zustand store for species classification state
 * Sprint 13-14: Species Classification UI
 * Sprint 15-16: Added correction tracking, batch progress, and validation metrics
 */

import { create } from 'zustand';
import * as speciesApi from '../api/species';
import type {
  SpeciesPrediction,
  SpeciesBreakdownItem,
  Region,
  SpeciesInfo,
  SpeciesClassificationOptions,
  // Sprint 15-16: New types
  SpeciesCorrection,
  CorrectionStatistics,
  BatchClassificationJob,
  ValidationMetrics,
} from '../api/species';

export interface SpeciesState {
  // Classification status
  classificationStatus: 'idle' | 'loading' | 'classifying' | 'completed' | 'failed';
  classificationProgress: number;
  classificationError: string | null;

  // Predictions data
  predictions: SpeciesPrediction[];
  isPredictionsLoading: boolean;

  // Breakdown data
  speciesBreakdown: SpeciesBreakdownItem[];
  isBreakdownLoading: boolean;

  // Region/species data
  regions: Region[];
  isRegionsLoading: boolean;
  selectedRegion: string | null;
  regionSpecies: SpeciesInfo[];
  isRegionSpeciesLoading: boolean;

  // Selected species filter (for viewer filtering)
  selectedSpeciesFilter: string[];

  // Visibility toggles per species
  speciesVisibility: Record<string, boolean>;

  // Current analysis ID being processed
  currentAnalysisId: string | null;

  // Sprint 15-16: Correction tracking state
  corrections: SpeciesCorrection[];
  isCorrectionsLoading: boolean;
  correctionStatistics: CorrectionStatistics | null;
  isStatisticsLoading: boolean;

  // Sprint 15-16: Batch processing state
  batchJob: BatchClassificationJob | null;
  isBatchJobLoading: boolean;

  // Sprint 15-16: Validation metrics state
  validationMetrics: ValidationMetrics | null;
  isValidationLoading: boolean;

  // Actions
  startClassification: (
    analysisId: string,
    region: string,
    options?: SpeciesClassificationOptions
  ) => Promise<void>;
  fetchPredictions: (analysisId: string) => Promise<void>;
  fetchSpeciesBreakdown: (projectId: string) => Promise<void>;
  fetchRegions: () => Promise<void>;
  fetchRegionSpecies: (region: string) => Promise<void>;
  setSelectedRegion: (region: string | null) => void;
  setSelectedSpeciesFilter: (speciesCodes: string[]) => void;
  toggleSpeciesFilter: (speciesCode: string) => void;
  clearSpeciesFilter: () => void;
  toggleSpeciesVisibility: (speciesCode: string) => void;
  setAllSpeciesVisibility: (visible: boolean) => void;
  updateTreeSpecies: (
    treeId: string,
    speciesCode: string,
    confidence?: number
  ) => Promise<void>;
  resetClassification: () => void;
  clearErrors: () => void;

  // Sprint 15-16: New actions
  recordCorrection: (
    treeId: string,
    predictedSpecies: string,
    correctedSpecies: string
  ) => Promise<void>;
  fetchCorrectionHistory: (analysisId: string) => Promise<void>;
  fetchCorrectionStatistics: () => Promise<void>;
  startBatchClassification: (analysisId: string, region: string) => Promise<void>;
  pollBatchProgress: (jobId: string) => Promise<void>;
  fetchValidationMetrics: (region: string) => Promise<void>;
}

export const useSpeciesStore = create<SpeciesState>((set, get) => ({
  // Initial state
  classificationStatus: 'idle',
  classificationProgress: 0,
  classificationError: null,
  predictions: [],
  isPredictionsLoading: false,
  speciesBreakdown: [],
  isBreakdownLoading: false,
  regions: [],
  isRegionsLoading: false,
  selectedRegion: null,
  regionSpecies: [],
  isRegionSpeciesLoading: false,
  selectedSpeciesFilter: [],
  speciesVisibility: {},
  currentAnalysisId: null,

  // Sprint 15-16: New initial state
  corrections: [],
  isCorrectionsLoading: false,
  correctionStatistics: null,
  isStatisticsLoading: false,
  batchJob: null,
  isBatchJobLoading: false,
  validationMetrics: null,
  isValidationLoading: false,

  // Start species classification
  startClassification: async (analysisId, region, options) => {
    set({
      classificationStatus: 'classifying',
      classificationProgress: 0,
      classificationError: null,
      currentAnalysisId: analysisId,
    });

    try {
      await speciesApi.classifySpecies(analysisId, region, options);

      // Poll for results
      const result = await speciesApi.pollClassificationStatus(analysisId);

      if (result.status === 'completed') {
        // Initialize visibility for all species
        const visibility: Record<string, boolean> = {};
        result.speciesBreakdown.forEach((item) => {
          visibility[item.speciesCode] = true;
        });

        set({
          classificationStatus: 'completed',
          classificationProgress: 100,
          predictions: result.predictions,
          speciesBreakdown: result.speciesBreakdown,
          speciesVisibility: visibility,
        });
      } else if (result.status === 'failed') {
        set({
          classificationStatus: 'failed',
          classificationError: result.error || 'Classification failed',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      set({
        classificationStatus: 'failed',
        classificationError: message,
      });
    }
  },

  // Fetch predictions for an analysis
  fetchPredictions: async (analysisId) => {
    set({ isPredictionsLoading: true });

    try {
      const result = await speciesApi.getSpeciesPredictions(analysisId);

      // Initialize visibility for all species
      const visibility: Record<string, boolean> = {};
      result.speciesBreakdown.forEach((item) => {
        visibility[item.speciesCode] = true;
      });

      set({
        predictions: result.predictions,
        speciesBreakdown: result.speciesBreakdown,
        speciesVisibility: visibility,
        classificationStatus: result.status === 'completed' ? 'completed' : 'idle',
        classificationProgress: result.progress,
        isPredictionsLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch predictions';
      set({
        classificationError: message,
        isPredictionsLoading: false,
      });
    }
  },

  // Fetch species breakdown for a project
  fetchSpeciesBreakdown: async (projectId) => {
    set({ isBreakdownLoading: true });

    try {
      const breakdown = await speciesApi.getProjectSpeciesBreakdown(projectId);

      // Initialize visibility for all species
      const visibility: Record<string, boolean> = {};
      breakdown.forEach((item) => {
        visibility[item.speciesCode] = true;
      });

      set({
        speciesBreakdown: breakdown,
        speciesVisibility: visibility,
        isBreakdownLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch breakdown';
      set({
        classificationError: message,
        isBreakdownLoading: false,
      });
    }
  },

  // Fetch supported regions
  fetchRegions: async () => {
    set({ isRegionsLoading: true });

    try {
      const regions = await speciesApi.getSupportedRegions();
      set({
        regions,
        isRegionsLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch regions';
      set({
        classificationError: message,
        isRegionsLoading: false,
      });
    }
  },

  // Fetch species for a region
  fetchRegionSpecies: async (region) => {
    set({ isRegionSpeciesLoading: true });

    try {
      const species = await speciesApi.getRegionSpecies(region);
      set({
        regionSpecies: species,
        isRegionSpeciesLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch species';
      set({
        classificationError: message,
        isRegionSpeciesLoading: false,
      });
    }
  },

  // Set selected region
  setSelectedRegion: (region) => {
    set({ selectedRegion: region });
    if (region) {
      get().fetchRegionSpecies(region);
    } else {
      set({ regionSpecies: [] });
    }
  },

  // Set species filter
  setSelectedSpeciesFilter: (speciesCodes) => {
    set({ selectedSpeciesFilter: speciesCodes });
  },

  // Toggle a species in the filter
  toggleSpeciesFilter: (speciesCode) => {
    const { selectedSpeciesFilter } = get();
    const isSelected = selectedSpeciesFilter.includes(speciesCode);

    if (isSelected) {
      set({
        selectedSpeciesFilter: selectedSpeciesFilter.filter((c) => c !== speciesCode),
      });
    } else {
      set({
        selectedSpeciesFilter: [...selectedSpeciesFilter, speciesCode],
      });
    }
  },

  // Clear species filter
  clearSpeciesFilter: () => {
    set({ selectedSpeciesFilter: [] });
  },

  // Toggle visibility for a species
  toggleSpeciesVisibility: (speciesCode) => {
    const { speciesVisibility } = get();
    set({
      speciesVisibility: {
        ...speciesVisibility,
        [speciesCode]: !speciesVisibility[speciesCode],
      },
    });
  },

  // Set visibility for all species
  setAllSpeciesVisibility: (visible) => {
    const { speciesBreakdown } = get();
    const visibility: Record<string, boolean> = {};
    speciesBreakdown.forEach((item) => {
      visibility[item.speciesCode] = visible;
    });
    set({ speciesVisibility: visibility });
  },

  // Update tree species
  updateTreeSpecies: async (treeId, speciesCode, confidence) => {
    try {
      const updatedPrediction = await speciesApi.updateTreeSpecies(treeId, {
        speciesCode,
        ...(confidence !== undefined ? { confidence } : {}),
        manualOverride: true,
      });

      // Update local predictions
      set((state) => ({
        predictions: state.predictions.map((p) =>
          p.treeId === treeId ? updatedPrediction : p
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update species';
      set({ classificationError: message });
      throw error;
    }
  },

  // Reset classification state
  resetClassification: () => {
    set({
      classificationStatus: 'idle',
      classificationProgress: 0,
      classificationError: null,
      predictions: [],
      speciesBreakdown: [],
      speciesVisibility: {},
      selectedSpeciesFilter: [],
      currentAnalysisId: null,
    });
  },

  // Clear errors
  clearErrors: () => {
    set({ classificationError: null });
  },

  // Sprint 15-16: Record a species correction
  recordCorrection: async (treeId, predictedSpecies, correctedSpecies) => {
    try {
      const correction = await speciesApi.recordSpeciesCorrection(
        treeId,
        predictedSpecies,
        correctedSpecies
      );

      // Add to corrections list
      set((state) => ({
        corrections: [correction, ...state.corrections],
      }));

      // Also update the local prediction
      set((state) => ({
        predictions: state.predictions.map((p) =>
          p.treeId === treeId
            ? { ...p, speciesCode: correctedSpecies, speciesName: correctedSpecies }
            : p
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record correction';
      set({ classificationError: message });
      throw error;
    }
  },

  // Sprint 15-16: Fetch correction history for an analysis
  fetchCorrectionHistory: async (analysisId) => {
    set({ isCorrectionsLoading: true });

    try {
      const corrections = await speciesApi.getCorrectionHistory(analysisId);
      set({
        corrections,
        isCorrectionsLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch corrections';
      set({
        classificationError: message,
        isCorrectionsLoading: false,
      });
    }
  },

  // Sprint 15-16: Fetch correction statistics
  fetchCorrectionStatistics: async () => {
    set({ isStatisticsLoading: true });

    try {
      const statistics = await speciesApi.getCorrectionStatistics();
      set({
        correctionStatistics: statistics,
        isStatisticsLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch statistics';
      set({
        classificationError: message,
        isStatisticsLoading: false,
      });
    }
  },

  // Sprint 15-16: Start batch classification
  startBatchClassification: async (analysisId, region) => {
    set({ isBatchJobLoading: true, batchJob: null });

    try {
      const job = await speciesApi.startBatchClassification(analysisId, region);
      set({
        batchJob: job,
        isBatchJobLoading: false,
      });

      // Start polling for progress if job started successfully
      if (job.status === 'processing' || job.status === 'queued') {
        get().pollBatchProgress(job.jobId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start batch classification';
      set({
        classificationError: message,
        isBatchJobLoading: false,
      });
    }
  },

  // Sprint 15-16: Poll batch job progress
  pollBatchProgress: async (jobId) => {
    const pollInterval = 2000;
    const maxAttempts = 150;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts++;
      try {
        const job = await speciesApi.getBatchProgress(jobId);
        set({ batchJob: job });

        if (job.status === 'completed' || job.status === 'failed') {
          return;
        }

        if (attempts >= maxAttempts) {
          set({ classificationError: 'Batch job polling timeout' });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        return poll();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get batch progress';
        set({ classificationError: message });
      }
    };

    await poll();
  },

  // Sprint 15-16: Fetch validation metrics for a region
  fetchValidationMetrics: async (region) => {
    set({ isValidationLoading: true });

    try {
      const metrics = await speciesApi.getValidationMetrics(region);
      set({
        validationMetrics: metrics,
        isValidationLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch validation metrics';
      set({
        classificationError: message,
        isValidationLoading: false,
      });
    }
  },
}));

export default useSpeciesStore;
