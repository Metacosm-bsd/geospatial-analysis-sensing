/**
 * ReportGenerator Component
 * Sprint 13-14: Report Generation UI
 * Sprint 15-16: Added species breakdown section option
 */

import React, { useState } from 'react';
import type { ReportFormat, ReportOptions } from '../../api/reports';
import type { Analysis } from '../../types';

// Extended ReportOptions for Sprint 15-16
interface ExtendedReportOptions extends ReportOptions {
  includeSpeciesBreakdown?: boolean;
  includeSpeciesValidation?: boolean;
}

interface ReportGeneratorProps {
  analyses: Analysis[];
  onGenerate: (analysisId: string, options: ExtendedReportOptions) => Promise<void>;
  isGenerating?: boolean;
  className?: string;
  hasSpeciesData?: boolean;
}

export function ReportGenerator({
  analyses,
  onGenerate,
  isGenerating = false,
  className = '',
  hasSpeciesData = false,
}: ReportGeneratorProps) {
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>(
    analyses.find((a) => a.status === 'completed')?.id || ''
  );
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeTreeList, setIncludeTreeList] = useState(true);
  const [includeMethodology, setIncludeMethodology] = useState(false);
  // Sprint 15-16: Species options
  const [includeSpeciesBreakdown, setIncludeSpeciesBreakdown] = useState(true);
  const [includeSpeciesValidation, setIncludeSpeciesValidation] = useState(false);
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [customTitle, setCustomTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const completedAnalyses = analyses.filter((a) => a.status === 'completed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedAnalysisId) {
      setError('Please select an analysis to generate a report from.');
      return;
    }

    const options: ExtendedReportOptions = {
      format,
      includeCharts,
      includeTreeList,
      includeMethodology,
      // Sprint 15-16: Include species options
      includeSpeciesBreakdown,
      includeSpeciesValidation,
      units,
      ...(customTitle.trim() ? { customTitle: customTitle.trim() } : {}),
    };

    try {
      await onGenerate(selectedAnalysisId, options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-forest-100 rounded-lg">
            <svg
              className="w-5 h-5 text-forest-600"
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
            <h3 className="text-sm font-semibold text-gray-900">Generate Report</h3>
            <p className="text-xs text-gray-500">Create a professional forest inventory report</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Analysis Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Analysis
          </label>
          {completedAnalyses.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
              No completed analyses available. Run an analysis first.
            </div>
          ) : (
            <select
              value={selectedAnalysisId}
              onChange={(e) => setSelectedAnalysisId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              disabled={isGenerating}
            >
              <option value="">Select an analysis...</option>
              {completedAnalyses.map((analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {analysis.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} -{' '}
                  {analysis.completedAt
                    ? new Date(analysis.completedAt).toLocaleDateString()
                    : 'Completed'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Report Format</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'pdf' as const, label: 'PDF', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
              { value: 'excel' as const, label: 'Excel', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
              { value: 'both' as const, label: 'Both', icon: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormat(option.value)}
                disabled={isGenerating}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  format === option.value
                    ? 'border-forest-500 bg-forest-50 text-forest-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={option.icon} />
                </svg>
                <span className="text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Options Checkboxes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Include Sections</label>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCharts}
                onChange={(e) => setIncludeCharts(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Charts & Visualizations</span>
                <p className="text-xs text-gray-500">
                  Include height distribution, species breakdown, and other charts
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTreeList}
                onChange={(e) => setIncludeTreeList(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Tree Inventory List</span>
                <p className="text-xs text-gray-500">
                  Detailed list of all detected trees with measurements
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMethodology}
                onChange={(e) => setIncludeMethodology(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Methodology Section</span>
                <p className="text-xs text-gray-500">
                  Explain the detection and analysis methods used
                </p>
              </div>
            </label>

            {/* Sprint 15-16: Species sections */}
            <div className="pt-3 mt-3 border-t border-gray-200">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Species Data
              </span>
            </div>

            <label className={`flex items-center gap-3 cursor-pointer ${!hasSpeciesData ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={includeSpeciesBreakdown}
                onChange={(e) => setIncludeSpeciesBreakdown(e.target.checked)}
                disabled={isGenerating || !hasSpeciesData}
                className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Species Breakdown</span>
                <p className="text-xs text-gray-500">
                  {hasSpeciesData
                    ? 'Include species distribution charts and tables'
                    : 'Run species classification to enable this option'}
                </p>
              </div>
            </label>

            <label className={`flex items-center gap-3 cursor-pointer ${!hasSpeciesData ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={includeSpeciesValidation}
                onChange={(e) => setIncludeSpeciesValidation(e.target.checked)}
                disabled={isGenerating || !hasSpeciesData}
                className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Species Validation Metrics</span>
                <p className="text-xs text-gray-500">
                  {hasSpeciesData
                    ? 'Include accuracy, precision, recall metrics'
                    : 'Run species classification to enable this option'}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Units Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Units</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUnits('metric')}
              disabled={isGenerating}
              className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                units === 'metric'
                  ? 'border-forest-500 bg-forest-50 text-forest-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Metric (m, ha)
            </button>
            <button
              type="button"
              onClick={() => setUnits('imperial')}
              disabled={isGenerating}
              className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                units === 'imperial'
                  ? 'border-forest-500 bg-forest-50 text-forest-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Imperial (ft, ac)
            </button>
          </div>
        </div>

        {/* Custom Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Report Title{' '}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            disabled={isGenerating}
            placeholder="Forest Inventory Report - Site A"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        <button
          type="submit"
          disabled={isGenerating || completedAnalyses.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-forest-600 text-white font-medium rounded-lg hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
              Generating Report...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Generate Report
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default ReportGenerator;
