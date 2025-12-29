import React, { useCallback } from 'react';
import { useViewerStore, MeasurementMode, Measurement } from '../../store/viewerStore';

interface MeasurementToolsProps {
  className?: string;
}

// Format measurement values
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(2)} m`;
}

function formatArea(squareMeters: number): string {
  if (squareMeters >= 10000) {
    return `${(squareMeters / 10000).toFixed(2)} ha`;
  }
  return `${squareMeters.toFixed(2)} m²`;
}

// Tool button component
interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function ToolButton({ icon, label, active, onClick, disabled }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
        ${active
          ? 'bg-forest-600 text-white shadow-md'
          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Measurement list item
interface MeasurementItemProps {
  measurement: Measurement;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function MeasurementItem({ measurement, selected, onSelect, onDelete }: MeasurementItemProps) {
  const getIcon = () => {
    switch (measurement.type) {
      case 'distance':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        );
      case 'area':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
          </svg>
        );
      case 'height':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m0-8l-2 2m2-2l2 2" />
          </svg>
        );
    }
  };

  const getValue = () => {
    switch (measurement.type) {
      case 'distance':
        return formatDistance(measurement.distance);
      case 'area':
        return formatArea(measurement.area);
      case 'height':
        return formatDistance(measurement.height);
    }
  };

  const getTypeLabel = () => {
    switch (measurement.type) {
      case 'distance':
        return 'Distance';
      case 'area':
        return 'Area';
      case 'height':
        return 'Height';
    }
  };

  return (
    <div
      className={`
        flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all
        ${selected ? 'bg-forest-50 border border-forest-300' : 'hover:bg-gray-50 border border-transparent'}
      `}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: measurement.color }}
        />
        {getIcon()}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">{getTypeLabel()}</span>
          <span className="text-sm font-medium text-gray-900">{getValue()}</span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        title="Delete measurement"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

export function MeasurementTools({ className = '' }: MeasurementToolsProps) {
  const {
    measurementMode,
    setMeasurementMode,
    measurements,
    activeMeasurementPoints,
    selectedMeasurementId,
    selectMeasurement,
    deleteMeasurement,
    clearMeasurements,
    completeMeasurement,
    cancelMeasurement,
    exportMeasurements,
  } = useViewerStore();

  const handleModeChange = useCallback((mode: MeasurementMode) => {
    if (measurementMode === mode) {
      setMeasurementMode('none');
    } else {
      setMeasurementMode(mode);
    }
  }, [measurementMode, setMeasurementMode]);

  const handleExport = useCallback(() => {
    const json = exportMeasurements();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurements-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportMeasurements]);

  const isActive = measurementMode !== 'none';
  const hasActiveMeasurement = activeMeasurementPoints.length > 0;

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Measurement Tools</h3>
        <p className="text-xs text-gray-500 mt-1">Click points in the 3D view to measure</p>
      </div>

      {/* Tool Buttons */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex flex-wrap gap-2">
          <ToolButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            label="Distance"
            active={measurementMode === 'distance'}
            onClick={() => handleModeChange('distance')}
          />
          <ToolButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
              </svg>
            }
            label="Area"
            active={measurementMode === 'area'}
            onClick={() => handleModeChange('area')}
          />
          <ToolButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m0-8l-2 2m2-2l2 2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20v-4m0 4l-2-2m2 2l2-2" />
              </svg>
            }
            label="Height"
            active={measurementMode === 'height'}
            onClick={() => handleModeChange('height')}
          />
        </div>

        {/* Active measurement status */}
        {isActive && (
          <div className="mt-3 p-2 bg-forest-50 rounded-lg border border-forest-200">
            <div className="flex items-center justify-between">
              <div className="text-xs text-forest-700">
                {measurementMode === 'distance' && (
                  <>
                    {activeMeasurementPoints.length === 0
                      ? 'Click first point'
                      : 'Click second point'}
                  </>
                )}
                {measurementMode === 'area' && (
                  <>
                    {activeMeasurementPoints.length === 0
                      ? 'Click to add polygon vertices'
                      : `${activeMeasurementPoints.length} points - click to add more or press Enter to complete`}
                  </>
                )}
                {measurementMode === 'height' && (
                  <>
                    {activeMeasurementPoints.length === 0
                      ? 'Click base point'
                      : 'Click top point'}
                  </>
                )}
              </div>
              {hasActiveMeasurement && (
                <div className="flex gap-1">
                  {measurementMode === 'area' && activeMeasurementPoints.length >= 3 && (
                    <button
                      onClick={completeMeasurement}
                      className="px-2 py-1 text-xs font-medium text-white bg-forest-600 rounded hover:bg-forest-700"
                    >
                      Complete
                    </button>
                  )}
                  <button
                    onClick={cancelMeasurement}
                    className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {activeMeasurementPoints.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                Points: {activeMeasurementPoints.map((p, i) => (
                  <span key={i} className="ml-1">
                    ({p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Measurements List */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase">
            Measurements ({measurements.length})
          </span>
          {measurements.length > 0 && (
            <div className="flex gap-1">
              <button
                onClick={handleExport}
                className="p-1 text-gray-400 hover:text-forest-600 transition-colors"
                title="Export measurements"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                onClick={clearMeasurements}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Clear all measurements"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {measurements.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <p className="text-xs">No measurements yet</p>
            <p className="text-xs mt-1">Select a tool and click in the 3D view</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {measurements.map((measurement) => (
              <MeasurementItem
                key={measurement.id}
                measurement={measurement}
                selected={selectedMeasurementId === measurement.id}
                onSelect={() => selectMeasurement(measurement.id)}
                onDelete={() => deleteMeasurement(measurement.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {measurements.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-500">Distances</div>
              <div className="text-sm font-medium text-gray-900">
                {measurements.filter((m) => m.type === 'distance').length}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Areas</div>
              <div className="text-sm font-medium text-gray-900">
                {measurements.filter((m) => m.type === 'area').length}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Heights</div>
              <div className="text-sm font-medium text-gray-900">
                {measurements.filter((m) => m.type === 'height').length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MeasurementTools;
