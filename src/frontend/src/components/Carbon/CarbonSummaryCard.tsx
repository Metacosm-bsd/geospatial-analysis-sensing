/**
 * CarbonSummaryCard Component
 * Sprint 25-30: Carbon Stock Estimation
 *
 * Displays carbon stock summary with uncertainty and pool breakdown.
 */

import type { ProjectCarbonStock, CarbonProtocol } from './types';

interface CarbonSummaryCardProps {
  carbonStock: ProjectCarbonStock;
  onViewAudit?: (auditId: string) => void;
  onGenerateReport?: () => void;
}

const protocolNames: Record<CarbonProtocol, string> = {
  vcs: 'Verified Carbon Standard (VCS)',
  car: 'Climate Action Reserve (CAR)',
  acr: 'American Carbon Registry (ACR)',
  fia: 'Forest Inventory and Analysis (FIA)',
};

const protocolColors: Record<CarbonProtocol, string> = {
  vcs: 'bg-green-100 text-green-800 border-green-200',
  car: 'bg-blue-100 text-blue-800 border-blue-200',
  acr: 'bg-purple-100 text-purple-800 border-purple-200',
  fia: 'bg-gray-100 text-gray-800 border-gray-200',
};

const poolNames: Record<string, string> = {
  above_ground_live: 'Above-Ground Live Biomass',
  below_ground_live: 'Below-Ground Live Biomass',
  dead_wood: 'Dead Wood',
  litter: 'Litter',
  soil: 'Soil Organic Carbon',
};

export function CarbonSummaryCard({
  carbonStock,
  onViewAudit,
  onGenerateReport,
}: CarbonSummaryCardProps) {
  const { total_carbon_tonnes, total_co2e_tonnes, pools } = carbonStock;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold">Carbon Stock Assessment</h2>
            <p className="text-sm text-green-100 mt-1">
              Project: {carbonStock.project_id} | Analysis: {carbonStock.analysis_id}
            </p>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded border ${protocolColors[carbonStock.protocol]}`}
          >
            {carbonStock.protocol.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Summary */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-700">
              {total_carbon_tonnes.value.toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">tonnes C</p>
            <p className="text-xs text-green-600 mt-1">
              ±{total_carbon_tonnes.uncertainty_pct.toFixed(1)}%
            </p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-700">
              {total_co2e_tonnes.value.toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">tonnes CO₂e</p>
            <p className="text-xs text-blue-600 mt-1">
              ±{total_co2e_tonnes.uncertainty_pct.toFixed(1)}%
            </p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-gray-700">
              {carbonStock.area_hectares.toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">hectares</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-gray-700">
              {carbonStock.tree_count.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">trees</p>
          </div>
        </div>

        {/* Density Metrics */}
        <div className="flex gap-4 mb-6 text-center">
          <div className="flex-1 p-3 bg-green-50 rounded">
            <p className="text-lg font-semibold text-green-700">
              {(total_carbon_tonnes.value / carbonStock.area_hectares).toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">tonnes C/ha</p>
          </div>
          <div className="flex-1 p-3 bg-blue-50 rounded">
            <p className="text-lg font-semibold text-blue-700">
              {(total_co2e_tonnes.value / carbonStock.area_hectares).toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">tonnes CO₂e/ha</p>
          </div>
        </div>

        {/* Carbon Pools */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Carbon Pools</h3>
          <div className="space-y-2">
            {Object.entries(pools).map(([poolId, pool]) => {
              const total = Object.values(pools).reduce((sum, p) => sum + p.carbon_tonnes, 0);
              const percentage = total > 0 ? (pool.carbon_tonnes / total) * 100 : 0;

              return (
                <div key={poolId} className="relative">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{poolNames[poolId] || poolId}</span>
                    <span className="font-medium">
                      {pool.carbon_tonnes.toFixed(2)} t ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Uncertainty Range */}
        <div className="bg-yellow-50 border border-yellow-100 rounded p-3 mb-4">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">95% Confidence Interval</h4>
          <div className="flex justify-between text-sm">
            <span className="text-yellow-700">Carbon Stock:</span>
            <span className="font-medium text-yellow-800">
              {total_carbon_tonnes.lower_bound.toFixed(1)} - {total_carbon_tonnes.upper_bound.toFixed(1)} tonnes C
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-yellow-700">CO₂ Equivalent:</span>
            <span className="font-medium text-yellow-800">
              {total_co2e_tonnes.lower_bound.toFixed(1)} - {total_co2e_tonnes.upper_bound.toFixed(1)} tonnes CO₂e
            </span>
          </div>
        </div>

        {/* Methodology Info */}
        <div className="text-sm text-gray-500 mb-4">
          <p>
            <span className="font-medium">Protocol:</span>{' '}
            {protocolNames[carbonStock.protocol]}
          </p>
          <p>
            <span className="font-medium">Methodology:</span>{' '}
            {carbonStock.methodology_version}
          </p>
          <p>
            <span className="font-medium">Audit ID:</span>{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{carbonStock.audit_id}</code>
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onViewAudit && (
            <button
              onClick={() => onViewAudit(carbonStock.audit_id)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              View Audit Trail
            </button>
          )}
          {onGenerateReport && (
            <button
              onClick={onGenerateReport}
              className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              Generate Report
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t">
        Calculated: {new Date(carbonStock.calculation_date).toLocaleString()} |
        Processing: {carbonStock.processing_time_ms.toFixed(0)}ms
      </div>
    </div>
  );
}

export default CarbonSummaryCard;
