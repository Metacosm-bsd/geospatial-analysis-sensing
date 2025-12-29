/**
 * Species Classification Job - Sprint 13-14
 * BullMQ worker for async species classification
 * Communicates with Python service for ML-based classification
 */

import { Job, Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { createWorker } from '../config/queue.js';
import * as speciesService from '../services/species.service.js';
import type {
  ClassifySpeciesOptions,
  SpeciesClassificationJobData,
  SpeciesClassificationResult,
  PythonClassifyResponse,
  SupportedRegion,
} from '../types/species.js';

// Queue name for species classification
const SPECIES_QUEUE_NAME = 'species-classification';

// ============================================================================
// Species Classification Job Processing
// ============================================================================

/**
 * Process a species classification job
 */
async function processSpeciesClassificationJob(
  job: Job<SpeciesClassificationJobData>
): Promise<SpeciesClassificationResult> {
  const { analysisId, region, options } = job.data;
  const startTime = Date.now();

  logger.info(`Starting species classification job ${job.id} for analysis ${analysisId}`);

  try {
    // Update job progress
    await job.updateProgress(5);

    // Get trees for classification
    const trees = await speciesService.getTreesForClassification(analysisId);

    if (trees.length === 0) {
      logger.warn(`No trees found for classification in analysis ${analysisId}`);
      return {
        success: true,
        analysisId,
        processingTime: Date.now() - startTime,
        totalTrees: 0,
        classifiedTrees: 0,
        speciesBreakdown: {},
      };
    }

    await job.updateProgress(20);
    logger.info(`Found ${trees.length} trees for classification in analysis ${analysisId}`);

    // Send to Python service for classification
    let pythonResult: PythonClassifyResponse;
    try {
      pythonResult = await speciesService.sendToPythonClassifier(
        analysisId,
        trees,
        region,
        options
      );
      await job.updateProgress(70);
    } catch (processingError) {
      // If Python service is unavailable, use simulation for development
      const errorMessage = processingError instanceof Error
        ? processingError.message
        : 'Python service unavailable';

      logger.warn(`Python classifier failed, attempting fallback: ${errorMessage}`);

      // For development/testing: simulate classification
      if (config.isDevelopment) {
        pythonResult = await speciesService.simulateClassification(analysisId, trees, region);
        await job.updateProgress(70);
      } else {
        throw processingError;
      }
    }

    await job.updateProgress(80);

    // Filter predictions by confidence threshold
    const minConfidence = options.minConfidence ?? 0.7;
    const filteredPredictions = options.includeUncertain
      ? pythonResult.predictions
      : pythonResult.predictions.filter((p) => p.confidence >= minConfidence);

    // Update tree records with species predictions
    await speciesService.updateTreesWithPredictions(filteredPredictions);

    await job.updateProgress(95);

    // Calculate species breakdown
    const speciesBreakdown: Record<string, number> = {};
    for (const prediction of filteredPredictions) {
      speciesBreakdown[prediction.speciesCode] =
        (speciesBreakdown[prediction.speciesCode] ?? 0) + 1;
    }

    await job.updateProgress(100);

    const processingTime = Date.now() - startTime;
    logger.info(
      `Species classification for analysis ${analysisId} completed in ${processingTime}ms. ` +
        `Classified ${filteredPredictions.length}/${trees.length} trees.`
    );

    return {
      success: true,
      analysisId,
      processingTime,
      totalTrees: trees.length,
      classifiedTrees: filteredPredictions.length,
      speciesBreakdown,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown classification error';
    logger.error(`Species classification job failed for ${analysisId}: ${errorMessage}`);

    return {
      success: false,
      analysisId,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Worker Creation
// ============================================================================

/**
 * Create and start the species classification worker
 */
export function createSpeciesClassificationWorker(
  concurrency = 3
): Worker<SpeciesClassificationJobData, SpeciesClassificationResult> {
  const worker = createWorker<SpeciesClassificationJobData, SpeciesClassificationResult>(
    SPECIES_QUEUE_NAME as never, // Cast needed as queue name is not in QUEUE_NAMES yet
    processSpeciesClassificationJob,
    concurrency
  );

  worker.on('completed', (job, result) => {
    if (result.success) {
      logger.info(
        `Species classification job ${job.id} completed successfully for analysis ${result.analysisId} ` +
          `in ${result.processingTime}ms. Classified ${result.classifiedTrees}/${result.totalTrees} trees.`
      );
    } else {
      logger.warn(
        `Species classification job ${job.id} completed with error for analysis ${result.analysisId}: ` +
          `${result.error}`
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      `Species classification job ${job?.id} failed for analysis ${job?.data.analysisId}: ${error.message}`
    );
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Species classification job ${job.id} progress: ${progress}%`);
  });

  logger.info(`Species classification worker started with concurrency: ${concurrency}`);

  return worker;
}

// ============================================================================
// Queue Functions
// ============================================================================

/**
 * Queue an analysis for species classification
 */
export async function queueSpeciesClassification(
  analysisId: string,
  projectId: string,
  userId: string,
  region: SupportedRegion,
  options: ClassifySpeciesOptions
): Promise<string> {
  // Create queue for species classification
  const { createQueue } = await import('../config/queue.js');
  const queue = createQueue(SPECIES_QUEUE_NAME as never);

  const job = await queue.add(
    'classify-species',
    {
      analysisId,
      projectId,
      userId,
      region,
      options,
    },
    {
      jobId: `species-${analysisId}-${Date.now()}`,
      priority: 2, // Lower priority than report generation
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );

  logger.info(`Analysis ${analysisId} queued for species classification with job ID: ${job.id}`);

  return job.id ?? analysisId;
}

/**
 * Get species classification job status
 */
export async function getSpeciesClassificationJobStatus(
  analysisId: string
): Promise<{
  state: string;
  progress: number;
  result?: SpeciesClassificationResult;
  error?: string;
} | null> {
  const { createQueue } = await import('../config/queue.js');
  const queue = createQueue(SPECIES_QUEUE_NAME as never);

  // Try to find the most recent job for this analysis
  const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed']);
  const job = jobs.find((j) => j.data.analysisId === analysisId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  const status: {
    state: string;
    progress: number;
    result?: SpeciesClassificationResult;
    error?: string;
  } = {
    state,
    progress,
  };

  if (job.returnvalue !== undefined) {
    status.result = job.returnvalue as SpeciesClassificationResult;
  }
  if (job.failedReason !== undefined) {
    status.error = job.failedReason;
  }

  return status;
}

/**
 * Cancel a pending species classification job
 */
export async function cancelSpeciesClassification(analysisId: string): Promise<boolean> {
  const { createQueue } = await import('../config/queue.js');
  const queue = createQueue(SPECIES_QUEUE_NAME as never);

  // Find the job for this analysis
  const jobs = await queue.getJobs(['waiting', 'delayed']);
  const job = jobs.find((j) => j.data.analysisId === analysisId);

  if (!job) {
    return false;
  }

  await job.remove();
  logger.info(`Species classification job for analysis ${analysisId} cancelled`);
  return true;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createSpeciesClassificationWorker,
  queueSpeciesClassification,
  getSpeciesClassificationJobStatus,
  cancelSpeciesClassification,
};
