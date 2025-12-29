import { create } from 'zustand';
import * as reportsApi from '../api/reports';
import type { Report, ReportOptions, ReportStatus as ApiReportStatus } from '../api/reports';

type ReportStatus = ApiReportStatus;

interface ReportFilters {
  status: ReportStatus | '';
  sortBy: 'createdAt' | 'title';
  sortOrder: 'asc' | 'desc';
}

interface DownloadState {
  [reportId: string]: {
    isDownloading: boolean;
    format: 'pdf' | 'excel' | null;
    error: string | null;
  };
}

interface GeneratingState {
  [reportId: string]: {
    progress: number;
    cleanupFn: (() => void) | null;
  };
}

interface ReportState {
  // Reports list
  reports: Report[];
  isLoadingReports: boolean;
  reportsError: string | null;

  // Current report (for preview)
  selectedReport: Report | null;
  isLoadingSelectedReport: boolean;

  // Report generation
  isGenerating: boolean;
  generatingReportId: string | null;
  generatingStates: GeneratingState;
  generationError: string | null;

  // Download states
  downloadStates: DownloadState;

  // Filters
  filters: ReportFilters;

  // Actions - Reports
  fetchProjectReports: (projectId: string) => Promise<void>;
  selectReport: (report: Report | null) => void;
  fetchReportDetails: (reportId: string) => Promise<void>;

  // Actions - Generation
  generateReport: (
    analysisId: string,
    options: ReportOptions,
    projectId: string
  ) => Promise<Report>;
  cancelGeneration: (reportId: string) => void;

  // Actions - Download
  downloadReport: (reportId: string, format: 'pdf' | 'excel', filename?: string) => Promise<void>;

  // Actions - Delete
  deleteReport: (reportId: string) => Promise<void>;
  isDeleting: boolean;

  // Actions - Filters
  setFilters: (filters: Partial<ReportFilters>) => void;
  resetFilters: () => void;

  // Actions - State management
  clearReports: () => void;
  clearErrors: () => void;
}

const defaultFilters: ReportFilters = {
  status: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

export const useReportStore = create<ReportState>((set, get) => ({
  // Initial state
  reports: [],
  isLoadingReports: false,
  reportsError: null,

  selectedReport: null,
  isLoadingSelectedReport: false,

  isGenerating: false,
  generatingReportId: null,
  generatingStates: {},
  generationError: null,

  downloadStates: {},
  isDeleting: false,

  filters: { ...defaultFilters },

  // Fetch reports for a project
  fetchProjectReports: async (projectId: string) => {
    const { filters } = get();
    set({ isLoadingReports: true, reportsError: null });

    try {
      const params: {
        status?: ReportStatus;
        sortBy?: 'createdAt' | 'title';
        sortOrder?: 'asc' | 'desc';
      } = {
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };

      if (filters.status) {
        params.status = filters.status;
      }

      const response = await reportsApi.listProjectReports(projectId, params);

      set({
        reports: response.reports,
        isLoadingReports: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      set({
        reportsError: message,
        isLoadingReports: false,
      });
    }
  },

  // Select a report for preview
  selectReport: (report: Report | null) => {
    set({ selectedReport: report });
  },

  // Fetch detailed report info
  fetchReportDetails: async (reportId: string) => {
    set({ isLoadingSelectedReport: true });

    try {
      const report = await reportsApi.getReport(reportId);
      set({
        selectedReport: report,
        isLoadingSelectedReport: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch report details';
      set({
        reportsError: message,
        isLoadingSelectedReport: false,
      });
    }
  },

  // Generate a new report
  generateReport: async (analysisId: string, options: ReportOptions, _projectId: string) => {
    set({ isGenerating: true, generationError: null });

    try {
      const report = await reportsApi.generateReport(analysisId, options);

      // Add report to the list
      set((state) => ({
        reports: [report, ...state.reports],
        generatingReportId: report.id,
      }));

      // If report is still generating, start polling
      if (report.status === 'generating') {
        const cleanupFn = reportsApi.pollReportStatus(
          report.id,
          // On update
          (updatedReport) => {
            set((state) => ({
              reports: state.reports.map((r) => (r.id === updatedReport.id ? updatedReport : r)),
              selectedReport:
                state.selectedReport?.id === updatedReport.id ? updatedReport : state.selectedReport,
            }));
          },
          // On complete
          (completedReport) => {
            set((state) => ({
              reports: state.reports.map((r) =>
                r.id === completedReport.id ? completedReport : r
              ),
              selectedReport:
                state.selectedReport?.id === completedReport.id
                  ? completedReport
                  : state.selectedReport,
              isGenerating: false,
              generatingReportId: null,
              generatingStates: {
                ...state.generatingStates,
                [completedReport.id]: undefined as unknown as GeneratingState[string],
              },
            }));
          },
          // On error
          (error) => {
            set((state) => ({
              generationError: error.message,
              isGenerating: false,
              generatingReportId: null,
              generatingStates: {
                ...state.generatingStates,
                [report.id]: undefined as unknown as GeneratingState[string],
              },
            }));
          }
        );

        set((state) => ({
          generatingStates: {
            ...state.generatingStates,
            [report.id]: {
              progress: 0,
              cleanupFn,
            },
          },
        }));
      } else {
        set({ isGenerating: false, generatingReportId: null });
      }

      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate report';
      set({
        generationError: message,
        isGenerating: false,
        generatingReportId: null,
      });
      throw error;
    }
  },

  // Cancel report generation polling
  cancelGeneration: (reportId: string) => {
    const { generatingStates } = get();
    const state = generatingStates[reportId];

    if (state?.cleanupFn) {
      state.cleanupFn();
    }

    set((currentState) => {
      const newGeneratingStates = { ...currentState.generatingStates };
      delete newGeneratingStates[reportId];

      return {
        generatingStates: newGeneratingStates,
        isGenerating:
          currentState.generatingReportId === reportId ? false : currentState.isGenerating,
        generatingReportId:
          currentState.generatingReportId === reportId ? null : currentState.generatingReportId,
      };
    });
  },

  // Download a report
  downloadReport: async (reportId: string, format: 'pdf' | 'excel', filename?: string) => {
    set((state) => ({
      downloadStates: {
        ...state.downloadStates,
        [reportId]: {
          isDownloading: true,
          format,
          error: null,
        },
      },
    }));

    try {
      await reportsApi.downloadReportFile(reportId, format, filename);

      set((state) => ({
        downloadStates: {
          ...state.downloadStates,
          [reportId]: {
            isDownloading: false,
            format: null,
            error: null,
          },
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download report';

      set((state) => ({
        downloadStates: {
          ...state.downloadStates,
          [reportId]: {
            isDownloading: false,
            format: null,
            error: message,
          },
        },
      }));

      throw error;
    }
  },

  // Delete a report
  deleteReport: async (reportId: string) => {
    set({ isDeleting: true });

    try {
      await reportsApi.deleteReport(reportId);

      set((state) => ({
        reports: state.reports.filter((r) => r.id !== reportId),
        selectedReport: state.selectedReport?.id === reportId ? null : state.selectedReport,
        isDeleting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete report';
      set({
        reportsError: message,
        isDeleting: false,
      });
      throw error;
    }
  },

  // Set filters
  setFilters: (newFilters: Partial<ReportFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  // Reset filters
  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
  },

  // Clear reports
  clearReports: () => {
    // Cleanup all polling
    const { generatingStates } = get();
    Object.values(generatingStates).forEach((state) => {
      if (state?.cleanupFn) {
        state.cleanupFn();
      }
    });

    set({
      reports: [],
      selectedReport: null,
      isLoadingReports: false,
      reportsError: null,
      isGenerating: false,
      generatingReportId: null,
      generatingStates: {},
      generationError: null,
    });
  },

  // Clear errors
  clearErrors: () => {
    set({
      reportsError: null,
      generationError: null,
    });
  },
}));
