/**
 * Processing Service for Sprint 7-8
 *
 * Handles LiDAR analysis processing pipeline management,
 * progress tracking, and communication with Python processing service.
 */

import { getRedisConnection } from '../config/redis.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { getQueue, QUEUE_NAMES } from '../config/queue.js';
import { prisma } from '../config/database.js';
import type {
  ProcessingStage,
  ProcessingProgress,
  ProcessingResults,
  DetailedProcessingResults,
  FullPipelineJobData,
  PipelineParameters,
  RedisProgressData,
  PythonProcessingRequest,
  PythonProcessingResponse,
  PythonProgressCallback,
  ProgressEvent,
} from '../types/processing.js';
import {
  calculateOverallProgress,
  estimateCompletionTime,
  PROCESSING_STAGE_LABELS,
} from '../types/processing.js';

// Redis key prefixes
const REDIS_KEY_PREFIXES = {
  PROGRESS: 'analysis:progress:',
  RESULTS: 'analysis:results:',
  CANCEL: 'analysis:cancel:',
  EVENTS: 'analysis:events:',
} as const;

// Progress TTL in seconds (24 hours)
const PROGRESS_TTL = 24 * 60 * 60;

// Results TTL in seconds (7 days)
const RESULTS_TTL = 7 * 24 * 60 * 60;

/**
 * Start the full processing pipeline for an analysis
 */
export async function startProcessingPipeline(
  analysisId: string,
  fileIds: string[],
  params: PipelineParameters,
  userId: string
): Promise<string> {
  logger.info(`Starting processing pipeline for analysis ${analysisId}`);

  // Get the analysis and verify it exists
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      project: true,
    },
  });

  if (!analysis) {
    throw new Error(`Analysis ${analysisId} not found`);
  }

  // Initialize progress in Redis
  const now = new Date().toISOString();
  const initialProgress: RedisProgressData = {
    analysisId,
    stage: 'queued',
    progress: 0,
    message: 'Processing job queued',
    startedAt: now,
    updatedAt: now,
    stageStartTimes: {
      queued: now,
      ground_classification: '',
      height_normalization: '',
      tree_detection: '',
      metrics_extraction: '',
      completed: '',
      failed: '',
    },
    stageDurations: {
      queued: 0,
      ground_classification: 0,
      height_normalization: 0,
      tree_detection: 0,
      metrics_extraction: 0,
      completed: 0,
      failed: 0,
    },
  };

  await setProgressData(analysisId, initialProgress);

  // Update analysis status in database
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'PROCESSING',
      progress: 0,
      progressMessage: 'Processing job queued',
      startedAt: new Date(),
    },
  });

  // Queue the processing job
  const queue = getQueue(QUEUE_NAMES.ANALYSIS);
  const jobData: FullPipelineJobData = {
    analysisId,
    fileIds,
    projectId: analysis.projectId,
    userId,
    parameters: params,
  };

  const job = await queue.add('full-pipeline', jobData, {
    jobId: `analysis-${analysisId}`,
    priority: 1,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });

  logger.info(`Pipeline job ${job.id} queued for analysis ${analysisId}`);

  return job.id ?? analysisId;
}

/**
 * Get the current processing progress for an analysis
 */
export async function getProcessingProgress(
  analysisId: string
): Promise<ProcessingProgress | null> {
  // Try to get from Redis first (real-time data)
  const redisData = await getProgressData(analysisId);

  if (redisData) {
    const progress: ProcessingProgress = {
      analysisId: redisData.analysisId,
      stage: redisData.stage,
      progress: redisData.progress,
      message: redisData.message,
      startedAt: redisData.startedAt,
    };

    if (redisData.estimatedCompletion) {
      progress.estimatedCompletion = redisData.estimatedCompletion;
    }

    // Include results if available
    if (redisData.intermediateResults) {
      const ir = redisData.intermediateResults;
      const results: ProcessingResults = {};
      if (ir.treeCount !== undefined) results.treeCount = ir.treeCount;
      if (ir.averageHeight !== undefined) results.averageHeight = ir.averageHeight;
      if (ir.maxHeight !== undefined) results.maxHeight = ir.maxHeight;
      if (ir.canopyArea !== undefined) results.canopyArea = ir.canopyArea;
      if (ir.processingTime !== undefined) results.processingTime = ir.processingTime;
      if (Object.keys(results).length > 0) {
        progress.results = results;
      }
    }

    return progress;
  }

  // Fall back to database
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
  });

  if (!analysis) {
    return null;
  }

  // Map database status to processing stage
  const stageMap: Record<string, ProcessingStage> = {
    PENDING: 'queued',
    PROCESSING: 'ground_classification', // Default to first processing stage
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'failed',
  };

  const progress: ProcessingProgress = {
    analysisId: analysis.id,
    stage: stageMap[analysis.status] ?? 'queued',
    progress: analysis.progress,
    message: analysis.progressMessage ?? 'Processing',
    startedAt: analysis.startedAt?.toISOString() ?? analysis.createdAt.toISOString(),
  };

  if (analysis.results) {
    const parsedResults = parseResults(analysis.results);
    if (parsedResults) {
      progress.results = parsedResults;
    }
  }

  return progress;
}

/**
 * Cancel a processing job
 */
export async function cancelProcessing(analysisId: string): Promise<boolean> {
  logger.info(`Cancelling processing for analysis ${analysisId}`);

  // Set cancellation flag in Redis
  const redis = getRedisConnection();
  await redis.set(
    `${REDIS_KEY_PREFIXES.CANCEL}${analysisId}`,
    'true',
    'EX',
    3600 // 1 hour TTL
  );

  // Try to remove from queue if still waiting
  const queue = getQueue(QUEUE_NAMES.ANALYSIS);
  const job = await queue.getJob(`analysis-${analysisId}`);

  if (job) {
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      logger.info(`Removed waiting job for analysis ${analysisId}`);
    }
  }

  // Update database status
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'CANCELLED',
      progressMessage: 'Processing cancelled by user',
    },
  });

  // Update progress in Redis
  const progressData = await getProgressData(analysisId);
  if (progressData) {
    progressData.stage = 'failed';
    progressData.message = 'Processing cancelled by user';
    progressData.updatedAt = new Date().toISOString();
    await setProgressData(analysisId, progressData);
  }

  return true;
}

/**
 * Check if processing has been cancelled
 */
export async function isCancelled(analysisId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const cancelled = await redis.get(`${REDIS_KEY_PREFIXES.CANCEL}${analysisId}`);
  return cancelled === 'true';
}

/**
 * Update processing progress
 */
export async function updateProgress(
  analysisId: string,
  stage: ProcessingStage,
  stageProgress: number,
  message: string,
  intermediateResults?: Partial<DetailedProcessingResults>
): Promise<void> {
  // Get existing progress data
  let progressData = await getProgressData(analysisId);

  const now = new Date().toISOString();

  if (!progressData) {
    progressData = {
      analysisId,
      stage,
      progress: 0,
      message,
      startedAt: now,
      updatedAt: now,
      stageStartTimes: {
        queued: now,
        ground_classification: '',
        height_normalization: '',
        tree_detection: '',
        metrics_extraction: '',
        completed: '',
        failed: '',
      },
      stageDurations: {
        queued: 0,
        ground_classification: 0,
        height_normalization: 0,
        tree_detection: 0,
        metrics_extraction: 0,
        completed: 0,
        failed: 0,
      },
    };
  }

  // Check if stage changed
  const stageStartTimes = progressData.stageStartTimes ?? {
    queued: '',
    ground_classification: '',
    height_normalization: '',
    tree_detection: '',
    metrics_extraction: '',
    completed: '',
    failed: '',
  };

  const stageDurations = progressData.stageDurations ?? {
    queued: 0,
    ground_classification: 0,
    height_normalization: 0,
    tree_detection: 0,
    metrics_extraction: 0,
    completed: 0,
    failed: 0,
  };

  if (progressData.stage !== stage) {
    // Record stage start time
    stageStartTimes[stage] = now;

    // Calculate duration of previous stage
    const prevStageStart = stageStartTimes[progressData.stage];
    if (prevStageStart) {
      stageDurations[progressData.stage] = Date.now() - new Date(prevStageStart).getTime();
    }
  }

  // Calculate overall progress
  const overallProgress = calculateOverallProgress(stage, stageProgress);

  // Estimate completion time
  const startTime = new Date(progressData.startedAt);
  const estimatedCompletion = estimateCompletionTime(startTime, overallProgress);

  // Update progress data
  const previousProgress = progressData.progress;
  progressData.stage = stage;
  progressData.progress = overallProgress;
  progressData.message = message;
  progressData.updatedAt = now;
  progressData.stageStartTimes = stageStartTimes;
  progressData.stageDurations = stageDurations;

  if (estimatedCompletion) {
    progressData.estimatedCompletion = estimatedCompletion.toISOString();
  }

  if (intermediateResults) {
    progressData.intermediateResults = {
      ...progressData.intermediateResults,
      ...intermediateResults,
    };
  }

  // Save to Redis
  await setProgressData(analysisId, progressData);

  // Update database periodically (every 10% progress or stage change)
  const shouldUpdateDb =
    progressData.stage !== stage ||
    Math.floor(overallProgress / 10) !== Math.floor(previousProgress / 10);

  if (shouldUpdateDb) {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        progress: overallProgress,
        progressMessage: `${PROCESSING_STAGE_LABELS[stage]}: ${message}`,
      },
    });
  }

  // Publish progress event for real-time updates
  const eventData: ProgressEvent['data'] = {
    stage,
    progress: overallProgress,
    message,
  };
  if (estimatedCompletion) {
    eventData.estimatedCompletion = estimatedCompletion.toISOString();
  }

  await publishProgressEvent(analysisId, {
    type: 'progress',
    analysisId,
    timestamp: now,
    data: eventData,
  });

  logger.debug(
    `Progress updated for ${analysisId}: ${stage} - ${overallProgress}% - ${message}`
  );
}

/**
 * Mark processing as complete
 */
export async function completeProcessing(
  analysisId: string,
  results: DetailedProcessingResults
): Promise<void> {
  logger.info(`Completing processing for analysis ${analysisId}`);

  const progressData = await getProgressData(analysisId);
  const startTime = progressData
    ? new Date(progressData.startedAt)
    : new Date();
  const processingTime = Math.round((Date.now() - startTime.getTime()) / 1000);

  // Update final results
  results.processingTime = processingTime;

  // Save results to Redis
  await setResultsData(analysisId, results);

  // Update progress to completed
  if (progressData) {
    progressData.stage = 'completed';
    progressData.progress = 100;
    progressData.message = 'Processing completed successfully';
    progressData.updatedAt = new Date().toISOString();
    progressData.intermediateResults = results;
    await setProgressData(analysisId, progressData);
  }

  // Update database
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'COMPLETED',
      progress: 100,
      progressMessage: 'Processing completed successfully',
      completedAt: new Date(),
      processingTime,
      results: results as unknown as Record<string, unknown>,
      statistics: {
        treeCount: results.treeCount,
        averageHeight: results.averageHeight,
        maxHeight: results.maxHeight,
        canopyArea: results.canopyArea,
        canopyCoverPercent: results.canopyCoverPercent,
      },
    },
  });

  // Build results for event
  const eventResults: ProcessingResults = {};
  if (results.treeCount !== undefined) eventResults.treeCount = results.treeCount;
  if (results.averageHeight !== undefined) eventResults.averageHeight = results.averageHeight;
  if (results.maxHeight !== undefined) eventResults.maxHeight = results.maxHeight;
  if (results.canopyArea !== undefined) eventResults.canopyArea = results.canopyArea;
  eventResults.processingTime = processingTime;

  // Publish completion event
  await publishProgressEvent(analysisId, {
    type: 'complete',
    analysisId,
    timestamp: new Date().toISOString(),
    data: {
      stage: 'completed',
      progress: 100,
      message: 'Processing completed successfully',
      results: eventResults,
    },
  });
}

/**
 * Mark processing as failed
 */
export async function failProcessing(
  analysisId: string,
  error: string
): Promise<void> {
  logger.error(`Processing failed for analysis ${analysisId}: ${error}`);

  // Update progress to failed
  const progressData = await getProgressData(analysisId);
  if (progressData) {
    progressData.stage = 'failed';
    progressData.message = error;
    progressData.updatedAt = new Date().toISOString();
    await setProgressData(analysisId, progressData);
  }

  // Update database
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'FAILED',
      progressMessage: 'Processing failed',
      errorMessage: error,
    },
  });

  // Publish error event
  await publishProgressEvent(analysisId, {
    type: 'error',
    analysisId,
    timestamp: new Date().toISOString(),
    data: {
      stage: 'failed',
      error,
      message: 'Processing failed',
    },
  });
}

/**
 * Get processing results
 */
export async function getProcessingResults(
  analysisId: string
): Promise<DetailedProcessingResults | null> {
  // Try Redis first
  const redisResults = await getResultsData(analysisId);
  if (redisResults) {
    return redisResults;
  }

  // Fall back to database
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
  });

  if (!analysis?.results) {
    return null;
  }

  return analysis.results as unknown as DetailedProcessingResults;
}

/**
 * Send processing request to Python service
 */
export async function sendToPythonService(
  analysisId: string,
  files: Array<{ fileId: string; storagePath: string; fileType: string }>,
  parameters: PipelineParameters
): Promise<PythonProcessingResponse> {
  const url = `${config.processing.serviceUrl}/api/v1/pipeline`;

  const storageConfig: PythonProcessingRequest['storageConfig'] = {
    type: config.storage.type,
  };
  if (config.storage.localPath) {
    storageConfig.localPath = config.storage.localPath;
  }
  if (config.s3.bucket) {
    storageConfig.s3Bucket = config.s3.bucket;
  }
  if (config.s3.region) {
    storageConfig.s3Region = config.s3.region;
  }

  const request: PythonProcessingRequest = {
    analysisId,
    files: files.map((f) => ({
      fileId: f.fileId,
      storagePath: f.storagePath,
      fileType: f.fileType,
    })),
    parameters,
    callbackUrl: `${config.processing.serviceUrl}/api/v1/pipeline/callback`,
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

    return (await response.json()) as PythonProcessingResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Python service error for analysis ${analysisId}: ${errorMessage}`);
    throw error;
  }
}

/**
 * Handle progress callback from Python service
 */
export async function handleProgressCallback(
  callback: PythonProgressCallback
): Promise<void> {
  const { analysisId, stage, progress, message, intermediateResults } = callback;

  await updateProgress(analysisId, stage, progress, message, intermediateResults);
}

// ============================================================================
// Redis Helper Functions
// ============================================================================

async function getProgressData(
  analysisId: string
): Promise<RedisProgressData | null> {
  const redis = getRedisConnection();
  const data = await redis.get(`${REDIS_KEY_PREFIXES.PROGRESS}${analysisId}`);
  if (!data) return null;
  return JSON.parse(data) as RedisProgressData;
}

async function setProgressData(
  analysisId: string,
  data: RedisProgressData
): Promise<void> {
  const redis = getRedisConnection();
  await redis.set(
    `${REDIS_KEY_PREFIXES.PROGRESS}${analysisId}`,
    JSON.stringify(data),
    'EX',
    PROGRESS_TTL
  );
}

async function getResultsData(
  analysisId: string
): Promise<DetailedProcessingResults | null> {
  const redis = getRedisConnection();
  const data = await redis.get(`${REDIS_KEY_PREFIXES.RESULTS}${analysisId}`);
  if (!data) return null;
  return JSON.parse(data) as DetailedProcessingResults;
}

async function setResultsData(
  analysisId: string,
  data: DetailedProcessingResults
): Promise<void> {
  const redis = getRedisConnection();
  await redis.set(
    `${REDIS_KEY_PREFIXES.RESULTS}${analysisId}`,
    JSON.stringify(data),
    'EX',
    RESULTS_TTL
  );
}

async function publishProgressEvent(
  analysisId: string,
  event: ProgressEvent
): Promise<void> {
  const redis = getRedisConnection();
  await redis.publish(
    `${REDIS_KEY_PREFIXES.EVENTS}${analysisId}`,
    JSON.stringify(event)
  );
}

function parseResults(results: unknown): ProcessingResults | undefined {
  if (!results || typeof results !== 'object') return undefined;
  const r = results as Record<string, unknown>;
  const parsed: ProcessingResults = {};
  if (typeof r.treeCount === 'number') parsed.treeCount = r.treeCount;
  if (typeof r.averageHeight === 'number') parsed.averageHeight = r.averageHeight;
  if (typeof r.maxHeight === 'number') parsed.maxHeight = r.maxHeight;
  if (typeof r.canopyArea === 'number') parsed.canopyArea = r.canopyArea;
  if (typeof r.processingTime === 'number') parsed.processingTime = r.processingTime;
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

// ============================================================================
// WebSocket Support Types (for optional real-time updates)
// ============================================================================

/**
 * Subscribe to progress updates for an analysis
 * Returns an unsubscribe function
 */
export async function subscribeToProgress(
  analysisId: string,
  callback: (event: ProgressEvent) => void
): Promise<() => Promise<void>> {
  const redis = getRedisConnection().duplicate();
  const channel = `${REDIS_KEY_PREFIXES.EVENTS}${analysisId}`;

  await redis.subscribe(channel);

  redis.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        const event = JSON.parse(message) as ProgressEvent;
        callback(event);
      } catch (error) {
        logger.error(`Error parsing progress event: ${error}`);
      }
    }
  });

  return async () => {
    await redis.unsubscribe(channel);
    await redis.quit();
  };
}

export default {
  startProcessingPipeline,
  getProcessingProgress,
  cancelProcessing,
  isCancelled,
  updateProgress,
  completeProcessing,
  failProcessing,
  getProcessingResults,
  sendToPythonService,
  handleProgressCallback,
  subscribeToProgress,
};
