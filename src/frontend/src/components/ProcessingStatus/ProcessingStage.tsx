
export type StageStatus = 'pending' | 'active' | 'completed' | 'failed';

export type StageType =
  | 'ground_classification'
  | 'height_normalization'
  | 'tree_detection'
  | 'metrics_calculation';

export interface ProcessingStageProps {
  type: StageType;
  status: StageStatus;
  duration?: number; // Duration in seconds if completed
  className?: string;
}

// Stage configuration with labels and icons
const stageConfig: Record<StageType, { label: string; shortLabel: string }> = {
  ground_classification: {
    label: 'Ground Classification',
    shortLabel: 'Ground',
  },
  height_normalization: {
    label: 'Height Normalization',
    shortLabel: 'Height',
  },
  tree_detection: {
    label: 'Tree Detection',
    shortLabel: 'Trees',
  },
  metrics_calculation: {
    label: 'Metrics Calculation',
    shortLabel: 'Metrics',
  },
};

// Format duration in seconds to human-readable format
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

// Icons for each stage type
function StageIcon({ type, className }: { type: StageType; className?: string }) {
  const baseClass = className || 'w-5 h-5';

  switch (type) {
    case 'ground_classification':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      );
    case 'height_normalization':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    case 'tree_detection':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
      );
    case 'metrics_calculation':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );
    default:
      return null;
  }
}

// Status indicator component
function StatusIndicator({ status }: { status: StageStatus }) {
  switch (status) {
    case 'pending':
      return (
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        </div>
      );
    case 'active':
      return (
        <div className="w-6 h-6 rounded-full border-2 border-forest-500 bg-forest-50 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-forest-600 animate-spin"
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
        </div>
      );
    case 'completed':
      return (
        <div className="w-6 h-6 rounded-full bg-forest-500 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      );
    case 'failed':
      return (
        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

export function ProcessingStage({
  type,
  status,
  duration,
  className = '',
}: ProcessingStageProps) {
  const config = stageConfig[type];

  const statusStyles: Record<StageStatus, string> = {
    pending: 'text-gray-400',
    active: 'text-forest-600',
    completed: 'text-forest-700',
    failed: 'text-red-600',
  };

  const bgStyles: Record<StageStatus, string> = {
    pending: 'bg-gray-50 border-gray-200',
    active: 'bg-forest-50 border-forest-200 ring-2 ring-forest-500 ring-opacity-50',
    completed: 'bg-forest-50 border-forest-200',
    failed: 'bg-red-50 border-red-200',
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${bgStyles[status]} ${className}`}
    >
      <StatusIndicator status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <StageIcon type={type} className={`w-4 h-4 ${statusStyles[status]}`} />
          <span
            className={`text-sm font-medium truncate ${statusStyles[status]}`}
            title={config.label}
          >
            <span className="hidden sm:inline">{config.label}</span>
            <span className="sm:hidden">{config.shortLabel}</span>
          </span>
        </div>
        {status === 'completed' && duration !== undefined && (
          <p className="text-xs text-gray-500 mt-0.5">{formatDuration(duration)}</p>
        )}
        {status === 'active' && (
          <p className="text-xs text-forest-600 mt-0.5 animate-pulse">Processing...</p>
        )}
        {status === 'failed' && (
          <p className="text-xs text-red-600 mt-0.5">Failed</p>
        )}
      </div>
    </div>
  );
}

export default ProcessingStage;
