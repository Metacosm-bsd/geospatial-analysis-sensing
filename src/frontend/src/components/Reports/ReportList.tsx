import { useState } from 'react';
import { ReportCard } from './ReportCard';
import type { Report, ReportStatus } from '../../api/reports';

interface ReportListProps {
  reports: Report[];
  isLoading?: boolean;
  error?: string | null;
  selectedReport?: Report | null;
  onSelectReport?: (report: Report | null) => void;
  onDownload?: (reportId: string, format: 'pdf' | 'excel') => void;
  onDelete?: (reportId: string) => void;
  downloadStates?: {
    [reportId: string]: {
      isDownloading: boolean;
      format: 'pdf' | 'excel' | null;
    };
  };
  isDeleting?: boolean;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type SortOrder = 'newest' | 'oldest';
type StatusFilter = ReportStatus | 'all';

export function ReportList({
  reports,
  isLoading = false,
  error = null,
  selectedReport = null,
  onSelectReport,
  onDownload,
  onDelete,
  downloadStates = {},
  isDeleting = false,
  className = '',
}: ReportListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Filter and sort reports
  const filteredReports = reports
    .filter((report) => statusFilter === 'all' || report.status === statusFilter)
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <svg className="w-8 h-8 text-forest-600 animate-spin" fill="none" viewBox="0 0 24 24">
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
        <p className="text-sm text-gray-500 mt-3">Loading reports...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 text-center ${className}`}>
        <svg
          className="w-12 h-12 text-red-400 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-sm font-medium text-red-800 mb-1">Failed to load reports</h3>
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
          >
            <option value="all">All Reports</option>
            <option value="completed">Completed</option>
            <option value="generating">Generating</option>
            <option value="failed">Failed</option>
          </select>

          {/* Sort Order */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Grid view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="List view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Reports Count */}
      <p className="text-sm text-gray-500 mb-4">
        {filteredReports.length === 0
          ? 'No reports found'
          : `${filteredReports.length} report${filteredReports.length === 1 ? '' : 's'}`}
      </p>

      {/* Empty State */}
      {reports.length === 0 && (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No reports yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Generate your first report by selecting a completed analysis and configuring your report options.
          </p>
        </div>
      )}

      {/* Filtered Empty State */}
      {reports.length > 0 && filteredReports.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <svg
            className="w-12 h-12 text-gray-300 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <h3 className="text-sm font-medium text-gray-900 mb-1">No matching reports</h3>
          <p className="text-sm text-gray-500">
            Try adjusting your filters to see more reports.
          </p>
          <button
            onClick={() => setStatusFilter('all')}
            className="mt-3 text-sm font-medium text-forest-600 hover:text-forest-700"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Reports Grid/List */}
      {filteredReports.length > 0 && (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-3'
          }
        >
          {filteredReports.map((report) => {
            const downloadState = downloadStates[report.id];

            return (
              <ReportCard
                key={report.id}
                report={report}
                onSelect={onSelectReport}
                onDownload={onDownload}
                onDelete={onDelete}
                isSelected={selectedReport?.id === report.id}
                isDownloading={downloadState?.isDownloading || false}
                downloadingFormat={downloadState?.format || null}
                isDeleting={isDeleting}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ReportList;
