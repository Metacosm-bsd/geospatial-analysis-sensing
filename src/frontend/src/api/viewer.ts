import apiClient, { getErrorMessage } from './client';
import type { Point3D, DetectedTree } from '../store/viewerStore';

// Types for point cloud data
export interface PointCloudMetadata {
  pointCount: number;
  bounds: {
    min: Point3D;
    max: Point3D;
  };
  hasColor: boolean;
  hasIntensity: boolean;
  hasClassification: boolean;
  coordinateSystem?: string;
  density?: number; // points per square meter
}

export interface PointCloudChunk {
  positions: Float32Array;
  colors: Uint8Array | undefined;
  intensities?: Float32Array | undefined;
  classifications?: Uint8Array | undefined;
  chunkIndex: number;
  totalChunks: number;
  pointCount: number;
}

export interface PointCloudLoadOptions {
  lodLevel?: number; // Level of detail (0 = full, higher = less detail)
  maxPoints?: number; // Maximum points to load
  bounds?: {
    // Optional bounding box filter
    min: Point3D;
    max: Point3D;
  };
  includeColor?: boolean;
  includeIntensity?: boolean;
  includeClassification?: boolean;
}

export interface StreamingOptions extends PointCloudLoadOptions {
  chunkSize?: number; // Points per chunk
  onProgress?: (loaded: number, total: number) => void;
  onChunk?: (chunk: PointCloudChunk) => void;
}

export interface TreeDetectionResult {
  trees: DetectedTree[];
  totalCount: number;
  averageHeight: number;
  maxHeight: number;
  minHeight: number;
  coverageArea?: number;
}

// Parsed point cloud data structure
interface ParsedPointCloudData {
  metadata: PointCloudMetadata;
  positions: Float32Array;
  colors: Uint8Array | undefined;
  intensities: Float32Array | undefined;
  classifications: Uint8Array | undefined;
}

// Get point cloud metadata without loading all points
export async function getPointCloudMetadata(fileId: string): Promise<PointCloudMetadata> {
  try {
    const response = await apiClient.get<PointCloudMetadata>(
      `/files/${fileId}/pointcloud/metadata`
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Get point cloud data with options
export async function getPointCloudData(
  fileId: string,
  options: PointCloudLoadOptions = {}
): Promise<ParsedPointCloudData> {
  try {
    const params = new URLSearchParams();

    if (options.lodLevel !== undefined) {
      params.append('lodLevel', String(options.lodLevel));
    }
    if (options.maxPoints !== undefined) {
      params.append('maxPoints', String(options.maxPoints));
    }
    if (options.bounds) {
      params.append('boundsMin', `${options.bounds.min.x},${options.bounds.min.y},${options.bounds.min.z}`);
      params.append('boundsMax', `${options.bounds.max.x},${options.bounds.max.y},${options.bounds.max.z}`);
    }
    if (options.includeColor !== undefined) {
      params.append('includeColor', String(options.includeColor));
    }
    if (options.includeIntensity !== undefined) {
      params.append('includeIntensity', String(options.includeIntensity));
    }
    if (options.includeClassification !== undefined) {
      params.append('includeClassification', String(options.includeClassification));
    }

    const response = await apiClient.get(`/files/${fileId}/pointcloud/data`, {
      params,
      responseType: 'arraybuffer',
    });

    // Parse the binary response
    return parsePointCloudResponse(response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Stream point cloud data for large files
export async function streamPointCloudData(
  fileId: string,
  options: StreamingOptions = {}
): Promise<void> {
  const { chunkSize = 100000, onProgress, onChunk, ...loadOptions } = options;

  try {
    // First get metadata to know total points
    const metadata = await getPointCloudMetadata(fileId);
    const totalPoints = loadOptions.maxPoints
      ? Math.min(metadata.pointCount, loadOptions.maxPoints)
      : metadata.pointCount;
    const totalChunks = Math.ceil(totalPoints / chunkSize);

    let loadedPoints = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const offset = chunkIndex * chunkSize;
      const limit = Math.min(chunkSize, totalPoints - offset);

      const params = new URLSearchParams();
      params.append('offset', String(offset));
      params.append('limit', String(limit));

      if (loadOptions.lodLevel !== undefined) {
        params.append('lodLevel', String(loadOptions.lodLevel));
      }
      if (loadOptions.bounds) {
        params.append(
          'boundsMin',
          `${loadOptions.bounds.min.x},${loadOptions.bounds.min.y},${loadOptions.bounds.min.z}`
        );
        params.append(
          'boundsMax',
          `${loadOptions.bounds.max.x},${loadOptions.bounds.max.y},${loadOptions.bounds.max.z}`
        );
      }

      const response = await apiClient.get(`/files/${fileId}/pointcloud/stream`, {
        params,
        responseType: 'arraybuffer',
      });

      const chunkData = parseChunkResponse(response.data, chunkIndex, totalChunks);

      loadedPoints += chunkData.pointCount;

      if (onChunk) {
        onChunk(chunkData);
      }

      if (onProgress) {
        onProgress(loadedPoints, totalPoints);
      }
    }
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Get detected trees from analysis results
export async function getDetectedTrees(analysisId: string): Promise<TreeDetectionResult> {
  try {
    const response = await apiClient.get<TreeDetectionResult>(
      `/analyses/${analysisId}/trees`
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Get trees for a specific file (if pre-computed)
export async function getTreesForFile(fileId: string): Promise<TreeDetectionResult | null> {
  try {
    const response = await apiClient.get<TreeDetectionResult>(
      `/files/${fileId}/trees`
    );
    return response.data;
  } catch (error) {
    // Trees might not be available for this file
    console.warn('No tree data available for file:', fileId);
    return null;
  }
}

// Get download URL for point cloud visualization
export async function getPointCloudUrl(fileId: string): Promise<string> {
  try {
    const response = await apiClient.get<{ url: string }>(
      `/files/${fileId}/pointcloud/url`
    );
    return response.data.url;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// Helper function to parse binary point cloud response
function parsePointCloudResponse(buffer: ArrayBuffer): ParsedPointCloudData {
  const view = new DataView(buffer);
  let offset = 0;

  // Read header
  const pointCount = view.getUint32(offset, true);
  offset += 4;

  const hasColor = view.getUint8(offset) === 1;
  offset += 1;

  const hasIntensity = view.getUint8(offset) === 1;
  offset += 1;

  const hasClassification = view.getUint8(offset) === 1;
  offset += 1;

  // Read bounds
  const minX = view.getFloat32(offset, true);
  offset += 4;
  const minY = view.getFloat32(offset, true);
  offset += 4;
  const minZ = view.getFloat32(offset, true);
  offset += 4;
  const maxX = view.getFloat32(offset, true);
  offset += 4;
  const maxY = view.getFloat32(offset, true);
  offset += 4;
  const maxZ = view.getFloat32(offset, true);
  offset += 4;

  // Read positions
  const positions = new Float32Array(buffer, offset, pointCount * 3);
  offset += pointCount * 3 * 4;

  // Read optional attributes
  let colors: Uint8Array | undefined;
  let intensities: Float32Array | undefined;
  let classifications: Uint8Array | undefined;

  if (hasColor) {
    colors = new Uint8Array(buffer, offset, pointCount * 3);
    offset += pointCount * 3;
  }

  if (hasIntensity) {
    intensities = new Float32Array(buffer, offset, pointCount);
    offset += pointCount * 4;
  }

  if (hasClassification) {
    classifications = new Uint8Array(buffer, offset, pointCount);
  }

  return {
    metadata: {
      pointCount,
      bounds: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
      },
      hasColor,
      hasIntensity,
      hasClassification,
    },
    positions,
    colors,
    intensities,
    classifications,
  };
}

// Helper function to parse streaming chunk response
function parseChunkResponse(
  buffer: ArrayBuffer,
  chunkIndex: number,
  totalChunks: number
): PointCloudChunk {
  const view = new DataView(buffer);
  let offset = 0;

  // Read chunk header
  const pointCount = view.getUint32(offset, true);
  offset += 4;

  const hasColor = view.getUint8(offset) === 1;
  offset += 1;

  // Read positions
  const positions = new Float32Array(buffer, offset, pointCount * 3);
  offset += pointCount * 3 * 4;

  // Read optional colors
  let colors: Uint8Array | undefined;
  if (hasColor) {
    colors = new Uint8Array(buffer, offset, pointCount * 3);
  }

  return {
    positions,
    colors,
    chunkIndex,
    totalChunks,
    pointCount,
  };
}

