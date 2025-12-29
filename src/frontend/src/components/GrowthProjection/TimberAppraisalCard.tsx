/**
 * TimberAppraisalCard Component
 * Sprint 37-42: Growth Projections & Timber Value
 *
 * Displays timber appraisal with product breakdown and harvest scenarios.
 */

import type { TimberAppraisal, HarvestScenario } from './types';
import { PRODUCT_CLASS_LABELS, PRODUCT_CLASS_COLORS } from './types';

interface TimberAppraisalCardProps {
  appraisal: TimberAppraisal;
  onScenarioSelect?: (scenario: HarvestScenario) => void;
}

export function TimberAppraisalCard({
  appraisal,
  onScenarioSelect,
}: TimberAppraisalCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-4">
        <h2 className="text-xl font-semibold">Timber Appraisal</h2>
        <p className="text-sm text-amber-100 mt-1">
          {appraisal.region.toUpperCase()} Region | {appraisal.area_hectares.toFixed(1)} ha
        </p>
      </div>

      <div className="p-4">
        {/* Value Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-700">
              {formatCurrency(appraisal.total_stumpage_value)}
            </p>
            <p className="text-sm text-gray-500">Total Stumpage Value</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-700">
              {formatCurrency(appraisal.value_per_hectare)}
            </p>
            <p className="text-sm text-gray-500">Per Hectare</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-700">
              {formatCurrency(appraisal.value_per_mbf_average)}
            </p>
            <p className="text-sm text-gray-500">Avg $/MBF</p>
          </div>
        </div>

        {/* Volume Summary */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-lg font-bold text-gray-700">
              {appraisal.tree_count.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Total Trees</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg text-center">
            <p className="text-lg font-bold text-green-700">
              {appraisal.merchantable_trees.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Merchantable</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-lg font-bold text-gray-700">
              {formatNumber(appraisal.total_net_volume_m3)}
            </p>
            <p className="text-xs text-gray-500">Net m3</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-lg font-bold text-gray-700">
              {formatNumber(appraisal.total_board_feet)}
            </p>
            <p className="text-xs text-gray-500">MBF</p>
          </div>
        </div>

        {/* Product Breakdown */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Product Breakdown</h3>
          <div className="space-y-2">
            {appraisal.products.map((product) => (
              <div key={product.product_class} className="relative">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: PRODUCT_CLASS_COLORS[product.product_class] }}
                    />
                    {PRODUCT_CLASS_LABELS[product.product_class]}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(product.total_value)} ({product.percent_of_volume.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${product.percent_of_volume}%`,
                      backgroundColor: PRODUCT_CLASS_COLORS[product.product_class],
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{product.tree_count} trees</span>
                  <span>{product.total_volume_m3.toFixed(1)} m3 @ ${product.average_price.toFixed(0)}/m3</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Harvest Scenarios */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Harvest Scenarios</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {appraisal.harvest_scenarios.map((scenario) => (
              <button
                key={scenario.scenario_id}
                onClick={() => onScenarioSelect?.(scenario)}
                className="p-3 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors border border-transparent hover:border-amber-300"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-800">{scenario.name}</p>
                    <p className="text-xs text-gray-500">{scenario.description}</p>
                  </div>
                  <span className="text-lg font-bold text-green-700">
                    {formatCurrency(scenario.estimated_value)}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>{scenario.estimated_trees} trees</span>
                  <span>{scenario.estimated_volume_m3.toFixed(0)} m3</span>
                  <span>Residual: {scenario.residual_ba_m2_ha.toFixed(1)} m2/ha</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Price Sources */}
        <div className="bg-gray-50 rounded p-3 text-sm text-gray-600">
          <p className="font-medium mb-1">Price Sources:</p>
          <p className="text-xs text-gray-500">
            {appraisal.price_sources.join(', ')}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            * Values are estimates. Actual stumpage prices depend on market conditions,
            access, logging costs, and buyer negotiations.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t">
        Appraised: {new Date(appraisal.appraisal_date).toLocaleDateString()} |
        Processing: {appraisal.processing_time_ms.toFixed(0)}ms
      </div>
    </div>
  );
}

export default TimberAppraisalCard;
