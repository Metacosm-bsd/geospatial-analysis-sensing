import apiClient, { getErrorMessage } from './client';

// Report types
export type ReportFormat = 'pdf' | 'excel' | 'both';
export type ReportStatus = 'generating' | 'completed' | 'failed';

export interface ReportOptions {
  format: ReportFormat;
  includeCharts?: boolean;
  includeTreeList?: boolean;
  includeMethodology?: boolean;
  units?: 'metric' | 'imperial';
  customTitle?: string;
}

export interface Report {
  id: string;
  projectId: string;
  analysisId: string;
  title: string;
  status: ReportStatus;
  format: ReportFormat;
  options: ReportOptions;
  fileSize?: number;
  pdfUrl?: string;
  excelUrl?: string;
  previewUrl?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  metadata?: {
    treeCount?: number;
    analysisType?: string;
    areaHectares?: number;
  };
}

export interface GenerateReportRequest {
  analysisId: string;
  options: ReportOptions;
}

export interface GenerateReportResponse {
  report: Report;
}

export interface ReportStatusResponse {
  report: Report;
}

export interface ListReportsResponse {
  reports: Report[];
  total: number;
}

// Reports API endpoints
const REPORTS_ENDPOINTS = {
  base: '/reports',
  byId: (id: string) => `/reports/${id}`,
  status: (id: string) => `/reports/${id}/status`,
  download: (id: string, format: 'pdf' | 'excel') => `/reports/${id}/download/${format}`,
  projectReports: (projectId: string) => `/projects/${projectId}/reports`,
};

/**
 * Generate a new report from an analysis
 */
export async function generateReport(
  analysisId: string,
  options: ReportOptions
): Promise<Report> {
  try {
    const response = await apiClient.post<GenerateReportResponse>(REPORTS_ENDPOINTS.base, {
      analysisId,
      options,
    });
    return response.data.report;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get the status of a report
 */
export async function getReportStatus(reportId: string): Promise<Report> {
  try {
    const response = await apiClient.get<ReportStatusResponse>(
      REPORTS_ENDPOINTS.status(reportId)
    );
    return response.data.report;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get a report by ID
 */
export async function getReport(reportId: string): Promise<Report> {
  try {
    const response = await apiClient.get<{ report: Report }>(REPORTS_ENDPOINTS.byId(reportId));
    return response.data.report;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Download a report in the specified format
 * Returns a download URL that can be used directly
 */
export async function downloadReport(
  reportId: string,
  format: 'pdf' | 'excel'
): Promise<string> {
  try {
    const response = await apiClient.get<{ downloadUrl: string }>(
      REPORTS_ENDPOINTS.download(reportId, format)
    );
    return response.data.downloadUrl;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Download a report file directly (triggers browser download)
 */
export async function downloadReportFile(
  reportId: string,
  format: 'pdf' | 'excel',
  filename?: string
): Promise<void> {
  try {
    const downloadUrl = await downloadReport(reportId, format);

    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || `report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * List all reports for a project
 */
export async function listProjectReports(
  projectId: string,
  params?: {
    status?: ReportStatus;
    sortBy?: 'createdAt' | 'title';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<ListReportsResponse> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.status) queryParams.append('status', params.status);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const url = queryParams.toString()
      ? `${REPORTS_ENDPOINTS.projectReports(projectId)}?${queryParams.toString()}`
      : REPORTS_ENDPOINTS.projectReports(projectId);

    const response = await apiClient.get<ListReportsResponse>(url);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Delete a report
 */
export async function deleteReport(reportId: string): Promise<void> {
  try {
    await apiClient.delete(REPORTS_ENDPOINTS.byId(reportId));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Poll for report completion
 */
export function pollReportStatus(
  reportId: string,
  onUpdate: (report: Report) => void,
  onComplete: (report: Report) => void,
  onError: (error: Error) => void,
  intervalMs: number = 2000
): () => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  let isPolling = true;

  const poll = async () => {
    if (!isPolling) return;

    try {
      const report = await getReportStatus(reportId);
      onUpdate(report);

      if (report.status === 'completed') {
        onComplete(report);
        return;
      }

      if (report.status === 'failed') {
        onError(new Error(report.error || 'Report generation failed'));
        return;
      }

      // Continue polling if still generating
      timeoutId = setTimeout(poll, intervalMs);
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Failed to get report status'));
    }
  };

  // Start polling
  poll();

  // Return cleanup function
  return () => {
    isPolling = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
