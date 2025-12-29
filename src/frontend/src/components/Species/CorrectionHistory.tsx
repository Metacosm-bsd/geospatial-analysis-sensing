/**
 * CorrectionHistory Component
 * Sprint 15-16: Species Classification Enhancements
 *
 * Displays list of user corrections with filtering by species,
 * statistics summary, and export functionality.
 */

import { useState, useMemo, useCallback } from 'react';
import type { SpeciesCorrection, CorrectionStatistics } from '../../api/species';
import { getSpeciesName, getSpeciesColor } from './speciesColors';

interface CorrectionHistoryProps {
  corrections: SpeciesCorrection[];
  statistics?: CorrectionStatistics;
  onExport?: () => void;
  isLoading?: boolean;
  className?: string;
}

type SortField = 'createdAt' | 'predictedSpecies' | 'correctedSpecies' | 'userName';
type SortOrder = 'asc' | 'desc';

export function CorrectionHistory({
  corrections,
  statistics,
  onExport,
  isLoading = false,
  className = '',
}: CorrectionHistoryProps) {
  const [speciesFilter, setSpeciesFilter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique species for filter dropdown
  const uniqueSpecies = useMemo(() => {
    const species = new Set<string>();
    corrections.forEach((c) => {
      species.add(c.predictedSpecies);
      species.add(c.correctedSpecies);
    });
    return Array.from(species).sort();
  }, [corrections]);

  // Filter and sort corrections
  const filteredCorrections = useMemo(() => {
    let result = [...corrections];

    // Apply species filter
    if (speciesFilter) {
      result = result.filter(
        (c) =>
          c.predictedSpecies === speciesFilter || c.correctedSpecies === speciesFilter
      );
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.userName.toLowerCase().includes(query) ||
          getSpeciesName(c.predictedSpecies).toLowerCase().includes(query) ||
          getSpeciesName(c.correctedSpecies).toLowerCase().includes(query) ||
          c.treeId.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'createdAt':
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'predictedSpecies':
          comparison = a.predictedSpecies.localeCompare(b.predictedSpecies);
          break;
        case 'correctedSpecies':
          comparison = a.correctedSpecies.localeCompare(b.correctedSpecies);
          break;
        case 'userName':
          comparison = a.userName.localeCompare(b.userName);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [corrections, speciesFilter, searchQuery, sortField, sortOrder]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortField(field);
        setSortOrder('desc');
      }
    },
    [sortField, sortOrder]
  );

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3">
            <svg
              className="w-8 h-8 text-forest-600 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm text-gray-500">Loading correction history...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Statistics summary */}
      {statistics && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Correction Statistics</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-forest-600">
                  {statistics.totalCorrections.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total Corrections</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {statistics.averageCorrectionsPerDay.toFixed(1)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Avg per Day</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {statistics.mostCorrectedSpecies.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Species Affected</p>
              </div>
            </div>

            {/* Most corrected species */}
            {statistics.mostCorrectedSpecies.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Most Corrected Species
                </h4>
                <div className="space-y-2">
                  {statistics.mostCorrectedSpecies.slice(0, 5).map((item, index) => (
                    <div
                      key={item.speciesCode}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400 w-4">
                          {index + 1}.
                        </span>
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getSpeciesColor(item.speciesCode) }}
                        />
                        <span className="text-sm text-gray-700">
                          {getSpeciesName(item.speciesCode)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {item.correctionCount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Correction list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Header with filters */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Correction History</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {filteredCorrections.length} of {corrections.length} corrections
              </p>
            </div>
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-forest-600 bg-forest-50 rounded-lg hover:bg-forest-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by user, species, or tree ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              />
            </div>
            <select
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
            >
              <option value="">All Species</option>
              {uniqueSpecies.map((code) => (
                <option key={code} value={code}>
                  {getSpeciesName(code)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {filteredCorrections.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-sm text-gray-500">
              {corrections.length === 0
                ? 'No corrections recorded yet'
                : 'No corrections match your filters'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center gap-1">
                      Date {getSortIcon('createdAt')}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('predictedSpecies')}
                  >
                    <div className="flex items-center gap-1">
                      Original {getSortIcon('predictedSpecies')}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {/* Arrow */}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('correctedSpecies')}
                  >
                    <div className="flex items-center gap-1">
                      Corrected {getSortIcon('correctedSpecies')}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('userName')}
                  >
                    <div className="flex items-center gap-1">
                      User {getSortIcon('userName')}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Tree ID
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCorrections.map((correction) => (
                  <tr key={correction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(correction.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: getSpeciesColor(correction.predictedSpecies),
                          }}
                        />
                        <span className="text-sm text-gray-900">
                          {getSpeciesName(correction.predictedSpecies)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <svg
                        className="w-4 h-4 text-gray-400 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: getSpeciesColor(correction.correctedSpecies),
                          }}
                        />
                        <span className="text-sm font-medium text-forest-600">
                          {getSpeciesName(correction.correctedSpecies)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                          {correction.userName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-700">
                          {correction.userName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-xs font-mono text-gray-500">
                        {correction.treeId.substring(0, 8)}...
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default CorrectionHistory;
