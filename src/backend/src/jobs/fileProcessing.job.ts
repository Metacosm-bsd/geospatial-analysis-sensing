/**
 * File Processing Job
 * Handles file processing after upload completes
 * Sends processing request to Python service
 *
 * Sprint 7-8: Added FULL_PIPELINE job type for complete LiDAR analysis
 */

import { Job, Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { createWorker, QUEUE_NAMES } from '../config/queue.js';
import * as fileService from '../services/file.service.js';
import * as processingService from '../services/processing.service.js';
import type {
  ProcessingStage,
  FullPipelineJobData,
  FullPipelineResult,
  DetailedProcessingResults,
  PipelineParameters,
} from '../types/processing.js';
import { PROCESSING_STAGE_LABELS } from '../types/processing.js';

/**
 * File processing job data
 */
export interface FileProcessingJobData {
  fileId: string;
  storagePath: string;
  fileType: string;
  projectId: string;
}

/**
 * File processing result
 */
export interface FileProcessingResult {
  success: boolean;
  fileId: string;
  processingTime: number;
  metadata?: {
    bounds?: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
    crs?: string;
    pointCount?: number;
    resolution?: number;
    additionalMetadata?: Record<string, unknown>;
  };
  error?: string;
}

/**
 * Send processing request to Python service
 */
async function sendToProcessingService(
  fileId: string,
  storagePath: string,
  fileType: string
): Promise<FileProcessingResult['metadata']> {
  const url = `${config.processing.serviceUrl}/api/v1/process`;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        storagePath,
        fileType,
        storageConfig: {
          type: config.storage.type,
          localPath: config.storage.localPath,
          s3Bucket: config.s3.bucket,
          s3Region: config.s3.region,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Processing service returned ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as {
      success: boolean;
      metadata?: FileProcessingResult['metadata'];
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? 'Processing failed with unknown error');
    }

    logger.info(`File ${fileId} processed in ${Date.now() - startTime}ms`);

    return result.metadata;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Processing service error for file ${fileId}: ${errorMessage}`);
    throw error;
  }
}

/**
 * Process a file processing job
 */
async function processFileJob(
  job: Job<FileProcessingJobData>
): Promise<FileProcessingResult> {
  const { fileId, storagePath, fileType } = job.data;
  const startTime = Date.now();

  logger.info(`Starting file processing job ${job.id} for file ${fileId}`);

  try {
    // Update job progress
    await job.updateProgress(10);

    // Verify file exists
    const file = await fileService.getFileMetadata(fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found in database`);
    }

    if (file.status !== 'PROCESSING') {
      throw new Error(`File ${fileId} has invalid status: ${file.status}`);
    }

    await job.updateProgress(20);

    // Send to processing service
    let metadata: FileProcessingResult['metadata'];
    try {
      metadata = await sendToProcessingService(fileId, storagePath, fileType);
      await job.updateProgress(80);
    } catch (processingError) {
      // If processing service is unavailable, log and mark as error
      const errorMessage = processingError instanceof Error
        ? processingError.message
        : 'Processing service unavailable';

      logger.error(`Processing service failed for file ${fileId}: ${errorMessage}`);

      // Update file status to error
      await fileService.updateFileStatus(fileId, 'ERROR', errorMessage);

      return {
        success: false,
        fileId,
        processingTime: Date.now() - startTime,
        error: errorMessage,
      };
    }

    // Update file metadata if provided
    if (metadata) {
      const updateData: {
        bounds?: { minX: number; minY: number; maxX: number; maxY: number };
        crs?: string;
        pointCount?: number;
        resolution?: number;
        metadata?: Record<string, unknown>;
      } = {};
      if (metadata.bounds !== undefined) updateData.bounds = metadata.bounds;
      if (metadata.crs !== undefined) updateData.crs = metadata.crs;
      if (metadata.pointCount !== undefined) updateData.pointCount = metadata.pointCount;
      if (metadata.resolution !== undefined) updateData.resolution = metadata.resolution;
      if (metadata.additionalMetadata !== undefined) updateData.metadata = metadata.additionalMetadata;
      await fileService.updateFileMetadata(fileId, updateData);
    }

    await job.updateProgress(90);

    // Mark file as ready
    await fileService.updateFileStatus(fileId, 'READY');

    await job.updateProgress(100);

    const processingTime = Date.now() - startTime;
    logger.info(`File ${fileId} processing completed in ${processingTime}ms`);

    const result: FileProcessingResult = {
      success: true,
      fileId,
      processingTime,
    };
    if (metadata !== undefined) {
      result.metadata = metadata;
    }
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    logger.error(`File processing job failed for ${fileId}: ${errorMessage}`);

    // Update file status to error
    try {
      await fileService.updateFileStatus(fileId, 'ERROR', errorMessage);
    } catch (updateError) {
      logger.error(`Failed to update file status: ${updateError}`);
    }

    return {
      success: false,
      fileId,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Full Pipeline Processing (Sprint 7-8)
// ============================================================================

/**
 * Processing stages with their progress weight
 */
const STAGE_WEIGHTS: Record<ProcessingStage, number> = {
  queued: 0,
  ground_classification: 20,
  height_normalization: 20,
  tree_detection: 30,
  metrics_extraction: 25,
  completed: 5,
  failed: 0,
};

/**
 * Process a full LiDAR analysis pipeline job
 */
async function processFullPipelineJob(
  job: Job<FullPipelineJobData>
): Promise<FullPipelineResult> {
  const { analysisId, fileIds, parameters } = job.data;
  const startTime = Date.now();

  logger.info(`Starting full pipeline job ${job.id} for analysis ${analysisId}`);

  try {
    // Check if cancelled before starting
    if (await processingService.isCancelled(analysisId)) {
      logger.info(`Pipeline ${analysisId} cancelled before starting`);
      return {
        success: false,
        analysisId,
        processingTime: 0,
        error: 'Processing cancelled by user',
      };
    }

    // Get file information
    const files: Array<{ fileId: string; storagePath: string; fileType: string }> = [];
    for (const fileId of fileIds) {
      const file = await fileService.getFileMetadata(fileId);
      if (!file) {
        throw new Error(`File ${fileId} not found`);
      }
      if (file.status !== 'READY') {
        throw new Error(`File ${fileId} is not ready for processing (status: ${file.status})`);
      }
      files.push({
        fileId: file.id,
        storagePath: file.storagePath,
        fileType: file.fileType,
      });
    }

    // Update progress to ground classification
    await processingService.updateProgress(
      analysisId,
      'ground_classification',
      0,
      'Starting ground point classification'
    );
    await job.updateProgress(5);

    // Send to Python processing service
    const response = await processingService.sendToPythonService(
      analysisId,
      files,
      parameters
    );

    // If Python service processes synchronously, update with results
    if (response.success && response.results) {
      await processingService.completeProcessing(analysisId, response.results);
      await job.updateProgress(100);

      const result: FullPipelineResult = {
        success: true,
        analysisId,
        processingTime: Date.now() - startTime,
        results: response.results,
      };
      if (response.outputFiles) {
        result.outputFiles = response.outputFiles.map((f) => f.storagePath);
      }
      return result;
    }

    // If processing is async (callback-based), just return acknowledgment
    // The progress will be updated via callbacks from Python service
    if (!response.success) {
      const errorMsg = response.error ?? 'Processing failed';
      await processingService.failProcessing(analysisId, errorMsg);
      return {
        success: false,
        analysisId,
        processingTime: Date.now() - startTime,
        error: errorMsg,
      };
    }

    // Async processing started
    return {
      success: true,
      analysisId,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown pipeline error';
    logger.error(`Full pipeline job failed for ${analysisId}: ${errorMessage}`);

    // Mark processing as failed
    try {
      await processingService.failProcessing(analysisId, errorMessage);
    } catch (updateError) {
      logger.error(`Failed to update processing status: ${updateError}`);
    }

    return {
      success: false,
      analysisId,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Simulate processing stages (for development/testing without Python service)
 * @internal Used for testing purposes
 */
export async function simulateProcessingStages(
  analysisId: string,
  job: Job<FullPipelineJobData>
): Promise<DetailedProcessingResults> {
  const stages: Array<{ stage: ProcessingStage; duration: number }> = [
    { stage: 'ground_classification', duration: 2000 },
    { stage: 'height_normalization', duration: 1500 },
    { stage: 'tree_detection', duration: 3000 },
    { stage: 'metrics_extraction', duration: 2000 },
  ];

  let overallProgress = 0;

  for (const { stage, duration } of stages) {
    // Check for cancellation
    if (await processingService.isCancelled(analysisId)) {
      throw new Error('Processing cancelled by user');
    }

    // Update stage
    await processingService.updateProgress(
      analysisId,
      stage,
      0,
      `Starting ${PROCESSING_STAGE_LABELS[stage]}`
    );

    // Simulate stage progress
    const steps = 10;
    const stepDuration = duration / steps;

    for (let i = 1; i <= steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, stepDuration));

      const stageProgress = (i / steps) * 100;
      await processingService.updateProgress(
        analysisId,
        stage,
        stageProgress,
        `${PROCESSING_STAGE_LABELS[stage]}: ${Math.round(stageProgress)}% complete`
      );

      overallProgress += STAGE_WEIGHTS[stage] / steps;
      await job.updateProgress(Math.round(overallProgress));
    }
  }

  // Generate mock results
  return {
    treeCount: Math.floor(Math.random() * 1000) + 100,
    averageHeight: 15 + Math.random() * 10,
    maxHeight: 30 + Math.random() * 15,
    minHeight: 3 + Math.random() * 5,
    heightStdDev: 3 + Math.random() * 2,
    canopyArea: 5000 + Math.random() * 10000,
    canopyCoverPercent: 40 + Math.random() * 40,
    pointCount: 1000000 + Math.floor(Math.random() * 5000000),
    groundPointCount: 200000 + Math.floor(Math.random() * 500000),
    vegetationPointCount: 800000 + Math.floor(Math.random() * 4000000),
    pointDensity: 10 + Math.random() * 20,
  };
}

// ============================================================================
// Worker Creation Functions
// ============================================================================

/**
 * Create and start the file processing worker
 */
export function createFileProcessingWorker(
  concurrency = 3
): Worker<FileProcessingJobData, FileProcessingResult> {
  const worker = createWorker<FileProcessingJobData, FileProcessingResult>(
    QUEUE_NAMES.FILE_UPLOAD,
    processFileJob,
    concurrency
  );

  worker.on('completed', (job, result) => {
    if (result.success) {
      logger.info(
        `File processing job ${job.id} completed successfully for file ${result.fileId} ` +
          `in ${result.processingTime}ms`
      );
    } else {
      logger.warn(
        `File processing job ${job.id} completed with error for file ${result.fileId}: ` +
          `${result.error}`
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      `File processing job ${job?.id} failed for file ${job?.data.fileId}: ${error.message}`
    );
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`File processing job ${job.id} progress: ${progress}%`);
  });

  logger.info(`File processing worker started with concurrency: ${concurrency}`);

  return worker;
}

/**
 * Create and start the full pipeline processing worker (Sprint 7-8)
 */
export function createFullPipelineWorker(
  concurrency = 2
): Worker<FullPipelineJobData, FullPipelineResult> {
  const worker = createWorker<FullPipelineJobData, FullPipelineResult>(
    QUEUE_NAMES.ANALYSIS,
    processFullPipelineJob,
    concurrency
  );

  worker.on('completed', (job, result) => {
    if (result.success) {
      logger.info(
        `Full pipeline job ${job.id} completed successfully for analysis ${result.analysisId} ` +
          `in ${result.processingTime}ms`
      );
      if (result.results) {
        logger.info(
          `Analysis results: ${result.results.treeCount} trees detected, ` +
            `avg height: ${result.results.averageHeight?.toFixed(2)}m`
        );
      }
    } else {
      logger.warn(
        `Full pipeline job ${job.id} completed with error for analysis ${result.analysisId}: ` +
          `${result.error}`
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      `Full pipeline job ${job?.id} failed for analysis ${job?.data.analysisId}: ${error.message}`
    );

    // Ensure processing is marked as failed
    if (job?.data.analysisId) {
      processingService.failProcessing(job.data.analysisId, error.message).catch((err) => {
        logger.error(`Failed to update processing status: ${err}`);
      });
    }
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Full pipeline job ${job.id} progress: ${progress}%`);
  });

  logger.info(`Full pipeline worker started with concurrency: ${concurrency}`);

  return worker;
}

/**
 * Queue a file for processing
 */
export async function queueFileProcessing(
  fileId: string,
  storagePath: string,
  fileType: string,
  projectId: string
): Promise<string> {
  const { getQueue } = await import('../config/queue.js');
  const queue = getQueue(QUEUE_NAMES.FILE_UPLOAD);

  const job = await queue.add(
    'process-file',
    {
      fileId,
      storagePath,
      fileType,
      projectId,
    },
    {
      jobId: `file-${fileId}`,
      priority: 1,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );

  logger.info(`File ${fileId} queued for processing with job ID: ${job.id}`);

  return job.id ?? fileId;
}

/**
 * Queue a full pipeline processing job (Sprint 7-8)
 */
export async function queueFullPipeline(
  analysisId: string,
  fileIds: string[],
  projectId: string,
  userId: string,
  parameters: PipelineParameters = {}
): Promise<string> {
  const { getQueue } = await import('../config/queue.js');
  const queue = getQueue(QUEUE_NAMES.ANALYSIS);

  const job = await queue.add(
    'full-pipeline',
    {
      analysisId,
      fileIds,
      projectId,
      userId,
      parameters,
    },
    {
      jobId: `analysis-${analysisId}`,
      priority: 1,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    }
  );

  logger.info(`Full pipeline ${analysisId} queued with job ID: ${job.id}`);

  return job.id ?? analysisId;
}

/**
 * Get processing job status
 */
export async function getProcessingJobStatus(
  jobId: string
): Promise<{
  state: string;
  progress: number;
  result?: FileProcessingResult;
  error?: string;
} | null> {
  const { getQueue } = await import('../config/queue.js');
  const queue = getQueue(QUEUE_NAMES.FILE_UPLOAD);

  const job = await queue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  const status: {
    state: string;
    progress: number;
    result?: FileProcessingResult;
    error?: string;
  } = {
    state,
    progress,
  };
  if (job.returnvalue !== undefined) {
    status.result = job.returnvalue as FileProcessingResult;
  }
  if (job.failedReason !== undefined) {
    status.error = job.failedReason;
  }
  return status;
}

/**
 * Get full pipeline job status (Sprint 7-8)
 */
export async function getFullPipelineJobStatus(
  analysisId: string
): Promise<{
  state: string;
  progress: number;
  result?: FullPipelineResult;
  error?: string;
} | null> {
  const { getQueue } = await import('../config/queue.js');
  const queue = getQueue(QUEUE_NAMES.ANALYSIS);

  const job = await queue.getJob(`analysis-${analysisId}`);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  const status: {
    state: string;
    progress: number;
    result?: FullPipelineResult;
    error?: string;
  } = {
    state,
    progress,
  };
  if (job.returnvalue !== undefined) {
    status.result = job.returnvalue as FullPipelineResult;
  }
  if (job.failedReason !== undefined) {
    status.error = job.failedReason;
  }
  return status;
}

export default {
  createFileProcessingWorker,
  createFullPipelineWorker,
  queueFileProcessing,
  queueFullPipeline,
  getProcessingJobStatus,
  getFullPipelineJobStatus,
  simulateProcessingStages,
};
