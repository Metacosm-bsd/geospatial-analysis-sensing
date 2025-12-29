/**
 * TreeInfoPopup.tsx
 * Info popup displayed when a tree is selected in the 3D viewer
 * Sprint 9-10: 3D Visualization Features
 */

import React, { useEffect, useRef } from 'react';
import type { DetectedTree } from './types';

interface TreeInfoPopupProps {
  tree: DetectedTree | null;
  screenPosition: { x: number; y: number } | null;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLElement>;
}

/**
 * Format a number with appropriate precision
 */
function formatValue(value: number | undefined, unit: string, precision: number = 2): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(precision)} ${unit}`;
}

/**
 * Format biomass/carbon values with appropriate units
 */
function formatMass(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} t`;
  }
  return `${value.toFixed(1)} kg`;
}

/**
 * TreeInfoPopup component
 * Displays tree metrics in a floating popup near the selected tree
 */
export const TreeInfoPopup: React.FC<TreeInfoPopupProps> = ({
  tree,
  screenPosition,
  onClose,
  containerRef,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close on the click that opened the popup
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!tree || !screenPosition) return null;

  // Calculate popup position (offset from cursor/click position)
  const popupStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${screenPosition.x + 15}px`,
    top: `${screenPosition.y - 10}px`,
    zIndex: 1000,
    maxWidth: '320px',
    minWidth: '260px',
  };

  // Adjust position if popup would go off screen
  if (popupRef.current) {
    const rect = popupRef.current.getBoundingClientRect();
    const container = containerRef?.current || document.body;
    const containerRect = container.getBoundingClientRect();

    if (screenPosition.x + rect.width + 15 > containerRect.right) {
      popupStyle.left = `${screenPosition.x - rect.width - 15}px`;
    }

    if (screenPosition.y + rect.height - 10 > containerRect.bottom) {
      popupStyle.top = `${screenPosition.y - rect.height + 10}px`;
    }
  }

  return (
    <div
      ref={popupRef}
      style={popupStyle}
      className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="bg-forest-600 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm">
            Tree ID: {tree.id.slice(0, 8)}
          </h3>
          {tree.species && (
            <p className="text-forest-100 text-xs mt-0.5">
              {tree.species}
              {tree.speciesConfidence && (
                <span className="ml-1 opacity-75">
                  ({(tree.speciesConfidence * 100).toFixed(0)}% confidence)
                </span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-forest-200 transition-colors p-1 rounded"
          aria-label="Close popup"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Metrics */}
      <div className="p-4 space-y-3">
        {/* Dimensions Section */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Dimensions
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <MetricItem label="Height" value={formatValue(tree.height, 'm', 1)} icon="height" />
            <MetricItem label="DBH" value={formatValue(tree.dbh, 'cm', 1)} icon="diameter" />
            <MetricItem
              label="Crown Diameter"
              value={formatValue(tree.crownDiameter, 'm', 1)}
              icon="crown"
            />
            {tree.crown?.area && (
              <MetricItem
                label="Crown Area"
                value={formatValue(tree.crown.area, 'm2', 1)}
                icon="area"
              />
            )}
          </div>
        </div>

        {/* Carbon/Biomass Section */}
        {(tree.biomass !== undefined || tree.carbonStock !== undefined) && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Carbon & Biomass
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <MetricItem
                label="Biomass"
                value={formatMass(tree.biomass)}
                icon="biomass"
                highlight
              />
              <MetricItem
                label="Carbon Stock"
                value={formatMass(tree.carbonStock)}
                icon="carbon"
                highlight
              />
            </div>
          </div>
        )}

        {/* Position Section */}
        <div className="border-t border-gray-100 pt-3">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Position
          </h4>
          <div className="bg-gray-50 rounded px-3 py-2 font-mono text-xs text-gray-600">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-gray-400">X: </span>
                {tree.position.x.toFixed(2)}
              </div>
              <div>
                <span className="text-gray-400">Y: </span>
                {tree.position.y.toFixed(2)}
              </div>
              <div>
                <span className="text-gray-400">Z: </span>
                {tree.position.z.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metadata */}
        {tree.metadata && Object.keys(tree.metadata).length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Additional Info
            </h4>
            <div className="space-y-1">
              {Object.entries(tree.metadata).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-gray-500 capitalize">
                    {key.replace(/_/g, ' ')}:
                  </span>
                  <span className="text-gray-700 font-medium">
                    {typeof value === 'number' ? value.toFixed(2) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {tree.timestamp && (
        <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Detected: {new Date(tree.timestamp).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Individual metric display item
 */
interface MetricItemProps {
  label: string;
  value: string;
  icon?: string;
  highlight?: boolean;
}

const MetricItem: React.FC<MetricItemProps> = ({ label, value, icon, highlight }) => {
  const iconElements: Record<string, React.ReactNode> = {
    height: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
      </svg>
    ),
    diameter: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={2} />
        <path strokeLinecap="round" strokeWidth={2} d="M3 12h18" />
      </svg>
    ),
    crown: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3c-4 4-7 7-7 11a7 7 0 1014 0c0-4-3-7-7-11z" />
      </svg>
    ),
    area: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
      </svg>
    ),
    biomass: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
    carbon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div
      className={`flex items-center space-x-2 rounded px-2 py-1.5 ${
        highlight ? 'bg-green-50' : 'bg-gray-50'
      }`}
    >
      {icon && iconElements[icon] && (
        <span className={highlight ? 'text-green-600' : 'text-gray-400'}>
          {iconElements[icon]}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p
          className={`text-sm font-semibold ${
            highlight ? 'text-green-700' : 'text-gray-900'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
};

/**
 * Hook for managing tree info popup state
 */
export function useTreeInfoPopup() {
  const [selectedTree, setSelectedTree] = React.useState<DetectedTree | null>(null);
  const [screenPosition, setScreenPosition] = React.useState<{ x: number; y: number } | null>(
    null
  );

  const openPopup = React.useCallback(
    (tree: DetectedTree, position: { x: number; y: number }) => {
      setSelectedTree(tree);
      setScreenPosition(position);
    },
    []
  );

  const closePopup = React.useCallback(() => {
    setSelectedTree(null);
    setScreenPosition(null);
  }, []);

  return {
    selectedTree,
    screenPosition,
    openPopup,
    closePopup,
  };
}

export default TreeInfoPopup;
