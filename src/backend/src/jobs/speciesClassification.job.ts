/**
 * Species Classification Job - Sprint 13-16
 * BullMQ worker for async species classification
 * Communicates with Python service for ML-based classification
 * Sprint 15-16: Added batch classification support
 */

import { Job, Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { createWorker, createQueue } from '../config/queue.js';
import { prisma } from '../config/database.js';
import * as speciesService from '../services/species.service.js';
import type {
  ClassifySpeciesOptions,
  SpeciesClassificationJobData,
  SpeciesClassificationResult,
  PythonClassifyResponse,
  SupportedRegion,
  BatchProgress,
} from '../types/species.js';

// Queue name for species classification
const SPECIES_QUEUE_NAME = 'species-classification';
const BATCH_QUEUE_NAME = 'species-batch-classification';

// ============================================================================
// Sprint 15-16: Batch Classification Job Data
// ============================================================================

interface BatchClassificationJobData {
  analysisId: string;
  region: SupportedRegion;
  userId: string;
  batchSize: number;
}

interface BatchClassificationResult {
  success: boolean;
  analysisId: string;
  totalTrees: number;
  processedTrees: number;
  failedBatches: number;
  processingTime: number;
  error?: string;
}

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
// Sprint 15-16: Batch Classification Processing
// ============================================================================

/**
 * Process a batch species classification job
 * Handles large analyses by processing trees in batches with progress reporting
 */
async function processBatchClassificationJob(
  job: Job<BatchClassificationJobData>
): Promise<BatchClassificationResult> {
  const { analysisId, region, userId, batchSize } = job.data;
  const startTime = Date.now();

  logger.info(
    `Starting batch species classification job ${job.id} for analysis ${analysisId} with batch size ${batchSize}`
  );

  try {
    // Verify user has access to the analysis
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

    // Get total tree count
    const totalTrees = await prisma.treeDetection.count({
      where: { analysisId },
    });

    if (totalTrees === 0) {
      logger.warn(`No trees found for batch classification in analysis ${analysisId}`);
      return {
        success: true,
        analysisId,
        totalTrees: 0,
        processedTrees: 0,
        failedBatches: 0,
        processingTime: Date.now() - startTime,
      };
    }

    await job.updateProgress(5);

    // Calculate number of batches
    const numBatches = Math.ceil(totalTrees / batchSize);
    let processedTrees = 0;
    let failedBatches = 0;

    logger.info(`Processing ${totalTrees} trees in ${numBatches} batches for analysis ${analysisId}`);

    // Process trees in batches
    for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
      const offset = batchIndex * batchSize;

      try {
        // Get batch of trees
        const trees = await prisma.treeDetection.findMany({
          where: { analysisId },
          skip: offset,
          take: batchSize,
          select: {
            id: true,
            x: true,
            y: true,
            z: true,
            height: true,
            crownDiameter: true,
            dbh: true,
          },
        });

        // Define tree type for Python conversion
        type TreeBatchData = {
          id: string;
          x: number;
          y: number;
          z: number;
          height: number;
          crownDiameter: number;
          dbh: number | null;
        };

        // Convert to Python format - handle optional dbh properly
        const pythonTrees = (trees as TreeBatchData[]).map((tree: TreeBatchData) => {
          const pythonTree: {
            id: string;
            x: number;
            y: number;
            z: number;
            height: number;
            crownDiameter: number;
            dbh?: number;
          } = {
            id: tree.id,
            x: tree.x,
            y: tree.y,
            z: tree.z,
            height: tree.height,
            crownDiameter: tree.crownDiameter,
          };
          if (tree.dbh !== null) {
            pythonTree.dbh = tree.dbh;
          }
          return pythonTree;
        });

        // Send to Python classifier or use simulation
        let pythonResult: PythonClassifyResponse;
        try {
          pythonResult = await speciesService.sendToPythonClassifier(
            analysisId,
            pythonTrees,
            region,
            { minConfidence: 0.7, includeUncertain: false, useEnsemble: true }
          );
        } catch (processingError) {
          // Fallback to simulation in development
          if (config.isDevelopment) {
            pythonResult = await speciesService.simulateClassification(analysisId, pythonTrees, region);
          } else {
            throw processingError;
          }
        }

        // Update trees with predictions
        if (pythonResult.success && pythonResult.predictions) {
          await speciesService.updateTreesWithPredictions(pythonResult.predictions);
          processedTrees += pythonResult.predictions.length;
        }

        // Update progress
        const progress = Math.round(((batchIndex + 1) / numBatches) * 90) + 5;
        await job.updateProgress(progress);

        logger.debug(
          `Batch ${batchIndex + 1}/${numBatches} completed for analysis ${analysisId}. ` +
            `Processed ${processedTrees}/${totalTrees} trees.`
        );
      } catch (batchError) {
        failedBatches++;
        const errorMessage = batchError instanceof Error ? batchError.message : 'Unknown batch error';
        logger.error(`Batch ${batchIndex + 1} failed for analysis ${analysisId}: ${errorMessage}`);

        // Continue with next batch - don't fail entire job for single batch failure
      }
    }

    await job.updateProgress(100);

    const processingTime = Date.now() - startTime;
    logger.info(
      `Batch species classification for analysis ${analysisId} completed in ${processingTime}ms. ` +
        `Processed ${processedTrees}/${totalTrees} trees with ${failedBatches} failed batches.`
    );

    return {
      success: failedBatches < numBatches, // Success if at least some batches succeeded
      analysisId,
      totalTrees,
      processedTrees,
      failedBatches,
      processingTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown batch classification error';
    logger.error(`Batch classification job failed for ${analysisId}: ${errorMessage}`);

    return {
      success: false,
      analysisId,
      totalTrees: 0,
      processedTrees: 0,
      failedBatches: 0,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Create and start the batch species classification worker
 */
export function createBatchSpeciesClassificationWorker(
  concurrency = 2
): Worker<BatchClassificationJobData, BatchClassificationResult> {
  const worker = createWorker<BatchClassificationJobData, BatchClassificationResult>(
    BATCH_QUEUE_NAME as never,
    processBatchClassificationJob,
    concurrency
  );

  worker.on('completed', (job, result) => {
    if (result.success) {
      logger.info(
        `Batch classification job ${job.id} completed for analysis ${result.analysisId}. ` +
          `Processed ${result.processedTrees}/${result.totalTrees} trees in ${result.processingTime}ms.`
      );
    } else {
      logger.warn(
        `Batch classification job ${job.id} completed with error for analysis ${result.analysisId}: ` +
          `${result.error}`
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      `Batch classification job ${job?.id} failed for analysis ${job?.data.analysisId}: ${error.message}`
    );
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Batch classification job ${job.id} progress: ${progress}%`);
  });

  logger.info(`Batch species classification worker started with concurrency: ${concurrency}`);

  return worker;
}

/**
 * Queue an analysis for batch species classification
 */
export async function queueBatchSpeciesClassification(
  analysisId: string,
  region: SupportedRegion,
  userId: string,
  batchSize: number = 1000
): Promise<string> {
  // Verify the analysis exists and user has access
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

  const queue = createQueue(BATCH_QUEUE_NAME as never);

  const job = await queue.add(
    'batch-classify-species',
    {
      analysisId,
      region,
      userId,
      batchSize,
    },
    {
      jobId: `batch-species-${analysisId}-${Date.now()}`,
      priority: 3, // Lower priority than regular classification
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    }
  );

  logger.info(
    `Analysis ${analysisId} queued for batch species classification with job ID: ${job.id}, batch size: ${batchSize}`
  );

  return job.id ?? analysisId;
}

/**
 * Get batch species classification job progress
 */
export async function getBatchJobProgress(jobId: string): Promise<BatchProgress | null> {
  const queue = createQueue(BATCH_QUEUE_NAME as never);

  // Find the job by ID
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  // Map job state to BatchProgress status
  let status: BatchProgress['status'];
  switch (state) {
    case 'waiting':
    case 'delayed':
      status = 'queued';
      break;
    case 'active':
      status = 'processing';
      break;
    case 'completed':
      status = 'completed';
      break;
    case 'failed':
      status = 'failed';
      break;
    default:
      status = 'queued';
  }

  // Get tree counts from job result if available
  let processedTrees = 0;
  let totalTrees = 0;

  if (job.returnvalue) {
    const result = job.returnvalue as BatchClassificationResult;
    processedTrees = result.processedTrees;
    totalTrees = result.totalTrees;
  }

  // Estimate time remaining based on progress and elapsed time
  let estimatedTimeRemaining: number | undefined = undefined;
  if (status === 'processing' && progress > 0) {
    const elapsed = Date.now() - (job.processedOn ?? Date.now());
    const estimatedTotal = (elapsed / progress) * 100;
    estimatedTimeRemaining = Math.round((estimatedTotal - elapsed) / 1000);
  }

  const result: BatchProgress = {
    jobId,
    status,
    processedTrees,
    totalTrees,
    percentComplete: progress,
  };

  if (estimatedTimeRemaining !== undefined) {
    result.estimatedTimeRemaining = estimatedTimeRemaining;
  }

  return result;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createSpeciesClassificationWorker,
  createBatchSpeciesClassificationWorker,
  queueSpeciesClassification,
  queueBatchSpeciesClassification,
  getSpeciesClassificationJobStatus,
  getBatchJobProgress,
  cancelSpeciesClassification,
};
