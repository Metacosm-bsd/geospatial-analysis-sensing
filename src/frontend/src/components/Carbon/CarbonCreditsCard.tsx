/**
 * CarbonCreditsCard Component
 * Sprint 25-30: Carbon Stock Estimation
 *
 * Displays carbon credits potential with estimated value ranges.
 */

import type { CarbonCredits } from './types';

interface CarbonCreditsCardProps {
  credits: CarbonCredits;
}

export function CarbonCreditsCard({ credits }: CarbonCreditsCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4">
        <h2 className="text-xl font-semibold">Carbon Credits Potential</h2>
        <p className="text-sm text-amber-100 mt-1">
          Registry: {credits.registry.toUpperCase()} | {credits.methodology}
        </p>
      </div>

      <div className="p-4">
        {/* Credits Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-700">
              {credits.gross_co2e_tonnes.toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">Gross CO₂e (tonnes)</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              -{credits.conservative_deduction_pct.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500">Conservative Buffer</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-700">
              {credits.credits.toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">Net Credits</p>
          </div>
        </div>

        {/* Flow Diagram */}
        <div className="flex items-center justify-center gap-2 mb-6 text-sm">
          <div className="px-3 py-1 bg-gray-100 rounded">
            {credits.gross_co2e_tonnes.toFixed(0)} tCO₂e
          </div>
          <span className="text-gray-400">→</span>
          <div className="px-3 py-1 bg-red-100 rounded text-red-700">
            -{(credits.gross_co2e_tonnes * credits.conservative_deduction_pct / 100).toFixed(0)}
          </div>
          <span className="text-gray-400">→</span>
          <div className="px-3 py-1 bg-green-100 rounded text-green-700 font-medium">
            {credits.net_co2e_tonnes.toFixed(0)} Credits
          </div>
        </div>

        {/* Value Estimate */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Estimated Value Range</h3>
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Low Estimate</span>
              <span className="text-lg font-semibold text-amber-600">
                {formatCurrency(credits.estimated_value_usd.low)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Mid Estimate</span>
              <span className="text-2xl font-bold text-amber-700">
                {formatCurrency(credits.estimated_value_usd.mid)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">High Estimate</span>
              <span className="text-lg font-semibold text-amber-600">
                {formatCurrency(credits.estimated_value_usd.high)}
              </span>
            </div>
          </div>
        </div>

        {/* Price per Credit */}
        <div className="bg-gray-50 rounded p-3 text-sm">
          <div className="flex justify-between text-gray-600 mb-1">
            <span>Price per Credit:</span>
            <span>
              {formatCurrency(credits.price_per_credit_usd.low)} - {formatCurrency(credits.price_per_credit_usd.high)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * Values are estimates based on current voluntary carbon market prices.
            Actual credit value depends on project specifics and market conditions.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CarbonCreditsCard;
