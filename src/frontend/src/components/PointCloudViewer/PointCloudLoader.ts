/**
 * PointCloudLoader Utilities
 * Data loading and processing utilities for LAS/LAZ point cloud files
 * Sprint 9-10: Core 3D visualization infrastructure
 */

import {
  PointCloudData,
  LODLevel,
  LASHeader,
  Point3D,
  HEIGHT_COLOR_GRADIENT,
} from './types';

/**
 * Parse LAS file header from ArrayBuffer
 */
export function parseLASHeader(buffer: ArrayBuffer): LASHeader {
  const view = new DataView(buffer);

  // File signature "LASF"
  const fileSignature = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );

  if (fileSignature !== 'LASF') {
    throw new Error('Invalid LAS file: Missing LASF signature');
  }

  // Version
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);

  // Point data format and record length
  const pointDataFormat = view.getUint8(104);
  const pointDataRecordLength = view.getUint16(105, true);

  // Number of points (varies by LAS version)
  let numberOfPoints: number;
  if (versionMajor === 1 && versionMinor >= 4) {
    // LAS 1.4 uses 64-bit point count at offset 247
    numberOfPoints = Number(view.getBigUint64(247, true));
  } else {
    // LAS 1.0-1.3 uses 32-bit count at offset 107
    numberOfPoints = view.getUint32(107, true);
  }

  // Scale factors
  const xScale = view.getFloat64(131, true);
  const yScale = view.getFloat64(139, true);
  const zScale = view.getFloat64(147, true);

  // Offsets
  const xOffset = view.getFloat64(155, true);
  const yOffset = view.getFloat64(163, true);
  const zOffset = view.getFloat64(171, true);

  // Bounds
  const maxX = view.getFloat64(179, true);
  const minX = view.getFloat64(187, true);
  const maxY = view.getFloat64(195, true);
  const minY = view.getFloat64(203, true);
  const maxZ = view.getFloat64(211, true);
  const minZ = view.getFloat64(219, true);

  // Offset to point data
  const offsetToPointData = view.getUint32(96, true);

  return {
    fileSignature,
    versionMajor,
    versionMinor,
    pointDataFormat,
    pointDataRecordLength,
    numberOfPoints,
    xScale,
    yScale,
    zScale,
    xOffset,
    yOffset,
    zOffset,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    offsetToPointData,
  };
}

/**
 * Parse LAS buffer and extract point cloud data
 */
export function parseLASBuffer(buffer: ArrayBuffer): PointCloudData {
  const header = parseLASHeader(buffer);
  const view = new DataView(buffer);

  const numPoints = header.numberOfPoints;
  const points = new Float32Array(numPoints * 3);
  const colors = new Float32Array(numPoints * 3);
  const intensities = new Float32Array(numPoints);
  const classifications = new Uint8Array(numPoints);

  let offset = header.offsetToPointData;
  const recordLength = header.pointDataRecordLength;

  // Track actual bounds as we parse
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  // Determine if format has RGB (formats 2, 3, 5, 7, 8, 10)
  const hasRGB = [2, 3, 5, 7, 8, 10].includes(header.pointDataFormat);

  // RGB offset varies by format
  let rgbOffset = 0;
  if (header.pointDataFormat === 2) rgbOffset = 20;
  else if (header.pointDataFormat === 3) rgbOffset = 28;
  else if (header.pointDataFormat === 5) rgbOffset = 28;
  else if (header.pointDataFormat === 7) rgbOffset = 30;
  else if (header.pointDataFormat === 8) rgbOffset = 30;
  else if (header.pointDataFormat === 10) rgbOffset = 30;

  for (let i = 0; i < numPoints; i++) {
    // Read X, Y, Z as scaled integers
    const rawX = view.getInt32(offset, true);
    const rawY = view.getInt32(offset + 4, true);
    const rawZ = view.getInt32(offset + 8, true);

    // Apply scale and offset
    const x = rawX * header.xScale + header.xOffset;
    const y = rawY * header.yScale + header.yOffset;
    const z = rawZ * header.zScale + header.zOffset;

    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = z;

    // Track bounds
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);

    // Read intensity (2 bytes at offset 12)
    intensities[i] = view.getUint16(offset + 12, true);

    // Read classification (1 byte, position varies by format)
    let classOffset = 15; // Default for formats 0-5
    if (header.pointDataFormat >= 6) classOffset = 16;
    classifications[i] = view.getUint8(offset + classOffset);

    // Read RGB if available
    if (hasRGB && rgbOffset > 0) {
      // RGB values are 16-bit in LAS format
      colors[i * 3] = view.getUint16(offset + rgbOffset, true) / 65535;
      colors[i * 3 + 1] = view.getUint16(offset + rgbOffset + 2, true) / 65535;
      colors[i * 3 + 2] = view.getUint16(offset + rgbOffset + 4, true) / 65535;
    } else {
      // Default to white
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }

    offset += recordLength;
  }

  return {
    points,
    colors,
    count: numPoints,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
    metadata: {
      header,
      intensities,
      classifications,
      hasRGB,
    },
  };
}

/**
 * Downsample point cloud by factor
 * Uses random sampling for efficiency
 */
export function downsample(
  points: Float32Array,
  colors: Float32Array,
  factor: number
): { points: Float32Array; colors: Float32Array; count: number } {
  const originalCount = points.length / 3;
  const targetCount = Math.floor(originalCount / factor);

  if (targetCount >= originalCount) {
    return { points, colors, count: originalCount };
  }

  const newPoints = new Float32Array(targetCount * 3);
  const newColors = new Float32Array(targetCount * 3);

  // Use reservoir sampling for uniform distribution
  const indices = new Set<number>();
  while (indices.size < targetCount) {
    indices.add(Math.floor(Math.random() * originalCount));
  }

  let outIdx = 0;
  indices.forEach(idx => {
    newPoints[outIdx * 3] = points[idx * 3] ?? 0;
    newPoints[outIdx * 3 + 1] = points[idx * 3 + 1] ?? 0;
    newPoints[outIdx * 3 + 2] = points[idx * 3 + 2] ?? 0;

    newColors[outIdx * 3] = colors[idx * 3] ?? 0;
    newColors[outIdx * 3 + 1] = colors[idx * 3 + 1] ?? 0;
    newColors[outIdx * 3 + 2] = colors[idx * 3 + 2] ?? 0;

    outIdx++;
  });

  return { points: newPoints, colors: newColors, count: targetCount };
}

/**
 * Create LOD (Level of Detail) levels for point cloud
 */
export function createLODLevels(
  data: PointCloudData,
  distances: number[] = [50, 100, 200, 500]
): LODLevel[] {
  const levels: LODLevel[] = [];

  // Full resolution for closest distance
  const firstDistance = distances[0] ?? 50;
  levels.push({
    distance: firstDistance,
    points: data.points,
    colors: data.colors,
    count: data.count,
  });

  // Create progressively downsampled levels
  const factors = [2, 4, 8, 16];

  for (let i = 1; i < distances.length && i <= factors.length; i++) {
    const factorIndex = i - 1;
    const factor = factors[factorIndex] ?? 2;
    const { points, colors, count } = downsample(
      data.points,
      data.colors,
      factor
    );

    const distance = distances[i] ?? 100;
    levels.push({
      distance,
      points,
      colors,
      count,
    });
  }

  return levels;
}

/**
 * Apply height-based coloring to points
 */
export function colorByHeight(
  points: Float32Array,
  bounds: { min: Point3D; max: Point3D }
): Float32Array {
  const count = points.length / 3;
  const colors = new Float32Array(count * 3);
  const minZ = bounds.min.z;
  const maxZ = bounds.max.z;
  const range = maxZ - minZ || 1;

  for (let i = 0; i < count; i++) {
    const z = points[i * 3 + 2] ?? 0;
    const normalized = Math.max(0, Math.min(1, (z - minZ) / range));

    // Interpolate through gradient
    let color: number[] = [0.5, 0.5, 0.5];
    for (let j = 0; j < HEIGHT_COLOR_GRADIENT.length - 1; j++) {
      const currentStop = HEIGHT_COLOR_GRADIENT[j];
      const nextStop = HEIGHT_COLOR_GRADIENT[j + 1];
      if (currentStop && nextStop &&
          normalized >= currentStop.stop &&
          normalized <= nextStop.stop) {
        const t = (normalized - currentStop.stop) /
                  (nextStop.stop - currentStop.stop);
        color = currentStop.color.map((c, idx) => {
          const nextColor = nextStop.color[idx] ?? c;
          return c + t * (nextColor - c);
        });
        break;
      }
    }

    colors[i * 3] = color[0] ?? 0.5;
    colors[i * 3 + 1] = color[1] ?? 0.5;
    colors[i * 3 + 2] = color[2] ?? 0.5;
  }

  return colors;
}

/**
 * Streaming loader for large files
 * Processes data in chunks to avoid blocking the main thread
 */
export class StreamingPointCloudLoader {
  private abortController: AbortController | null = null;
  // Reserved for future chunked processing
  // private chunkSize = 1024 * 1024; // 1MB chunks

  /**
   * Load point cloud from URL with progress tracking
   */
  async load(
    url: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<PointCloudData> {
    this.abortController = new AbortController();

    const response = await fetch(url, {
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to load point cloud: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (onProgress && total > 0) {
        onProgress(loaded, total);
      }
    }

    // Combine chunks into single buffer
    const buffer = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, position);
      position += chunk.length;
    }

    return parseLASBuffer(buffer.buffer);
  }

  /**
   * Cancel ongoing load
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

/**
 * Simple in-memory cache for loaded point clouds
 */
export class PointCloudCache {
  private cache = new Map<string, PointCloudData>();
  private maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }

  get(url: string): PointCloudData | undefined {
    return this.cache.get(url);
  }

  set(url: string, data: PointCloudData): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(url, data);
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
export const pointCloudCache = new PointCloudCache();

export default {
  parseLASBuffer,
  parseLASHeader,
  downsample,
  createLODLevels,
  colorByHeight,
  StreamingPointCloudLoader,
  PointCloudCache,
  pointCloudCache,
};
