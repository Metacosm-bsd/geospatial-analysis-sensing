/**
 * Report Service - Sprint 11-12
 * Handles report generation, status tracking, and file management
 */

import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { getStorageAdapter } from './storage/index.js';
import type {
  ReportOptions,
  ReportMetadata,
  ReportStatus,
  ReportFormat,
  GenerateReportResponse,
  ReportDownloadResponse,
  PythonReportRequest,
  PythonReportResponse,
} from '../types/report.js';

// Type alias for JSON values since Prisma types may not be generated
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate a new report from an analysis
 * @param analysisId - ID of the analysis to generate report from
 * @param options - Report generation options
 * @param userId - ID of the user requesting the report
 * @returns Report generation response with report ID
 */
export async function generateReport(
  analysisId: string,
  options: ReportOptions,
  userId: string
): Promise<GenerateReportResponse> {
  try {
    // Verify analysis exists and user has access
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    if (analysis.project.userId !== userId) {
      throw new Error('Access denied: You do not own this analysis');
    }

    if (analysis.status !== 'COMPLETED') {
      throw new Error('Analysis must be completed before generating a report');
    }

    // Create report record
    const report = await prisma.report.create({
      data: {
        analysisId,
        projectId: analysis.project.id,
        format: options.format,
        options: options as unknown as JsonValue,
        status: 'QUEUED',
      },
    });

    logger.info(`Report ${report.id} created for analysis ${analysisId}`);

    // Queue the report generation job
    const { queueReportGeneration } = await import('../jobs/reportGeneration.job.js');
    await queueReportGeneration(
      report.id,
      analysisId,
      analysis.project.id,
      userId,
      options
    );

    return {
      reportId: report.id,
      status: 'queued',
      estimatedTime: estimateGenerationTime(options),
    };
  } catch (error) {
    logger.error('Error generating report:', error);
    throw error;
  }
}

/**
 * Estimate report generation time based on options
 */
function estimateGenerationTime(options: ReportOptions): number {
  let baseTime = 30; // Base time in seconds

  if (options.includeCharts) baseTime += 15;
  if (options.includeTreeList) baseTime += 20;
  if (options.includeMethodology) baseTime += 5;
  if (options.format === 'both') baseTime += 20;

  return baseTime;
}

// ============================================================================
// Report Status and Retrieval
// ============================================================================

/**
 * Get report metadata by ID
 * @param reportId - Report ID
 * @param userId - User ID for access verification
 * @returns Report metadata or null if not found
 */
export async function getReportStatus(
  reportId: string,
  userId?: string
): Promise<ReportMetadata | null> {
  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        project: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!report) {
      return null;
    }

    // Verify access if userId provided
    if (userId && report.project.userId !== userId) {
      throw new Error('Access denied: You do not have access to this report');
    }

    return mapReportToMetadata(report);
  } catch (error) {
    logger.error('Error getting report status:', error);
    throw error;
  }
}

/**
 * Get signed download URL for a report file
 * @param reportId - Report ID
 * @param format - Format to download ('pdf' or 'excel')
 * @param userId - User ID for access verification
 * @returns Download URL response
 */
export async function getReportDownloadUrl(
  reportId: string,
  format: 'pdf' | 'excel',
  userId?: string
): Promise<ReportDownloadResponse> {
  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        project: {
          select: {
            userId: true,
          },
        },
        analysis: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Verify access if userId provided
    if (userId && report.project.userId !== userId) {
      throw new Error('Access denied: You do not have access to this report');
    }

    if (report.status !== 'COMPLETED') {
      throw new Error('Report is not ready for download');
    }

    // Get the appropriate file path
    const filePath = format === 'pdf' ? report.pdfPath : report.excelPath;

    if (!filePath) {
      throw new Error(`${format.toUpperCase()} format not available for this report`);
    }

    // Generate signed URL
    const storage = getStorageAdapter();
    const expiresIn = 3600; // 1 hour
    const url = await storage.getSignedUrl(filePath, { expiresIn, method: 'GET' });

    // Get file size
    const metadata = await storage.getMetadata(filePath);
    const fileSize = metadata?.size;

    // Generate filename
    const extension = format === 'pdf' ? 'pdf' : 'xlsx';
    const filename = `${report.analysis.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.${extension}`;

    const response: ReportDownloadResponse = {
      url,
      expiresIn,
      filename,
    };
    if (fileSize !== undefined) response.fileSize = fileSize;

    return response;
  } catch (error) {
    logger.error('Error getting report download URL:', error);
    throw error;
  }
}

/**
 * List all reports for a project
 * @param projectId - Project ID
 * @param userId - User ID for access verification
 * @returns Array of report metadata
 */
export async function listProjectReports(
  projectId: string,
  userId?: string
): Promise<ReportMetadata[]> {
  try {
    // Verify project access if userId provided
    if (userId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.userId !== userId) {
        throw new Error('Access denied: You do not have access to this project');
      }
    }

    const reports = await prisma.report.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return reports.map(mapReportToMetadata);
  } catch (error) {
    logger.error('Error listing project reports:', error);
    throw error;
  }
}

/**
 * Delete a report and its files
 * @param reportId - Report ID
 * @param userId - User ID for access verification
 */
export async function deleteReport(reportId: string, userId?: string): Promise<void> {
  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        project: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Verify access if userId provided
    if (userId && report.project.userId !== userId) {
      throw new Error('Access denied: You do not have access to this report');
    }

    // Delete files from storage
    const storage = getStorageAdapter();
    const deletePromises: Promise<void>[] = [];

    if (report.pdfPath) {
      deletePromises.push(
        storage.delete(report.pdfPath).catch((err) => {
          logger.warn(`Failed to delete PDF file: ${err.message}`);
        })
      );
    }

    if (report.excelPath) {
      deletePromises.push(
        storage.delete(report.excelPath).catch((err) => {
          logger.warn(`Failed to delete Excel file: ${err.message}`);
        })
      );
    }

    await Promise.all(deletePromises);

    // Delete database record
    await prisma.report.delete({
      where: { id: reportId },
    });

    logger.info(`Report ${reportId} deleted`);
  } catch (error) {
    logger.error('Error deleting report:', error);
    throw error;
  }
}

// ============================================================================
// Report Update Functions (used by job worker)
// ============================================================================

/**
 * Update report status to generating
 * @param reportId - Report ID
 */
export async function markReportGenerating(reportId: string): Promise<void> {
  await prisma.report.update({
    where: { id: reportId },
    data: { status: 'GENERATING' },
  });
  logger.debug(`Report ${reportId} marked as generating`);
}

/**
 * Complete report generation successfully
 * @param reportId - Report ID
 * @param pdfPath - Path to generated PDF file
 * @param excelPath - Path to generated Excel file
 */
export async function completeReport(
  reportId: string,
  pdfPath?: string,
  excelPath?: string
): Promise<void> {
  const updateData: {
    status: 'COMPLETED';
    completedAt: Date;
    pdfPath?: string;
    excelPath?: string;
  } = {
    status: 'COMPLETED',
    completedAt: new Date(),
  };

  if (pdfPath) updateData.pdfPath = pdfPath;
  if (excelPath) updateData.excelPath = excelPath;

  await prisma.report.update({
    where: { id: reportId },
    data: updateData,
  });

  logger.info(`Report ${reportId} completed successfully`);
}

/**
 * Mark report generation as failed
 * @param reportId - Report ID
 * @param error - Error message
 */
export async function failReport(reportId: string, error: string): Promise<void> {
  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: 'FAILED',
      error,
      completedAt: new Date(),
    },
  });
  logger.error(`Report ${reportId} failed: ${error}`);
}

// ============================================================================
// Python Service Communication
// ============================================================================

/**
 * Send report generation request to Python service
 * @param reportId - Report ID
 * @param analysisId - Analysis ID
 * @param options - Report options
 * @returns Python service response
 */
export async function sendToPythonService(
  reportId: string,
  analysisId: string,
  options: ReportOptions
): Promise<PythonReportResponse> {
  const url = `${config.processing.serviceUrl}/api/v1/reports/generate`;

  const storageConfig: PythonReportRequest['storageConfig'] = {
    type: config.storage.type,
  };
  if (config.storage.localPath) storageConfig.localPath = config.storage.localPath;
  if (config.s3.bucket) storageConfig.s3Bucket = config.s3.bucket;
  if (config.s3.region) storageConfig.s3Region = config.s3.region;

  const request: PythonReportRequest = {
    analysisId,
    options,
    storageConfig,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python service returned ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as PythonReportResponse;

    if (!result.success) {
      throw new Error(result.error ?? 'Report generation failed with unknown error');
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Python service error for report ${reportId}: ${errorMessage}`);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map database report to API metadata format
 */
function mapReportToMetadata(report: {
  id: string;
  analysisId: string;
  projectId: string;
  status: 'QUEUED' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  format: string;
  pdfPath: string | null;
  excelPath: string | null;
  options: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): ReportMetadata {
  const statusMap: Record<typeof report.status, ReportStatus> = {
    QUEUED: 'queued',
    GENERATING: 'generating',
    COMPLETED: 'completed',
    FAILED: 'failed',
  };

  const metadata: ReportMetadata = {
    id: report.id,
    analysisId: report.analysisId,
    projectId: report.projectId,
    status: statusMap[report.status],
    format: report.format as ReportFormat,
    createdAt: report.createdAt.toISOString(),
  };

  // Only add optional fields if they have values
  if (report.completedAt) metadata.generatedAt = report.completedAt.toISOString();
  if (report.error) metadata.error = report.error;

  return metadata;
}

/**
 * Get analysis data for report generation
 * @param analysisId - Analysis ID
 * @returns Analysis data including results and project info
 */
export async function getAnalysisForReport(analysisId: string) {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          bounds: true,
        },
      },
      resultFiles: true,
      analysisFiles: {
        include: {
          file: true,
        },
      },
    },
  });

  return analysis;
}

// ============================================================================
// Export Service Object
// ============================================================================

export const reportService = {
  generateReport,
  getReportStatus,
  getReportDownloadUrl,
  listProjectReports,
  deleteReport,
  markReportGenerating,
  completeReport,
  failReport,
  sendToPythonService,
  getAnalysisForReport,
};

export default reportService;
