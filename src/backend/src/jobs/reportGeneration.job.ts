/**
 * Report Generation Job - Sprint 11-12
 * BullMQ worker for async report generation
 * Communicates with Python service for PDF/Excel generation
 */

import { Job, Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { createWorker } from '../config/queue.js';
import * as reportService from '../services/report.service.js';
import { getStorageAdapter } from '../services/storage/index.js';
import type {
  ReportOptions,
  ReportGenerationJobData,
  ReportGenerationResult,
  PythonReportResponse,
} from '../types/report.js';

// Add REPORT queue name to queue config
const REPORT_QUEUE_NAME = 'report-generation';

// ============================================================================
// Report Generation Job Processing
// ============================================================================

/**
 * Process a report generation job
 */
async function processReportJob(
  job: Job<ReportGenerationJobData>
): Promise<ReportGenerationResult> {
  const { reportId, analysisId, options } = job.data;
  const startTime = Date.now();

  logger.info(`Starting report generation job ${job.id} for report ${reportId}`);

  try {
    // Update job progress
    await job.updateProgress(5);

    // Mark report as generating
    await reportService.markReportGenerating(reportId);
    await job.updateProgress(10);

    // Get analysis data for report
    const analysis = await reportService.getAnalysisForReport(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    if (analysis.status !== 'COMPLETED') {
      throw new Error(`Analysis ${analysisId} is not completed`);
    }

    await job.updateProgress(20);

    // Send to Python service for report generation
    let pythonResult: PythonReportResponse;
    try {
      pythonResult = await reportService.sendToPythonService(reportId, analysisId, options);
      await job.updateProgress(80);
    } catch (processingError) {
      // If Python service is unavailable, generate a mock/simple report
      // This allows testing without the Python service running
      const errorMessage = processingError instanceof Error
        ? processingError.message
        : 'Python service unavailable';

      logger.warn(`Python service failed, attempting fallback: ${errorMessage}`);

      // For development/testing: simulate successful generation
      if (config.isDevelopment) {
        pythonResult = await simulateReportGeneration(reportId, analysisId, options, job);
      } else {
        throw processingError;
      }
    }

    await job.updateProgress(90);

    // Complete the report with file paths
    await reportService.completeReport(reportId, pythonResult.pdfPath, pythonResult.excelPath);

    await job.updateProgress(100);

    const processingTime = Date.now() - startTime;
    logger.info(`Report ${reportId} generation completed in ${processingTime}ms`);

    const result: ReportGenerationResult = {
      success: true,
      reportId,
      processingTime,
    };
    if (pythonResult.pdfPath) result.pdfPath = pythonResult.pdfPath;
    if (pythonResult.excelPath) result.excelPath = pythonResult.excelPath;
    if (pythonResult.fileSize) result.fileSize = pythonResult.fileSize;

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown report generation error';
    logger.error(`Report generation job failed for ${reportId}: ${errorMessage}`);

    // Mark report as failed
    try {
      await reportService.failReport(reportId, errorMessage);
    } catch (updateError) {
      logger.error(`Failed to update report status: ${updateError}`);
    }

    return {
      success: false,
      reportId,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Development/Testing Fallback
// ============================================================================

/**
 * Simulate report generation for development/testing
 * Creates placeholder files when Python service is unavailable
 */
async function simulateReportGeneration(
  reportId: string,
  analysisId: string,
  options: ReportOptions,
  job: Job<ReportGenerationJobData>
): Promise<PythonReportResponse> {
  logger.info(`Simulating report generation for ${reportId}`);

  const storage = getStorageAdapter();
  const result: PythonReportResponse = {
    success: true,
    fileSize: {},
  };

  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await job.updateProgress(40);

  // Generate PDF placeholder if requested
  if (options.format === 'pdf' || options.format === 'both') {
    const pdfPath = `reports/${reportId}/report.pdf`;
    const pdfContent = Buffer.from(
      `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 700 Td
(Report Placeholder - Analysis: ${analysisId}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
310
%%EOF`
    );

    await storage.upload(pdfPath, pdfContent, { contentType: 'application/pdf' });
    result.pdfPath = pdfPath;
    result.fileSize!.pdf = pdfContent.length;
    logger.debug(`Generated placeholder PDF: ${pdfPath}`);
  }

  await job.updateProgress(60);

  // Generate Excel placeholder if requested
  if (options.format === 'excel' || options.format === 'both') {
    const excelPath = `reports/${reportId}/report.xlsx`;
    // Minimal XLSX file (just a placeholder)
    const excelContent = Buffer.from(
      'UEsDBBQAAAAIAAAAAACxHg0AFAAAABQAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldFBLAwQUAAAACAAAAAAA',
      'base64'
    );

    await storage.upload(excelPath, excelContent, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    result.excelPath = excelPath;
    result.fileSize!.excel = excelContent.length;
    logger.debug(`Generated placeholder Excel: ${excelPath}`);
  }

  await job.updateProgress(80);

  return result;
}

// ============================================================================
// Worker Creation
// ============================================================================

/**
 * Create and start the report generation worker
 */
export function createReportGenerationWorker(
  concurrency = 2
): Worker<ReportGenerationJobData, ReportGenerationResult> {
  const worker = createWorker<ReportGenerationJobData, ReportGenerationResult>(
    REPORT_QUEUE_NAME as never, // Cast needed as queue name is not in QUEUE_NAMES yet
    processReportJob,
    concurrency
  );

  worker.on('completed', (job, result) => {
    if (result.success) {
      logger.info(
        `Report generation job ${job.id} completed successfully for report ${result.reportId} ` +
          `in ${result.processingTime}ms`
      );
    } else {
      logger.warn(
        `Report generation job ${job.id} completed with error for report ${result.reportId}: ` +
          `${result.error}`
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      `Report generation job ${job?.id} failed for report ${job?.data.reportId}: ${error.message}`
    );

    // Ensure report is marked as failed
    if (job?.data.reportId) {
      reportService.failReport(job.data.reportId, error.message).catch((err) => {
        logger.error(`Failed to update report status: ${err}`);
      });
    }
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Report generation job ${job.id} progress: ${progress}%`);
  });

  logger.info(`Report generation worker started with concurrency: ${concurrency}`);

  return worker;
}

// ============================================================================
// Queue Functions
// ============================================================================

/**
 * Queue a report for generation
 */
export async function queueReportGeneration(
  reportId: string,
  analysisId: string,
  projectId: string,
  userId: string,
  options: ReportOptions
): Promise<string> {
  // Create queue for report generation
  const { createQueue } = await import('../config/queue.js');
  const queue = createQueue(REPORT_QUEUE_NAME as never);

  const job = await queue.add(
    'generate-report',
    {
      reportId,
      analysisId,
      projectId,
      userId,
      options,
    },
    {
      jobId: `report-${reportId}`,
      priority: 1,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );

  logger.info(`Report ${reportId} queued for generation with job ID: ${job.id}`);

  return job.id ?? reportId;
}

/**
 * Get report generation job status
 */
export async function getReportJobStatus(
  reportId: string
): Promise<{
  state: string;
  progress: number;
  result?: ReportGenerationResult;
  error?: string;
} | null> {
  const { createQueue } = await import('../config/queue.js');
  const queue = createQueue(REPORT_QUEUE_NAME as never);

  const job = await queue.getJob(`report-${reportId}`);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  const status: {
    state: string;
    progress: number;
    result?: ReportGenerationResult;
    error?: string;
  } = {
    state,
    progress,
  };

  if (job.returnvalue !== undefined) {
    status.result = job.returnvalue as ReportGenerationResult;
  }
  if (job.failedReason !== undefined) {
    status.error = job.failedReason;
  }

  return status;
}

/**
 * Cancel a pending report generation job
 */
export async function cancelReportGeneration(reportId: string): Promise<boolean> {
  const { createQueue } = await import('../config/queue.js');
  const queue = createQueue(REPORT_QUEUE_NAME as never);

  const job = await queue.getJob(`report-${reportId}`);
  if (!job) {
    return false;
  }

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    logger.info(`Report generation job for ${reportId} cancelled`);
    return true;
  }

  logger.warn(`Cannot cancel report job ${reportId} in state: ${state}`);
  return false;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createReportGenerationWorker,
  queueReportGeneration,
  getReportJobStatus,
  cancelReportGeneration,
};
