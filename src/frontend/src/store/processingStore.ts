import { create } from 'zustand';
import * as processingApi from '../api/processing';
import type {
  ProcessingProgress,
  ProcessingResultsResponse,
} from '../api/processing';

// Polling interval in milliseconds
const POLLING_INTERVAL = 2000;

interface ProcessingJob {
  analysisId: string;
  projectId: string;
  progress: ProcessingProgress | null;
  results: ProcessingResultsResponse | null;
  error: string | null;
  isPolling: boolean;
}

interface ProcessingState {
  // Active processing jobs keyed by analysisId
  jobs: Record<string, ProcessingJob>;

  // Loading states
  isLoadingProgress: Record<string, boolean>;
  isLoadingResults: Record<string, boolean>;
  isCancelling: Record<string, boolean>;
  isDownloadingReport: Record<string, boolean>;

  // Actions
  startPolling: (analysisId: string, projectId: string) => void;
  stopPolling: (analysisId: string) => void;
  fetchProgress: (analysisId: string) => Promise<void>;
  fetchResults: (analysisId: string) => Promise<void>;
  cancelProcessing: (analysisId: string) => Promise<void>;
  downloadReport: (analysisId: string, format?: 'pdf' | 'excel') => Promise<void>;
  clearJob: (analysisId: string) => void;
  clearAllJobs: () => void;

  // Getters
  getJob: (analysisId: string) => ProcessingJob | undefined;
  getActiveJobs: () => ProcessingJob[];
  getCompletedJobs: () => ProcessingJob[];
}

// Track polling intervals outside of state to avoid re-renders
const pollingIntervals: Record<string, NodeJS.Timeout> = {};

// Helper to create a new job object
function createJob(analysisId: string, projectId: string): ProcessingJob {
  return {
    analysisId,
    projectId,
    progress: null,
    results: null,
    error: null,
    isPolling: true,
  };
}

// Helper to update a job safely
function updateJob(
  jobs: Record<string, ProcessingJob>,
  analysisId: string,
  updates: Partial<ProcessingJob>
): Record<string, ProcessingJob> {
  const existingJob = jobs[analysisId];
  if (!existingJob) {
    return jobs;
  }
  return {
    ...jobs,
    [analysisId]: {
      ...existingJob,
      ...updates,
    },
  };
}

export const useProcessingStore = create<ProcessingState>((set, get) => ({
  jobs: {},
  isLoadingProgress: {},
  isLoadingResults: {},
  isCancelling: {},
  isDownloadingReport: {},

  startPolling: (analysisId: string, projectId: string) => {
    const { jobs, fetchProgress } = get();

    // Initialize job if not exists
    if (!jobs[analysisId]) {
      const newJob = createJob(analysisId, projectId);
      set({ jobs: { ...jobs, [analysisId]: newJob } });
    } else {
      set({ jobs: updateJob(jobs, analysisId, { isPolling: true }) });
    }

    // Clear any existing interval
    if (pollingIntervals[analysisId]) {
      clearInterval(pollingIntervals[analysisId]);
    }

    // Start polling
    fetchProgress(analysisId);
    pollingIntervals[analysisId] = setInterval(() => {
      const currentJob = get().jobs[analysisId];
      if (
        currentJob?.progress?.status === 'completed' ||
        currentJob?.progress?.status === 'failed' ||
        currentJob?.progress?.status === 'cancelled'
      ) {
        get().stopPolling(analysisId);
        // Fetch results if completed
        if (currentJob.progress?.status === 'completed') {
          get().fetchResults(analysisId);
        }
      } else if (currentJob?.isPolling) {
        fetchProgress(analysisId);
      }
    }, POLLING_INTERVAL);
  },

  stopPolling: (analysisId: string) => {
    if (pollingIntervals[analysisId]) {
      clearInterval(pollingIntervals[analysisId]);
      delete pollingIntervals[analysisId];
    }

    const { jobs } = get();
    if (jobs[analysisId]) {
      set({ jobs: updateJob(jobs, analysisId, { isPolling: false }) });
    }
  },

  fetchProgress: async (analysisId: string) => {
    set((state) => ({
      isLoadingProgress: { ...state.isLoadingProgress, [analysisId]: true },
    }));

    try {
      const progress = await processingApi.getProcessingProgress(analysisId);
      const { jobs } = get();
      const existingJob = jobs[analysisId];

      const updatedJob: ProcessingJob = {
        analysisId,
        projectId: existingJob?.projectId || progress.projectId,
        progress,
        results: existingJob?.results || null,
        error: null,
        isPolling: existingJob?.isPolling ?? false,
      };

      set({
        jobs: { ...jobs, [analysisId]: updatedJob },
        isLoadingProgress: { ...get().isLoadingProgress, [analysisId]: false },
      });

      // Auto-fetch results when completed
      if (progress.status === 'completed') {
        get().fetchResults(analysisId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch progress';
      const { jobs } = get();
      const existingJob = jobs[analysisId];

      const errorJob: ProcessingJob = existingJob
        ? { ...existingJob, error: message }
        : {
            analysisId,
            projectId: '',
            progress: null,
            results: null,
            error: message,
            isPolling: false,
          };

      set({
        jobs: { ...jobs, [analysisId]: errorJob },
        isLoadingProgress: { ...get().isLoadingProgress, [analysisId]: false },
      });
    }
  },

  fetchResults: async (analysisId: string) => {
    set((state) => ({
      isLoadingResults: { ...state.isLoadingResults, [analysisId]: true },
    }));

    try {
      const results = await processingApi.getProcessingResults(analysisId);
      const { jobs } = get();
      const existingJob = jobs[analysisId];

      if (existingJob) {
        const updatedJob: ProcessingJob = {
          ...existingJob,
          results,
          error: null,
        };
        set({
          jobs: { ...jobs, [analysisId]: updatedJob },
          isLoadingResults: { ...get().isLoadingResults, [analysisId]: false },
        });
      } else {
        set({
          isLoadingResults: { ...get().isLoadingResults, [analysisId]: false },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch results';
      const { jobs } = get();
      const existingJob = jobs[analysisId];

      if (existingJob) {
        const errorJob: ProcessingJob = { ...existingJob, error: message };
        set({
          jobs: { ...jobs, [analysisId]: errorJob },
          isLoadingResults: { ...get().isLoadingResults, [analysisId]: false },
        });
      } else {
        set({
          isLoadingResults: { ...get().isLoadingResults, [analysisId]: false },
        });
      }
    }
  },

  cancelProcessing: async (analysisId: string) => {
    set((state) => ({
      isCancelling: { ...state.isCancelling, [analysisId]: true },
    }));

    try {
      await processingApi.cancelProcessing(analysisId);

      // Stop polling
      get().stopPolling(analysisId);

      // Update job status
      const { jobs } = get();
      const existingJob = jobs[analysisId];

      if (existingJob && existingJob.progress) {
        const updatedProgress: ProcessingProgress = {
          ...existingJob.progress,
          status: 'cancelled',
        };
        const updatedJob: ProcessingJob = {
          ...existingJob,
          progress: updatedProgress,
        };
        set({
          jobs: { ...jobs, [analysisId]: updatedJob },
          isCancelling: { ...get().isCancelling, [analysisId]: false },
        });
      } else {
        set({
          isCancelling: { ...get().isCancelling, [analysisId]: false },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel processing';
      const { jobs } = get();
      const existingJob = jobs[analysisId];

      if (existingJob) {
        const errorJob: ProcessingJob = { ...existingJob, error: message };
        set({
          jobs: { ...jobs, [analysisId]: errorJob },
          isCancelling: { ...get().isCancelling, [analysisId]: false },
        });
      } else {
        set({
          isCancelling: { ...get().isCancelling, [analysisId]: false },
        });
      }
      throw error;
    }
  },

  downloadReport: async (analysisId: string, format: 'pdf' | 'excel' = 'pdf') => {
    set((state) => ({
      isDownloadingReport: { ...state.isDownloadingReport, [analysisId]: true },
    }));

    try {
      const { downloadUrl } = await processingApi.generateReport(analysisId, format);

      if (downloadUrl) {
        // Trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `analysis-report-${analysisId}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      set((state) => ({
        isDownloadingReport: { ...state.isDownloadingReport, [analysisId]: false },
      }));
    } catch {
      set((state) => ({
        isDownloadingReport: { ...state.isDownloadingReport, [analysisId]: false },
      }));
      throw new Error('Failed to download report');
    }
  },

  clearJob: (analysisId: string) => {
    // Stop polling first
    get().stopPolling(analysisId);

    const { jobs, isLoadingProgress, isLoadingResults, isCancelling, isDownloadingReport } = get();

    const newJobs = { ...jobs };
    delete newJobs[analysisId];

    const newLoadingProgress = { ...isLoadingProgress };
    delete newLoadingProgress[analysisId];

    const newLoadingResults = { ...isLoadingResults };
    delete newLoadingResults[analysisId];

    const newCancelling = { ...isCancelling };
    delete newCancelling[analysisId];

    const newDownloading = { ...isDownloadingReport };
    delete newDownloading[analysisId];

    set({
      jobs: newJobs,
      isLoadingProgress: newLoadingProgress,
      isLoadingResults: newLoadingResults,
      isCancelling: newCancelling,
      isDownloadingReport: newDownloading,
    });
  },

  clearAllJobs: () => {
    // Stop all polling
    Object.keys(pollingIntervals).forEach((id) => {
      clearInterval(pollingIntervals[id]);
      delete pollingIntervals[id];
    });

    set({
      jobs: {},
      isLoadingProgress: {},
      isLoadingResults: {},
      isCancelling: {},
      isDownloadingReport: {},
    });
  },

  getJob: (analysisId: string) => {
    return get().jobs[analysisId];
  },

  getActiveJobs: () => {
    const { jobs } = get();
    return Object.values(jobs).filter(
      (job) =>
        job.progress?.status === 'processing' || job.progress?.status === 'queued'
    );
  },

  getCompletedJobs: () => {
    const { jobs } = get();
    return Object.values(jobs).filter((job) => job.progress?.status === 'completed');
  },
}));
