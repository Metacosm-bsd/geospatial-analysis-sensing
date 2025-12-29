/**
 * ClassificationColorizer.ts
 * ASPRS classification-based coloring for point cloud visualization
 * Sprint 9-10: 3D Visualization Features
 */

import { ASPRSClassification } from './types';

/**
 * ASPRS Standard LiDAR Classification Colors
 * Colors follow industry conventions for easy recognition
 */
const ASPRS_COLORS: Record<number, [number, number, number]> = {
  // Class 0: Created, never classified
  [ASPRSClassification.Created]: [128, 128, 128], // Gray

  // Class 1: Unclassified
  [ASPRSClassification.Unclassified]: [192, 192, 192], // Light gray

  // Class 2: Ground
  [ASPRSClassification.Ground]: [139, 90, 43], // Brown (saddle brown)

  // Class 3: Low Vegetation (0-0.5m)
  [ASPRSClassification.LowVegetation]: [144, 238, 144], // Light green

  // Class 4: Medium Vegetation (0.5-2m)
  [ASPRSClassification.MediumVegetation]: [34, 139, 34], // Forest green

  // Class 5: High Vegetation (>2m)
  [ASPRSClassification.HighVegetation]: [0, 100, 0], // Dark green

  // Class 6: Building
  [ASPRSClassification.Building]: [220, 20, 60], // Crimson red

  // Class 7: Low Point (noise)
  [ASPRSClassification.LowPoint]: [255, 0, 255], // Magenta

  // Class 8: Reserved (Model Key-point in legacy)
  8: [255, 165, 0], // Orange

  // Class 9: Water
  [ASPRSClassification.Water]: [30, 144, 255], // Dodger blue

  // Class 10: Rail
  [ASPRSClassification.Rail]: [139, 69, 19], // Dark brown

  // Class 11: Road Surface
  [ASPRSClassification.RoadSurface]: [105, 105, 105], // Dim gray

  // Class 12: Reserved (Overlap in legacy)
  12: [255, 215, 0], // Gold

  // Class 13: Wire - Guard (Shield)
  [ASPRSClassification.WireGuard]: [255, 255, 0], // Yellow

  // Class 14: Wire - Conductor (Phase)
  [ASPRSClassification.WireConductor]: [255, 200, 0], // Amber

  // Class 15: Transmission Tower
  [ASPRSClassification.TransmissionTower]: [128, 0, 128], // Purple

  // Class 16: Wire-structure Connector
  [ASPRSClassification.WireStructureConnector]: [255, 182, 193], // Light pink

  // Class 17: Bridge Deck
  [ASPRSClassification.BridgeDeck]: [169, 169, 169], // Dark gray

  // Class 18: High Noise
  [ASPRSClassification.HighNoise]: [255, 0, 0], // Red

  // Classes 19-63: Reserved
  // Classes 64-255: User definable
};

// Extended color palette for user-defined classes (64-255)
const USER_DEFINED_COLORS: [number, number, number][] = [
  [255, 127, 80], // Coral
  [100, 149, 237], // Cornflower blue
  [255, 215, 0], // Gold
  [50, 205, 50], // Lime green
  [238, 130, 238], // Violet
  [72, 209, 204], // Medium turquoise
  [255, 99, 71], // Tomato
  [135, 206, 235], // Sky blue
  [255, 160, 122], // Light salmon
  [152, 251, 152], // Pale green
];

/**
 * Get the color for a specific ASPRS classification code
 *
 * @param classification - ASPRS classification code (0-255)
 * @returns RGB color tuple
 */
export function getClassificationColor(
  classification: number
): [number, number, number] {
  const defaultColor: [number, number, number] = [128, 128, 128];

  // Check standard ASPRS colors
  if (classification in ASPRS_COLORS) {
    return ASPRS_COLORS[classification] ?? defaultColor;
  }

  // For user-defined classes (64-255), use rotating palette
  if (classification >= 64) {
    const index = (classification - 64) % USER_DEFINED_COLORS.length;
    return USER_DEFINED_COLORS[index] ?? defaultColor;
  }

  // Default for reserved classes (19-63)
  return defaultColor; // Gray
}

/**
 * Generate classification-based colors for point cloud points
 *
 * @param points - Float32Array of point positions (x, y, z, x, y, z, ...)
 * @param classifications - Uint8Array of classification codes for each point
 * @returns Float32Array of RGB values normalized to 0-1 (r, g, b, r, g, b, ...)
 */
export function generateClassificationColors(
  points: Float32Array,
  classifications: Uint8Array
): Float32Array {
  const numPoints = Math.floor(points.length / 3);
  const colors = new Float32Array(numPoints * 3);

  // Validate that we have enough classification data
  if (classifications.length < numPoints) {
    console.warn(
      `Classification array (${classifications.length}) is smaller than point count (${numPoints})`
    );
  }

  for (let i = 0; i < numPoints; i++) {
    // Get classification for this point (default to unclassified if missing)
    const classification =
      i < classifications.length
        ? (classifications[i] ?? ASPRSClassification.Unclassified)
        : ASPRSClassification.Unclassified;

    // Get color for this classification
    const [r, g, b] = getClassificationColor(classification);

    // Store normalized RGB values (0-1 range for Three.js)
    const colorIndex = i * 3;
    colors[colorIndex] = r / 255;
    colors[colorIndex + 1] = g / 255;
    colors[colorIndex + 2] = b / 255;
  }

  return colors;
}

/**
 * Get all standard ASPRS classification names and colors
 * Useful for legend display
 */
export function getClassificationLegend(): Array<{
  code: number;
  name: string;
  color: string;
}> {
  const defaultColor: [number, number, number] = [128, 128, 128];
  return [
    {
      code: 0,
      name: 'Created/Never Classified',
      color: rgbToHex(ASPRS_COLORS[0] ?? defaultColor),
    },
    { code: 1, name: 'Unclassified', color: rgbToHex(ASPRS_COLORS[1] ?? defaultColor) },
    { code: 2, name: 'Ground', color: rgbToHex(ASPRS_COLORS[2] ?? defaultColor) },
    { code: 3, name: 'Low Vegetation', color: rgbToHex(ASPRS_COLORS[3] ?? defaultColor) },
    { code: 4, name: 'Medium Vegetation', color: rgbToHex(ASPRS_COLORS[4] ?? defaultColor) },
    { code: 5, name: 'High Vegetation', color: rgbToHex(ASPRS_COLORS[5] ?? defaultColor) },
    { code: 6, name: 'Building', color: rgbToHex(ASPRS_COLORS[6] ?? defaultColor) },
    { code: 7, name: 'Low Point (Noise)', color: rgbToHex(ASPRS_COLORS[7] ?? defaultColor) },
    { code: 9, name: 'Water', color: rgbToHex(ASPRS_COLORS[9] ?? defaultColor) },
    { code: 10, name: 'Rail', color: rgbToHex(ASPRS_COLORS[10] ?? defaultColor) },
    { code: 11, name: 'Road Surface', color: rgbToHex(ASPRS_COLORS[11] ?? defaultColor) },
    { code: 13, name: 'Wire - Guard', color: rgbToHex(ASPRS_COLORS[13] ?? defaultColor) },
    { code: 14, name: 'Wire - Conductor', color: rgbToHex(ASPRS_COLORS[14] ?? defaultColor) },
    {
      code: 15,
      name: 'Transmission Tower',
      color: rgbToHex(ASPRS_COLORS[15] ?? defaultColor),
    },
    {
      code: 16,
      name: 'Wire Structure Connector',
      color: rgbToHex(ASPRS_COLORS[16] ?? defaultColor),
    },
    { code: 17, name: 'Bridge Deck', color: rgbToHex(ASPRS_COLORS[17] ?? defaultColor) },
    { code: 18, name: 'High Noise', color: rgbToHex(ASPRS_COLORS[18] ?? defaultColor) },
  ];
}

/**
 * Get only vegetation-related classifications
 * Useful for forest inventory applications
 */
export function getVegetationLegend(): Array<{
  code: number;
  name: string;
  color: string;
  heightRange: string;
}> {
  const defaultColor: [number, number, number] = [128, 128, 128];
  return [
    {
      code: 2,
      name: 'Ground',
      color: rgbToHex(ASPRS_COLORS[2] ?? defaultColor),
      heightRange: '0m',
    },
    {
      code: 3,
      name: 'Low Vegetation',
      color: rgbToHex(ASPRS_COLORS[3] ?? defaultColor),
      heightRange: '0-0.5m',
    },
    {
      code: 4,
      name: 'Medium Vegetation',
      color: rgbToHex(ASPRS_COLORS[4] ?? defaultColor),
      heightRange: '0.5-2m',
    },
    {
      code: 5,
      name: 'High Vegetation',
      color: rgbToHex(ASPRS_COLORS[5] ?? defaultColor),
      heightRange: '>2m',
    },
  ];
}

/**
 * Convert RGB tuple to hex color string
 */
function rgbToHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

/**
 * Convert hex color string to RGB tuple
 */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) {
    return [128, 128, 128]; // Default gray
  }
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/**
 * Count points by classification
 *
 * @param classifications - Uint8Array of classification codes
 * @returns Map of classification code to count
 */
export function countByClassification(
  classifications: Uint8Array
): Map<number, number> {
  const counts = new Map<number, number>();

  for (let i = 0; i < classifications.length; i++) {
    const classCode = classifications[i] ?? 0;
    counts.set(classCode, (counts.get(classCode) ?? 0) + 1);
  }

  return counts;
}

/**
 * Get classification statistics
 */
export function getClassificationStats(classifications: Uint8Array): {
  total: number;
  byClass: Array<{ code: number; name: string; count: number; percentage: number }>;
} {
  const counts = countByClassification(classifications);
  const total = classifications.length;
  const legend = getClassificationLegend();

  const byClass = Array.from(counts.entries())
    .map(([code, count]) => {
      const legendItem = legend.find((l) => l.code === code);
      return {
        code,
        name: legendItem?.name || `Class ${code}`,
        count,
        percentage: (count / total) * 100,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { total, byClass };
}

/**
 * Custom color mapping for specific use cases
 */
export function createCustomClassificationColorMap(
  mappings: Record<number, string>
): Record<number, [number, number, number]> {
  const colorMap: Record<number, [number, number, number]> = {};

  for (const [code, hexColor] of Object.entries(mappings)) {
    colorMap[Number(code)] = hexToRgb(hexColor);
  }

  return colorMap;
}

/**
 * Generate colors with custom color mapping
 */
export function generateCustomClassificationColors(
  points: Float32Array,
  classifications: Uint8Array,
  customColors: Record<number, [number, number, number]>
): Float32Array {
  const numPoints = Math.floor(points.length / 3);
  const colors = new Float32Array(numPoints * 3);

  for (let i = 0; i < numPoints; i++) {
    const classification =
      i < classifications.length
        ? (classifications[i] ?? ASPRSClassification.Unclassified)
        : ASPRSClassification.Unclassified;

    // Use custom color if available, otherwise fall back to standard
    const [r, g, b] =
      classification in customColors
        ? (customColors[classification] ?? getClassificationColor(classification))
        : getClassificationColor(classification);

    const colorIndex = i * 3;
    colors[colorIndex] = r / 255;
    colors[colorIndex + 1] = g / 255;
    colors[colorIndex + 2] = b / 255;
  }

  return colors;
}

export default {
  generateClassificationColors,
  getClassificationColor,
  getClassificationLegend,
  getVegetationLegend,
  countByClassification,
  getClassificationStats,
  createCustomClassificationColorMap,
  generateCustomClassificationColors,
  hexToRgb,
};
