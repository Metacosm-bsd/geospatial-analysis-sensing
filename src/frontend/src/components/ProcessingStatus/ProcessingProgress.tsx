import { ProcessingStage, StageType, StageStatus } from './ProcessingStage';

export interface StageInfo {
  type: StageType;
  status: StageStatus;
  progress?: number; // 0-100 for current stage
  duration?: number; // Duration in seconds if completed
}

export interface ProcessingProgressProps {
  analysisId: string;
  stages: StageInfo[];
  currentStageProgress?: number; // 0-100
  estimatedTimeRemaining?: number; // In seconds
  onCancel?: () => void;
  isCancelling?: boolean;
  className?: string;
}

// Default pipeline stages in order
export const DEFAULT_STAGES: StageType[] = [
  'ground_classification',
  'height_normalization',
  'tree_detection',
  'metrics_calculation',
];

// Format time remaining in a human-readable format
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s remaining`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes}m remaining`;
    }
    return `${minutes}m ${remainingSeconds}s remaining`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h remaining`;
  }
  return `${hours}h ${remainingMinutes}m remaining`;
}

// Get overall progress percentage based on stages
function calculateOverallProgress(stages: StageInfo[]): number {
  const completedStages = stages.filter((s) => s.status === 'completed').length;
  const activeStage = stages.find((s) => s.status === 'active');
  const activeProgress = activeStage?.progress ?? 0;

  // Each stage contributes equally to overall progress
  const stageWeight = 100 / stages.length;
  return Math.round(completedStages * stageWeight + (activeProgress * stageWeight) / 100);
}

export function ProcessingProgress({
  analysisId,
  stages,
  currentStageProgress = 0,
  estimatedTimeRemaining,
  onCancel,
  isCancelling = false,
  className = '',
}: ProcessingProgressProps) {
  const overallProgress = calculateOverallProgress(stages);
  const currentStage = stages.find((s) => s.status === 'active');
  const hasFailed = stages.some((s) => s.status === 'failed');
  const isComplete = stages.every((s) => s.status === 'completed');

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-forest-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-forest-100 rounded-lg">
              <svg
                className={`w-5 h-5 text-forest-600 ${!hasFailed && !isComplete ? 'animate-pulse' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {hasFailed
                  ? 'Processing Failed'
                  : isComplete
                  ? 'Processing Complete'
                  : 'Processing LiDAR Data'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Analysis ID: {analysisId.slice(0, 8)}...
              </p>
            </div>
          </div>

          {/* Cancel Button */}
          {onCancel && !isComplete && !hasFailed && (
            <button
              onClick={onCancel}
              disabled={isCancelling}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCancelling ? (
                <>
                  <svg
                    className="w-3 h-3 mr-1.5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Cancelling...
                </>
              ) : (
                <>
                  <svg
                    className="w-3 h-3 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Cancel
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-semibold text-forest-600">{overallProgress}%</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-full ${
              hasFailed
                ? 'bg-red-500'
                : isComplete
                ? 'bg-forest-500'
                : 'bg-gradient-to-r from-forest-400 to-forest-600'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        {estimatedTimeRemaining !== undefined && !isComplete && !hasFailed && (
          <p className="text-xs text-gray-500 mt-2 flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {formatTimeRemaining(estimatedTimeRemaining)}
          </p>
        )}
      </div>

      {/* Current Stage Progress (if active) */}
      {currentStage && currentStageProgress > 0 && (
        <div className="px-6 py-3 bg-forest-50 border-b border-forest-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-forest-700">
              {currentStage.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </span>
            <span className="text-xs font-semibold text-forest-600">{currentStageProgress}%</span>
          </div>
          <div className="h-1.5 bg-forest-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-forest-500 transition-all duration-300 rounded-full"
              style={{ width: `${currentStageProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Pipeline Stages */}
      <div className="p-6">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Pipeline Stages
        </h4>
        <div className="relative">
          {/* Connector Line */}
          <div className="absolute left-[14px] top-6 bottom-6 w-0.5 bg-gray-200" />

          {/* Stages */}
          <div className="space-y-3 relative">
            {stages.map((stage) => (
              <ProcessingStage
                key={stage.type}
                type={stage.type}
                status={stage.status}
                {...(stage.duration !== undefined ? { duration: stage.duration } : {})}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProcessingProgress;
