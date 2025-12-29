/**
 * TreeVolumeCard Component
 * Sprint 17-18: DBH & Volume Estimation
 *
 * Displays volume and biomass metrics for a single tree.
 */

import React from 'react';
import type { TreeEstimate, DisplayOptions, UnitSystem } from './types';
import { DEFAULT_DISPLAY_OPTIONS } from './types';

interface TreeVolumeCardProps {
  tree: TreeEstimate;
  options?: Partial<DisplayOptions>;
  className?: string;
}

// Unit conversion functions
const convertVolume = (m3: number, system: UnitSystem): { value: number; unit: string } => {
  if (system === 'imperial') {
    return { value: m3 * 35.3147, unit: 'ft³' };
  }
  return { value: m3, unit: 'm³' };
};

const convertBiomass = (kg: number, system: UnitSystem): { value: number; unit: string } => {
  if (system === 'imperial') {
    return { value: kg * 2.20462, unit: 'lb' };
  }
  return { value: kg, unit: 'kg' };
};

const convertLength = (m: number, system: UnitSystem): { value: number; unit: string } => {
  if (system === 'imperial') {
    return { value: m * 3.28084, unit: 'ft' };
  }
  return { value: m, unit: 'm' };
};

const convertDiameter = (cm: number, system: UnitSystem): { value: number; unit: string } => {
  if (system === 'imperial') {
    return { value: cm / 2.54, unit: 'in' };
  }
  return { value: cm, unit: 'cm' };
};

const formatValue = (value: number, decimals: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const TreeVolumeCard: React.FC<TreeVolumeCardProps> = ({
  tree,
  options = {},
  className = '',
}) => {
  const displayOptions = { ...DEFAULT_DISPLAY_OPTIONS, ...options };
  const { unitSystem, showComponents, showConfidence, decimalPlaces } = displayOptions;

  const height = convertLength(tree.height_m, unitSystem);
  const dbh = convertDiameter(tree.dbh_cm, unitSystem);
  const crown = tree.crown_diameter_m
    ? convertLength(tree.crown_diameter_m, unitSystem)
    : null;
  const volume = convertVolume(tree.volume.total_m3, unitSystem);
  const biomass = convertBiomass(tree.biomass.aboveground_kg, unitSystem);
  const carbon = tree.biomass.carbon_kg
    ? convertBiomass(tree.biomass.carbon_kg, unitSystem)
    : null;

  // Confidence indicator color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Tree {tree.tree_id}
          </h3>
          <p className="text-sm text-gray-500">
            {tree.species_code || 'Unknown species'}
          </p>
        </div>
        {showConfidence && (
          <div className={`text-right ${getConfidenceColor(tree.confidence)}`}>
            <span className="text-sm font-medium">
              {Math.round(tree.confidence * 100)}%
            </span>
            <span className="text-xs block text-gray-500">confidence</span>
          </div>
        )}
      </div>

      {/* Basic Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {formatValue(height.value, 1)}
          </div>
          <div className="text-xs text-gray-500">Height ({height.unit})</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {formatValue(dbh.value, 1)}
          </div>
          <div className="text-xs text-gray-500">DBH ({dbh.unit})</div>
        </div>
        {crown && (
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatValue(crown.value, 1)}
            </div>
            <div className="text-xs text-gray-500">Crown ({crown.unit})</div>
          </div>
        )}
      </div>

      {/* Volume Section */}
      <div className="border-t pt-4 mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Volume</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xl font-bold text-blue-600">
              {formatValue(volume.value, decimalPlaces)}
            </div>
            <div className="text-xs text-gray-500">
              Total ({volume.unit})
            </div>
          </div>
          {tree.volume.board_feet !== null && unitSystem === 'imperial' && (
            <div>
              <div className="text-xl font-bold text-blue-600">
                {formatValue(tree.volume.board_feet, 0)}
              </div>
              <div className="text-xs text-gray-500">Board Feet</div>
            </div>
          )}
          {tree.volume.merchantable_m3 !== null && (
            <div>
              <div className="text-xl font-bold text-blue-500">
                {formatValue(
                  convertVolume(tree.volume.merchantable_m3, unitSystem).value,
                  decimalPlaces
                )}
              </div>
              <div className="text-xs text-gray-500">
                Merchantable ({volume.unit})
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Biomass Section */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Biomass & Carbon
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xl font-bold text-green-600">
              {formatValue(biomass.value, decimalPlaces)}
            </div>
            <div className="text-xs text-gray-500">
              Biomass ({biomass.unit})
            </div>
          </div>
          {carbon && (
            <div>
              <div className="text-xl font-bold text-green-600">
                {formatValue(carbon.value, decimalPlaces)}
              </div>
              <div className="text-xs text-gray-500">
                Carbon ({carbon.unit})
              </div>
            </div>
          )}
          {tree.biomass.co2_equivalent_kg !== null && (
            <div>
              <div className="text-xl font-bold text-emerald-600">
                {formatValue(
                  convertBiomass(tree.biomass.co2_equivalent_kg, unitSystem).value,
                  decimalPlaces
                )}
              </div>
              <div className="text-xs text-gray-500">
                CO₂e ({biomass.unit})
              </div>
            </div>
          )}
        </div>

        {/* Component Breakdown */}
        {showComponents && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <h5 className="text-xs font-semibold text-gray-600 mb-2">
              Biomass Components
            </h5>
            <div className="grid grid-cols-4 gap-2 text-center">
              {tree.biomass.stem_kg !== null && (
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    {formatValue(
                      convertBiomass(tree.biomass.stem_kg, unitSystem).value,
                      1
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Stem</div>
                </div>
              )}
              {tree.biomass.branch_kg !== null && (
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    {formatValue(
                      convertBiomass(tree.biomass.branch_kg, unitSystem).value,
                      1
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Branch</div>
                </div>
              )}
              {tree.biomass.foliage_kg !== null && (
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    {formatValue(
                      convertBiomass(tree.biomass.foliage_kg, unitSystem).value,
                      1
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Foliage</div>
                </div>
              )}
              {tree.biomass.root_kg !== null && (
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    {formatValue(
                      convertBiomass(tree.biomass.root_kg, unitSystem).value,
                      1
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Root</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Basal Area */}
      <div className="mt-4 text-center text-sm text-gray-600">
        Basal Area: {formatValue(tree.basal_area_m2 * 10000, 1)} cm²
      </div>
    </div>
  );
};

export default TreeVolumeCard;
