/**
 * Types for PointCloudViewer components
 * Sprint 9-10: 3D Visualization Features
 */

import { Vector3 } from 'three';

// Core point cloud data types
export interface Point3D {
  x: number;
  y: number;
  z: number;
  intensity?: number;
  classification?: number;
  returnNumber?: number;
}

export interface PointCloudData {
  points: Float32Array; // x,y,z interleaved
  colors: Float32Array; // r,g,b interleaved
  count: number;
  bounds: {
    min: Point3D;
    max: Point3D;
  };
  metadata?: Record<string, unknown>;
}

export interface LODLevel {
  distance: number;
  points: Float32Array;
  colors: Float32Array;
  count: number;
}

export interface ViewerSettings {
  pointSize: number;
  colorMode: 'height' | 'intensity' | 'classification' | 'rgb';
  showGrid: boolean;
  showAxes: boolean;
  backgroundColor: string;
}

export interface PointCloudViewerProps {
  pointCloudData?: PointCloudData;
  settings?: Partial<ViewerSettings>;
  onSettingsChange?: (settings: ViewerSettings) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export interface LoaderProgress {
  loaded: number;
  total: number;
  percentage: number;
  stage: 'downloading' | 'parsing' | 'processing' | 'complete';
}

export interface UsePointCloudLoaderResult {
  data: PointCloudData | null;
  isLoading: boolean;
  progress: LoaderProgress | null;
  error: Error | null;
  load: (url: string) => Promise<void>;
  cancel: () => void;
}

export interface CameraControlsProps {
  bounds?: { min: Point3D; max: Point3D };
  enableFirstPerson?: boolean;
  onResetView?: () => void;
}

export interface ViewerToolbarProps {
  settings: ViewerSettings;
  onSettingsChange: (settings: ViewerSettings) => void;
  onResetView: () => void;
  onToggleFullscreen: () => void;
  isFullscreen?: boolean;
}

// LAS file format types
export interface LASHeader {
  fileSignature: string;
  versionMajor: number;
  versionMinor: number;
  pointDataFormat: number;
  pointDataRecordLength: number;
  numberOfPoints: number;
  xScale: number;
  yScale: number;
  zScale: number;
  xOffset: number;
  yOffset: number;
  zOffset: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  offsetToPointData: number;
}

// Classification colors for visualization
export const LAS_CLASSIFICATION_COLORS: Record<number, [number, number, number]> = {
  0: [0.5, 0.5, 0.5],    // Created, never classified
  1: [0.5, 0.5, 0.5],    // Unclassified
  2: [0.6, 0.4, 0.2],    // Ground
  3: [0.2, 0.6, 0.2],    // Low vegetation
  4: [0.3, 0.8, 0.3],    // Medium vegetation
  5: [0.1, 0.5, 0.1],    // High vegetation
  6: [0.8, 0.2, 0.2],    // Building
  7: [0.4, 0.4, 0.4],    // Low point (noise)
  8: [0.7, 0.7, 0.7],    // Model key-point
  9: [0.3, 0.3, 0.8],    // Water
  10: [0.9, 0.9, 0.9],   // Rail
  11: [0.6, 0.6, 0.6],   // Road surface
  12: [0.8, 0.8, 0.8],   // Reserved
  13: [0.7, 0.5, 0.3],   // Wire - guard
  14: [0.7, 0.4, 0.2],   // Wire - conductor
  15: [0.6, 0.3, 0.1],   // Transmission tower
  16: [0.5, 0.5, 0.2],   // Wire - connector
  17: [0.4, 0.6, 0.8],   // Bridge deck
  18: [0.5, 0.5, 0.5],   // High noise
};

// Height-based color gradient
export const HEIGHT_COLOR_GRADIENT = [
  { stop: 0.0, color: [0.0, 0.0, 0.5] },   // Deep blue
  { stop: 0.2, color: [0.0, 0.5, 1.0] },   // Light blue
  { stop: 0.4, color: [0.0, 1.0, 0.5] },   // Cyan-green
  { stop: 0.6, color: [0.5, 1.0, 0.0] },   // Yellow-green
  { stop: 0.8, color: [1.0, 0.5, 0.0] },   // Orange
  { stop: 1.0, color: [1.0, 0.0, 0.0] },   // Red
];

// Color scale types for height-based coloring
export type ColorScale = 'viridis' | 'plasma' | 'terrain' | 'forest';

// Bounds for point cloud data
export interface PointCloudBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

// ASPRS LiDAR classification codes
export enum ASPRSClassification {
  Created = 0,
  Unclassified = 1,
  Ground = 2,
  LowVegetation = 3,
  MediumVegetation = 4,
  HighVegetation = 5,
  Building = 6,
  LowPoint = 7,
  Water = 9,
  Rail = 10,
  RoadSurface = 11,
  WireGuard = 13,
  WireConductor = 14,
  TransmissionTower = 15,
  WireStructureConnector = 16,
  BridgeDeck = 17,
  HighNoise = 18,
}

// Tree data structure
export interface DetectedTree {
  id: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  height: number;
  dbh?: number; // Diameter at breast height (cm)
  crownDiameter?: number;
  species?: string;
  speciesConfidence?: number;
  biomass?: number; // kg
  carbonStock?: number; // kg CO2e
  crown?: {
    area: number;
    volume?: number;
  };
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// Tree marker display options
export interface TreeMarkerOptions {
  markerType: 'cylinder' | 'billboard' | 'cone' | 'sphere';
  colorBy: 'species' | 'height' | 'biomass' | 'dbh' | 'uniform';
  uniformColor?: string;
  scale: number;
  showLabels: boolean;
  labelField?: keyof DetectedTree;
  opacity: number;
}

// Selection state
export interface SelectionState {
  selectedTreeIds: Set<string>;
  selectedPointIndices: Set<number>;
  selectionMode: 'single' | 'box' | 'lasso';
  isSelecting: boolean;
  selectionStart?: { x: number; y: number };
  selectionEnd?: { x: number; y: number };
}

// Tree info for popup display
export interface TreeInfoData {
  tree: DetectedTree;
  screenPosition: { x: number; y: number };
  worldPosition: Vector3;
}

// Grid configuration
export interface GridConfig {
  size: number;
  divisions: number;
  showLabels: boolean;
  visible: boolean;
  color: string;
  opacity: number;
  labelUnit: 'meters' | 'feet';
}

// Compass configuration
export interface CompassConfig {
  visible: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number;
}

// Scale bar configuration
export interface ScaleBarConfig {
  visible: boolean;
  position: 'bottom-left' | 'bottom-right';
  unit: 'meters' | 'feet' | 'auto';
  maxWidth: number;
}

// Camera state for scale calculations
export interface CameraState {
  position: Vector3;
  target: Vector3;
  zoom: number;
  fov: number;
  distance: number;
}

// Color palette for species
export interface SpeciesColorPalette {
  [species: string]: string;
}

// Default species colors
export const DEFAULT_SPECIES_COLORS: SpeciesColorPalette = {
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
  'Unknown': '#9E9E9E',
};

// Height color scales (normalized 0-1 input)
export interface ColorScaleDefinition {
  name: ColorScale;
  stops: Array<{ position: number; color: [number, number, number] }>;
}

// Callback types
export type OnTreeSelect = (tree: DetectedTree | null) => void;
export type OnTreeHover = (tree: DetectedTree | null) => void;
export type OnMultiSelect = (trees: DetectedTree[]) => void;
export type OnSelectionChange = (state: SelectionState) => void;

// Component props interfaces
export interface HeightColorizerProps {
  points: Float32Array;
  bounds: PointCloudBounds;
  colorScale: ColorScale;
}

export interface ClassificationColorizerProps {
  points: Float32Array;
  classifications: Uint8Array;
}

export interface TreeMarkersProps {
  trees: DetectedTree[];
  options: TreeMarkerOptions;
  selectedIds?: Set<string>;
  hoveredId?: string | null;
  onSelect?: OnTreeSelect;
  onHover?: OnTreeHover;
}

export interface TreeInfoPopupProps {
  tree: DetectedTree | null;
  screenPosition: { x: number; y: number } | null;
  onClose: () => void;
}

export interface SelectionManagerProps {
  trees: DetectedTree[];
  enabled: boolean;
  mode: 'single' | 'box' | 'lasso';
  onSelectionChange: OnSelectionChange;
  children?: React.ReactNode;
}

export interface GridHelperProps {
  config: GridConfig;
}

export interface CompassRoseProps {
  config: CompassConfig;
}

export interface ScaleBarProps {
  config: ScaleBarConfig;
  cameraState: CameraState;
}
