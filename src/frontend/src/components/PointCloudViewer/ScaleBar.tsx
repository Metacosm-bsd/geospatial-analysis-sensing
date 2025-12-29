/**
 * ScaleBar.tsx
 * Dynamic scale bar that updates based on zoom level
 * Sprint 9-10: 3D Visualization Features
 */

import React, { useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ScaleBarConfig, CameraState } from './types';

interface ScaleBarProps {
  config: ScaleBarConfig;
  /** Optional custom camera state (for external control) */
  cameraState?: CameraState;
}

/**
 * Default scale bar configuration
 */
export const DEFAULT_SCALE_BAR_CONFIG: ScaleBarConfig = {
  visible: true,
  position: 'bottom-left',
  unit: 'auto',
  maxWidth: 200,
};

// Nice scale values for different magnitudes
const NICE_SCALES_METRIC = [
  0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

const NICE_SCALES_IMPERIAL = [
  0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 26400, // 5 miles
];

const METERS_PER_FOOT = 0.3048;

/**
 * Find the best "nice" scale value for a given maximum distance
 */
function findNiceScale(maxDistance: number, scales: number[]): number {
  if (scales.length === 0) {
    return 100; // Default fallback
  }
  for (const scale of scales) {
    if (scale <= maxDistance) {
      continue;
    }
    // Find the largest scale that fits
    const idx = scales.indexOf(scale);
    return idx > 0 ? (scales[idx - 1] ?? scales[0] ?? 100) : (scales[0] ?? 100);
  }
  return scales[scales.length - 1] ?? 100;
}

/**
 * Format distance with appropriate unit
 */
function formatDistance(meters: number, unit: 'meters' | 'feet' | 'auto'): string {
  if (unit === 'feet' || (unit === 'auto' && meters > 1000)) {
    const feet = meters / METERS_PER_FOOT;
    if (feet >= 5280) {
      const miles = feet / 5280;
      return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
    }
    return `${feet.toFixed(0)} ft`;
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }

  if (meters < 1) {
    return `${(meters * 100).toFixed(0)} cm`;
  }

  return `${meters.toFixed(meters < 10 ? 1 : 0)} m`;
}

/**
 * ScaleBar component
 * Displays a dynamic scale bar that updates with zoom level
 */
export const ScaleBar: React.FC<ScaleBarProps> = ({ config, cameraState: externalCameraState }) => {
  const { camera, gl } = useThree();
  const [scaleInfo, setScaleInfo] = useState({ distance: 100, width: 100 });

  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_SCALE_BAR_CONFIG, ...config }),
    [config]
  );

  // Calculate scale based on camera distance and viewport
  useFrame(() => {
    const viewportHeight = gl.domElement.clientHeight;

    let cameraDistance: number;

    if (externalCameraState) {
      cameraDistance = externalCameraState.distance;
    } else {
      // Calculate distance from camera to origin or target
      cameraDistance = camera.position.length();
    }

    // For perspective camera, calculate world units per pixel
    const isPerspective = camera instanceof THREE.PerspectiveCamera;
    let metersPerPixel: number;

    if (isPerspective) {
      const perspCam = camera as THREE.PerspectiveCamera;
      const vFov = THREE.MathUtils.degToRad(perspCam.fov);
      const heightAtDistance = 2 * Math.tan(vFov / 2) * cameraDistance;
      metersPerPixel = heightAtDistance / viewportHeight;
    } else {
      // Orthographic camera
      const orthoCam = camera as THREE.OrthographicCamera;
      const viewHeight = (orthoCam.top - orthoCam.bottom) / orthoCam.zoom;
      metersPerPixel = viewHeight / viewportHeight;
    }

    // Calculate max distance that fits in maxWidth
    const maxDistance = metersPerPixel * mergedConfig.maxWidth;

    // Find nice scale value
    const scales =
      mergedConfig.unit === 'feet' ? NICE_SCALES_IMPERIAL : NICE_SCALES_METRIC;
    const niceDistance = findNiceScale(maxDistance, scales);

    // Calculate actual width in pixels
    const width = niceDistance / metersPerPixel;

    // Only update if significantly different (avoid jitter)
    if (
      Math.abs(niceDistance - scaleInfo.distance) > 0.1 ||
      Math.abs(width - scaleInfo.width) > 1
    ) {
      setScaleInfo({ distance: niceDistance, width: Math.min(width, mergedConfig.maxWidth) });
    }
  });

  if (!mergedConfig.visible) return null;

  const { position, unit } = mergedConfig;

  // Calculate position styles
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    zIndex: 100,
    ...(position === 'bottom-left' && { bottom: '16px', left: '16px' }),
    ...(position === 'bottom-right' && { bottom: '16px', right: '16px' }),
  };

  return (
    <Html
      style={positionStyles}
      calculatePosition={() => [0, 0]}
      zIndexRange={[100, 0]}
    >
      <div className="scale-bar" style={{ userSelect: 'none' }}>
        {/* Scale bar container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: position === 'bottom-right' ? 'flex-end' : 'flex-start',
          }}
        >
          {/* Label */}
          <span
            style={{
              fontSize: '11px',
              color: '#374151',
              fontWeight: 500,
              marginBottom: '4px',
              textShadow: '0 0 2px white, 0 0 2px white',
            }}
          >
            {formatDistance(scaleInfo.distance, unit)}
          </span>

          {/* Bar */}
          <div
            style={{
              width: `${scaleInfo.width}px`,
              height: '6px',
              backgroundColor: '#1F2937',
              borderRadius: '1px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
              position: 'relative',
            }}
          >
            {/* Alternating segments */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '50%',
                height: '100%',
                backgroundColor: '#FFFFFF',
                borderRadius: '1px 0 0 1px',
              }}
            />
            {/* End caps */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '-2px',
                width: '2px',
                height: '10px',
                backgroundColor: '#1F2937',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '-2px',
                width: '2px',
                height: '10px',
                backgroundColor: '#1F2937',
              }}
            />
            {/* Center mark */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '-1px',
                width: '1px',
                height: '8px',
                backgroundColor: '#1F2937',
                transform: 'translateX(-50%)',
              }}
            />
          </div>
        </div>
      </div>
    </Html>
  );
};

/**
 * Standalone scale bar component (for use outside Canvas)
 */
interface StandaloneScaleBarProps {
  distance: number; // Distance in meters
  width: number; // Width in pixels
  unit: 'meters' | 'feet' | 'auto';
  position?: 'left' | 'right';
  className?: string;
}

export const StandaloneScaleBar: React.FC<StandaloneScaleBarProps> = ({
  distance,
  width,
  unit,
  position = 'left',
  className = '',
}) => {
  return (
    <div
      className={`scale-bar-standalone ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: position === 'right' ? 'flex-end' : 'flex-start',
        userSelect: 'none',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: '11px',
          color: '#374151',
          fontWeight: 500,
          marginBottom: '4px',
        }}
      >
        {formatDistance(distance, unit)}
      </span>

      {/* Bar */}
      <div
        style={{
          width: `${width}px`,
          height: '6px',
          backgroundColor: '#1F2937',
          borderRadius: '1px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '50%',
            height: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '1px 0 0 1px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '-2px',
            width: '2px',
            height: '10px',
            backgroundColor: '#1F2937',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '-2px',
            width: '2px',
            height: '10px',
            backgroundColor: '#1F2937',
          }}
        />
      </div>
    </div>
  );
};

/**
 * Vertical scale bar for elevation
 */
interface ElevationScaleBarProps {
  minElevation: number;
  maxElevation: number;
  height?: number;
  unit?: 'meters' | 'feet';
  colorGradient?: string;
  visible?: boolean;
}

export const ElevationScaleBar: React.FC<ElevationScaleBarProps> = ({
  minElevation,
  maxElevation,
  height = 150,
  unit = 'meters',
  colorGradient = 'linear-gradient(to top, #8B5A2B, #228B22, #90EE90)',
  visible = true,
}) => {
  if (!visible) return null;

  const range = maxElevation - minElevation;
  const formatElev = (val: number) => {
    if (unit === 'feet') {
      return `${(val / METERS_PER_FOOT).toFixed(0)} ft`;
    }
    return `${val.toFixed(1)} m`;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: `${height}px`,
        userSelect: 'none',
      }}
    >
      {/* Labels */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          marginRight: '8px',
          fontSize: '10px',
          color: '#374151',
        }}
      >
        <span>{formatElev(maxElevation)}</span>
        <span>{formatElev(minElevation + range * 0.75)}</span>
        <span>{formatElev(minElevation + range * 0.5)}</span>
        <span>{formatElev(minElevation + range * 0.25)}</span>
        <span>{formatElev(minElevation)}</span>
      </div>

      {/* Gradient bar */}
      <div
        style={{
          width: '16px',
          height: '100%',
          background: colorGradient,
          borderRadius: '2px',
          border: '1px solid #D1D5DB',
        }}
      />
    </div>
  );
};

/**
 * Hook to calculate scale bar values
 */
export function useScaleBar(
  maxWidth: number = 200,
  unit: 'meters' | 'feet' | 'auto' = 'auto'
): { distance: number; width: number; label: string } {
  const { camera, gl } = useThree();
  const [scaleInfo, setScaleInfo] = useState({
    distance: 100,
    width: 100,
    label: '100 m',
  });

  useFrame(() => {
    const viewportHeight = gl.domElement.clientHeight;
    const cameraDistance = camera.position.length();

    const isPerspective = camera instanceof THREE.PerspectiveCamera;
    let metersPerPixel: number;

    if (isPerspective) {
      const perspCam = camera as THREE.PerspectiveCamera;
      const vFov = THREE.MathUtils.degToRad(perspCam.fov);
      const heightAtDistance = 2 * Math.tan(vFov / 2) * cameraDistance;
      metersPerPixel = heightAtDistance / viewportHeight;
    } else {
      const orthoCam = camera as THREE.OrthographicCamera;
      const viewHeight = (orthoCam.top - orthoCam.bottom) / orthoCam.zoom;
      metersPerPixel = viewHeight / viewportHeight;
    }

    const maxDistance = metersPerPixel * maxWidth;
    const scales = unit === 'feet' ? NICE_SCALES_IMPERIAL : NICE_SCALES_METRIC;
    const niceDistance = findNiceScale(maxDistance, scales);
    const width = niceDistance / metersPerPixel;

    if (
      Math.abs(niceDistance - scaleInfo.distance) > 0.1 ||
      Math.abs(width - scaleInfo.width) > 1
    ) {
      setScaleInfo({
        distance: niceDistance,
        width: Math.min(width, maxWidth),
        label: formatDistance(niceDistance, unit),
      });
    }
  });

  return scaleInfo;
}

export default ScaleBar;
