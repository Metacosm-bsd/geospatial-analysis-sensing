/**
 * SpeciesCard Component
 * Sprint 13-14: Species Classification UI
 *
 * Displays detailed information about a single species including
 * tree count, percentage, average height/DBH, and confidence distribution.
 */

import { getSpeciesColor, getSpeciesName, SPECIES_SCIENTIFIC_NAMES, SPECIES_TYPES } from './speciesColors';
import type { SpeciesBreakdownItem } from '../../api/species';

interface SpeciesCardProps {
  species: SpeciesBreakdownItem;
  totalTrees: number;
  onClick?: () => void;
  isSelected?: boolean;
  showDetails?: boolean;
  className?: string;
}

// Confidence level indicator
function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const level = confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
  const levelStyles = {
    high: { bg: 'bg-green-100', fill: 'bg-green-500', text: 'text-green-700', label: 'High' },
    medium: { bg: 'bg-yellow-100', fill: 'bg-yellow-500', text: 'text-yellow-700', label: 'Medium' },
    low: { bg: 'bg-red-100', fill: 'bg-red-500', text: 'text-red-700', label: 'Low' },
  };
  const style = levelStyles[level];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-16 h-2 ${style.bg} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${style.fill} rounded-full`}
          style={{ width: `${confidence * 100}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${style.text}`}>
        {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

// Stat display component
function Stat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-xs font-normal text-gray-500 ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

export function SpeciesCard({
  species,
  totalTrees: _totalTrees,
  onClick,
  isSelected = false,
  showDetails = true,
  className = '',
}: SpeciesCardProps) {
  // totalTrees available for percentage calculations if needed
  void _totalTrees;
  const color = getSpeciesColor(species.speciesCode);
  const name = getSpeciesName(species.speciesCode);
  const scientificName = SPECIES_SCIENTIFIC_NAMES[species.speciesCode];
  const type = SPECIES_TYPES[species.speciesCode] || 'unknown';

  const typeStyles = {
    conifer: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    deciduous: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    unknown: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
  };
  const typeStyle = typeStyles[type];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border overflow-hidden transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${
        isSelected ? 'ring-2 ring-forest-500 border-forest-500' : 'border-gray-200'
      } ${className}`}
    >
      {/* Header with color bar */}
      <div className="h-1.5" style={{ backgroundColor: color }} />

      <div className="p-4">
        {/* Species Name */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
            </div>
            {scientificName && (
              <p className="text-xs text-gray-500 italic mt-0.5 truncate">{scientificName}</p>
            )}
          </div>
          <span
            className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${typeStyle.bg} ${typeStyle.text}`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        </div>

        {/* Species Code */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
            {species.speciesCode}
          </span>
          <span className="text-xs text-gray-500">
            {species.percentage.toFixed(1)}% of stand
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Tree Count" value={species.count} />
          <Stat label="Percentage" value={`${species.percentage.toFixed(1)}%`} />
          {showDetails && (
            <>
              <Stat label="Avg Height" value={species.averageHeight.toFixed(1)} unit="m" />
              <Stat label="Avg DBH" value={species.averageDbh.toFixed(1)} unit="cm" />
            </>
          )}
        </div>

        {/* Confidence */}
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Classification Confidence</p>
          <ConfidenceIndicator confidence={species.averageConfidence} />
        </div>
      </div>
    </div>
  );
}

// Compact variant for lists
export function SpeciesCardCompact({
  species,
  totalTrees: _totalTrees,
  onClick,
  isSelected = false,
  className = '',
}: SpeciesCardProps) {
  // totalTrees available for percentage calculations if needed
  void _totalTrees;
  const color = getSpeciesColor(species.speciesCode);
  const name = getSpeciesName(species.speciesCode);

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 bg-white rounded-lg border transition-all ${
        onClick ? 'cursor-pointer hover:shadow-sm' : ''
      } ${
        isSelected ? 'ring-2 ring-forest-500 border-forest-500' : 'border-gray-200 hover:border-gray-300'
      } ${className}`}
    >
      {/* Color Indicator */}
      <div
        className="w-2 h-10 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Species Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
          <span className="text-xs font-mono text-gray-400">{species.speciesCode}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-500">
            {species.count.toLocaleString()} trees
          </span>
          <span className="text-xs text-gray-400">
            {species.percentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Confidence */}
      <div className="flex-shrink-0 w-12">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              species.averageConfidence >= 0.9
                ? 'bg-green-500'
                : species.averageConfidence >= 0.7
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${species.averageConfidence * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-0.5">
          {Math.round(species.averageConfidence * 100)}%
        </p>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}

export default SpeciesCard;
