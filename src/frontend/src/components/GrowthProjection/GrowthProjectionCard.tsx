/**
 * GrowthProjectionCard Component
 * Sprint 37-42: Growth Projections & Timber Value
 *
 * Displays growth projection results with charts and metrics.
 */

import type { GrowthProjectionResult, StandProjection } from './types';

interface GrowthProjectionCardProps {
  projection: GrowthProjectionResult;
  selectedMetric?: 'volume' | 'carbon' | 'trees';
  onMetricChange?: (metric: 'volume' | 'carbon' | 'trees') => void;
}

export function GrowthProjectionCard({
  projection,
  selectedMetric = 'volume',
  onMetricChange,
}: GrowthProjectionCardProps) {
  const { current_stand, projections, annual_growth, site_index } = projection;

  const formatNumber = (num: number, decimals: number = 1) => {
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(decimals) + 'M';
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(decimals) + 'K';
    }
    return num.toFixed(decimals);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getMetricValue = (proj: StandProjection) => {
    switch (selectedMetric) {
      case 'volume':
        return proj.volume_m3_ha;
      case 'carbon':
        return proj.carbon_kg_ha / 1000; // Convert to tonnes
      case 'trees':
        return proj.tree_count;
      default:
        return 0;
    }
  };

  const metricLabels = {
    volume: 'Volume (m3/ha)',
    carbon: 'Carbon (t/ha)',
    trees: 'Tree Count',
  };

  // Prepare chart data
  const allProjections = [
    { ...current_stand, projection_year: projection.base_year, years_from_now: 0 } as StandProjection,
    ...projections,
  ];

  const chartValues = allProjections.map(getMetricValue);
  const maxValue = Math.max(...chartValues) * 1.1;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4">
        <h2 className="text-xl font-semibold">Growth Projection</h2>
        <p className="text-sm text-emerald-100 mt-1">
          {projection.region.toUpperCase()} Region | Site Index: {site_index.site_index_ft} ft
        </p>
      </div>

      <div className="p-4">
        {/* Metric Selector */}
        <div className="flex gap-2 mb-4">
          {(['volume', 'carbon', 'trees'] as const).map((metric) => (
            <button
              key={metric}
              onClick={() => onMetricChange?.(metric)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedMetric === metric
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {metricLabels[metric]}
            </button>
          ))}
        </div>

        {/* Simple Bar Chart */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-end justify-around h-40 gap-2">
            {allProjections.map((proj, i) => {
              const value = getMetricValue(proj);
              const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const isCurrentYear = proj.years_from_now === 0;

              return (
                <div key={i} className="flex flex-col items-center flex-1">
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${
                      isCurrentYear ? 'bg-gray-400' : 'bg-emerald-500'
                    }`}
                    style={{ height: `${height}%`, minHeight: '4px' }}
                  />
                  <p className="text-xs font-medium mt-2">
                    {formatNumber(value)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {isCurrentYear ? 'Now' : `+${proj.years_from_now}yr`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Stand Metrics */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Current Stand</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-lg font-bold text-gray-700">
                {current_stand.tree_count.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Trees</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-lg font-bold text-gray-700">
                {current_stand.volume_m3_ha.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">m3/ha</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-lg font-bold text-gray-700">
                {(current_stand.carbon_kg_ha / 1000).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">t C/ha</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-lg font-bold text-gray-700">
                {current_stand.mean_dbh_cm.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">cm DBH</p>
            </div>
          </div>
        </div>

        {/* Annual Growth Rates */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Annual Growth Rates</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-2 bg-emerald-50 rounded text-center">
              <p className="text-sm font-semibold text-emerald-700">
                +{annual_growth.height_growth_m_yr.toFixed(2)} m
              </p>
              <p className="text-xs text-gray-500">Height</p>
            </div>
            <div className="p-2 bg-emerald-50 rounded text-center">
              <p className="text-sm font-semibold text-emerald-700">
                +{annual_growth.dbh_growth_cm_yr.toFixed(2)} cm
              </p>
              <p className="text-xs text-gray-500">DBH</p>
            </div>
            <div className="p-2 bg-emerald-50 rounded text-center">
              <p className="text-sm font-semibold text-emerald-700">
                +{annual_growth.volume_growth_m3_ha_yr.toFixed(1)} m3
              </p>
              <p className="text-xs text-gray-500">Volume/ha</p>
            </div>
            <div className="p-2 bg-emerald-50 rounded text-center">
              <p className="text-sm font-semibold text-emerald-700">
                +{(annual_growth.carbon_growth_kg_ha_yr / 1000).toFixed(2)} t
              </p>
              <p className="text-xs text-gray-500">Carbon/ha</p>
            </div>
            <div className="p-2 bg-emerald-50 rounded text-center">
              <p className="text-sm font-semibold text-emerald-700">
                +{annual_growth.basal_area_growth_m2_ha_yr.toFixed(2)} m2
              </p>
              <p className="text-xs text-gray-500">BA/ha</p>
            </div>
          </div>
        </div>

        {/* Projection Table */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Projected Values</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Year</th>
                  <th className="px-3 py-2 text-right">Trees</th>
                  <th className="px-3 py-2 text-right">Height (m)</th>
                  <th className="px-3 py-2 text-right">Volume (m3/ha)</th>
                  <th className="px-3 py-2 text-right">Carbon (t/ha)</th>
                  <th className="px-3 py-2 text-right">Mortality</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((proj) => (
                  <tr key={proj.projection_year} className="border-t">
                    <td className="px-3 py-2">
                      {proj.projection_year} (+{proj.years_from_now}yr)
                    </td>
                    <td className="px-3 py-2 text-right">
                      {proj.tree_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {proj.mean_height_m.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {proj.volume_m3_ha.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(proj.carbon_kg_ha / 1000).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right text-red-600">
                      {proj.mortality_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Site Index Info */}
        <div className="bg-teal-50 rounded p-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Site Index:</span>
            <span className="font-medium text-teal-700">
              {site_index.site_index_ft} ft @ {site_index.base_age_years} years
            </span>
          </div>
          <div className="flex justify-between text-gray-600 mt-1">
            <span>Confidence:</span>
            <span className="font-medium">
              {(site_index.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t">
        Model: {projection.growth_model} | Processing: {projection.processing_time_ms.toFixed(0)}ms
      </div>
    </div>
  );
}

export default GrowthProjectionCard;
