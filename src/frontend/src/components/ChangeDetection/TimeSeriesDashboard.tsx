/**
 * TimeSeriesDashboard Component
 * Sprint 31-36: Change Detection & Time Series
 *
 * Main dashboard for change detection and time series analysis.
 */

import { useState, useEffect } from 'react';
import { useChangeDetection } from './useChangeDetection';
import { ChangeSummaryCard } from './ChangeSummaryCard';
import { TimeSeriesChart } from './TimeSeriesChart';
import type { ChangeType } from './types';
import { CHANGE_TYPE_COLORS, CHANGE_TYPE_LABELS } from './types';

interface TimeSeriesDashboardProps {
  projectId: string;
  areaHectares: number;
  epochs?: {
    date: string;
    trees: object[];
  }[];
  onExport?: (geojson: object) => void;
}

type ViewMode = 'comparison' | 'time-series' | 'forecast';

export function TimeSeriesDashboard({
  projectId,
  areaHectares,
  epochs = [],
  onExport,
}: TimeSeriesDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('comparison');
  const [selectedEpochIndices, setSelectedEpochIndices] = useState<[number, number]>([0, 1]);
  const [selectedMetric, setSelectedMetric] = useState<'carbon' | 'trees' | 'height'>('carbon');
  const [forecastYears, setForecastYears] = useState(10);
  const [forecastModel, setForecastModel] = useState<'linear' | 'exponential' | 'moving_average'>('linear');
  const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType | null>(null);

  const {
    isLoading,
    error,
    changeResult,
    timeSeriesResult,
    forecastResult,
    detectChanges,
    analyzeTimeSeries,
    forecastGrowth,
    exportToGeoJSON,
    clearError,
  } = useChangeDetection();

  // Run change detection when epochs change
  useEffect(() => {
    if (epochs.length >= 2 && viewMode === 'comparison') {
      const epoch1 = epochs[selectedEpochIndices[0]];
      const epoch2 = epochs[selectedEpochIndices[1]];

      if (epoch1 && epoch2) {
        detectChanges({
          trees_t1: epoch1.trees,
          trees_t2: epoch2.trees,
          date_t1: epoch1.date,
          date_t2: epoch2.date,
          area_hectares: areaHectares,
          project_id: projectId,
        });
      }
    }
  }, [epochs, selectedEpochIndices, viewMode, areaHectares, projectId, detectChanges]);

  // Run time series analysis when switching to that mode
  useEffect(() => {
    if (epochs.length >= 2 && viewMode === 'time-series') {
      analyzeTimeSeries({
        epochs,
        area_hectares: areaHectares,
        project_id: projectId,
      });
    }
  }, [epochs, viewMode, areaHectares, projectId, analyzeTimeSeries]);

  // Run forecast when switching to that mode
  useEffect(() => {
    if (epochs.length >= 2 && viewMode === 'forecast') {
      forecastGrowth({
        epochs,
        area_hectares: areaHectares,
        forecast_years: forecastYears,
        model_type: forecastModel,
        project_id: projectId,
      });
    }
  }, [epochs, viewMode, forecastYears, forecastModel, areaHectares, projectId, forecastGrowth]);

  const handleExportGeoJSON = async () => {
    if (epochs.length < 2) return;

    const epoch1 = epochs[selectedEpochIndices[0]];
    const epoch2 = epochs[selectedEpochIndices[1]];

    const geojson = await exportToGeoJSON({
      trees_t1: epoch1.trees,
      trees_t2: epoch2.trees,
      date_t1: epoch1.date,
      date_t2: epoch2.date,
      area_hectares: areaHectares,
      project_id: projectId,
      change_type_filter: changeTypeFilter || undefined,
    });

    if (geojson && onExport) {
      onExport(geojson);
    } else if (geojson) {
      // Download as file
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `changes_${projectId}_${changeTypeFilter || 'all'}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (epochs.length < 2) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">
          At least 2 epochs of LiDAR data are required for change detection.
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Upload multiple LiDAR scans from different dates to analyze forest changes over time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & View Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Change Detection & Time Series
            </h1>
            <p className="text-sm text-gray-500">
              Project: {projectId} | Area: {areaHectares.toFixed(1)} ha | {epochs.length} epochs
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('comparison')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'comparison'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Two-Epoch Comparison
            </button>
            <button
              onClick={() => setViewMode('time-series')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'time-series'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Time Series Trends
            </button>
            <button
              onClick={() => setViewMode('forecast')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'forecast'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Growth Forecast
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-red-700">{error}</p>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Analyzing forest changes...</p>
        </div>
      )}

      {/* Two-Epoch Comparison View */}
      {viewMode === 'comparison' && !isLoading && (
        <div className="space-y-4">
          {/* Epoch Selector */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Baseline Epoch (T1)
                </label>
                <select
                  value={selectedEpochIndices[0]}
                  onChange={(e) => setSelectedEpochIndices([parseInt(e.target.value), selectedEpochIndices[1]])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {epochs.map((epoch, i) => (
                    <option key={i} value={i} disabled={i === selectedEpochIndices[1]}>
                      {formatDate(epoch.date)} ({epoch.trees.length} trees)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comparison Epoch (T2)
                </label>
                <select
                  value={selectedEpochIndices[1]}
                  onChange={(e) => setSelectedEpochIndices([selectedEpochIndices[0], parseInt(e.target.value)])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {epochs.map((epoch, i) => (
                    <option key={i} value={i} disabled={i === selectedEpochIndices[0]}>
                      {formatDate(epoch.date)} ({epoch.trees.length} trees)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Export Filter
                </label>
                <select
                  value={changeTypeFilter || ''}
                  onChange={(e) => setChangeTypeFilter((e.target.value || null) as ChangeType | null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">All Changes</option>
                  {Object.entries(CHANGE_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Change Summary */}
          {changeResult && (
            <ChangeSummaryCard
              result={changeResult}
              onExportGeoJSON={handleExportGeoJSON}
            />
          )}

          {/* Change Type Legend */}
          {changeResult && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Change Type Legend</h3>
              <div className="flex flex-wrap gap-4">
                {Object.entries(CHANGE_TYPE_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm text-gray-600">
                      {CHANGE_TYPE_LABELS[type as ChangeType]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Time Series View */}
      {viewMode === 'time-series' && !isLoading && timeSeriesResult && (
        <TimeSeriesChart
          analysis={timeSeriesResult}
          selectedMetric={selectedMetric}
          onMetricChange={setSelectedMetric}
        />
      )}

      {/* Forecast View */}
      {viewMode === 'forecast' && !isLoading && (
        <div className="space-y-4">
          {/* Forecast Controls */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forecast Years
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={forecastYears}
                  onChange={(e) => setForecastYears(parseInt(e.target.value) || 10)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forecast Model
                </label>
                <select
                  value={forecastModel}
                  onChange={(e) => setForecastModel(e.target.value as typeof forecastModel)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="linear">Linear</option>
                  <option value="exponential">Exponential</option>
                  <option value="moving_average">Moving Average</option>
                </select>
              </div>
            </div>
          </div>

          {/* Time Series with Forecast */}
          {timeSeriesResult && (
            <TimeSeriesChart
              analysis={timeSeriesResult}
              forecast={forecastResult}
              selectedMetric={selectedMetric}
              onMetricChange={setSelectedMetric}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default TimeSeriesDashboard;
