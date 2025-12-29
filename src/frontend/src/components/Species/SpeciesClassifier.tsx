/**
 * SpeciesClassifier Component
 * Sprint 13-14: Species Classification UI
 *
 * Provides UI for triggering species classification on detected trees.
 * Includes region selector, confidence threshold slider, and progress indicator.
 */

import { useEffect, useState, useCallback } from 'react';
import { useSpeciesStore } from '../../store/speciesStore';

interface SpeciesClassifierProps {
  analysisId: string;
  onClassificationComplete?: () => void;
  className?: string;
}

export function SpeciesClassifier({
  analysisId,
  onClassificationComplete,
  className = '',
}: SpeciesClassifierProps) {
  const {
    classificationStatus,
    classificationProgress,
    classificationError,
    regions,
    isRegionsLoading,
    selectedRegion,
    speciesBreakdown,
    fetchRegions,
    setSelectedRegion,
    startClassification,
    clearErrors,
  } = useSpeciesStore();

  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [useEnsemble, setUseEnsemble] = useState(true);

  // Fetch regions on mount
  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);

  // Call completion callback when done
  useEffect(() => {
    if (classificationStatus === 'completed' && onClassificationComplete) {
      onClassificationComplete();
    }
  }, [classificationStatus, onClassificationComplete]);

  const handleStartClassification = useCallback(async () => {
    if (!selectedRegion) return;

    clearErrors();
    await startClassification(analysisId, selectedRegion, {
      confidenceThreshold,
      useEnsemble,
    });
  }, [analysisId, selectedRegion, confidenceThreshold, useEnsemble, startClassification, clearErrors]);

  const isProcessing = classificationStatus === 'classifying' || classificationStatus === 'loading';
  const isComplete = classificationStatus === 'completed';
  const canStartClassification = selectedRegion && !isProcessing;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-forest-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-forest-100 rounded-lg">
            <svg className="w-5 h-5 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Species Classification</h3>
            <p className="text-xs text-gray-500">Identify tree species using ML models</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Error Message */}
        {classificationError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">Classification Error</p>
                <p className="text-sm text-red-700 mt-1">{classificationError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Region Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Region
          </label>
          <select
            value={selectedRegion || ''}
            onChange={(e) => setSelectedRegion(e.target.value || null)}
            disabled={isProcessing}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-forest-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select a region...</option>
            {isRegionsLoading ? (
              <option value="" disabled>Loading regions...</option>
            ) : (
              regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.name}
                </option>
              ))
            )}
          </select>
          {selectedRegion && regions.find(r => r.code === selectedRegion)?.description && (
            <p className="mt-1.5 text-xs text-gray-500">
              {regions.find(r => r.code === selectedRegion)?.description}
            </p>
          )}
        </div>

        {/* Confidence Threshold Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Confidence Threshold
            </label>
            <span className="text-sm font-semibold text-forest-600">
              {Math.round(confidenceThreshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.05"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            disabled={isProcessing}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-forest-600 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>50%</span>
            <span>95%</span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            Trees below this threshold will be marked as uncertain
          </p>
        </div>

        {/* Ensemble Option */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="useEnsemble"
            checked={useEnsemble}
            onChange={(e) => setUseEnsemble(e.target.checked)}
            disabled={isProcessing}
            className="w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500 disabled:cursor-not-allowed"
          />
          <label htmlFor="useEnsemble" className="text-sm text-gray-700">
            Use ensemble model (more accurate, slower)
          </label>
        </div>

        {/* Progress Indicator */}
        {isProcessing && (
          <div className="bg-forest-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-forest-700">
                Classifying species...
              </span>
              <span className="text-sm font-semibold text-forest-600">
                {classificationProgress}%
              </span>
            </div>
            <div className="h-2 bg-forest-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-forest-600 transition-all duration-300 rounded-full"
                style={{ width: `${classificationProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-forest-600">
              Analyzing tree structure and spectral signatures...
            </p>
          </div>
        )}

        {/* Results Summary */}
        {isComplete && speciesBreakdown.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold text-green-800">
                Classification Complete
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-500 text-xs">Species Found</p>
                <p className="text-lg font-bold text-gray-900">{speciesBreakdown.length}</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-500 text-xs">Trees Classified</p>
                <p className="text-lg font-bold text-gray-900">
                  {speciesBreakdown.reduce((sum, s) => sum + s.count, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleStartClassification}
          disabled={!canStartClassification}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
            canStartClassification
              ? 'bg-forest-600 text-white hover:bg-forest-700 shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Classifying...
            </>
          ) : isComplete ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-classify Species
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Classify Species
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default SpeciesClassifier;
