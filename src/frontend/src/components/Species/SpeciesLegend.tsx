/**
 * SpeciesLegend Component
 * Sprint 13-14: Species Classification UI
 *
 * Color legend for species visualization with toggleable visibility controls.
 * Shows species name, color swatch, and tree count.
 */

import { useCallback } from 'react';
import { useSpeciesStore } from '../../store/speciesStore';
import { getSpeciesColor, getSpeciesName } from './speciesColors';
import type { SpeciesBreakdownItem } from '../../api/species';

interface SpeciesLegendProps {
  breakdown?: SpeciesBreakdownItem[];
  showVisibilityToggle?: boolean;
  showCounts?: boolean;
  compact?: boolean;
  maxItems?: number;
  className?: string;
}

interface LegendItemProps {
  species: SpeciesBreakdownItem;
  isVisible: boolean;
  showVisibilityToggle: boolean;
  showCount: boolean;
  compact: boolean;
  onToggle: () => void;
  onClick: () => void;
  isFiltered: boolean;
}

function LegendItem({
  species,
  isVisible,
  showVisibilityToggle,
  showCount,
  compact,
  onToggle,
  onClick,
  isFiltered,
}: LegendItemProps) {
  const color = getSpeciesColor(species.speciesCode);
  const name = getSpeciesName(species.speciesCode);

  return (
    <div
      className={`flex items-center gap-2 group transition-opacity ${
        isFiltered ? 'opacity-40' : ''
      } ${compact ? 'py-1' : 'py-1.5'}`}
    >
      {/* Visibility Toggle */}
      {showVisibilityToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
            isVisible
              ? 'bg-forest-500 border-forest-500'
              : 'bg-white border-gray-300 hover:border-gray-400'
          }`}
          title={isVisible ? 'Hide species' : 'Show species'}
        >
          {isVisible && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}

      {/* Color Swatch and Name - Clickable for filtering */}
      <button
        onClick={onClick}
        className={`flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-gray-50 rounded px-1 -mx-1 transition-colors ${
          !isVisible ? 'opacity-50' : ''
        }`}
      >
        <div
          className={`flex-shrink-0 rounded ${compact ? 'w-3 h-3' : 'w-4 h-4'}`}
          style={{ backgroundColor: color }}
        />
        <span
          className={`truncate ${compact ? 'text-xs' : 'text-sm'} text-gray-700 group-hover:text-gray-900`}
        >
          {name}
        </span>
      </button>

      {/* Count */}
      {showCount && (
        <span
          className={`flex-shrink-0 ${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-500`}
        >
          {species.count.toLocaleString()}
        </span>
      )}
    </div>
  );
}

export function SpeciesLegend({
  breakdown: propBreakdown,
  showVisibilityToggle = true,
  showCounts = true,
  compact = false,
  maxItems,
  className = '',
}: SpeciesLegendProps) {
  const {
    speciesBreakdown: storeBreakdown,
    speciesVisibility,
    selectedSpeciesFilter,
    toggleSpeciesVisibility,
    toggleSpeciesFilter,
    setAllSpeciesVisibility,
    clearSpeciesFilter,
  } = useSpeciesStore();

  const breakdown = propBreakdown || storeBreakdown;

  // Sort by count descending
  const sortedBreakdown = [...breakdown].sort((a, b) => b.count - a.count);
  const displayBreakdown = maxItems ? sortedBreakdown.slice(0, maxItems) : sortedBreakdown;
  const hiddenCount = maxItems ? Math.max(0, sortedBreakdown.length - maxItems) : 0;

  const handleToggleVisibility = useCallback(
    (speciesCode: string) => {
      toggleSpeciesVisibility(speciesCode);
    },
    [toggleSpeciesVisibility]
  );

  const handleItemClick = useCallback(
    (speciesCode: string) => {
      toggleSpeciesFilter(speciesCode);
    },
    [toggleSpeciesFilter]
  );

  const allVisible = Object.values(speciesVisibility).every(Boolean);
  const noneVisible = Object.values(speciesVisibility).every((v) => !v);

  if (breakdown.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className={`flex items-center justify-between border-b border-gray-200 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <h4 className={`font-semibold text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>
          Species Legend
        </h4>
        {showVisibilityToggle && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAllSpeciesVisibility(true)}
              disabled={allVisible}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                allVisible
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-forest-600 hover:bg-forest-50'
              }`}
            >
              All
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setAllSpeciesVisibility(false)}
              disabled={noneVisible}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                noneVisible
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              None
            </button>
          </div>
        )}
      </div>

      {/* Active Filter Banner */}
      {selectedSpeciesFilter.length > 0 && (
        <div className={`flex items-center justify-between bg-forest-50 border-b border-forest-100 ${compact ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
          <span className="text-xs text-forest-700">
            Filtering {selectedSpeciesFilter.length} species
          </span>
          <button
            onClick={clearSpeciesFilter}
            className="text-xs font-medium text-forest-600 hover:text-forest-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Legend Items */}
      <div className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} max-h-64 overflow-y-auto`}>
        <div className="space-y-0.5">
          {displayBreakdown.map((species) => (
            <LegendItem
              key={species.speciesCode}
              species={species}
              isVisible={speciesVisibility[species.speciesCode] ?? true}
              showVisibilityToggle={showVisibilityToggle}
              showCount={showCounts}
              compact={compact}
              onToggle={() => handleToggleVisibility(species.speciesCode)}
              onClick={() => handleItemClick(species.speciesCode)}
              isFiltered={
                selectedSpeciesFilter.length > 0 &&
                !selectedSpeciesFilter.includes(species.speciesCode)
              }
            />
          ))}
        </div>

        {/* Hidden Count */}
        {hiddenCount > 0 && (
          <div className={`mt-2 pt-2 border-t border-gray-100 ${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>
            +{hiddenCount} more species
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className={`border-t border-gray-200 bg-gray-50 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className="flex items-center justify-between">
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>
            Total: {breakdown.reduce((sum, s) => sum + s.count, 0).toLocaleString()} trees
          </span>
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-700`}>
            {breakdown.length} species
          </span>
        </div>
      </div>
    </div>
  );
}

export default SpeciesLegend;
