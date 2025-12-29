/**
 * ViewerToolbar Component
 * Control toolbar for point cloud viewer settings
 * Sprint 9-10: Core 3D visualization infrastructure
 */

import React, { useCallback } from 'react';
import { ViewerToolbarProps, ViewerSettings } from './types';

// Icon components (inline SVG for no additional dependencies)
const GridIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 10h16M4 15h16M10 4v16M15 4v16" />
  </svg>
);

const AxesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 20l7-7m0 0l7-7m-7 7H4m7 0v7" />
  </svg>
);

const ResetIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const FullscreenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
);

const ExitFullscreenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
  </svg>
);

// Color mode options
const COLOR_MODE_OPTIONS: { value: ViewerSettings['colorMode']; label: string }[] = [
  { value: 'height', label: 'Height' },
  { value: 'intensity', label: 'Intensity' },
  { value: 'classification', label: 'Classification' },
  { value: 'rgb', label: 'RGB' },
];

// Toggle button component
interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({ active, onClick, icon, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`
      p-2 rounded-md transition-colors
      ${active
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }
    `}
  >
    {icon}
  </button>
);

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  settings,
  onSettingsChange,
  onResetView,
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  // Update a single setting
  const updateSetting = useCallback(<K extends keyof ViewerSettings>(
    key: K,
    value: ViewerSettings[K]
  ) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  }, [settings, onSettingsChange]);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
      {/* Main toolbar */}
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-2 flex flex-col gap-3">
        {/* Point Size Slider */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Point Size</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={settings.pointSize}
              onChange={(e) => updateSetting('pointSize', parseFloat(e.target.value))}
              className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-blue-500
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:hover:bg-blue-400"
            />
            <span className="text-xs text-gray-300 w-8 text-right">
              {settings.pointSize.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700" />

        {/* Color Mode Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Color Mode</label>
          <select
            value={settings.colorMode}
            onChange={(e) => updateSetting('colorMode', e.target.value as ViewerSettings['colorMode'])}
            className="bg-gray-700 text-gray-200 text-sm rounded-md px-2 py-1.5
              border border-gray-600 focus:border-blue-500 focus:outline-none
              cursor-pointer"
          >
            {COLOR_MODE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700" />

        {/* Toggle Buttons */}
        <div className="flex gap-2">
          <ToggleButton
            active={settings.showGrid}
            onClick={() => updateSetting('showGrid', !settings.showGrid)}
            icon={<GridIcon className="w-5 h-5" />}
            title="Toggle Grid"
          />
          <ToggleButton
            active={settings.showAxes}
            onClick={() => updateSetting('showAxes', !settings.showAxes)}
            icon={<AxesIcon className="w-5 h-5" />}
            title="Toggle Axes"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700" />

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onResetView}
            title="Reset View"
            className="flex-1 p-2 bg-gray-700 text-gray-300 rounded-md
              hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
          >
            <ResetIcon className="w-4 h-4" />
            <span className="text-xs">Reset</span>
          </button>
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-2 bg-gray-700 text-gray-300 rounded-md
              hover:bg-gray-600 transition-colors"
          >
            {isFullscreen
              ? <ExitFullscreenIcon className="w-5 h-5" />
              : <FullscreenIcon className="w-5 h-5" />
            }
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="bg-gray-800/70 backdrop-blur-sm rounded-lg p-2 text-xs text-gray-400">
        <p className="font-medium text-gray-300 mb-1">Controls</p>
        <p>Left click: Rotate</p>
        <p>Right click: Pan</p>
        <p>Scroll: Zoom</p>
      </div>
    </div>
  );
};

export default ViewerToolbar;
