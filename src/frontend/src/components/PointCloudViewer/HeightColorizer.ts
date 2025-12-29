/**
 * HeightColorizer.ts
 * Height-based coloring utilities for point cloud visualization
 * Sprint 9-10: 3D Visualization Features
 */

import type { ColorScale, PointCloudBounds, ColorScaleDefinition } from './types';

// Color scale definitions with RGB values (0-255)
const COLOR_SCALES: Record<ColorScale, ColorScaleDefinition> = {
  viridis: {
    name: 'viridis',
    stops: [
      { position: 0.0, color: [68, 1, 84] },
      { position: 0.25, color: [59, 82, 139] },
      { position: 0.5, color: [33, 145, 140] },
      { position: 0.75, color: [94, 201, 98] },
      { position: 1.0, color: [253, 231, 37] },
    ],
  },
  plasma: {
    name: 'plasma',
    stops: [
      { position: 0.0, color: [13, 8, 135] },
      { position: 0.25, color: [126, 3, 168] },
      { position: 0.5, color: [204, 71, 120] },
      { position: 0.75, color: [248, 149, 64] },
      { position: 1.0, color: [240, 249, 33] },
    ],
  },
  terrain: {
    name: 'terrain',
    stops: [
      { position: 0.0, color: [51, 51, 153] },    // Deep blue (water/lowest)
      { position: 0.2, color: [102, 178, 102] },  // Green (low vegetation)
      { position: 0.4, color: [153, 204, 102] },  // Light green
      { position: 0.6, color: [204, 204, 102] },  // Yellow-green
      { position: 0.8, color: [153, 102, 51] },   // Brown (higher elevation)
      { position: 1.0, color: [255, 255, 255] },  // White (highest)
    ],
  },
  forest: {
    name: 'forest',
    stops: [
      { position: 0.0, color: [139, 90, 43] },    // Ground brown
      { position: 0.15, color: [85, 107, 47] },   // Dark olive green
      { position: 0.35, color: [34, 139, 34] },   // Forest green
      { position: 0.55, color: [0, 128, 0] },     // Green
      { position: 0.75, color: [50, 205, 50] },   // Lime green
      { position: 1.0, color: [144, 238, 144] },  // Light green (canopy top)
    ],
  },
};

/**
 * Interpolate between two colors based on a factor (0-1)
 */
function interpolateColor(
  color1: [number, number, number],
  color2: [number, number, number],
  factor: number
): [number, number, number] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * factor),
    Math.round(color1[1] + (color2[1] - color1[1]) * factor),
    Math.round(color1[2] + (color2[2] - color1[2]) * factor),
  ];
}

/**
 * Get color from a color scale at a given position (0-1)
 */
function getColorAtPosition(
  scale: ColorScaleDefinition,
  position: number
): [number, number, number] {
  // Clamp position to 0-1 range
  const clampedPosition = Math.max(0, Math.min(1, position));

  // Handle empty or single-stop scales
  if (scale.stops.length === 0) {
    return [128, 128, 128]; // Default gray
  }

  const defaultStop = { position: 0, color: [128, 128, 128] as [number, number, number] };

  // Find the two stops that surround this position
  let lowerStop = scale.stops[0] ?? defaultStop;
  let upperStop = scale.stops[scale.stops.length - 1] ?? defaultStop;

  for (let i = 0; i < scale.stops.length - 1; i++) {
    const currentStop = scale.stops[i];
    const nextStop = scale.stops[i + 1];
    if (
      currentStop &&
      nextStop &&
      clampedPosition >= currentStop.position &&
      clampedPosition <= nextStop.position
    ) {
      lowerStop = currentStop;
      upperStop = nextStop;
      break;
    }
  }

  // Calculate interpolation factor
  const range = upperStop.position - lowerStop.position;
  const factor = range === 0 ? 0 : (clampedPosition - lowerStop.position) / range;

  return interpolateColor(lowerStop.color, upperStop.color, factor);
}

/**
 * Generate height-based colors for point cloud points
 *
 * @param points - Float32Array of point positions (x, y, z, x, y, z, ...)
 * @param bounds - Bounding box of the point cloud
 * @param colorScale - Name of the color scale to use
 * @returns Float32Array of RGB values normalized to 0-1 (r, g, b, r, g, b, ...)
 */
export function generateHeightColors(
  points: Float32Array,
  bounds: PointCloudBounds,
  colorScale: ColorScale
): Float32Array {
  const scale = COLOR_SCALES[colorScale];
  const numPoints = Math.floor(points.length / 3);
  const colors = new Float32Array(numPoints * 3);

  const heightRange = bounds.maxZ - bounds.minZ;
  const hasValidRange = heightRange > 0;

  for (let i = 0; i < numPoints; i++) {
    const zIndex = i * 3 + 2; // Z is at index 2 for each point
    const z = points[zIndex] ?? 0;

    // Normalize height to 0-1 range
    const normalizedHeight = hasValidRange
      ? (z - bounds.minZ) / heightRange
      : 0.5;

    // Get color from scale
    const [r, g, b] = getColorAtPosition(scale, normalizedHeight);

    // Store normalized RGB values (0-1 range for Three.js)
    const colorIndex = i * 3;
    colors[colorIndex] = r / 255;
    colors[colorIndex + 1] = g / 255;
    colors[colorIndex + 2] = b / 255;
  }

  return colors;
}

/**
 * Generate a color lookup table for the given scale
 * Useful for legend display
 *
 * @param colorScale - Name of the color scale
 * @param numSteps - Number of steps in the lookup table
 * @returns Array of CSS color strings
 */
export function generateColorLUT(
  colorScale: ColorScale,
  numSteps: number = 256
): string[] {
  const scale = COLOR_SCALES[colorScale];
  const lut: string[] = [];

  for (let i = 0; i < numSteps; i++) {
    const position = i / (numSteps - 1);
    const [r, g, b] = getColorAtPosition(scale, position);
    lut.push(`rgb(${r}, ${g}, ${b})`);
  }

  return lut;
}

/**
 * Get the CSS gradient string for a color scale
 * Useful for legend display
 *
 * @param colorScale - Name of the color scale
 * @param direction - Gradient direction ('vertical' | 'horizontal')
 * @returns CSS linear-gradient string
 */
export function getColorScaleGradient(
  colorScale: ColorScale,
  direction: 'vertical' | 'horizontal' = 'vertical'
): string {
  const scale = COLOR_SCALES[colorScale];
  const gradientDirection = direction === 'vertical' ? 'to top' : 'to right';

  const stops = scale.stops
    .map((stop) => {
      const [r, g, b] = stop.color;
      return `rgb(${r}, ${g}, ${b}) ${stop.position * 100}%`;
    })
    .join(', ');

  return `linear-gradient(${gradientDirection}, ${stops})`;
}

/**
 * Calculate bounds from point cloud data
 *
 * @param points - Float32Array of point positions (x, y, z, x, y, z, ...)
 * @returns PointCloudBounds object
 */
export function calculateBounds(points: Float32Array): PointCloudBounds {
  if (points.length < 3) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    };
  }

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  const numPoints = Math.floor(points.length / 3);

  for (let i = 0; i < numPoints; i++) {
    const idx = i * 3;
    const x = points[idx] ?? 0;
    const y = points[idx + 1] ?? 0;
    const z = points[idx + 2] ?? 0;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Get available color scales
 */
export function getAvailableColorScales(): ColorScale[] {
  return Object.keys(COLOR_SCALES) as ColorScale[];
}

/**
 * Get color scale definition
 */
export function getColorScaleDefinition(
  colorScale: ColorScale
): ColorScaleDefinition {
  return COLOR_SCALES[colorScale];
}

/**
 * Create a custom color scale
 *
 * @param name - Identifier for the scale
 * @param stops - Array of position/color pairs
 * @returns ColorScaleDefinition
 */
export function createCustomColorScale(
  name: string,
  stops: Array<{ position: number; color: [number, number, number] }>
): ColorScaleDefinition {
  // Sort stops by position
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  return {
    name: name as ColorScale,
    stops: sortedStops,
  };
}

export default {
  generateHeightColors,
  generateColorLUT,
  getColorScaleGradient,
  calculateBounds,
  getAvailableColorScales,
  getColorScaleDefinition,
  createCustomColorScale,
};
