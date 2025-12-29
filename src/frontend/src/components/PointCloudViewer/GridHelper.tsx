/**
 * GridHelper.tsx
 * Reference grid component with configurable size, divisions, and labels
 * Sprint 9-10: 3D Visualization Features
 */

import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GridConfig } from './types';

interface GridHelperProps {
  config: GridConfig;
  center?: { x: number; y: number; z: number };
}

/**
 * Default grid configuration
 */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  size: 100,
  divisions: 10,
  showLabels: true,
  visible: true,
  color: '#888888',
  opacity: 0.5,
  labelUnit: 'meters',
};

/**
 * Convert meters to feet
 */
function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

/**
 * Format distance label
 */
function formatLabel(value: number, unit: 'meters' | 'feet'): string {
  if (unit === 'feet') {
    const feet = metersToFeet(value);
    return `${feet.toFixed(0)} ft`;
  }
  return `${value.toFixed(0)} m`;
}

/**
 * GridHelper component
 * Renders a configurable reference grid in 3D space
 */
export const GridHelper: React.FC<GridHelperProps> = ({
  config,
  center = { x: 0, y: 0, z: 0 },
}) => {
  // Merge with defaults
  const mergedConfig = useMemo(() => ({ ...DEFAULT_GRID_CONFIG, ...config }), [config]);

  // Calculate grid parameters
  const { size, divisions, showLabels, visible, color, opacity, labelUnit } = mergedConfig;
  const cellSize = size / divisions;

  // Generate grid line geometry
  const gridGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];

    const halfSize = size / 2;

    // Lines parallel to X axis
    for (let i = 0; i <= divisions; i++) {
      const z = -halfSize + i * cellSize;
      positions.push(-halfSize, 0, z);
      positions.push(halfSize, 0, z);
    }

    // Lines parallel to Z axis
    for (let i = 0; i <= divisions; i++) {
      const x = -halfSize + i * cellSize;
      positions.push(x, 0, -halfSize);
      positions.push(x, 0, halfSize);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, [size, divisions, cellSize]);

  // Generate label positions
  const labelPositions = useMemo(() => {
    if (!showLabels) return [];

    const positions: Array<{
      position: [number, number, number];
      text: string;
      axis: 'x' | 'z';
    }> = [];

    const halfSize = size / 2;

    // X-axis labels (along the edge)
    for (let i = 0; i <= divisions; i++) {
      const x = -halfSize + i * cellSize;
      const value = i * cellSize;
      positions.push({
        position: [x, 0.1, -halfSize - 2],
        text: formatLabel(value, labelUnit),
        axis: 'x',
      });
    }

    // Z-axis labels (along the edge)
    for (let i = 0; i <= divisions; i++) {
      const z = -halfSize + i * cellSize;
      const value = i * cellSize;
      positions.push({
        position: [-halfSize - 2, 0.1, z],
        text: formatLabel(value, labelUnit),
        axis: 'z',
      });
    }

    return positions;
  }, [size, divisions, cellSize, showLabels, labelUnit]);

  if (!visible) return null;

  return (
    <group position={[center.x, center.z, center.y]} name="grid-helper">
      {/* Main grid lines */}
      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial color={color} opacity={opacity} transparent />
      </lineSegments>

      {/* Center cross (highlighted) */}
      <group>
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([-size / 2, 0.01, 0, size / 2, 0.01, 0]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#FF0000" opacity={0.8} transparent linewidth={2} />
        </line>
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, 0.01, -size / 2, 0, 0.01, size / 2]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#00FF00" opacity={0.8} transparent linewidth={2} />
        </line>
      </group>

      {/* Grid labels */}
      {showLabels &&
        labelPositions.map((label, index) => (
          <Text
            key={`label-${index}`}
            position={label.position}
            fontSize={1}
            color="#666666"
            anchorX={label.axis === 'x' ? 'center' : 'right'}
            anchorY="middle"
            rotation={[-Math.PI / 2, 0, 0]}
          >
            {label.text}
          </Text>
        ))}

      {/* Origin marker */}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshBasicMaterial color="#FFFF00" />
      </mesh>
    </group>
  );
};

/**
 * Infinite grid component (extends to horizon)
 */
interface InfiniteGridProps {
  cellSize?: number;
  sectionSize?: number;
  fadeDistance?: number;
  fadeStrength?: number;
  cellColor?: string;
  sectionColor?: string;
}

export const InfiniteGrid: React.FC<InfiniteGridProps> = ({
  cellSize = 1,
  sectionSize = 10,
  fadeDistance = 100,
  fadeStrength = 1,
  cellColor = '#888888',
  sectionColor = '#444444',
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();

  // Custom shader for infinite grid with fade
  const shader = useMemo(
    () => ({
      uniforms: {
        uCellSize: { value: cellSize },
        uSectionSize: { value: sectionSize },
        uFadeDistance: { value: fadeDistance },
        uFadeStrength: { value: fadeStrength },
        uCellColor: { value: new THREE.Color(cellColor) },
        uSectionColor: { value: new THREE.Color(sectionColor) },
        uCameraPosition: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uCellSize;
        uniform float uSectionSize;
        uniform float uFadeDistance;
        uniform float uFadeStrength;
        uniform vec3 uCellColor;
        uniform vec3 uSectionColor;
        uniform vec3 uCameraPosition;

        varying vec3 vWorldPosition;

        float grid(vec2 st, float res) {
          vec2 grid = abs(fract(st * res - 0.5) - 0.5) / fwidth(st * res);
          return 1.0 - min(min(grid.x, grid.y), 1.0);
        }

        void main() {
          float d = distance(uCameraPosition.xz, vWorldPosition.xz);
          float fade = 1.0 - smoothstep(0.0, uFadeDistance, d) * uFadeStrength;

          float cellGrid = grid(vWorldPosition.xz, 1.0 / uCellSize);
          float sectionGrid = grid(vWorldPosition.xz, 1.0 / uSectionSize);

          vec3 color = mix(uCellColor, uSectionColor, sectionGrid * 0.5);
          float alpha = max(cellGrid, sectionGrid) * fade * 0.5;

          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
    [cellSize, sectionSize, fadeDistance, fadeStrength, cellColor, sectionColor]
  );

  // Update camera position uniform
  useFrame(() => {
    if (materialRef.current && materialRef.current.uniforms['uCameraPosition']) {
      materialRef.current.uniforms['uCameraPosition'].value.copy(camera.position);
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[1000, 1000, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        {...shader}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

/**
 * Axis helper component
 */
interface AxisHelperProps {
  size?: number;
  visible?: boolean;
  showLabels?: boolean;
}

export const AxisHelper: React.FC<AxisHelperProps> = ({
  size = 10,
  visible = true,
  showLabels = true,
}) => {
  if (!visible) return null;

  return (
    <group name="axis-helper">
      {/* X axis (red) */}
      <arrowHelper args={[new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), size, 0xff0000]} />
      {showLabels && (
        <Text position={[size + 1, 0, 0]} fontSize={0.8} color="#FF0000">
          X
        </Text>
      )}

      {/* Y axis (green) */}
      <arrowHelper args={[new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), size, 0x00ff00]} />
      {showLabels && (
        <Text position={[0, size + 1, 0]} fontSize={0.8} color="#00FF00">
          Y
        </Text>
      )}

      {/* Z axis (blue) */}
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), size, 0x0000ff]} />
      {showLabels && (
        <Text position={[0, 0, size + 1]} fontSize={0.8} color="#0000FF">
          Z
        </Text>
      )}
    </group>
  );
};

/**
 * Measurement grid overlay
 * Shows grid with measurements at current view scale
 */
interface MeasurementGridProps {
  visible?: boolean;
  unit?: 'meters' | 'feet';
  color?: string;
  opacity?: number;
}

export const MeasurementGrid: React.FC<MeasurementGridProps> = ({
  visible = true,
  unit = 'meters',
  color = '#666666',
  opacity = 0.3,
}) => {
  const { camera } = useThree();
  const [gridParams, setGridParams] = React.useState({ size: 100, divisions: 10 });

  // Adjust grid based on camera distance
  useFrame(() => {
    const distance = camera.position.length();

    // Calculate appropriate grid size based on view distance
    let cellSize: number;
    if (distance < 10) {
      cellSize = 1;
    } else if (distance < 50) {
      cellSize = 5;
    } else if (distance < 200) {
      cellSize = 10;
    } else if (distance < 500) {
      cellSize = 25;
    } else {
      cellSize = 50;
    }

    const size = cellSize * 20;
    const divisions = 20;

    if (size !== gridParams.size || divisions !== gridParams.divisions) {
      setGridParams({ size, divisions });
    }
  });

  if (!visible) return null;

  return (
    <GridHelper
      config={{
        size: gridParams.size,
        divisions: gridParams.divisions,
        showLabels: true,
        visible: true,
        color,
        opacity,
        labelUnit: unit,
      }}
    />
  );
};

export default GridHelper;
