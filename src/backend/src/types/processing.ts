/**
 * Processing Progress Tracking Types for Sprint 7-8
 *
 * Defines types for tracking LiDAR analysis processing progress,
 * communicating with the Python processing service, and
 * providing real-time updates to clients.
 */

// ============================================================================
// Processing Stage Types
// ============================================================================

/**
 * Stages of the LiDAR processing pipeline
 */
export type ProcessingStage =
  | 'queued'
  | 'ground_classification'
  | 'height_normalization'
  | 'tree_detection'
  | 'metrics_extraction'
  | 'completed'
  | 'failed';

/**
 * Mapping of processing stages to their display names
 */
export const PROCESSING_STAGE_LABELS: Record<ProcessingStage, string> = {
  queued: 'Queued',
  ground_classification: 'Ground Classification',
  height_normalization: 'Height Normalization',
  tree_detection: 'Tree Detection',
  metrics_extraction: 'Metrics Extraction',
  completed: 'Completed',
  failed: 'Failed',
} as const;

/**
 * Order of processing stages for progress calculation
 */
export const PROCESSING_STAGE_ORDER: ProcessingStage[] = [
  'queued',
  'ground_classification',
  'height_normalization',
  'tree_detection',
  'metrics_extraction',
  'completed',
] as const;

// ============================================================================
// Processing Progress Types
// ============================================================================

/**
 * Real-time processing progress information
 */
export interface ProcessingProgress {
  analysisId: string;
  stage: ProcessingStage;
  progress: number; // 0-100
  message: string;
  startedAt: string;
  estimatedCompletion?: string;
  results?: ProcessingResults;
}

/**
 * Processing results summary
 */
export interface ProcessingResults {
  treeCount?: number;
  averageHeight?: number;
  maxHeight?: number;
  canopyArea?: number;
  processingTime?: number;
}

/**
 * Detailed processing metrics for analysis results
 */
export interface DetailedProcessingResults extends ProcessingResults {
  // Tree metrics
  minHeight?: number;
  heightStdDev?: number;
  heightPercentiles?: {
    p10?: number;
    p25?: number;
    p50?: number;
    p75?: number;
    p90?: number;
    p95?: number;
    p99?: number;
  };

  // Crown metrics
  averageCrownDiameter?: number;
  minCrownDiameter?: number;
  maxCrownDiameter?: number;
  crownAreaTotal?: number;

  // Canopy metrics
  canopyCoverPercent?: number;
  gapFraction?: number;
  leafAreaIndex?: number;

  // Point cloud metrics
  pointCount?: number;
  groundPointCount?: number;
  vegetationPointCount?: number;
  pointDensity?: number;

  // Species classification (if performed)
  speciesBreakdown?: Record<string, number>;

  // Biomass/Carbon (if calculated)
  totalBiomass?: number;
  totalCarbon?: number;
  totalCO2e?: number;
}

// ============================================================================
// Pipeline Job Types
// ============================================================================

/**
 * Full pipeline job data for BullMQ
 */
export interface FullPipelineJobData {
  analysisId: string;
  fileIds: string[];
  projectId: string;
  userId: string;
  parameters: PipelineParameters;
}

/**
 * Pipeline processing parameters
 */
export interface PipelineParameters {
  // Ground classification
  groundClassification?: {
    method?: 'pmf' | 'csf' | 'smrf';
    maxWindowSize?: number;
    slope?: number;
    maxDistance?: number;
    initialDistance?: number;
    cellSize?: number;
  };

  // Height normalization
  heightNormalization?: {
    method?: 'tin' | 'idw' | 'kriging';
    resolution?: number;
  };

  // Tree detection
  treeDetection?: {
    minHeight?: number;
    maxHeight?: number;
    windowSize?: number;
    smoothingFactor?: number;
    minTreeDistance?: number;
  };

  // Metrics extraction
  metricsExtraction?: {
    calculateBiomass?: boolean;
    calculateCarbon?: boolean;
    speciesClassification?: boolean;
    gridSize?: number;
    heightBreaks?: number[];
  };

  // Processing options
  processingOptions?: {
    useGPU?: boolean;
    chunkSize?: number;
    parallelChunks?: number;
  };
}

/**
 * Pipeline job result
 */
export interface FullPipelineResult {
  success: boolean;
  analysisId: string;
  processingTime: number;
  results?: DetailedProcessingResults;
  outputFiles?: string[];
  error?: string;
  stageResults?: Record<ProcessingStage, StageResult>;
}

/**
 * Result from a single processing stage
 */
export interface StageResult {
  success: boolean;
  duration: number;
  message?: string;
  error?: string;
  metrics?: Record<string, unknown>;
}

// ============================================================================
// Progress Event Types
// ============================================================================

/**
 * Progress event for real-time updates
 */
export interface ProgressEvent {
  type: 'progress' | 'stage_complete' | 'error' | 'complete';
  analysisId: string;
  timestamp: string;
  data: ProgressEventData;
}

/**
 * Progress event data payload
 */
export interface ProgressEventData {
  stage?: ProcessingStage;
  progress?: number;
  message?: string;
  error?: string;
  results?: ProcessingResults;
  estimatedCompletion?: string;
}

// ============================================================================
// Redis Storage Types
// ============================================================================

/**
 * Progress data stored in Redis
 */
export interface RedisProgressData {
  analysisId: string;
  stage: ProcessingStage;
  progress: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  estimatedCompletion?: string;
  stageStartTimes?: Record<ProcessingStage, string>;
  stageDurations?: Record<ProcessingStage, number>;
  intermediateResults?: Partial<DetailedProcessingResults>;
}

/**
 * Redis key prefixes for progress storage
 */
export const REDIS_KEYS = {
  PROGRESS: 'analysis:progress:',
  RESULTS: 'analysis:results:',
  CANCEL: 'analysis:cancel:',
  EVENTS: 'analysis:events:',
} as const;

// ============================================================================
// Python Service Communication Types
// ============================================================================

/**
 * Request to Python processing service
 */
export interface PythonProcessingRequest {
  analysisId: string;
  files: PythonFileInput[];
  parameters: PipelineParameters;
  callbackUrl?: string;
  storageConfig: {
    type: 'local' | 's3';
    localPath?: string;
    s3Bucket?: string;
    s3Region?: string;
  };
}

/**
 * File input for Python service
 */
export interface PythonFileInput {
  fileId: string;
  storagePath: string;
  fileType: string;
}

/**
 * Response from Python processing service
 */
export interface PythonProcessingResponse {
  success: boolean;
  analysisId: string;
  status: ProcessingStage;
  progress: number;
  message: string;
  results?: DetailedProcessingResults;
  outputFiles?: PythonOutputFile[];
  error?: string;
}

/**
 * Output file from Python service
 */
export interface PythonOutputFile {
  name: string;
  storagePath: string;
  mimeType: string;
  size: number;
  fileType: string;
}

/**
 * Progress callback from Python service
 */
export interface PythonProgressCallback {
  analysisId: string;
  stage: ProcessingStage;
  progress: number;
  message: string;
  intermediateResults?: Partial<DetailedProcessingResults>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate overall progress based on stage and stage progress
 */
export function calculateOverallProgress(
  stage: ProcessingStage,
  stageProgress: number
): number {
  const stageIndex = PROCESSING_STAGE_ORDER.indexOf(stage);
  if (stageIndex === -1) return 0;

  // Each stage contributes equally to overall progress
  const stagesCount = PROCESSING_STAGE_ORDER.length - 1; // Exclude 'completed'
  const stageWeight = 100 / stagesCount;

  // Calculate base progress from completed stages
  const baseProgress = stageIndex * stageWeight;

  // Add progress within current stage
  const currentStageProgress = (stageProgress / 100) * stageWeight;

  return Math.min(100, Math.round(baseProgress + currentStageProgress));
}

/**
 * Estimate completion time based on current progress and elapsed time
 */
export function estimateCompletionTime(
  startTime: Date,
  currentProgress: number
): Date | null {
  if (currentProgress <= 0) return null;

  const elapsed = Date.now() - startTime.getTime();
  const totalEstimated = (elapsed / currentProgress) * 100;
  const remaining = totalEstimated - elapsed;

  return new Date(Date.now() + remaining);
}

/**
 * Check if a stage is a terminal stage
 */
export function isTerminalStage(stage: ProcessingStage): boolean {
  return stage === 'completed' || stage === 'failed';
}

/**
 * Get the next processing stage
 */
export function getNextStage(
  currentStage: ProcessingStage
): ProcessingStage | null {
  const currentIndex = PROCESSING_STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= PROCESSING_STAGE_ORDER.length - 1) {
    return null;
  }
  const nextStage = PROCESSING_STAGE_ORDER[currentIndex + 1];
  return nextStage !== undefined ? nextStage : null;
}
