/**
 * PointCloudViewer Component Exports
 * Sprint 9-10: Core 3D visualization infrastructure
 */

// Core viewer components
export { PointCloudViewer } from './PointCloudViewer';
export { PointCloudPoints } from './PointCloudPoints';
export { CameraControls } from './CameraControls';
export type { CameraControlsHandle } from './CameraControls';
export { ViewerToolbar } from './ViewerToolbar';

// Data loading utilities
export {
  parseLASBuffer,
  parseLASHeader,
  downsample,
  createLODLevels,
  colorByHeight,
  StreamingPointCloudLoader,
  PointCloudCache,
  pointCloudCache,
} from './PointCloudLoader';

// React hooks
export { usePointCloudLoader, usePointCloudFileLoader } from './usePointCloudLoader';

// Types
export type {
  Point3D,
  PointCloudData,
  LODLevel,
  ViewerSettings,
  PointCloudViewerProps,
  LoaderProgress,
  UsePointCloudLoaderResult,
  CameraControlsProps,
  ViewerToolbarProps,
  LASHeader,
  PointCloudBounds,
  ColorScale,
  DetectedTree,
  TreeMarkerOptions,
  SelectionState,
  TreeInfoData,
  GridConfig,
  CompassConfig,
  ScaleBarConfig,
  CameraState,
  SpeciesColorPalette,
  ColorScaleDefinition,
  OnTreeSelect,
  OnTreeHover,
  OnMultiSelect,
  OnSelectionChange,
} from './types';

// Classification and color constants
export {
  LAS_CLASSIFICATION_COLORS,
  HEIGHT_COLOR_GRADIENT,
  ASPRSClassification,
  DEFAULT_SPECIES_COLORS,
} from './types';

// Colorizers
export {
  generateHeightColors,
  generateColorLUT,
  getColorScaleGradient,
  calculateBounds,
  getAvailableColorScales,
  getColorScaleDefinition,
  createCustomColorScale,
} from './HeightColorizer';
export {
  getClassificationColor,
  generateClassificationColors,
  getClassificationLegend,
  getVegetationLegend,
  hexToRgb,
  countByClassification,
  getClassificationStats,
  createCustomClassificationColorMap,
  generateCustomClassificationColors,
} from './ClassificationColorizer';

// Measurement tools
export { MeasurementTools } from './MeasurementTools';
export { MeasurementLine, MeasurementLinePreview } from './MeasurementLine';
export { MeasurementPolygon, MeasurementPolygonPreview } from './MeasurementPolygon';

// Tree visualization
export { TreeMarkers } from './TreeMarkers';
export { TreeInfoPopup, useTreeInfoPopup } from './TreeInfoPopup';
export {
  SelectionManager,
  useSelection,
  useSelectionState,
  RaycasterSelector,
  SelectionHighlight,
} from './SelectionManager';

// Grid and reference helpers
export {
  GridHelper,
  InfiniteGrid,
  AxisHelper,
  MeasurementGrid,
  DEFAULT_GRID_CONFIG,
} from './GridHelper';

// Navigation aids
export {
  CompassRose,
  CompassRose3D,
  MiniCompass,
  useCameraHeading,
  DEFAULT_COMPASS_CONFIG,
} from './CompassRose';

export {
  ScaleBar,
  StandaloneScaleBar,
  ElevationScaleBar,
  useScaleBar,
  DEFAULT_SCALE_BAR_CONFIG,
} from './ScaleBar';
