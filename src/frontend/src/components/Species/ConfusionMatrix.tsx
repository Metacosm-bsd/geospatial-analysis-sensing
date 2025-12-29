/**
 * ConfusionMatrix Component
 * Sprint 15-16: Species Classification Enhancements
 *
 * Heatmap visualization of classification confusion matrix with
 * interactive hover states and highlighting of correct predictions.
 */

import { useMemo, useState } from 'react';
import { getSpeciesName, getSpeciesColor } from './speciesColors';

interface ConfusionMatrixData {
  labels: string[];
  matrix: number[][];
}

interface ConfusionMatrixProps {
  data: ConfusionMatrixData;
  title?: string;
  className?: string;
  showPercentages?: boolean;
}

interface CellInfo {
  predicted: string;
  actual: string;
  count: number;
  percentage: number;
  rowIndex: number;
  colIndex: number;
}

export function ConfusionMatrix({
  data,
  title = 'Confusion Matrix',
  className = '',
  showPercentages = false,
}: ConfusionMatrixProps) {
  const [hoveredCell, setHoveredCell] = useState<CellInfo | null>(null);

  // Calculate max value for color intensity scaling
  const { maxValue, totalCounts, rowTotals } = useMemo(() => {
    let max = 0;
    const totals: number[] = [];
    let total = 0;

    data.matrix.forEach((row, rowIndex) => {
      let rowSum = 0;
      row.forEach((value) => {
        if (value > max) max = value;
        rowSum += value;
        total += value;
      });
      totals[rowIndex] = rowSum;
    });

    return { maxValue: max, totalCounts: total, rowTotals: totals };
  }, [data.matrix]);

  // Get color intensity based on value (0-1 scale)
  const getIntensity = (value: number): number => {
    if (maxValue === 0) return 0;
    return value / maxValue;
  };

  // Get cell background color
  const getCellColor = (
    value: number,
    isDiagonal: boolean
  ): string => {
    const intensity = getIntensity(value);

    if (value === 0) {
      return 'bg-gray-50';
    }

    if (isDiagonal) {
      // Green for correct predictions (diagonal)
      if (intensity > 0.8) return 'bg-forest-600';
      if (intensity > 0.6) return 'bg-forest-500';
      if (intensity > 0.4) return 'bg-forest-400';
      if (intensity > 0.2) return 'bg-forest-300';
      return 'bg-forest-200';
    } else {
      // Red/orange for misclassifications (off-diagonal)
      if (intensity > 0.8) return 'bg-red-600';
      if (intensity > 0.6) return 'bg-red-500';
      if (intensity > 0.4) return 'bg-orange-400';
      if (intensity > 0.2) return 'bg-orange-300';
      return 'bg-orange-200';
    }
  };

  // Get text color based on background intensity
  const getTextColor = (value: number): string => {
    const intensity = getIntensity(value);
    if (intensity > 0.5) return 'text-white';
    return 'text-gray-700';
  };

  // Calculate correct predictions (diagonal sum)
  const correctPredictions = useMemo(() => {
    return data.matrix.reduce(
      (sum, row, i) => sum + (row[i] || 0),
      0
    );
  }, [data.matrix]);

  const accuracy = totalCounts > 0 ? (correctPredictions / totalCounts) * 100 : 0;

  if (data.labels.length === 0 || data.matrix.length === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <p className="text-sm">No confusion matrix data available</p>
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
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Predicted vs Actual species classifications
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-forest-600">
              {accuracy.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">Overall Accuracy</p>
          </div>
        </div>
      </div>

      {/* Matrix container with scroll */}
      <div className="p-4 overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Axis label */}
          <div className="flex items-center justify-center mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Predicted Species
            </span>
          </div>

          <div className="flex">
            {/* Y-axis label */}
            <div className="flex items-center mr-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actual Species
              </span>
            </div>

            {/* Matrix table */}
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="w-24 p-1"></th>
                  {data.labels.map((label, colIndex) => (
                    <th
                      key={`header-${colIndex}`}
                      className="p-1 text-center"
                      title={getSpeciesName(label)}
                    >
                      <div
                        className="w-12 h-12 flex items-center justify-center text-xs font-medium text-gray-700 bg-gray-100 rounded"
                        style={{ borderLeft: `3px solid ${getSpeciesColor(label)}` }}
                      >
                        {label.substring(0, 4)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    <td
                      className="p-1 text-right"
                      title={getSpeciesName(data.labels[rowIndex] || '')}
                    >
                      <div
                        className="w-24 h-12 flex items-center justify-end pr-2 text-xs font-medium text-gray-700 bg-gray-100 rounded"
                        style={{ borderRight: `3px solid ${getSpeciesColor(data.labels[rowIndex] || '')}` }}
                      >
                        {getSpeciesName(data.labels[rowIndex] || '').substring(0, 10)}
                      </div>
                    </td>
                    {row.map((value, colIndex) => {
                      const percentage = (rowTotals[rowIndex] || 0) > 0
                        ? (value / (rowTotals[rowIndex] || 1)) * 100
                        : 0;
                      const isDiagonal = rowIndex === colIndex;

                      return (
                        <td
                          key={`cell-${rowIndex}-${colIndex}`}
                          className="p-1"
                          onMouseEnter={() =>
                            setHoveredCell({
                              predicted: data.labels[colIndex] || '',
                              actual: data.labels[rowIndex] || '',
                              count: value,
                              percentage,
                              rowIndex,
                              colIndex,
                            })
                          }
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          <div
                            className={`
                              w-12 h-12 flex items-center justify-center text-xs font-medium
                              rounded cursor-pointer transition-all
                              ${getCellColor(value, isDiagonal)}
                              ${getTextColor(value)}
                              ${isDiagonal ? 'ring-2 ring-forest-600 ring-opacity-50' : ''}
                              ${hoveredCell?.rowIndex === rowIndex && hoveredCell?.colIndex === colIndex
                                ? 'ring-2 ring-blue-500 scale-105'
                                : ''}
                            `}
                          >
                            {showPercentages
                              ? `${percentage.toFixed(0)}%`
                              : value.toLocaleString()}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredCell && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Actual:</span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded border"
                style={{ borderLeftColor: getSpeciesColor(hoveredCell.actual), borderLeftWidth: '3px' }}
              >
                <span className="font-medium">{getSpeciesName(hoveredCell.actual)}</span>
              </span>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Predicted:</span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded border"
                style={{ borderLeftColor: getSpeciesColor(hoveredCell.predicted), borderLeftWidth: '3px' }}
              >
                <span className="font-medium">{getSpeciesName(hoveredCell.predicted)}</span>
              </span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <div>
                <span className="text-gray-500">Count: </span>
                <span className="font-semibold text-gray-900">{hoveredCell.count.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500">Row %: </span>
                <span className="font-semibold text-gray-900">{hoveredCell.percentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-forest-500 ring-1 ring-forest-600"></div>
              <span>Correct (diagonal)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-400"></div>
              <span>Misclassified</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-100"></div>
              <span>Zero count</span>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {correctPredictions.toLocaleString()} / {totalCounts.toLocaleString()} correct
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfusionMatrix;
