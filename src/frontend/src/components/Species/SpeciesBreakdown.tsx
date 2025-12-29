/**
 * SpeciesBreakdown Component
 * Sprint 13-14: Species Classification UI
 * Sprint 15-16: Added accuracy indicator and validation metrics link
 *
 * Displays species distribution with pie chart, bar chart, and interactive legend.
 * Allows filtering by species when clicked.
 */

import { useMemo, useCallback } from 'react';
import { useSpeciesStore } from '../../store/speciesStore';
import { getSpeciesColor, getSpeciesName } from './speciesColors';
import type { SpeciesBreakdownItem, ValidationMetrics } from '../../api/species';

interface SpeciesBreakdownProps {
  breakdown?: SpeciesBreakdownItem[];
  onSpeciesClick?: (speciesCode: string) => void;
  showPieChart?: boolean;
  showBarChart?: boolean;
  className?: string;
  // Sprint 15-16: New props for validation integration
  validationMetrics?: ValidationMetrics | null;
  onViewValidation?: () => void;
}

// Simple pie chart component
function PieChart({
  data,
  onSliceClick,
  selectedSpecies,
}: {
  data: SpeciesBreakdownItem[];
  onSliceClick?: (speciesCode: string) => void;
  selectedSpecies: string[];
}) {
  const total = useMemo(
    () => data.reduce((sum, item) => sum + item.count, 0),
    [data]
  );

  const slices = useMemo(() => {
    let cumulativePercentage = 0;
    return data.map((item) => {
      const percentage = (item.count / total) * 100;
      const startAngle = cumulativePercentage * 3.6;
      cumulativePercentage += percentage;
      const endAngle = cumulativePercentage * 3.6;

      // Calculate path for the slice
      const startRadians = (startAngle - 90) * (Math.PI / 180);
      const endRadians = (endAngle - 90) * (Math.PI / 180);

      const x1 = 50 + 45 * Math.cos(startRadians);
      const y1 = 50 + 45 * Math.sin(startRadians);
      const x2 = 50 + 45 * Math.cos(endRadians);
      const y2 = 50 + 45 * Math.sin(endRadians);

      const largeArcFlag = percentage > 50 ? 1 : 0;

      const pathData =
        percentage === 100
          ? 'M 50 5 A 45 45 0 1 1 49.99 5 Z'
          : `M 50 50 L ${x1} ${y1} A 45 45 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

      return {
        item,
        percentage,
        pathData,
        color: getSpeciesColor(item.speciesCode),
        isSelected: selectedSpecies.includes(item.speciesCode),
      };
    });
  }, [data, total, selectedSpecies]);

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {slices.map((slice) => (
        <path
          key={slice.item.speciesCode}
          d={slice.pathData}
          fill={slice.color}
          stroke="white"
          strokeWidth="0.5"
          opacity={selectedSpecies.length === 0 || slice.isSelected ? 1 : 0.3}
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => onSliceClick?.(slice.item.speciesCode)}
        >
          <title>
            {getSpeciesName(slice.item.speciesCode)}: {slice.item.count} trees (
            {slice.percentage.toFixed(1)}%)
          </title>
        </path>
      ))}
      {/* Center circle for donut effect */}
      <circle cx="50" cy="50" r="25" fill="white" />
      <text
        x="50"
        y="48"
        textAnchor="middle"
        className="text-xs font-semibold fill-gray-900"
      >
        {total.toLocaleString()}
      </text>
      <text
        x="50"
        y="56"
        textAnchor="middle"
        className="text-[6px] fill-gray-500"
      >
        trees
      </text>
    </svg>
  );
}

// Bar chart component
function BarChart({
  data,
  onBarClick,
  selectedSpecies,
}: {
  data: SpeciesBreakdownItem[];
  onBarClick?: (speciesCode: string) => void;
  selectedSpecies: string[];
}) {
  const maxCount = useMemo(
    () => Math.max(...data.map((item) => item.count)),
    [data]
  );

  const sortedData = useMemo(
    () => [...data].sort((a, b) => b.count - a.count).slice(0, 10),
    [data]
  );

  return (
    <div className="space-y-2">
      {sortedData.map((item) => {
        const percentage = (item.count / maxCount) * 100;
        const isSelected = selectedSpecies.includes(item.speciesCode);
        const isFiltered = selectedSpecies.length > 0 && !isSelected;

        return (
          <div
            key={item.speciesCode}
            className={`cursor-pointer transition-opacity ${
              isFiltered ? 'opacity-30' : ''
            }`}
            onClick={() => onBarClick?.(item.speciesCode)}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getSpeciesColor(item.speciesCode) }}
                />
                <span className="text-gray-700 truncate max-w-[120px]">
                  {getSpeciesName(item.speciesCode)}
                </span>
              </div>
              <span className="text-gray-500 font-medium">
                {item.count.toLocaleString()}
              </span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: getSpeciesColor(item.speciesCode),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SpeciesBreakdown({
  breakdown: propBreakdown,
  onSpeciesClick,
  showPieChart = true,
  showBarChart = true,
  className = '',
  validationMetrics,
  onViewValidation,
}: SpeciesBreakdownProps) {
  const {
    speciesBreakdown: storeBreakdown,
    selectedSpeciesFilter,
    toggleSpeciesFilter,
    isBreakdownLoading,
  } = useSpeciesStore();

  const breakdown = propBreakdown || storeBreakdown;

  const handleSpeciesClick = useCallback(
    (speciesCode: string) => {
      if (onSpeciesClick) {
        onSpeciesClick(speciesCode);
      } else {
        toggleSpeciesFilter(speciesCode);
      }
    },
    [onSpeciesClick, toggleSpeciesFilter]
  );

  // Statistics
  const stats = useMemo(() => {
    if (breakdown.length === 0) return null;

    const totalTrees = breakdown.reduce((sum, s) => sum + s.count, 0);
    const avgConfidence =
      breakdown.reduce((sum, s) => sum + s.averageConfidence * s.count, 0) / totalTrees;
    const avgHeight =
      breakdown.reduce((sum, s) => sum + s.averageHeight * s.count, 0) / totalTrees;
    const dominantSpecies = breakdown.reduce((a, b) =>
      a.count > b.count ? a : b
    );

    return {
      totalTrees,
      speciesCount: breakdown.length,
      avgConfidence,
      avgHeight,
      dominantSpecies,
    };
  }, [breakdown]);

  if (isBreakdownLoading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3">
            <svg className="w-8 h-8 text-forest-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-500">Loading species data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (breakdown.length === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <h3 className="text-sm font-medium text-gray-900">No Species Data</h3>
          <p className="text-sm text-gray-500 mt-1">
            Run species classification to see the breakdown
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Species Distribution</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Click on a species to filter the view
            </p>
          </div>
          {/* Sprint 15-16: Accuracy indicator */}
          {validationMetrics && (
            <div className="flex items-center gap-2">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  validationMetrics.overallAccuracy >= 0.8
                    ? 'bg-forest-100 text-forest-700'
                    : validationMetrics.overallAccuracy >= 0.6
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {(validationMetrics.overallAccuracy * 100).toFixed(0)}% Accuracy
              </div>
              {onViewValidation && (
                <button
                  onClick={onViewValidation}
                  className="text-xs text-forest-600 hover:text-forest-700 font-medium hover:underline"
                >
                  View Metrics
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">
                {stats.totalTrees.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total Trees</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-forest-600">
                {stats.speciesCount}
              </p>
              <p className="text-xs text-gray-500">Species</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-blue-600">
                {stats.avgHeight.toFixed(1)}m
              </p>
              <p className="text-xs text-gray-500">Avg Height</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-600">
                {Math.round(stats.avgConfidence * 100)}%
              </p>
              <p className="text-xs text-gray-500">Confidence</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="p-6">
        <div className={`grid gap-6 ${showPieChart && showBarChart ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {/* Pie Chart */}
          {showPieChart && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Composition
              </h4>
              <div className="h-48">
                <PieChart
                  data={breakdown}
                  onSliceClick={handleSpeciesClick}
                  selectedSpecies={selectedSpeciesFilter}
                />
              </div>
            </div>
          )}

          {/* Bar Chart */}
          {showBarChart && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Tree Counts
              </h4>
              <BarChart
                data={breakdown}
                onBarClick={handleSpeciesClick}
                selectedSpecies={selectedSpeciesFilter}
              />
            </div>
          )}
        </div>

        {/* Dominant Species */}
        {stats && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: getSpeciesColor(stats.dominantSpecies.speciesCode) }}
              />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Dominant: {getSpeciesName(stats.dominantSpecies.speciesCode)}
                </p>
                <p className="text-xs text-gray-500">
                  {stats.dominantSpecies.count.toLocaleString()} trees (
                  {stats.dominantSpecies.percentage.toFixed(1)}%)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active Filter */}
        {selectedSpeciesFilter.length > 0 && (
          <div className="mt-4 p-3 bg-forest-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-forest-700">
                  Filtering by:
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedSpeciesFilter.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-forest-100 text-forest-700 rounded-full"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getSpeciesColor(code) }}
                      />
                      {getSpeciesName(code)}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  const firstFilter = selectedSpeciesFilter[0];
                  if (firstFilter) toggleSpeciesFilter(firstFilter);
                }}
                className="text-xs text-forest-600 hover:text-forest-700 font-medium"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SpeciesBreakdown;
