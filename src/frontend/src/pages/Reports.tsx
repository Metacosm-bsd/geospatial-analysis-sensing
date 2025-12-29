import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjectStore } from '../store/projectStore';
import { useReportStore } from '../store/reportStore';
import { ReportGenerator, ReportList, ReportPreview } from '../components/Reports';
import type { ReportOptions } from '../api/reports';

function Reports() {
  const { id: projectId } = useParams<{ id: string }>();
  const [showGenerator, setShowGenerator] = useState(false);

  // Project store
  const {
    currentProject,
    projectAnalyses,
    isLoadingCurrentProject,
    isLoadingAnalyses,
    fetchProject,
    fetchProjectAnalyses,
  } = useProjectStore();

  // Report store
  const {
    reports,
    isLoadingReports,
    reportsError,
    selectedReport,
    isGenerating,
    downloadStates,
    isDeleting,
    fetchProjectReports,
    selectReport,
    generateReport,
    downloadReport,
    deleteReport,
    clearReports,
  } = useReportStore();

  // Fetch project and reports on mount
  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      fetchProjectAnalyses(projectId);
      fetchProjectReports(projectId);
    }

    return () => {
      clearReports();
    };
  }, [projectId, fetchProject, fetchProjectAnalyses, fetchProjectReports, clearReports]);

  // Handle report generation
  const handleGenerate = useCallback(
    async (analysisId: string, options: ReportOptions) => {
      if (!projectId) return;

      try {
        await generateReport(analysisId, options, projectId);
        setShowGenerator(false);
      } catch {
        // Error handled in store
      }
    },
    [projectId, generateReport]
  );

  // Handle report download
  const handleDownload = useCallback(
    async (reportId: string, format: 'pdf' | 'excel') => {
      const report = reports.find((r) => r.id === reportId);
      const filename = report
        ? `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.${format === 'excel' ? 'xlsx' : 'pdf'}`
        : undefined;

      try {
        await downloadReport(reportId, format, filename);
      } catch {
        // Error handled in store
      }
    },
    [reports, downloadReport]
  );

  // Handle report deletion
  const handleDelete = useCallback(
    async (reportId: string) => {
      try {
        await deleteReport(reportId);
      } catch {
        // Error handled in store
      }
    },
    [deleteReport]
  );

  // Close preview panel
  const handleClosePreview = useCallback(() => {
    selectReport(null);
  }, [selectReport]);

  // Loading state
  if (isLoadingCurrentProject && !currentProject) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex items-center space-x-3">
          <svg className="animate-spin h-6 w-6 text-forest-600" fill="none" viewBox="0 0 24 24">
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
          <span className="text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <svg
            className="mx-auto h-12 w-12 text-yellow-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Project not found</h3>
          <p className="text-sm text-yellow-700 mb-4">
            The project you're looking for doesn't exist or you don't have access.
          </p>
          <Link
            to="/projects"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-yellow-800 bg-yellow-100 rounded-lg hover:bg-yellow-200"
          >
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link to="/projects" className="hover:text-gray-700">
          Projects
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/projects/${projectId}`} className="hover:text-gray-700">
          {currentProject.name}
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900">Reports</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate and manage forest inventory reports for {currentProject.name}
          </p>
        </div>

        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showGenerator
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-forest-600 text-white hover:bg-forest-700'
          }`}
        >
          {showGenerator ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate Report
            </>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Generator or Report List */}
        <div className={`${selectedReport ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* Report Generator */}
          {showGenerator && (
            <div className="mb-6">
              <ReportGenerator
                analyses={projectAnalyses}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
            </div>
          )}

          {/* Report List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Generated Reports</h2>
              {reports.length > 0 && (
                <span className="text-sm text-gray-500">{reports.length} total</span>
              )}
            </div>

            <ReportList
              reports={reports}
              isLoading={isLoadingReports || isLoadingAnalyses}
              error={reportsError}
              selectedReport={selectedReport}
              onSelectReport={selectReport}
              onDownload={handleDownload}
              onDelete={handleDelete}
              downloadStates={downloadStates}
              isDeleting={isDeleting}
            />
          </div>
        </div>

        {/* Right Column - Preview Panel */}
        {selectedReport && (
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <ReportPreview
                report={selectedReport}
                onDownload={handleDownload}
                onClose={handleClosePreview}
                isDownloading={downloadStates[selectedReport.id]?.isDownloading || false}
                downloadingFormat={downloadStates[selectedReport.id]?.format || null}
              />
            </div>
          </div>
        )}
      </div>

      {/* Quick Tips for empty state */}
      {reports.length === 0 && !showGenerator && !isLoadingReports && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Getting Started with Reports</h3>
              <ul className="mt-2 text-sm text-blue-800 space-y-1">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Run an analysis on your LiDAR data first
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Click "Generate Report" to create a professional forest inventory
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Choose PDF for printable reports or Excel for data analysis
                </li>
              </ul>
              {projectAnalyses.filter((a) => a.status === 'completed').length === 0 && (
                <div className="mt-4">
                  <Link
                    to={`/projects/${projectId}?tab=analyses`}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Start an Analysis
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
