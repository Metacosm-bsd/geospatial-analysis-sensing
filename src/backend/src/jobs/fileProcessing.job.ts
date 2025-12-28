/**
 * File Processing Job
 * Handles file processing after upload completes
 * Sends processing request to Python service
 */

import { Job, Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { createWorker, QUEUE_NAMES } from '../config/queue.js';
import * as fileService from '../services/file.service.js';

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

export default {
  createFileProcessingWorker,
  queueFileProcessing,
  getProcessingJobStatus,
};
