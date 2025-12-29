/**
 * ValidationMetrics Component
 * Sprint 15-16: Species Classification Enhancements
 *
 * Displays overall accuracy, per-species precision/recall/F1 table,
 * recommendations, and validation date.
 */

import { useMemo } from 'react';
import type { ValidationMetrics as ValidationMetricsType } from '../../api/species';
import { getSpeciesName, getSpeciesColor } from './speciesColors';
import { ConfusionMatrix } from './ConfusionMatrix';

interface ValidationMetricsProps {
  metrics: ValidationMetricsType;
  showConfusionMatrix?: boolean;
  className?: string;
}

function MetricBadge({
  value,
  label,
  colorClass,
}: {
  value: number;
  label: string;
  colorClass: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${colorClass}`}>
        {(value * 100).toFixed(1)}%
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 0.9) return 'text-forest-600';
  if (score >= 0.8) return 'text-forest-500';
  if (score >= 0.7) return 'text-amber-600';
  if (score >= 0.5) return 'text-orange-500';
  return 'text-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 0.9) return 'bg-forest-50';
  if (score >= 0.8) return 'bg-forest-50/50';
  if (score >= 0.7) return 'bg-amber-50';
  if (score >= 0.5) return 'bg-orange-50';
  return 'bg-red-50';
}

export function ValidationMetrics({
  metrics,
  showConfusionMatrix = true,
  className = '',
}: ValidationMetricsProps) {
  // Calculate average metrics
  const averageMetrics = useMemo(() => {
    const perSpecies = metrics.perSpeciesMetrics;
    if (perSpecies.length === 0) {
      return { precision: 0, recall: 0, f1: 0 };
    }

    const totals = perSpecies.reduce(
      (acc, m) => ({
        precision: acc.precision + m.precision * m.support,
        recall: acc.recall + m.recall * m.support,
        f1: acc.f1 + m.f1Score * m.support,
        support: acc.support + m.support,
      }),
      { precision: 0, recall: 0, f1: 0, support: 0 }
    );

    return {
      precision: totals.support > 0 ? totals.precision / totals.support : 0,
      recall: totals.support > 0 ? totals.recall / totals.support : 0,
      f1: totals.support > 0 ? totals.f1 / totals.support : 0,
    };
  }, [metrics.perSpeciesMetrics]);

  // Sort species by support (most samples first)
  const sortedSpeciesMetrics = useMemo(() => {
    return [...metrics.perSpeciesMetrics].sort((a, b) => b.support - a.support);
  }, [metrics.perSpeciesMetrics]);

  const formattedDate = new Date(metrics.validationDate).toLocaleDateString(
    'en-US',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overall metrics card */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-forest-100 rounded-lg">
                <svg
                  className="w-5 h-5 text-forest-600"
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
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Validation Metrics
                </h3>
                <p className="text-xs text-gray-500">
                  Validated on {formattedDate}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Total Validated</p>
              <p className="text-lg font-semibold text-gray-900">
                {metrics.totalValidated.toLocaleString()} trees
              </p>
            </div>
          </div>
        </div>

        {/* Overall accuracy and weighted metrics */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-4 gap-8">
            <MetricBadge
              value={metrics.overallAccuracy}
              label="Overall Accuracy"
              colorClass={getScoreColor(metrics.overallAccuracy)}
            />
            <MetricBadge
              value={averageMetrics.precision}
              label="Weighted Precision"
              colorClass={getScoreColor(averageMetrics.precision)}
            />
            <MetricBadge
              value={averageMetrics.recall}
              label="Weighted Recall"
              colorClass={getScoreColor(averageMetrics.recall)}
            />
            <MetricBadge
              value={averageMetrics.f1}
              label="Weighted F1"
              colorClass={getScoreColor(averageMetrics.f1)}
            />
          </div>
        </div>
      </div>

      {/* Per-species metrics table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            Per-Species Performance
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Classification metrics by species
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Species
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Precision
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Recall
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  F1 Score
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Support
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedSpeciesMetrics.map((speciesMetric) => (
                <tr
                  key={speciesMetric.speciesCode}
                  className={`hover:bg-gray-50 ${getScoreBgColor(speciesMetric.f1Score)}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: getSpeciesColor(speciesMetric.speciesCode),
                        }}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {getSpeciesName(speciesMetric.speciesCode)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {speciesMetric.speciesCode}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`text-sm font-medium ${getScoreColor(
                        speciesMetric.precision
                      )}`}
                    >
                      {(speciesMetric.precision * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`text-sm font-medium ${getScoreColor(
                        speciesMetric.recall
                      )}`}
                    >
                      {(speciesMetric.recall * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`text-sm font-semibold ${getScoreColor(
                        speciesMetric.f1Score
                      )}`}
                    >
                      {(speciesMetric.f1Score * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    {speciesMetric.support.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      {metrics.recommendations.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <svg
                  className="w-5 h-5 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Recommendations
                </h3>
                <p className="text-xs text-gray-500">
                  Suggestions to improve classification accuracy
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <ul className="space-y-3">
              {metrics.recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <p className="text-sm text-gray-700 flex-1">{recommendation}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Confusion Matrix */}
      {showConfusionMatrix && metrics.confusionMatrix && (
        <ConfusionMatrix
          data={metrics.confusionMatrix}
          title="Species Classification Confusion Matrix"
        />
      )}
    </div>
  );
}

export default ValidationMetrics;
