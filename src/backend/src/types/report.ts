/**
 * Report Types for Sprint 11-12
 * Type definitions for report generation and management
 */

// ============================================================================
// Report Format and Status Types
// ============================================================================

/**
 * Supported report output formats
 */
export type ReportFormat = 'pdf' | 'excel' | 'both';

/**
 * Report generation status
 */
export type ReportStatus = 'queued' | 'generating' | 'completed' | 'failed';

// ============================================================================
// Report Options and Configuration
// ============================================================================

/**
 * Options for report generation
 */
export interface ReportOptions {
  /** Output format for the report */
  format: ReportFormat;
  /** Include visualizations and charts in the report */
  includeCharts: boolean;
  /** Include detailed tree list/inventory */
  includeTreeList: boolean;
  /** Include methodology section explaining analysis techniques */
  includeMethodology: boolean;
  /** Unit system for measurements */
  units: 'metric' | 'imperial';
  /** Custom report title (optional) */
  title?: string;
}

/**
 * Default report options
 */
export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  format: 'pdf',
  includeCharts: true,
  includeTreeList: true,
  includeMethodology: false,
  units: 'metric',
};

// ============================================================================
// Report Metadata and Response Types
// ============================================================================

/**
 * Report metadata returned from the API
 */
export interface ReportMetadata {
  /** Unique report identifier */
  id: string;
  /** ID of the analysis this report is generated from */
  analysisId: string;
  /** ID of the project containing the analysis */
  projectId: string;
  /** Current generation status */
  status: ReportStatus;
  /** Requested output format */
  format: ReportFormat;
  /** Signed URL for PDF download (if available) */
  pdfUrl?: string;
  /** Signed URL for Excel download (if available) */
  excelUrl?: string;
  /** Timestamp when report generation completed */
  generatedAt?: string;
  /** File sizes in bytes */
  fileSize?: { pdf?: number; excel?: number };
  /** Error message if generation failed */
  error?: string;
  /** Report creation timestamp */
  createdAt?: string;
}

/**
 * File size information for generated reports
 */
export interface ReportFileSize {
  pdf?: number;
  excel?: number;
}

// ============================================================================
// Request and Response DTOs
// ============================================================================

/**
 * Request body for generating a new report
 */
export interface GenerateReportRequest {
  /** ID of the analysis to generate report from */
  analysisId: string;
  /** Report generation options */
  options: ReportOptions;
}

/**
 * Response from report generation request
 */
export interface GenerateReportResponse {
  /** Generated report ID */
  reportId: string;
  /** Initial status (usually 'queued') */
  status: ReportStatus;
  /** Estimated generation time in seconds */
  estimatedTime?: number;
}

/**
 * Report status response with detailed progress
 */
export interface ReportStatusResponse {
  /** Report metadata */
  report: ReportMetadata;
  /** Generation progress percentage (0-100) */
  progress?: number;
  /** Current stage message */
  currentStage?: string;
}

/**
 * Download URL response
 */
export interface ReportDownloadResponse {
  /** Signed download URL */
  url: string;
  /** URL expiration time in seconds */
  expiresIn: number;
  /** File name for download */
  filename: string;
  /** File size in bytes */
  fileSize?: number;
}

// ============================================================================
// Job Queue Types
// ============================================================================

/**
 * Data payload for report generation job
 */
export interface ReportGenerationJobData {
  /** Report ID in the database */
  reportId: string;
  /** Analysis ID to generate report from */
  analysisId: string;
  /** Project ID containing the analysis */
  projectId: string;
  /** User ID who requested the report */
  userId: string;
  /** Report generation options */
  options: ReportOptions;
}

/**
 * Result from report generation job
 */
export interface ReportGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Report ID */
  reportId: string;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Generated PDF file path (if applicable) */
  pdfPath?: string;
  /** Generated Excel file path (if applicable) */
  excelPath?: string;
  /** File sizes */
  fileSize?: ReportFileSize;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Python Service Communication Types
// ============================================================================

/**
 * Request to Python report generation service
 */
export interface PythonReportRequest {
  /** Analysis ID */
  analysisId: string;
  /** Report options */
  options: ReportOptions;
  /** Storage configuration for output files */
  storageConfig: {
    type: 'local' | 's3';
    localPath?: string;
    s3Bucket?: string;
    s3Region?: string;
  };
  /** Callback URL for progress updates (optional) */
  callbackUrl?: string;
}

/**
 * Response from Python report generation service
 */
export interface PythonReportResponse {
  /** Whether generation succeeded */
  success: boolean;
  /** PDF file storage path */
  pdfPath?: string;
  /** Excel file storage path */
  excelPath?: string;
  /** File sizes */
  fileSize?: ReportFileSize;
  /** Error message if failed */
  error?: string;
}

/**
 * Progress update from Python service
 */
export interface ReportProgressUpdate {
  /** Report ID */
  reportId: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current stage description */
  stage: string;
  /** Status update */
  status?: ReportStatus;
}

// ============================================================================
// Database Model Types (mirrors Prisma model)
// ============================================================================

/**
 * Report database model type
 * Used when Prisma types are not yet generated
 */
export interface ReportModel {
  id: string;
  analysisId: string;
  projectId: string;
  status: 'QUEUED' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  format: string;
  pdfPath: string | null;
  excelPath: string | null;
  options: Record<string, unknown>;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * Convert database status to API status
 */
export function mapDbStatusToApiStatus(dbStatus: ReportModel['status']): ReportStatus {
  const statusMap: Record<ReportModel['status'], ReportStatus> = {
    QUEUED: 'queued',
    GENERATING: 'generating',
    COMPLETED: 'completed',
    FAILED: 'failed',
  };
  return statusMap[dbStatus];
}

/**
 * Convert API status to database status
 */
export function mapApiStatusToDbStatus(apiStatus: ReportStatus): ReportModel['status'] {
  const statusMap: Record<ReportStatus, ReportModel['status']> = {
    queued: 'QUEUED',
    generating: 'GENERATING',
    completed: 'COMPLETED',
    failed: 'FAILED',
  };
  return statusMap[apiStatus];
}
