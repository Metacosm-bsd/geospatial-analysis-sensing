/**
 * StandSummary Component
 * Sprint 17-18: DBH & Volume Estimation
 *
 * Displays stand-level volume, biomass, and carbon metrics.
 */

import React from 'react';
import type { StandTotals, UnitSystem } from './types';

interface StandSummaryProps {
  totals: StandTotals;
  unitSystem?: UnitSystem;
  showCarbonCredits?: boolean;
  className?: string;
}

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  subValue?: number;
  subUnit?: string;
  color?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  subValue,
  subUnit,
  color = 'text-gray-900',
}) => (
  <div className="bg-white rounded-lg p-4 shadow-sm">
    <div className={`text-2xl font-bold ${color}`}>
      {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </div>
    <div className="text-xs text-gray-500 uppercase tracking-wide">{unit}</div>
    <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
    {subValue !== undefined && subUnit && (
      <div className="text-xs text-gray-500 mt-1">
        Total: {subValue.toLocaleString()} {subUnit}
      </div>
    )}
  </div>
);

export const StandSummary: React.FC<StandSummaryProps> = ({
  totals,
  unitSystem = 'metric',
  showCarbonCredits = true,
  className = '',
}) => {
  // Approximate carbon credit value range (USD)
  const lowCarbonPrice = 10; // USD per tonne CO2e
  const highCarbonPrice = 50;
  const totalCO2eTonnes = totals.total_co2_equivalent_kg / 1000;
  const creditValueLow = totalCO2eTonnes * lowCarbonPrice;
  const creditValueHigh = totalCO2eTonnes * highCarbonPrice;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Stand Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-3xl font-bold">
              {totals.tree_count.toLocaleString()}
            </div>
            <div className="text-green-100 text-sm">Total Trees</div>
          </div>
          <div>
            <div className="text-3xl font-bold">
              {totals.area_hectares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-green-100 text-sm">
              Area ({unitSystem === 'metric' ? 'ha' : 'acres'})
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold">
              {Math.round(totals.stems_per_hectare).toLocaleString()}
            </div>
            <div className="text-green-100 text-sm">
              Stems/{unitSystem === 'metric' ? 'ha' : 'acre'}
            </div>
          </div>
        </div>
      </div>

      {/* Structure Metrics */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Stand Structure
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Mean Height"
            value={unitSystem === 'metric' ? totals.mean_height_m : totals.mean_height_m * 3.28084}
            unit={unitSystem === 'metric' ? 'm' : 'ft'}
            color="text-blue-600"
          />
          <MetricCard
            label="Dominant Height"
            value={unitSystem === 'metric' ? totals.dominant_height_m : totals.dominant_height_m * 3.28084}
            unit={unitSystem === 'metric' ? 'm' : 'ft'}
            color="text-blue-600"
          />
          <MetricCard
            label="Mean DBH"
            value={unitSystem === 'metric' ? totals.mean_dbh_cm : totals.mean_dbh_cm / 2.54}
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            color="text-blue-600"
          />
          <MetricCard
            label="QMD"
            value={unitSystem === 'metric' ? totals.quadratic_mean_dbh_cm : totals.quadratic_mean_dbh_cm / 2.54}
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            color="text-blue-600"
          />
        </div>
      </div>

      {/* Basal Area */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Basal Area</h3>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Per Hectare"
            value={totals.basal_area_m2_ha}
            unit="m²/ha"
            subValue={totals.basal_area_m2_total}
            subUnit="m²"
            color="text-indigo-600"
          />
          <div className="bg-white rounded-lg p-4 shadow-sm flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-2">
                <div className="text-indigo-600 text-lg font-bold">
                  {totals.basal_area_m2_ha.toFixed(1)}
                </div>
              </div>
              <div className="text-xs text-gray-500">m²/ha</div>
            </div>
          </div>
        </div>
      </div>

      {/* Volume Metrics */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Volume</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total Volume"
            value={totals.volume_m3_ha}
            unit="m³/ha"
            subValue={Math.round(totals.total_volume_m3)}
            subUnit="m³"
            color="text-purple-600"
          />
          <MetricCard
            label="Merchantable"
            value={totals.merchantable_volume_m3_ha}
            unit="m³/ha"
            subValue={Math.round(totals.merchantable_volume_m3)}
            subUnit="m³"
            color="text-purple-600"
          />
          <MetricCard
            label="Board Feet"
            value={Math.round(totals.board_feet_per_hectare)}
            unit="BF/ha"
            subValue={Math.round(totals.total_board_feet)}
            subUnit="BF"
            color="text-purple-600"
          />
          <MetricCard
            label="MBF"
            value={totals.mbf_per_hectare}
            unit="MBF/ha"
            color="text-purple-600"
          />
        </div>
      </div>

      {/* Biomass & Carbon */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Biomass & Carbon
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Biomass"
            value={totals.biomass_tonnes_ha}
            unit="tonnes/ha"
            subValue={Math.round(totals.total_biomass_kg / 1000)}
            subUnit="tonnes"
            color="text-green-600"
          />
          <MetricCard
            label="Carbon"
            value={totals.carbon_tonnes_ha}
            unit="tC/ha"
            subValue={Math.round(totals.total_carbon_kg / 1000)}
            subUnit="tC"
            color="text-green-600"
          />
          <MetricCard
            label="CO₂ Equivalent"
            value={totals.co2_equivalent_tonnes_ha}
            unit="tCO₂e/ha"
            subValue={Math.round(totals.total_co2_equivalent_kg / 1000)}
            subUnit="tCO₂e"
            color="text-emerald-600"
          />
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-4 shadow-sm">
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">
                {(totals.total_co2_equivalent_kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </div>
              <div className="text-xs text-emerald-600 uppercase tracking-wide">
                tonnes CO₂e
              </div>
              <div className="text-sm font-medium text-gray-700 mt-2">
                Total Carbon Stock
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Carbon Credits Estimate */}
      {showCarbonCredits && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg p-6 border border-emerald-200">
          <h3 className="text-lg font-semibold text-emerald-800 mb-4">
            Carbon Credit Estimate
          </h3>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-2xl font-bold text-emerald-700">
                {totalCO2eTonnes.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </div>
              <div className="text-sm text-emerald-600">tonnes CO₂e</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-700">
                ${creditValueLow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {' - '}
                ${creditValueHigh.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-sm text-emerald-600">
                Estimated Value (USD)
              </div>
            </div>
            <div className="text-sm text-emerald-700">
              <p className="font-medium">Methodology:</p>
              <p>VCS/ARB above-ground biomass</p>
              <p className="text-xs text-emerald-600 mt-1">
                Based on ${lowCarbonPrice}-${highCarbonPrice}/tCO₂e
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            * Carbon credit values are estimates based on current voluntary market rates.
            Actual values depend on project verification, location, and methodology.
          </p>
        </div>
      )}

      {/* Summary Footer */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Quick Summary
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm">
          <div>
            <span className="font-bold">{totals.tree_count}</span> trees
          </div>
          <div>
            <span className="font-bold">{totals.area_hectares.toFixed(2)}</span> ha
          </div>
          <div>
            <span className="font-bold">{Math.round(totals.total_volume_m3)}</span> m³ volume
          </div>
          <div>
            <span className="font-bold">{Math.round(totals.total_biomass_kg / 1000)}</span> t biomass
          </div>
          <div>
            <span className="font-bold">{Math.round(totals.total_carbon_kg / 1000)}</span> tC carbon
          </div>
        </div>
      </div>
    </div>
  );
};

export default StandSummary;
