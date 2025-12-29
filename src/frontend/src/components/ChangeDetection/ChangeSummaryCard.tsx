/**
 * ChangeSummaryCard Component
 * Sprint 31-36: Change Detection & Time Series
 *
 * Displays change detection summary with mortality, ingrowth, and growth metrics.
 */

import type { ChangeDetectionResult, ChangeType } from './types';
import { CHANGE_TYPE_COLORS, CHANGE_TYPE_LABELS } from './types';

interface ChangeSummaryCardProps {
  result: ChangeDetectionResult;
  onExportGeoJSON?: () => void;
  onViewDetails?: () => void;
}

export function ChangeSummaryCard({
  result,
  onExportGeoJSON,
  onViewDetails,
}: ChangeSummaryCardProps) {
  const { summary, date_t1, date_t2, time_interval_years, area_hectares } = result;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const changeTypeCounts: { type: ChangeType; count: number; label: string }[] = [
    { type: 'mortality', count: summary.mortality_count, label: CHANGE_TYPE_LABELS.mortality },
    { type: 'ingrowth', count: summary.ingrowth_count, label: CHANGE_TYPE_LABELS.ingrowth },
    { type: 'growth', count: summary.growth_count, label: CHANGE_TYPE_LABELS.growth },
    { type: 'decline', count: summary.decline_count, label: CHANGE_TYPE_LABELS.decline },
    { type: 'stable', count: summary.stable_count, label: CHANGE_TYPE_LABELS.stable },
  ];

  const totalChanges = changeTypeCounts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4">
        <h2 className="text-xl font-semibold">Change Detection Results</h2>
        <p className="text-sm text-indigo-100 mt-1">
          {formatDate(date_t1)} to {formatDate(date_t2)} ({time_interval_years.toFixed(1)} years)
        </p>
      </div>

      <div className="p-4">
        {/* Tree Count Overview */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-700">
              {summary.total_trees_t1.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Trees (T1)</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-indigo-700">
              {summary.matched_trees.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Matched</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-700">
              {summary.total_trees_t2.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Trees (T2)</p>
          </div>
        </div>

        {/* Net Change */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className={`px-4 py-2 rounded-lg ${
            summary.net_tree_change >= 0
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            <span className="text-2xl font-bold">
              {summary.net_tree_change >= 0 ? '+' : ''}{summary.net_tree_change}
            </span>
            <span className="text-sm ml-2">Net Tree Change</span>
          </div>
        </div>

        {/* Change Type Breakdown */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Change Type Distribution</h3>
          <div className="space-y-2">
            {changeTypeCounts.map(({ type, count, label }) => {
              const percentage = totalChanges > 0 ? (count / totalChanges) * 100 : 0;
              return (
                <div key={type} className="relative">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: CHANGE_TYPE_COLORS[type] }}
                      />
                      {label}
                    </span>
                    <span className="font-medium">
                      {count.toLocaleString()} ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: CHANGE_TYPE_COLORS[type],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rates */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-lg font-semibold text-red-700">
              {summary.mortality_rate_pct.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">Mortality Rate</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-lg font-semibold text-green-700">
              {summary.ingrowth_rate_pct.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">Ingrowth Rate</p>
          </div>
        </div>

        {/* Growth Metrics */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Growth Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-lg font-semibold text-blue-700">
                {summary.mean_height_growth_m.toFixed(2)} m
              </p>
              <p className="text-xs text-gray-500">Mean Height Growth</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-lg font-semibold text-blue-700">
                {summary.mean_dbh_growth_cm.toFixed(2)} cm
              </p>
              <p className="text-xs text-gray-500">Mean DBH Growth</p>
            </div>
          </div>
        </div>

        {/* Carbon Change */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-green-800 mb-3">Carbon Stock Change</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className={`text-xl font-bold ${
                summary.total_carbon_change_kg >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {summary.total_carbon_change_kg >= 0 ? '+' : ''}
                {(summary.total_carbon_change_kg / 1000).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">Total (t C)</p>
            </div>
            <div>
              <p className={`text-xl font-bold ${
                summary.annual_carbon_change_kg >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {summary.annual_carbon_change_kg >= 0 ? '+' : ''}
                {(summary.annual_carbon_change_kg / 1000).toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Annual (t C/yr)</p>
            </div>
            <div>
              <p className={`text-xl font-bold ${
                summary.carbon_per_hectare_change >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {summary.carbon_per_hectare_change >= 0 ? '+' : ''}
                {summary.carbon_per_hectare_change.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">Per ha (kg/ha)</p>
            </div>
          </div>
        </div>

        {/* Project Info */}
        <div className="bg-gray-50 rounded p-3 text-sm text-gray-600 mb-4">
          <div className="flex justify-between">
            <span>Project ID:</span>
            <span className="font-medium">{result.project_id}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Area:</span>
            <span className="font-medium">{area_hectares.toFixed(1)} ha</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Processing Time:</span>
            <span className="font-medium">{result.processing_time_ms.toFixed(0)} ms</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              View Tree Details
            </button>
          )}
          {onExportGeoJSON && (
            <button
              onClick={onExportGeoJSON}
              className="flex-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Export GeoJSON
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChangeSummaryCard;
