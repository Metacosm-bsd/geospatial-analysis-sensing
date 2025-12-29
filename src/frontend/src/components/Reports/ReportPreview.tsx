// ReportPreview component
import type { Report } from '../../api/reports';

interface ReportPreviewProps {
  report: Report;
  onDownload?: (reportId: string, format: 'pdf' | 'excel') => void;
  onClose?: () => void;
  isDownloading?: boolean;
  downloadingFormat?: 'pdf' | 'excel' | null;
  className?: string;
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
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReportPreview({
  report,
  onDownload,
  onClose,
  isDownloading = false,
  downloadingFormat = null,
  className = '',
}: ReportPreviewProps) {
  const handleDownload = (format: 'pdf' | 'excel') => {
    onDownload?.(report.id, format);
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-forest-50 to-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-forest-500 rounded-lg">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
              <p className="text-sm text-gray-500">{formatDate(report.createdAt)}</p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Report Metadata */}
      <div className="p-6">
        {/* Status */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Status
          </h4>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
              report.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : report.status === 'generating'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {report.status === 'generating' && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {report.status === 'completed' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {report.status === 'failed' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
          </span>
        </div>

        {/* Quick Stats from Analysis */}
        {report.metadata && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Analysis Summary
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {report.metadata.treeCount !== undefined && (
                <div className="bg-forest-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    <span className="text-xs font-medium text-gray-500 uppercase">Trees</span>
                  </div>
                  <p className="text-xl font-bold text-forest-700">
                    {report.metadata.treeCount.toLocaleString()}
                  </p>
                </div>
              )}

              {report.metadata.areaHectares !== undefined && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <span className="text-xs font-medium text-gray-500 uppercase">Area</span>
                  </div>
                  <p className="text-xl font-bold text-blue-700">
                    {report.metadata.areaHectares.toFixed(1)} <span className="text-sm font-normal">ha</span>
                  </p>
                </div>
              )}

              {report.metadata.analysisType && (
                <div className="bg-purple-50 rounded-lg p-4 col-span-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-xs font-medium text-gray-500 uppercase">Analysis Type</span>
                  </div>
                  <p className="text-lg font-semibold text-purple-700">
                    {report.metadata.analysisType
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Report Options */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Report Details
          </h4>
          <dl className="space-y-2">
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Format</dt>
              <dd className="text-gray-900 font-medium">
                {report.format === 'both'
                  ? 'PDF + Excel'
                  : report.format.toUpperCase()}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Units</dt>
              <dd className="text-gray-900 font-medium">
                {report.options.units === 'imperial' ? 'Imperial (ft, ac)' : 'Metric (m, ha)'}
              </dd>
            </div>
            {report.fileSize && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">File Size</dt>
                <dd className="text-gray-900 font-medium">{formatFileSize(report.fileSize)}</dd>
              </div>
            )}
            {report.completedAt && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">Completed</dt>
                <dd className="text-gray-900 font-medium">
                  {new Date(report.completedAt).toLocaleTimeString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Included Sections */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Included Sections
          </h4>
          <div className="flex flex-wrap gap-2">
            {report.options.includeCharts && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Charts
              </span>
            )}
            {report.options.includeTreeList && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Tree List
              </span>
            )}
            {report.options.includeMethodology && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Methodology
              </span>
            )}
          </div>
        </div>

        {/* Preview Placeholder */}
        {report.previewUrl && report.status === 'completed' && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Preview
            </h4>
            <div className="aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
              <img
                src={report.previewUrl}
                alt="Report preview"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
          </div>
        )}

        {/* No preview placeholder */}
        {!report.previewUrl && report.status === 'completed' && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Preview
            </h4>
            <div className="aspect-[4/3] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400">
              <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Preview not available</p>
              <p className="text-xs text-gray-400 mt-1">Download to view full report</p>
            </div>
          </div>
        )}
      </div>

      {/* Download Actions */}
      {report.status === 'completed' && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            {(report.format === 'pdf' || report.format === 'both') && (
              <button
                onClick={() => handleDownload('pdf')}
                disabled={isDownloading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading && downloadingFormat === 'pdf' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Download PDF
              </button>
            )}
            {(report.format === 'excel' || report.format === 'both') && (
              <button
                onClick={() => handleDownload('excel')}
                disabled={isDownloading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading && downloadingFormat === 'excel' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Download Excel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error state for failed reports */}
      {report.status === 'failed' && (
        <div className="px-6 py-4 bg-red-50 border-t border-red-100">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-red-800">Report Generation Failed</h4>
              <p className="text-sm text-red-700 mt-1">{report.error || 'An unexpected error occurred'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportPreview;
