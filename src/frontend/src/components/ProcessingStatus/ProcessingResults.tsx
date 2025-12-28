import React from 'react';

export interface ProcessingResultsData {
  treeCount: number;
  averageHeight: number; // in meters
  maxHeight: number; // in meters
  canopyCoverage: number; // percentage 0-100
  processingTimeSeconds: number;
  analysisId: string;
  completedAt?: string;
}

export interface ProcessingResultsProps {
  results: ProcessingResultsData;
  onViewFullResults?: () => void;
  onDownloadReport?: () => void;
  isDownloading?: boolean;
  className?: string;
}

// Format duration in seconds to human-readable format
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

// Format date to locale string
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Stat card component
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  color: 'forest' | 'blue' | 'amber' | 'purple';
}

function StatCard({ icon, label, value, unit, color }: StatCardProps) {
  const colorStyles = {
    forest: {
      bg: 'bg-forest-50',
      iconBg: 'bg-forest-100',
      iconColor: 'text-forest-600',
      valueColor: 'text-forest-700',
    },
    blue: {
      bg: 'bg-blue-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-700',
    },
    amber: {
      bg: 'bg-amber-50',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      valueColor: 'text-amber-700',
    },
    purple: {
      bg: 'bg-purple-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      valueColor: 'text-purple-700',
    },
  };

  const styles = colorStyles[color];

  return (
    <div className={`${styles.bg} rounded-lg p-4 transition-transform hover:scale-[1.02]`}>
      <div className="flex items-start gap-3">
        <div className={`${styles.iconBg} p-2 rounded-lg`}>
          <div className={`w-5 h-5 ${styles.iconColor}`}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold ${styles.valueColor} mt-0.5`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
            {unit && <span className="text-sm font-medium ml-1">{unit}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProcessingResults({
  results,
  onViewFullResults,
  onDownloadReport,
  isDownloading = false,
  className = '',
}: ProcessingResultsProps) {
  const { treeCount, averageHeight, maxHeight, canopyCoverage, processingTimeSeconds, completedAt } =
    results;

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-forest-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-forest-500 rounded-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Analysis Complete</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {completedAt ? formatDate(completedAt) : 'Just now'} - Processed in{' '}
              {formatDuration(processingTimeSeconds)}
            </p>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="p-6">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Detection Results
        </h4>
        <div className="grid grid-cols-2 gap-4">
          {/* Tree Count */}
          <StatCard
            color="forest"
            label="Trees Detected"
            value={treeCount}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            }
          />

          {/* Canopy Coverage */}
          <StatCard
            color="blue"
            label="Canopy Coverage"
            value={canopyCoverage.toFixed(1)}
            unit="%"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            }
          />

          {/* Average Height */}
          <StatCard
            color="amber"
            label="Average Height"
            value={averageHeight.toFixed(1)}
            unit="m"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"
                />
              </svg>
            }
          />

          {/* Max Height */}
          <StatCard
            color="purple"
            label="Maximum Height"
            value={maxHeight.toFixed(1)}
            unit="m"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 11l5-5m0 0l5 5m-5-5v12"
                />
              </svg>
            }
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <div className="flex flex-col sm:flex-row gap-3">
          {onViewFullResults && (
            <button
              onClick={onViewFullResults}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-forest-600 rounded-lg hover:bg-forest-700 transition-colors shadow-sm"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View Full Results
            </button>
          )}

          {onDownloadReport && (
            <button
              onClick={onDownloadReport}
              disabled={isDownloading}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-forest-700 bg-white border border-forest-300 rounded-lg hover:bg-forest-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <>
                  <svg
                    className="w-4 h-4 mr-2 animate-spin"
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
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download Report
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProcessingResults;
