/**
 * DiameterDistributionChart Component
 * Sprint 21-24: FIA Reports & Export
 *
 * Displays diameter class distribution as a bar chart.
 * Uses pure CSS for visualization (no external chart library required).
 */

import { useMemo } from 'react';

interface TreeData {
  dbh_cm?: number;
  dbh?: number;
}

interface DiameterDistributionChartProps {
  trees: TreeData[];
  classWidth?: number; // Width of each DBH class in cm
  title?: string;
  showCounts?: boolean;
  showPercentages?: boolean;
  height?: number;
}

interface DiameterClass {
  label: string;
  minDbh: number;
  maxDbh: number;
  count: number;
  percentage: number;
}

export function DiameterDistributionChart({
  trees,
  classWidth = 5, // Default 5cm classes
  title = 'Diameter Distribution',
  showCounts = true,
  showPercentages = false,
  height = 200,
}: DiameterDistributionChartProps) {
  const distribution = useMemo(() => {
    // Get DBH values
    const dbhValues = trees
      .map((t) => t.dbh_cm || t.dbh || 0)
      .filter((d) => d > 0);

    if (dbhValues.length === 0) {
      return [];
    }

    // Calculate range
    const minDbh = Math.floor(Math.min(...dbhValues) / classWidth) * classWidth;
    const maxDbh = Math.ceil(Math.max(...dbhValues) / classWidth) * classWidth;

    // Create classes
    const classes: DiameterClass[] = [];
    for (let i = minDbh; i < maxDbh; i += classWidth) {
      const count = dbhValues.filter((d) => d >= i && d < i + classWidth).length;
      classes.push({
        label: `${i}-${i + classWidth}`,
        minDbh: i,
        maxDbh: i + classWidth,
        count,
        percentage: (count / dbhValues.length) * 100,
      });
    }

    return classes;
  }, [trees, classWidth]);

  if (distribution.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-gray-500 text-sm text-center">No DBH data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...distribution.map((d) => d.count));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">{title}</h3>

      {/* Chart Container */}
      <div className="relative" style={{ height }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-xs text-gray-500">
          <span>{maxCount}</span>
          <span>{Math.round(maxCount / 2)}</span>
          <span>0</span>
        </div>

        {/* Bars Container */}
        <div className="ml-10 h-full flex items-end gap-1 pb-6">
          {distribution.map((cls) => {
            const barHeight = maxCount > 0 ? (cls.count / maxCount) * 100 : 0;
            return (
              <div
                key={cls.label}
                className="flex-1 flex flex-col items-center justify-end"
                style={{ height: '100%' }}
              >
                {/* Bar */}
                <div
                  className="w-full bg-blue-500 hover:bg-blue-600 transition-colors rounded-t cursor-pointer group relative"
                  style={{
                    height: `${barHeight}%`,
                    minHeight: cls.count > 0 ? '2px' : '0',
                  }}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {cls.label}cm: {cls.count} trees ({cls.percentage.toFixed(1)}%)
                  </div>
                </div>

                {/* Count label */}
                {showCounts && cls.count > 0 && (
                  <span className="text-xs text-gray-600 mt-1">{cls.count}</span>
                )}

                {/* X-axis label */}
                <span className="text-xs text-gray-500 mt-1 -rotate-45 origin-top-left whitespace-nowrap">
                  {cls.minDbh}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis label */}
      <p className="text-xs text-gray-500 text-center mt-2">DBH Class (cm)</p>

      {/* Summary stats */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-4 gap-4 text-center">
        <div>
          <span className="text-xs text-gray-500">Min DBH</span>
          <p className="font-medium text-sm">
            {distribution[0]?.minDbh.toFixed(0)} cm
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Max DBH</span>
          <p className="font-medium text-sm">
            {distribution[distribution.length - 1]?.maxDbh.toFixed(0)} cm
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Modal Class</span>
          <p className="font-medium text-sm">
            {distribution.reduce((max, cls) => (cls.count > max.count ? cls : max)).label} cm
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Total Trees</span>
          <p className="font-medium text-sm">
            {distribution.reduce((sum, cls) => sum + cls.count, 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * DiameterBySpeciesChart Component
 * Shows diameter distribution grouped by species
 */
interface TreeWithSpecies extends TreeData {
  species_code?: string;
  species?: string;
}

interface DiameterBySpeciesChartProps {
  trees: TreeWithSpecies[];
  classWidth?: number;
  title?: string;
  height?: number;
}

export function DiameterBySpeciesChart({
  trees,
  classWidth = 10,
  title = 'Diameter Distribution by Species',
  height = 250,
}: DiameterBySpeciesChartProps) {
  const { species, distribution, maxCount } = useMemo(() => {
    // Group trees by species
    const speciesMap = new Map<string, TreeData[]>();

    for (const tree of trees) {
      const speciesCode = tree.species_code || tree.species || 'Unknown';
      if (!speciesMap.has(speciesCode)) {
        speciesMap.set(speciesCode, []);
      }
      speciesMap.get(speciesCode)!.push(tree);
    }

    // Get unique species
    const speciesList = Array.from(speciesMap.keys()).sort();

    // Get all DBH values to determine range
    const allDbh = trees.map((t) => t.dbh_cm || t.dbh || 0).filter((d) => d > 0);
    if (allDbh.length === 0) {
      return { species: [], distribution: [], maxCount: 0 };
    }

    const minDbh = Math.floor(Math.min(...allDbh) / classWidth) * classWidth;
    const maxDbh = Math.ceil(Math.max(...allDbh) / classWidth) * classWidth;

    // Create distribution for each class
    const dist: { label: string; counts: Record<string, number> }[] = [];
    let maxC = 0;

    for (let i = minDbh; i < maxDbh; i += classWidth) {
      const counts: Record<string, number> = {};

      for (const [sp, spTrees] of speciesMap) {
        const count = spTrees.filter((t) => {
          const dbh = t.dbh_cm || t.dbh || 0;
          return dbh >= i && dbh < i + classWidth;
        }).length;
        counts[sp] = count;
        maxC = Math.max(maxC, count);
      }

      dist.push({
        label: `${i}-${i + classWidth}`,
        counts,
      });
    }

    return { species: speciesList, distribution: dist, maxCount: maxC };
  }, [trees, classWidth]);

  // Color palette for species
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-red-500',
    'bg-cyan-500',
    'bg-pink-500',
    'bg-indigo-500',
  ];

  if (distribution.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-gray-500 text-sm text-center">No DBH data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">{title}</h3>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {species.map((sp, i) => (
          <div key={sp} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${colors[i % colors.length]}`} />
            <span className="text-xs text-gray-600">{sp}</span>
          </div>
        ))}
      </div>

      {/* Stacked Bar Chart */}
      <div className="relative" style={{ height }}>
        <div className="h-full flex items-end gap-1">
          {distribution.map((cls) => {
            const totalHeight = Object.values(cls.counts).reduce((sum, c) => sum + c, 0);
            return (
              <div
                key={cls.label}
                className="flex-1 flex flex-col justify-end"
                style={{ height: '100%' }}
              >
                {species.map((sp, i) => {
                  const count = cls.counts[sp] || 0;
                  const segmentHeight = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div
                      key={sp}
                      className={`w-full ${colors[i % colors.length]} first:rounded-t`}
                      style={{
                        height: `${segmentHeight}%`,
                        minHeight: count > 0 ? '1px' : '0',
                      }}
                      title={`${sp}: ${count}`}
                    />
                  );
                })}
                <span className="text-xs text-gray-500 mt-1 text-center truncate">
                  {cls.label.split('-')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center mt-2">DBH Class (cm)</p>
    </div>
  );
}

export default DiameterDistributionChart;
