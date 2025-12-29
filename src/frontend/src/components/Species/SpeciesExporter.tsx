/**
 * SpeciesExporter Component
 * Sprint 15-16: Species Classification Enhancements
 *
 * Export species data with format selector (CSV, GeoJSON, Shapefile),
 * confidence threshold filter, and download progress.
 */

import { useState, useCallback } from 'react';
import * as speciesApi from '../../api/species';
import type { SpeciesExportOptions } from '../../api/species';

interface SpeciesExporterProps {
  analysisId: string;
  onExportComplete?: () => void;
  onExportError?: (error: string) => void;
  className?: string;
}

type ExportFormat = 'csv' | 'geojson' | 'shapefile';

const FORMAT_INFO: Record<
  ExportFormat,
  { label: string; description: string; icon: string; extension: string }
> = {
  csv: {
    label: 'CSV',
    description: 'Comma-separated values, compatible with Excel',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    extension: '.csv',
  },
  geojson: {
    label: 'GeoJSON',
    description: 'Geospatial JSON format for GIS software',
    icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    extension: '.geojson',
  },
  shapefile: {
    label: 'Shapefile',
    description: 'Industry standard GIS format (ZIP archive)',
    icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    extension: '.zip',
  },
};

export function SpeciesExporter({
  analysisId,
  onExportComplete,
  onExportError,
  className = '',
}: SpeciesExporterProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);
  const [includeUncertain, setIncludeUncertain] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);
    setError(null);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setExportProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const options: SpeciesExportOptions = {
        format,
        confidenceThreshold: confidenceThreshold / 100,
        includeUncertain,
      };

      const blob = await speciesApi.exportSpeciesData(analysisId, options);

      clearInterval(progressInterval);
      setExportProgress(100);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `species-export-${analysisId.substring(0, 8)}-${timestamp}${FORMAT_INFO[format].extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onExportComplete?.();

      // Reset after short delay
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
      onExportError?.(message);
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [
    analysisId,
    format,
    confidenceThreshold,
    includeUncertain,
    onExportComplete,
    onExportError,
  ]);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Export Species Data</h3>
            <p className="text-xs text-gray-500">
              Download species classifications in various formats
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Format selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Export Format
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(FORMAT_INFO) as ExportFormat[]).map((formatKey) => {
              const info = FORMAT_INFO[formatKey];
              return (
                <button
                  key={formatKey}
                  type="button"
                  onClick={() => setFormat(formatKey)}
                  disabled={isExporting}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    format === formatKey
                      ? 'border-forest-500 bg-forest-50 text-forest-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  } ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={info.icon}
                    />
                  </svg>
                  <span className="text-sm font-medium">{info.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500">{FORMAT_INFO[format].description}</p>
        </div>

        {/* Confidence threshold slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Minimum Confidence Threshold
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              disabled={isExporting}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-forest-600"
            />
            <div className="w-16 text-right">
              <span className="text-sm font-semibold text-gray-900">
                {confidenceThreshold}%
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Only export trees with confidence at or above this threshold
          </p>
        </div>

        {/* Include uncertain checkbox */}
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeUncertain}
              onChange={(e) => setIncludeUncertain(e.target.checked)}
              disabled={isExporting}
              className="mt-0.5 w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">
                Include uncertain classifications
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                Export trees marked as &quot;uncertain&quot; or needing review
              </p>
            </div>
          </label>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0"
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
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Export button with progress */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full relative flex items-center justify-center gap-2 px-4 py-3 bg-forest-600 text-white font-medium rounded-lg hover:bg-forest-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden"
        >
          {/* Progress bar */}
          {isExporting && (
            <div
              className="absolute inset-0 bg-forest-700 transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          )}

          <span className="relative flex items-center gap-2">
            {isExporting ? (
              <>
                {exportProgress < 100 ? (
                  <>
                    <svg
                      className="w-5 h-5 animate-spin"
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
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Exporting... {exportProgress}%
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Export Complete!
                  </>
                )}
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download {FORMAT_INFO[format].label}
              </>
            )}
          </span>
        </button>
      </div>

      {/* Footer info */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Export includes tree location, species, confidence, and metrics
        </p>
      </div>
    </div>
  );
}

export default SpeciesExporter;
