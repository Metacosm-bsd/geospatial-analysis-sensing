/**
 * TimeSeriesChart Component
 * Sprint 31-36: Change Detection & Time Series
 *
 * Displays time series trends with epoch data and trend analysis.
 */

import type { TimeSeriesAnalysis, ForecastResult } from './types';

interface TimeSeriesChartProps {
  analysis: TimeSeriesAnalysis;
  forecast?: ForecastResult | null;
  selectedMetric?: 'carbon' | 'trees' | 'height';
  onMetricChange?: (metric: 'carbon' | 'trees' | 'height') => void;
}

export function TimeSeriesChart({
  analysis,
  forecast,
  selectedMetric = 'carbon',
  onMetricChange,
}: TimeSeriesChartProps) {
  const { epochs, trends, overall_summary } = analysis;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
    });
  };

  const formatNumber = (num: number, decimals: number = 1) => {
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(decimals) + 'M';
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(decimals) + 'K';
    }
    return num.toFixed(decimals);
  };

  // Get metric data
  const getMetricValue = (epoch: typeof epochs[0]) => {
    switch (selectedMetric) {
      case 'carbon':
        return epoch.total_carbon_kg / 1000; // Convert to tonnes
      case 'trees':
        return epoch.tree_count;
      case 'height':
        return epoch.mean_height_m;
      default:
        return 0;
    }
  };

  const metricLabels = {
    carbon: 'Carbon Stock (tonnes)',
    trees: 'Tree Count',
    height: 'Mean Height (m)',
  };

  const trendKey = selectedMetric === 'carbon' ? 'carbon_kg' : selectedMetric === 'trees' ? 'tree_count' : 'mean_height_m';
  const trend = trends[trendKey];

  // Calculate chart dimensions
  const values = epochs.map(getMetricValue);
  const minValue = Math.min(...values) * 0.9;
  const maxValue = Math.max(...values) * 1.1;
  const valueRange = maxValue - minValue;

  // Add forecast values if available
  const forecastValues = forecast?.projections.map(p => {
    switch (selectedMetric) {
      case 'carbon':
        return p.carbon_kg.value / 1000;
      case 'trees':
        return p.tree_count.value;
      default:
        return 0;
    }
  }) || [];

  const allValues = [...values, ...forecastValues];
  const chartMax = Math.max(...allValues) * 1.1;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-4">
        <h2 className="text-xl font-semibold">Time Series Analysis</h2>
        <p className="text-sm text-blue-100 mt-1">
          {formatDate(analysis.start_date)} to {formatDate(analysis.end_date)} | {analysis.epoch_count} epochs
        </p>
      </div>

      <div className="p-4">
        {/* Metric Selector */}
        <div className="flex gap-2 mb-4">
          {(['carbon', 'trees', 'height'] as const).map((metric) => (
            <button
              key={metric}
              onClick={() => onMetricChange?.(metric)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedMetric === metric
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {metricLabels[metric]}
            </button>
          ))}
        </div>

        {/* Simple Chart */}
        <div className="relative h-64 mb-4 bg-gray-50 rounded-lg p-4">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500 py-2">
            <span>{formatNumber(chartMax)}</span>
            <span>{formatNumber((chartMax + minValue) / 2)}</span>
            <span>{formatNumber(minValue)}</span>
          </div>

          {/* Chart area */}
          <div className="ml-14 h-full relative">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-t border-gray-200" />
              ))}
            </div>

            {/* Data points and lines */}
            <svg className="absolute inset-0 w-full h-full overflow-visible">
              {/* Historical trend line */}
              {values.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  points={values.map((v, i) => {
                    const x = (i / (values.length - 1)) * 100;
                    const y = ((chartMax - v) / (chartMax - minValue)) * 100;
                    return `${x}%,${y}%`;
                  }).join(' ')}
                />
              )}

              {/* Forecast line (dashed) */}
              {forecast && forecastValues.length > 0 && (
                <polyline
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  points={[
                    // Start from last historical point
                    `${100}%,${((chartMax - values[values.length - 1]) / (chartMax - minValue)) * 100}%`,
                    // Then forecast points
                    ...forecastValues.map((v, i) => {
                      const x = 100 + ((i + 1) / forecastValues.length) * 30;
                      const y = ((chartMax - v) / (chartMax - minValue)) * 100;
                      return `${x}%,${y}%`;
                    }),
                  ].join(' ')}
                />
              )}

              {/* Historical data points */}
              {values.map((v, i) => {
                const x = (i / (values.length - 1)) * 100;
                const y = ((chartMax - v) / (chartMax - minValue)) * 100;
                return (
                  <circle
                    key={i}
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r="6"
                    fill="#2563eb"
                    stroke="white"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>

            {/* X-axis labels */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 transform translate-y-6">
              {epochs.map((epoch, i) => (
                <span key={i} className="text-center">
                  {formatDate(epoch.date)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Trend Analysis */}
        {trend && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-medium text-blue-800 mb-3">Trend Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center">
                <p className={`text-lg font-bold ${
                  trend.trend_direction === 'increasing' ? 'text-green-700' :
                  trend.trend_direction === 'decreasing' ? 'text-red-700' : 'text-gray-700'
                }`}>
                  {trend.trend_direction === 'increasing' ? '↑' :
                   trend.trend_direction === 'decreasing' ? '↓' : '→'}
                  {' '}{trend.trend_direction}
                </p>
                <p className="text-xs text-gray-500">Direction</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-blue-700">
                  {(trend.r_squared * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-gray-500">R² (fit)</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold ${
                  trend.annual_change >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {trend.annual_change >= 0 ? '+' : ''}{formatNumber(trend.annual_change)}
                </p>
                <p className="text-xs text-gray-500">Annual Change</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold ${
                  trend.percent_change >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {trend.percent_change >= 0 ? '+' : ''}{trend.percent_change.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">Total Change</p>
              </div>
            </div>
            {trend.significant && (
              <p className="text-xs text-blue-600 mt-2 text-center">
                Statistically significant (p = {trend.p_value.toFixed(4)})
              </p>
            )}
          </div>
        )}

        {/* Overall Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className={`text-lg font-bold ${
              overall_summary.net_tree_change >= 0 ? 'text-green-700' : 'text-red-700'
            }`}>
              {overall_summary.net_tree_change >= 0 ? '+' : ''}{overall_summary.net_tree_change}
            </p>
            <p className="text-xs text-gray-500">Net Tree Change</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className={`text-lg font-bold ${
              overall_summary.net_carbon_change_kg >= 0 ? 'text-green-700' : 'text-red-700'
            }`}>
              {overall_summary.net_carbon_change_kg >= 0 ? '+' : ''}
              {formatNumber(overall_summary.net_carbon_change_kg / 1000)} t
            </p>
            <p className="text-xs text-gray-500">Net Carbon Change</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-lg font-bold text-blue-700">
              {formatNumber(overall_summary.annual_carbon_rate_kg / 1000)} t/yr
            </p>
            <p className="text-xs text-gray-500">Annual Carbon Rate</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-lg font-bold text-blue-700">
              {overall_summary.annual_height_growth_m.toFixed(2)} m/yr
            </p>
            <p className="text-xs text-gray-500">Annual Height Growth</p>
          </div>
        </div>

        {/* Forecast Summary (if available) */}
        {forecast && (
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-green-800 mb-3">
              {forecast.forecast_years}-Year Forecast ({forecast.model_type} model)
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-green-700">
                  {formatNumber(forecast.cumulative_carbon_gain_kg / 1000)} t
                </p>
                <p className="text-xs text-gray-500">Projected Carbon Gain</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-700">
                  {(forecast.average_annual_growth_rate * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">Avg Annual Growth</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-700">
                  {(forecast.confidence_level * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-gray-500">Confidence Level</p>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-600" />
            <span>Historical</span>
          </div>
          {forecast && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 border-t-2 border-dashed border-green-600" />
              <span>Forecast</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TimeSeriesChart;
