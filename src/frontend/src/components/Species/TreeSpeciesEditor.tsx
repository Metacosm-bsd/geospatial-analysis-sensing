/**
 * TreeSpeciesEditor Component
 * Sprint 13-14: Species Classification UI
 *
 * Allows manual editing of a tree's species classification.
 * Provides dropdown for species selection and confidence indicator.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSpeciesStore } from '../../store/speciesStore';
import { getSpeciesColor, getSpeciesName, SPECIES_COLORS, SPECIES_NAMES } from './speciesColors';

interface TreeSpeciesEditorProps {
  treeId: string;
  currentSpeciesCode?: string;
  currentConfidence?: number;
  onSave?: (speciesCode: string, confidence?: number) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function TreeSpeciesEditor({
  treeId,
  currentSpeciesCode = 'UNKN',
  currentConfidence = 0,
  onSave,
  onCancel,
  isLoading = false,
  className = '',
}: TreeSpeciesEditorProps) {
  const { updateTreeSpecies, regionSpecies, classificationError, clearErrors } = useSpeciesStore();

  const [selectedSpecies, setSelectedSpecies] = useState(currentSpeciesCode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when treeId changes
  useEffect(() => {
    setSelectedSpecies(currentSpeciesCode);
    setError(null);
  }, [treeId, currentSpeciesCode]);

  // Get available species options
  const speciesOptions = useMemo(() => {
    // If we have region-specific species loaded, use those
    if (regionSpecies.length > 0) {
      return regionSpecies.map((s) => ({
        code: s.code,
        name: s.commonName,
        color: getSpeciesColor(s.code),
      }));
    }

    // Otherwise use the full species list
    return Object.entries(SPECIES_NAMES).map(([code, name]) => ({
      code,
      name,
      color: SPECIES_COLORS[code] || '#9E9E9E',
    }));
  }, [regionSpecies]);

  const handleSave = useCallback(async () => {
    if (selectedSpecies === currentSpeciesCode) {
      onCancel?.();
      return;
    }

    setIsSaving(true);
    setError(null);
    clearErrors();

    try {
      await updateTreeSpecies(treeId, selectedSpecies, 1.0); // Manual override = 100% confidence
      onSave?.(selectedSpecies, 1.0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update species';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [treeId, selectedSpecies, currentSpeciesCode, updateTreeSpecies, onSave, onCancel, clearErrors]);

  const handleCancel = useCallback(() => {
    setSelectedSpecies(currentSpeciesCode);
    setError(null);
    onCancel?.();
  }, [currentSpeciesCode, onCancel]);

  const hasChanges = selectedSpecies !== currentSpeciesCode;
  const selectedColor = getSpeciesColor(selectedSpecies);
  const selectedName = getSpeciesName(selectedSpecies);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h4 className="text-sm font-semibold text-gray-900">Edit Species</h4>
        <p className="text-xs text-gray-500 mt-0.5">
          Manually override the species classification
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Error Message */}
        {(error || classificationError) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">{error || classificationError}</p>
          </div>
        )}

        {/* Current Classification */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Current Classification</p>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: getSpeciesColor(currentSpeciesCode) }}
            />
            <span className="text-sm font-medium text-gray-900">
              {getSpeciesName(currentSpeciesCode)}
            </span>
            <span className="text-xs text-gray-500 font-mono">{currentSpeciesCode}</span>
          </div>
          {currentConfidence > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      currentConfidence >= 0.9
                        ? 'bg-green-500'
                        : currentConfidence >= 0.7
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${currentConfidence * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {Math.round(currentConfidence * 100)}% confidence
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Species Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            New Species
          </label>
          <div className="relative">
            <select
              value={selectedSpecies}
              onChange={(e) => setSelectedSpecies(e.target.value)}
              disabled={isSaving || isLoading}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-forest-500 disabled:bg-gray-100 disabled:cursor-not-allowed appearance-none"
            >
              {speciesOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name} ({option.code})
                </option>
              ))}
            </select>
            {/* Color indicator */}
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded"
              style={{ backgroundColor: selectedColor }}
            />
            {/* Dropdown arrow */}
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Change Preview */}
        {hasChanges && (
          <div className="flex items-center gap-3 p-3 bg-forest-50 border border-forest-200 rounded-lg">
            <svg className="w-5 h-5 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <div className="flex-1">
              <p className="text-xs text-forest-700">
                Changing from <strong>{getSpeciesName(currentSpeciesCode)}</strong> to{' '}
                <strong>{selectedName}</strong>
              </p>
              <p className="text-xs text-forest-600 mt-0.5">
                This will set confidence to 100% (manual override)
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isLoading}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              hasChanges && !isSaving
                ? 'bg-forest-600 text-white hover:bg-forest-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </>
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline variant for quick edits in popups
export function TreeSpeciesEditorInline({
  treeId,
  currentSpeciesCode = 'UNKN',
  onSave,
  onCancel,
  className = '',
}: TreeSpeciesEditorProps) {
  const { updateTreeSpecies, clearErrors } = useSpeciesStore();
  const [selectedSpecies, setSelectedSpecies] = useState(currentSpeciesCode);
  const [isSaving, setIsSaving] = useState(false);

  const speciesOptions = Object.entries(SPECIES_NAMES).map(([code, name]) => ({
    code,
    name,
    color: SPECIES_COLORS[code] || '#9E9E9E',
  }));

  const handleSave = useCallback(async () => {
    if (selectedSpecies === currentSpeciesCode) {
      onCancel?.();
      return;
    }

    setIsSaving(true);
    clearErrors();

    try {
      await updateTreeSpecies(treeId, selectedSpecies, 1.0);
      onSave?.(selectedSpecies, 1.0);
    } catch {
      // Error handled in store
    } finally {
      setIsSaving(false);
    }
  }, [treeId, selectedSpecies, currentSpeciesCode, updateTreeSpecies, onSave, onCancel, clearErrors]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex-1">
        <select
          value={selectedSpecies}
          onChange={(e) => setSelectedSpecies(e.target.value)}
          disabled={isSaving}
          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 disabled:bg-gray-100"
        >
          {speciesOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm"
          style={{ backgroundColor: getSpeciesColor(selectedSpecies) }}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={isSaving || selectedSpecies === currentSpeciesCode}
        className="p-1.5 text-forest-600 hover:bg-forest-50 rounded disabled:text-gray-300 disabled:hover:bg-transparent"
        title="Save"
      >
        {isSaving ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <button
        onClick={onCancel}
        disabled={isSaving}
        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:text-gray-300"
        title="Cancel"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default TreeSpeciesEditor;
