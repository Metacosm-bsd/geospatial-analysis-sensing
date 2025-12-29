/**
 * CompassRose.tsx
 * Orientation indicator showing N/S/E/W directions
 * Sprint 9-10: 3D Visualization Features
 */

import React, { useRef, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CompassConfig } from './types';

interface CompassRoseProps {
  config: CompassConfig;
  /** Heading offset in degrees (if the scene is rotated) */
  headingOffset?: number;
}

/**
 * Default compass configuration
 */
export const DEFAULT_COMPASS_CONFIG: CompassConfig = {
  visible: true,
  position: 'top-right',
  size: 80,
};

/**
 * CompassRose component - HTML overlay version
 * Shows a compass that rotates with the camera
 */
export const CompassRose: React.FC<CompassRoseProps> = ({
  config,
  headingOffset = 0,
}) => {
  const { camera } = useThree();
  const [rotation, setRotation] = useState(0);
  const mergedConfig = useMemo(() => ({ ...DEFAULT_COMPASS_CONFIG, ...config }), [config]);

  // Update rotation based on camera orientation
  useFrame(() => {
    // Get camera's horizontal rotation (yaw)
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const yaw = THREE.MathUtils.radToDeg(euler.y);
    setRotation(-yaw + headingOffset);
  });

  if (!mergedConfig.visible) return null;

  const { position, size } = mergedConfig;

  // Calculate position styles
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    zIndex: 100,
    ...(position === 'top-left' && { top: '16px', left: '16px' }),
    ...(position === 'top-right' && { top: '16px', right: '16px' }),
    ...(position === 'bottom-left' && { bottom: '16px', left: '16px' }),
    ...(position === 'bottom-right' && { bottom: '16px', right: '16px' }),
  };

  return (
    <Html
      style={positionStyles}
      calculatePosition={() => [0, 0]}
      zIndexRange={[100, 0]}
    >
      <div
        className="compass-rose"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {/* Background circle */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            border: '2px solid #e5e7eb',
          }}
        />

        {/* Rotating compass */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          {/* North arrow */}
          <svg
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
            }}
          >
            {/* Cardinal directions */}
            <g transform="translate(50, 50)">
              {/* North pointer (red) */}
              <polygon
                points="0,-35 -8,-5 0,-10 8,-5"
                fill="#DC2626"
                stroke="#B91C1C"
                strokeWidth="1"
              />
              {/* South pointer (gray) */}
              <polygon
                points="0,35 -8,5 0,10 8,5"
                fill="#9CA3AF"
                stroke="#6B7280"
                strokeWidth="1"
              />

              {/* Direction labels */}
              <text
                x="0"
                y="-38"
                textAnchor="middle"
                dominantBaseline="auto"
                fontSize="12"
                fontWeight="bold"
                fill="#DC2626"
              >
                N
              </text>
              <text
                x="38"
                y="4"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="#6B7280"
              >
                E
              </text>
              <text
                x="0"
                y="44"
                textAnchor="middle"
                dominantBaseline="auto"
                fontSize="10"
                fill="#6B7280"
              >
                S
              </text>
              <text
                x="-38"
                y="4"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="#6B7280"
              >
                W
              </text>

              {/* Tick marks */}
              {[45, 135, 225, 315].map((angle) => (
                <line
                  key={angle}
                  x1={Math.sin((angle * Math.PI) / 180) * 30}
                  y1={-Math.cos((angle * Math.PI) / 180) * 30}
                  x2={Math.sin((angle * Math.PI) / 180) * 35}
                  y2={-Math.cos((angle * Math.PI) / 180) * 35}
                  stroke="#9CA3AF"
                  strokeWidth="1.5"
                />
              ))}

              {/* Center dot */}
              <circle cx="0" cy="0" r="3" fill="#374151" />
            </g>
          </svg>
        </div>

        {/* Heading display */}
        <div
          style={{
            position: 'absolute',
            bottom: '-20px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            color: '#6B7280',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {formatHeading(-rotation + headingOffset)}
        </div>
      </div>
    </Html>
  );
};

/**
 * Format heading to degrees with direction
 */
function formatHeading(degrees: number): string {
  // Normalize to 0-360
  let normalized = degrees % 360;
  if (normalized < 0) normalized += 360;

  // Determine cardinal/intercardinal direction
  let direction: string;
  if (normalized >= 337.5 || normalized < 22.5) direction = 'N';
  else if (normalized >= 22.5 && normalized < 67.5) direction = 'NE';
  else if (normalized >= 67.5 && normalized < 112.5) direction = 'E';
  else if (normalized >= 112.5 && normalized < 157.5) direction = 'SE';
  else if (normalized >= 157.5 && normalized < 202.5) direction = 'S';
  else if (normalized >= 202.5 && normalized < 247.5) direction = 'SW';
  else if (normalized >= 247.5 && normalized < 292.5) direction = 'W';
  else direction = 'NW';

  return `${normalized.toFixed(0)}° ${direction}`;
}

/**
 * 3D Compass Rose component
 * Renders directly in 3D space, always facing camera
 */
interface CompassRose3DProps {
  position?: [number, number, number];
  size?: number;
  visible?: boolean;
}

export const CompassRose3D: React.FC<CompassRose3DProps> = ({
  position = [0, 0, 0],
  size = 5,
  visible = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Always face the camera (billboard effect)
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(camera.quaternion);
    }
  });

  if (!visible) return null;

  const arrowLength = size * 0.4;
  const arrowWidth = size * 0.08;

  return (
    <group ref={groupRef} position={position}>
      {/* Background circle */}
      <mesh>
        <circleGeometry args={[size * 0.5, 32]} />
        <meshBasicMaterial color="#FFFFFF" opacity={0.9} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* Border */}
      <mesh>
        <ringGeometry args={[size * 0.48, size * 0.5, 32]} />
        <meshBasicMaterial color="#E5E7EB" side={THREE.DoubleSide} />
      </mesh>

      {/* North arrow (red) */}
      <mesh position={[0, arrowLength * 0.5, 0.01]}>
        <coneGeometry args={[arrowWidth, arrowLength, 4]} />
        <meshBasicMaterial color="#DC2626" />
      </mesh>

      {/* South arrow (gray) */}
      <mesh position={[0, -arrowLength * 0.5, 0.01]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[arrowWidth, arrowLength, 4]} />
        <meshBasicMaterial color="#9CA3AF" />
      </mesh>

      {/* Center dot */}
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[size * 0.03, 16]} />
        <meshBasicMaterial color="#374151" />
      </mesh>
    </group>
  );
};

/**
 * Mini compass for toolbar or status bar
 */
interface MiniCompassProps {
  heading: number;
  size?: number;
  onClick?: () => void;
  className?: string;
}

export const MiniCompass: React.FC<MiniCompassProps> = ({
  heading,
  size = 32,
  onClick,
  className = '',
}) => {
  // Normalize heading
  let normalized = heading % 360;
  if (normalized < 0) normalized += 360;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full bg-white shadow border border-gray-200 hover:bg-gray-50 transition-colors ${className}`}
      style={{ width: size, height: size }}
      title={`Heading: ${normalized.toFixed(0)}°`}
    >
      <svg
        viewBox="0 0 24 24"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          transform: `rotate(${-heading}deg)`,
          transition: 'transform 0.1s ease-out',
        }}
      >
        <circle cx="12" cy="12" r="10" fill="none" stroke="#E5E7EB" strokeWidth="1" />
        <polygon points="12,4 9,12 12,10 15,12" fill="#DC2626" />
        <polygon points="12,20 15,12 12,14 9,12" fill="#9CA3AF" />
        <circle cx="12" cy="12" r="1.5" fill="#374151" />
      </svg>
    </button>
  );
};

/**
 * Hook to get current camera heading
 */
export function useCameraHeading(headingOffset: number = 0): number {
  const { camera } = useThree();
  const [heading, setHeading] = useState(0);

  useFrame(() => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const yaw = THREE.MathUtils.radToDeg(euler.y);
    let newHeading = -yaw + headingOffset;

    // Normalize to 0-360
    newHeading = newHeading % 360;
    if (newHeading < 0) newHeading += 360;

    if (Math.abs(newHeading - heading) > 0.5) {
      setHeading(newHeading);
    }
  });

  return heading;
}

export default CompassRose;
