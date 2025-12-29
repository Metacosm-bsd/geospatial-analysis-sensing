/**
 * SpeciesFilter Component
 * Sprint 15-16: Species Classification Enhancements
 *
 * Multi-select dropdown for species filtering with quick filter buttons
 * for conifers/deciduous, apply to 3D viewer, and clear filters.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSpeciesStore } from '../../store/speciesStore';
import {
  getSpeciesName,
  getSpeciesColor,
  SPECIES_TYPES,
} from './speciesColors';

interface SpeciesFilterProps {
  onFilterChange?: (speciesCodes: string[]) => void;
  className?: string;
  compact?: boolean;
}

export function SpeciesFilter({
  onFilterChange,
  className = '',
  compact = false,
}: SpeciesFilterProps) {
  const {
    speciesBreakdown,
    selectedSpeciesFilter,
    setSelectedSpeciesFilter,
    clearSpeciesFilter,
  } = useSpeciesStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get available species from breakdown
  const availableSpecies = useMemo(() => {
    return speciesBreakdown.map((item) => ({
      code: item.speciesCode,
      name: getSpeciesName(item.speciesCode),
      color: getSpeciesColor(item.speciesCode),
      type: SPECIES_TYPES[item.speciesCode] || 'unknown',
      count: item.count,
    }));
  }, [speciesBreakdown]);

  // Filter species by search query
  const filteredSpecies = useMemo(() => {
    if (!searchQuery.trim()) return availableSpecies;
    const query = searchQuery.toLowerCase().trim();
    return availableSpecies.filter(
      (s) =>
        s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)
    );
  }, [availableSpecies, searchQuery]);

  // Group species by type
  const groupedSpecies = useMemo(() => {
    const conifers = filteredSpecies.filter((s) => s.type === 'conifer');
    const deciduous = filteredSpecies.filter((s) => s.type === 'deciduous');
    const other = filteredSpecies.filter((s) => s.type === 'unknown');
    return { conifers, deciduous, other };
  }, [filteredSpecies]);

  // Count selected by type
  const selectedCounts = useMemo(() => {
    const conifers = selectedSpeciesFilter.filter(
      (code) => SPECIES_TYPES[code] === 'conifer'
    ).length;
    const deciduous = selectedSpeciesFilter.filter(
      (code) => SPECIES_TYPES[code] === 'deciduous'
    ).length;
    return { conifers, deciduous };
  }, [selectedSpeciesFilter]);

  // Handle species toggle
  const handleToggleSpecies = useCallback(
    (code: string) => {
      const newFilter = selectedSpeciesFilter.includes(code)
        ? selectedSpeciesFilter.filter((c) => c !== code)
        : [...selectedSpeciesFilter, code];
      setSelectedSpeciesFilter(newFilter);
      onFilterChange?.(newFilter);
    },
    [selectedSpeciesFilter, setSelectedSpeciesFilter, onFilterChange]
  );

  // Quick filter: select all conifers
  const selectAllConifers = useCallback(() => {
    const coniferCodes = availableSpecies
      .filter((s) => s.type === 'conifer')
      .map((s) => s.code);
    const newFilter = Array.from(
      new Set([
        ...selectedSpeciesFilter.filter(
          (code) => SPECIES_TYPES[code] !== 'conifer'
        ),
        ...coniferCodes,
      ])
    );
    setSelectedSpeciesFilter(newFilter);
    onFilterChange?.(newFilter);
  }, [availableSpecies, selectedSpeciesFilter, setSelectedSpeciesFilter, onFilterChange]);

  // Quick filter: select all deciduous
  const selectAllDeciduous = useCallback(() => {
    const deciduousCodes = availableSpecies
      .filter((s) => s.type === 'deciduous')
      .map((s) => s.code);
    const newFilter = Array.from(
      new Set([
        ...selectedSpeciesFilter.filter(
          (code) => SPECIES_TYPES[code] !== 'deciduous'
        ),
        ...deciduousCodes,
      ])
    );
    setSelectedSpeciesFilter(newFilter);
    onFilterChange?.(newFilter);
  }, [availableSpecies, selectedSpeciesFilter, setSelectedSpeciesFilter, onFilterChange]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    clearSpeciesFilter();
    onFilterChange?.([]);
  }, [clearSpeciesFilter, onFilterChange]);

  // Select all
  const selectAll = useCallback(() => {
    const allCodes = availableSpecies.map((s) => s.code);
    setSelectedSpeciesFilter(allCodes);
    onFilterChange?.(allCodes);
  }, [availableSpecies, setSelectedSpeciesFilter, onFilterChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasFilters = selectedSpeciesFilter.length > 0;
  const allSelected =
    selectedSpeciesFilter.length === availableSpecies.length &&
    availableSpecies.length > 0;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Compact dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              hasFilters
                ? 'bg-forest-50 text-forest-700 border-forest-300'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
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
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Species
            {hasFilters && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold bg-forest-200 text-forest-800 rounded-full">
                {selectedSpeciesFilter.length}
              </span>
            )}
            <svg
              className={`w-4 h-4 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute z-50 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-gray-200">
                <input
                  type="text"
                  placeholder="Search species..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>

              {/* Quick filters */}
              <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
                <button
                  onClick={selectAllConifers}
                  className="px-2 py-1 text-xs font-medium text-forest-700 bg-forest-50 rounded hover:bg-forest-100"
                >
                  Conifers
                </button>
                <button
                  onClick={selectAllDeciduous}
                  className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100"
                >
                  Deciduous
                </button>
                <button
                  onClick={selectAll}
                  className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  All
                </button>
                {hasFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="ml-auto text-xs text-red-600 hover:text-red-700"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Species list */}
              <div className="max-h-64 overflow-y-auto p-2">
                {filteredSpecies.map((species) => (
                  <label
                    key={species.code}
                    className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSpeciesFilter.includes(species.code)}
                      onChange={() => handleToggleSpecies(species.code)}
                      className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
                    />
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: species.color }}
                    />
                    <span className="text-sm text-gray-700 flex-1 truncate">
                      {species.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {species.count.toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Clear button */}
        {hasFilters && (
          <button
            onClick={handleClearFilters}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            title="Clear filters"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Full component
  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
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
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Species Filter</h3>
              <p className="text-xs text-gray-500">
                {selectedSpeciesFilter.length} of {availableSpecies.length} selected
              </p>
            </div>
          </div>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-gray-200">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search species..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Quick filters */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Quick:</span>
          <button
            onClick={selectAllConifers}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              selectedCounts.conifers > 0
                ? 'bg-forest-100 text-forest-700 border border-forest-300'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-forest-50'
            }`}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L3 12h5v10h8V12h5z" />
            </svg>
            Conifers
            {groupedSpecies.conifers.length > 0 && (
              <span className="text-xs opacity-70">
                ({groupedSpecies.conifers.length})
              </span>
            )}
          </button>
          <button
            onClick={selectAllDeciduous}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              selectedCounts.deciduous > 0
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-amber-50'
            }`}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2c3.31 0 6 2.69 6 6 0 2.97-2.17 5.43-5 5.91V22h-2v-8.09c-2.83-.48-5-2.94-5-5.91 0-3.31 2.69-6 6-6z" />
            </svg>
            Deciduous
            {groupedSpecies.deciduous.length > 0 && (
              <span className="text-xs opacity-70">
                ({groupedSpecies.deciduous.length})
              </span>
            )}
          </button>
          <button
            onClick={allSelected ? handleClearFilters : selectAll}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-full hover:bg-gray-50"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {/* Species list */}
      <div className="max-h-64 overflow-y-auto p-4">
        {availableSpecies.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No species data available</p>
          </div>
        ) : filteredSpecies.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No species match your search</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Conifers section */}
            {groupedSpecies.conifers.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
                  Conifers ({groupedSpecies.conifers.length})
                </div>
                {groupedSpecies.conifers.map((species) => (
                  <label
                    key={species.code}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSpeciesFilter.includes(species.code)}
                      onChange={() => handleToggleSpecies(species.code)}
                      className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
                    />
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: species.color }}
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {species.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {species.count.toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Deciduous section */}
            {groupedSpecies.deciduous.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
                  Deciduous ({groupedSpecies.deciduous.length})
                </div>
                {groupedSpecies.deciduous.map((species) => (
                  <label
                    key={species.code}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSpeciesFilter.includes(species.code)}
                      onChange={() => handleToggleSpecies(species.code)}
                      className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
                    />
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: species.color }}
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {species.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {species.count.toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Other section */}
            {groupedSpecies.other.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
                  Other ({groupedSpecies.other.length})
                </div>
                {groupedSpecies.other.map((species) => (
                  <label
                    key={species.code}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSpeciesFilter.includes(species.code)}
                      onChange={() => handleToggleSpecies(species.code)}
                      className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
                    />
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: species.color }}
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {species.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {species.count.toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Apply indicator */}
      {hasFilters && (
        <div className="px-6 py-3 bg-forest-50 border-t border-forest-200">
          <div className="flex items-center gap-2 text-sm text-forest-700">
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              Filter active: showing{' '}
              <span className="font-semibold">{selectedSpeciesFilter.length}</span>{' '}
              species in viewer
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SpeciesFilter;
