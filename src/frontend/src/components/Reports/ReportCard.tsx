// ReportCard component
import type { Report } from '../../api/reports';

interface ReportCardProps {
  report: Report;
  onSelect?: ((report: Report) => void) | ((report: Report | null) => void) | undefined;
  onDownload?: ((reportId: string, format: 'pdf' | 'excel') => void) | undefined;
  onDelete?: ((reportId: string) => void) | undefined;
  isSelected?: boolean | undefined;
  isDownloading?: boolean | undefined;
  downloadingFormat?: 'pdf' | 'excel' | null | undefined;
  isDeleting?: boolean | undefined;
  className?: string | undefined;
}

// Format file size
function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
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

export function ReportCard({
  report,
  onSelect,
  onDownload,
  onDelete,
  isSelected = false,
  isDownloading = false,
  downloadingFormat = null,
  isDeleting = false,
  className = '',
}: ReportCardProps) {
  const statusStyles = {
    generating: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      icon: (
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ),
    },
    completed: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    failed: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
  };

  const style = statusStyles[report.status];

  const handleCardClick = () => {
    onSelect?.(report);
  };

  const handleDownload = (e: React.MouseEvent, format: 'pdf' | 'excel') => {
    e.stopPropagation();
    onDownload?.(report.id, format);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this report?')) {
      onDelete?.(report.id);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? 'border-forest-500 ring-2 ring-forest-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      } ${className}`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{report.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(report.createdAt)}</p>
          </div>

          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
          >
            {style.icon}
            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
          </span>
        </div>

        {/* Metadata */}
        {report.metadata && (
          <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-500">
            {report.metadata.treeCount !== undefined && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                {report.metadata.treeCount.toLocaleString()} trees
              </span>
            )}
            {report.metadata.areaHectares !== undefined && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                {report.metadata.areaHectares.toFixed(1)} ha
              </span>
            )}
          </div>
        )}

        {/* Format & Size */}
        <div className="flex items-center gap-3 mb-4">
          {/* Format Icons */}
          <div className="flex items-center gap-2">
            {(report.format === 'pdf' || report.format === 'both') && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 rounded text-xs font-medium text-red-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </span>
            )}
            {(report.format === 'excel' || report.format === 'both') && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 rounded text-xs font-medium text-green-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel
              </span>
            )}
          </div>

          {/* File Size */}
          {report.fileSize && (
            <span className="text-xs text-gray-500">{formatFileSize(report.fileSize)}</span>
          )}
        </div>

        {/* Actions */}
        {report.status === 'completed' && (
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            {/* Download Buttons */}
            {(report.format === 'pdf' || report.format === 'both') && (
              <button
                onClick={(e) => handleDownload(e, 'pdf')}
                disabled={isDownloading}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading && downloadingFormat === 'pdf' ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                PDF
              </button>
            )}
            {(report.format === 'excel' || report.format === 'both') && (
              <button
                onClick={(e) => handleDownload(e, 'excel')}
                disabled={isDownloading}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading && downloadingFormat === 'excel' ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Excel
              </button>
            )}

            {/* Delete Button */}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title="Delete report"
            >
              {isDeleting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Error Message for failed reports */}
        {report.status === 'failed' && report.error && (
          <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
            {report.error}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportCard;
