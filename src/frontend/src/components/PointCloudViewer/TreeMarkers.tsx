/**
 * TreeMarkers.tsx
 * 3D tree markers for point cloud visualization
 * Sprint 9-10: 3D Visualization Features
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DetectedTree,
  TreeMarkerOptions,
  OnTreeSelect,
  OnTreeHover,
  DEFAULT_SPECIES_COLORS,
} from './types';

// Re-export for convenience
export { DEFAULT_SPECIES_COLORS };

interface TreeMarkersProps {
  trees: DetectedTree[];
  options: TreeMarkerOptions;
  selectedIds?: Set<string>;
  hoveredId?: string | null;
  onSelect?: OnTreeSelect;
  onHover?: OnTreeHover;
  speciesColors?: Record<string, string>;
}

// Height color gradient (green gradient for trees)
const HEIGHT_COLOR_STOPS = [
  { position: 0.0, color: new THREE.Color('#8BC34A') },   // Light green (short)
  { position: 0.33, color: new THREE.Color('#4CAF50') },  // Green (medium)
  { position: 0.66, color: new THREE.Color('#2E7D32') },  // Dark green (tall)
  { position: 1.0, color: new THREE.Color('#1B5E20') },   // Forest green (tallest)
];

// Biomass color gradient (yellow to red)
const BIOMASS_COLOR_STOPS = [
  { position: 0.0, color: new THREE.Color('#FFEB3B') },   // Yellow (low)
  { position: 0.5, color: new THREE.Color('#FF9800') },   // Orange (medium)
  { position: 1.0, color: new THREE.Color('#F44336') },   // Red (high)
];

// DBH color gradient (cyan to purple)
const DBH_COLOR_STOPS = [
  { position: 0.0, color: new THREE.Color('#00BCD4') },   // Cyan (small)
  { position: 0.5, color: new THREE.Color('#3F51B5') },   // Indigo (medium)
  { position: 1.0, color: new THREE.Color('#9C27B0') },   // Purple (large)
];

/**
 * Interpolate color from gradient stops
 */
function interpolateColor(
  stops: Array<{ position: number; color: THREE.Color }>,
  t: number
): THREE.Color {
  const clampedT = Math.max(0, Math.min(1, t));

  for (let i = 0; i < stops.length - 1; i++) {
    const currentStop = stops[i];
    const nextStop = stops[i + 1];
    if (currentStop && nextStop && clampedT >= currentStop.position && clampedT <= nextStop.position) {
      const range = nextStop.position - currentStop.position;
      const factor = range === 0 ? 0 : (clampedT - currentStop.position) / range;
      return currentStop.color.clone().lerp(nextStop.color, factor);
    }
  }

  const lastStop = stops[stops.length - 1];
  return lastStop ? lastStop.color.clone() : new THREE.Color('#9E9E9E');
}

/**
 * Get color for a tree based on coloring mode
 */
function getTreeColor(
  tree: DetectedTree,
  options: TreeMarkerOptions,
  speciesColors: Record<string, string>,
  heightRange: { min: number; max: number },
  biomassRange: { min: number; max: number },
  dbhRange: { min: number; max: number }
): THREE.Color {
  switch (options.colorBy) {
    case 'species':
      const speciesColor = speciesColors[tree.species || 'Unknown'] || '#9E9E9E';
      return new THREE.Color(speciesColor);

    case 'height':
      const heightNorm =
        heightRange.max > heightRange.min
          ? (tree.height - heightRange.min) / (heightRange.max - heightRange.min)
          : 0.5;
      return interpolateColor(HEIGHT_COLOR_STOPS, heightNorm);

    case 'biomass':
      if (tree.biomass === undefined) return new THREE.Color('#9E9E9E');
      const biomassNorm =
        biomassRange.max > biomassRange.min
          ? (tree.biomass - biomassRange.min) / (biomassRange.max - biomassRange.min)
          : 0.5;
      return interpolateColor(BIOMASS_COLOR_STOPS, biomassNorm);

    case 'dbh':
      if (tree.dbh === undefined) return new THREE.Color('#9E9E9E');
      const dbhNorm =
        dbhRange.max > dbhRange.min
          ? (tree.dbh - dbhRange.min) / (dbhRange.max - dbhRange.min)
          : 0.5;
      return interpolateColor(DBH_COLOR_STOPS, dbhNorm);

    case 'uniform':
    default:
      return new THREE.Color(options.uniformColor || '#4CAF50');
  }
}

/**
 * Individual tree marker component
 */
interface TreeMarkerProps {
  tree: DetectedTree;
  options: TreeMarkerOptions;
  color: THREE.Color;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (tree: DetectedTree) => void;
  onHover: (tree: DetectedTree | null) => void;
}

const TreeMarker: React.FC<TreeMarkerProps> = ({
  tree,
  options,
  color,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Hover effect animation
  useFrame(() => {
    if (meshRef.current) {
      const targetScale = isHovered ? options.scale * 1.2 : options.scale;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }
  });

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect(tree);
    },
    [tree, onSelect]
  );

  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHover(tree);
      document.body.style.cursor = 'pointer';
    },
    [tree, onHover]
  );

  const handlePointerLeave = useCallback(() => {
    onHover(null);
    document.body.style.cursor = 'auto';
  }, [onHover]);

  // Calculate marker dimensions based on tree metrics
  const markerHeight = Math.max(1, tree.height * 0.1) * options.scale;
  const markerRadius = (tree.crownDiameter || tree.height * 0.3) * 0.05 * options.scale;

  // Selection/hover highlight color
  const displayColor = isSelected
    ? new THREE.Color('#FFD700') // Gold for selected
    : isHovered
    ? color.clone().multiplyScalar(1.3) // Brighter on hover
    : color;

  const position: [number, number, number] = [
    tree.position.x,
    tree.position.y,
    tree.position.z + markerHeight / 2,
  ];

  const renderMarker = () => {
    switch (options.markerType) {
      case 'cylinder':
        return (
          <mesh
            ref={meshRef}
            position={position}
            onClick={handleClick}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            <cylinderGeometry args={[markerRadius * 0.8, markerRadius, markerHeight, 8]} />
            <meshStandardMaterial
              color={displayColor}
              opacity={options.opacity}
              transparent={options.opacity < 1}
              {...(isSelected ? { emissive: displayColor } : {})}
              emissiveIntensity={isSelected ? 0.3 : 0}
            />
          </mesh>
        );

      case 'cone':
        return (
          <mesh
            ref={meshRef}
            position={position}
            onClick={handleClick}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            <coneGeometry args={[markerRadius, markerHeight, 8]} />
            <meshStandardMaterial
              color={displayColor}
              opacity={options.opacity}
              transparent={options.opacity < 1}
              {...(isSelected ? { emissive: displayColor } : {})}
              emissiveIntensity={isSelected ? 0.3 : 0}
            />
          </mesh>
        );

      case 'sphere':
        return (
          <mesh
            ref={meshRef}
            position={[tree.position.x, tree.position.y, tree.position.z + markerRadius]}
            onClick={handleClick}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            <sphereGeometry args={[markerRadius, 16, 12]} />
            <meshStandardMaterial
              color={displayColor}
              opacity={options.opacity}
              transparent={options.opacity < 1}
              {...(isSelected ? { emissive: displayColor } : {})}
              emissiveIntensity={isSelected ? 0.3 : 0}
            />
          </mesh>
        );

      case 'billboard':
      default:
        return (
          <Billboard
            position={[tree.position.x, tree.position.y, tree.position.z + markerHeight]}
            onClick={handleClick}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            <mesh ref={meshRef}>
              <planeGeometry args={[markerRadius * 2, markerHeight]} />
              <meshBasicMaterial
                color={displayColor}
                opacity={options.opacity}
                transparent
                side={THREE.DoubleSide}
              />
            </mesh>
          </Billboard>
        );
    }
  };

  return (
    <group>
      {renderMarker()}

      {/* Selection ring */}
      {isSelected && (
        <mesh
          position={[tree.position.x, tree.position.y, tree.position.z + 0.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[markerRadius * 1.5, markerRadius * 1.8, 32]} />
          <meshBasicMaterial color="#FFD700" opacity={0.8} transparent />
        </mesh>
      )}

      {/* Label */}
      {options.showLabels && (
        <Billboard position={[tree.position.x, tree.position.y, tree.position.z + markerHeight + 0.5]}>
          <Text
            fontSize={0.5 * options.scale}
            color={isSelected ? '#FFD700' : '#FFFFFF'}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {options.labelField
              ? String(tree[options.labelField] ?? tree.id)
              : `${tree.height.toFixed(1)}m`}
          </Text>
        </Billboard>
      )}
    </group>
  );
};

/**
 * TreeMarkers component - renders all tree markers
 */
export const TreeMarkers: React.FC<TreeMarkersProps> = ({
  trees,
  options,
  selectedIds = new Set(),
  hoveredId = null,
  onSelect,
  onHover,
  speciesColors = {},
}) => {
  // Calculate ranges for color normalization
  const ranges = useMemo(() => {
    if (trees.length === 0) {
      return {
        height: { min: 0, max: 1 },
        biomass: { min: 0, max: 1 },
        dbh: { min: 0, max: 1 },
      };
    }

    let minHeight = Infinity,
      maxHeight = -Infinity;
    let minBiomass = Infinity,
      maxBiomass = -Infinity;
    let minDbh = Infinity,
      maxDbh = -Infinity;

    trees.forEach((tree) => {
      if (tree.height < minHeight) minHeight = tree.height;
      if (tree.height > maxHeight) maxHeight = tree.height;

      if (tree.biomass !== undefined) {
        if (tree.biomass < minBiomass) minBiomass = tree.biomass;
        if (tree.biomass > maxBiomass) maxBiomass = tree.biomass;
      }

      if (tree.dbh !== undefined) {
        if (tree.dbh < minDbh) minDbh = tree.dbh;
        if (tree.dbh > maxDbh) maxDbh = tree.dbh;
      }
    });

    return {
      height: { min: minHeight, max: maxHeight },
      biomass: {
        min: minBiomass === Infinity ? 0 : minBiomass,
        max: maxBiomass === -Infinity ? 1 : maxBiomass,
      },
      dbh: {
        min: minDbh === Infinity ? 0 : minDbh,
        max: maxDbh === -Infinity ? 1 : maxDbh,
      },
    };
  }, [trees]);

  // Merge default species colors with custom ones
  const mergedSpeciesColors = useMemo(() => {
    const defaultColors: Record<string, string> = {
      'Douglas Fir': '#2E7D32',
      'Western Red Cedar': '#1B5E20',
      'Sitka Spruce': '#388E3C',
      'Western Hemlock': '#43A047',
      'Red Alder': '#8BC34A',
      'Bigleaf Maple': '#CDDC39',
      'Black Cottonwood': '#9E9D24',
      'Oregon White Oak': '#827717',
      'Pacific Madrone': '#F44336',
      'Grand Fir': '#4CAF50',
      'Noble Fir': '#66BB6A',
      'Pacific Silver Fir': '#81C784',
      'Lodgepole Pine': '#A5D6A7',
      'Ponderosa Pine': '#FFC107',
      Unknown: '#9E9E9E',
    };
    return { ...defaultColors, ...speciesColors };
  }, [speciesColors]);

  // Pre-compute colors for all trees
  const treeColors = useMemo(() => {
    return trees.map((tree) =>
      getTreeColor(
        tree,
        options,
        mergedSpeciesColors,
        ranges.height,
        ranges.biomass,
        ranges.dbh
      )
    );
  }, [trees, options, mergedSpeciesColors, ranges]);

  const handleSelect = useCallback(
    (tree: DetectedTree) => {
      onSelect?.(tree);
    },
    [onSelect]
  );

  const handleHover = useCallback(
    (tree: DetectedTree | null) => {
      onHover?.(tree);
    },
    [onHover]
  );

  return (
    <group name="tree-markers">
      {trees.map((tree, index) => (
        <TreeMarker
          key={tree.id}
          tree={tree}
          options={options}
          color={treeColors[index] ?? new THREE.Color('#9E9E9E')}
          isSelected={selectedIds.has(tree.id)}
          isHovered={hoveredId === tree.id}
          onSelect={handleSelect}
          onHover={handleHover}
        />
      ))}
    </group>
  );
};

export default TreeMarkers;
