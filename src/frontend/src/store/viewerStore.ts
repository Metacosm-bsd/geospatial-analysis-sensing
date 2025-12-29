import { create } from 'zustand';

// Types for measurements
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface DistanceMeasurement {
  id: string;
  type: 'distance';
  startPoint: Point3D;
  endPoint: Point3D;
  distance: number; // in meters
  label?: string;
  color: string;
  createdAt: Date;
}

export interface AreaMeasurement {
  id: string;
  type: 'area';
  points: Point3D[];
  area: number; // in square meters
  perimeter: number; // in meters
  label?: string;
  color: string;
  createdAt: Date;
}

export interface HeightMeasurement {
  id: string;
  type: 'height';
  basePoint: Point3D;
  topPoint: Point3D;
  height: number; // in meters
  label?: string;
  color: string;
  createdAt: Date;
}

export type Measurement = DistanceMeasurement | AreaMeasurement | HeightMeasurement;

export type MeasurementMode = 'none' | 'distance' | 'area' | 'height';

// Types for detected trees
export interface DetectedTree {
  id: string;
  position: Point3D;
  height: number;
  crownDiameter: number;
  dbh?: number;
  species?: string;
  confidence: number;
  selected?: boolean;
}

// Types for viewer settings
export interface ViewerSettings {
  pointSize: number;
  pointBudget: number;
  colorMode: 'rgb' | 'height' | 'intensity' | 'classification';
  showGrid: boolean;
  showAxes: boolean;
  showBoundingBox: boolean;
  showTreeMarkers: boolean;
  showMeasurements: boolean;
  backgroundColor: string;
  fieldOfView: number;
}

// Types for camera state
export interface CameraState {
  position: Point3D;
  target: Point3D;
  up: Point3D;
  zoom: number;
}

// Types for point cloud file
export interface ViewerFile {
  id: string;
  name: string;
  status: 'loading' | 'ready' | 'error';
  pointCount?: number;
  bounds?: {
    min: Point3D;
    max: Point3D;
  };
  error?: string;
}

// Status bar info
export interface StatusInfo {
  pointCount: number;
  fps: number;
  cursorPosition: Point3D | null;
  memoryUsage?: number;
  loadProgress?: number;
}

interface ViewerState {
  // Current file being viewed
  currentFile: ViewerFile | null;
  availableFiles: ViewerFile[];

  // Viewer settings
  settings: ViewerSettings;

  // Camera state
  cameraState: CameraState;

  // Detected trees
  detectedTrees: DetectedTree[];
  selectedTreeIds: string[];

  // Measurements
  measurements: Measurement[];
  measurementMode: MeasurementMode;
  activeMeasurementPoints: Point3D[];
  selectedMeasurementId: string | null;

  // Status
  statusInfo: StatusInfo;
  isLoading: boolean;
  error: string | null;

  // Actions - File management
  setCurrentFile: (file: ViewerFile | null) => void;
  setAvailableFiles: (files: ViewerFile[]) => void;
  updateFileStatus: (fileId: string, status: ViewerFile['status'], error?: string) => void;

  // Actions - Settings
  updateSettings: (settings: Partial<ViewerSettings>) => void;
  resetSettings: () => void;

  // Actions - Camera
  setCameraState: (state: Partial<CameraState>) => void;
  focusOnPoint: (point: Point3D) => void;
  focusOnTree: (treeId: string) => void;
  resetCamera: () => void;

  // Actions - Trees
  setDetectedTrees: (trees: DetectedTree[]) => void;
  selectTree: (treeId: string) => void;
  deselectTree: (treeId: string) => void;
  toggleTreeSelection: (treeId: string) => void;
  clearTreeSelection: () => void;

  // Actions - Measurements
  setMeasurementMode: (mode: MeasurementMode) => void;
  addMeasurementPoint: (point: Point3D) => void;
  completeMeasurement: () => void;
  cancelMeasurement: () => void;
  deleteMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  selectMeasurement: (id: string | null) => void;
  updateMeasurementLabel: (id: string, label: string) => void;

  // Actions - Status
  updateStatusInfo: (info: Partial<StatusInfo>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Actions - Export
  exportMeasurements: () => string;
}

// Default settings
const defaultSettings: ViewerSettings = {
  pointSize: 1.0,
  pointBudget: 1000000,
  colorMode: 'rgb',
  showGrid: true,
  showAxes: false,
  showBoundingBox: false,
  showTreeMarkers: true,
  showMeasurements: true,
  backgroundColor: '#1a1a2e',
  fieldOfView: 60,
};

// Default camera state
const defaultCameraState: CameraState = {
  position: { x: 50, y: 50, z: 50 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  zoom: 1,
};

// Default status info
const defaultStatusInfo: StatusInfo = {
  pointCount: 0,
  fps: 0,
  cursorPosition: null,
  memoryUsage: 0,
  loadProgress: 0,
};

// Utility functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateDistance(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function calculatePolygonArea(points: Point3D[]): number {
  if (points.length < 3) return 0;

  // Using the shoelace formula for 2D area (projecting to XY plane)
  // For more accurate 3D area, we'd need to calculate the actual surface area
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = points[i]!;
    const pj = points[j]!;
    area += pi.x * pj.y;
    area -= pj.x * pi.y;
  }

  return Math.abs(area / 2);
}

function calculatePolygonPerimeter(points: Point3D[]): number {
  if (points.length < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const pi = points[i]!;
    const pj = points[j]!;
    perimeter += calculateDistance(pi, pj);
  }

  return perimeter;
}

function getMeasurementColor(mode: MeasurementMode): string {
  switch (mode) {
    case 'distance':
      return '#00ff00'; // Green
    case 'area':
      return '#00ffff'; // Cyan
    case 'height':
      return '#ff00ff'; // Magenta
    default:
      return '#ffffff';
  }
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  // Initial state
  currentFile: null,
  availableFiles: [],
  settings: { ...defaultSettings },
  cameraState: { ...defaultCameraState },
  detectedTrees: [],
  selectedTreeIds: [],
  measurements: [],
  measurementMode: 'none',
  activeMeasurementPoints: [],
  selectedMeasurementId: null,
  statusInfo: { ...defaultStatusInfo },
  isLoading: false,
  error: null,

  // File management
  setCurrentFile: (file) => {
    set({ currentFile: file });
  },

  setAvailableFiles: (files) => {
    set({ availableFiles: files });
  },

  updateFileStatus: (fileId, status, errorMsg) => {
    set((state) => {
      const updatedFiles = state.availableFiles.map((f) =>
        f.id === fileId ? { ...f, status, ...(errorMsg !== undefined ? { error: errorMsg } : {}) } : f
      );
      const updatedCurrentFile = state.currentFile?.id === fileId
        ? { ...state.currentFile, status, ...(errorMsg !== undefined ? { error: errorMsg } : {}) }
        : state.currentFile;
      return {
        availableFiles: updatedFiles,
        currentFile: updatedCurrentFile,
      };
    });
  },

  // Settings
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },

  resetSettings: () => {
    set({ settings: { ...defaultSettings } });
  },

  // Camera
  setCameraState: (newState) => {
    set((state) => ({
      cameraState: { ...state.cameraState, ...newState },
    }));
  },

  focusOnPoint: (point) => {
    const offset = 20; // Distance from point
    set((state) => ({
      cameraState: {
        ...state.cameraState,
        position: { x: point.x + offset, y: point.y + offset, z: point.z + offset },
        target: point,
      },
    }));
  },

  focusOnTree: (treeId) => {
    const { detectedTrees, focusOnPoint } = get();
    const tree = detectedTrees.find((t) => t.id === treeId);
    if (tree) {
      focusOnPoint(tree.position);
    }
  },

  resetCamera: () => {
    set({ cameraState: { ...defaultCameraState } });
  },

  // Trees
  setDetectedTrees: (trees) => {
    set({ detectedTrees: trees, selectedTreeIds: [] });
  },

  selectTree: (treeId) => {
    set((state) => ({
      selectedTreeIds: state.selectedTreeIds.includes(treeId)
        ? state.selectedTreeIds
        : [...state.selectedTreeIds, treeId],
    }));
  },

  deselectTree: (treeId) => {
    set((state) => ({
      selectedTreeIds: state.selectedTreeIds.filter((id) => id !== treeId),
    }));
  },

  toggleTreeSelection: (treeId) => {
    set((state) => ({
      selectedTreeIds: state.selectedTreeIds.includes(treeId)
        ? state.selectedTreeIds.filter((id) => id !== treeId)
        : [...state.selectedTreeIds, treeId],
    }));
  },

  clearTreeSelection: () => {
    set({ selectedTreeIds: [] });
  },

  // Measurements
  setMeasurementMode: (mode) => {
    set({
      measurementMode: mode,
      activeMeasurementPoints: [],
    });
  },

  addMeasurementPoint: (point) => {
    const { measurementMode, activeMeasurementPoints, completeMeasurement } = get();

    if (measurementMode === 'none') return;

    const newPoints = [...activeMeasurementPoints, point];
    set({ activeMeasurementPoints: newPoints });

    // Auto-complete based on mode
    if (measurementMode === 'distance' && newPoints.length === 2) {
      completeMeasurement();
    } else if (measurementMode === 'height' && newPoints.length === 2) {
      completeMeasurement();
    }
    // Area measurement requires manual completion or a minimum of 3 points
  },

  completeMeasurement: () => {
    const { measurementMode, activeMeasurementPoints, measurements } = get();

    if (measurementMode === 'none') return;

    const color = getMeasurementColor(measurementMode);
    const now = new Date();

    let newMeasurement: Measurement | null = null;

    if (measurementMode === 'distance' && activeMeasurementPoints.length >= 2) {
      const startPoint = activeMeasurementPoints[0]!;
      const endPoint = activeMeasurementPoints[1]!;
      newMeasurement = {
        id: generateId(),
        type: 'distance',
        startPoint,
        endPoint,
        distance: calculateDistance(startPoint, endPoint),
        color,
        createdAt: now,
      };
    } else if (measurementMode === 'area' && activeMeasurementPoints.length >= 3) {
      newMeasurement = {
        id: generateId(),
        type: 'area',
        points: [...activeMeasurementPoints],
        area: calculatePolygonArea(activeMeasurementPoints),
        perimeter: calculatePolygonPerimeter(activeMeasurementPoints),
        color,
        createdAt: now,
      };
    } else if (measurementMode === 'height' && activeMeasurementPoints.length >= 2) {
      const basePoint = activeMeasurementPoints[0]!;
      const secondPoint = activeMeasurementPoints[1]!;
      const topPoint = {
        x: basePoint.x,
        y: basePoint.y,
        z: secondPoint.z,
      };
      newMeasurement = {
        id: generateId(),
        type: 'height',
        basePoint,
        topPoint,
        height: Math.abs(topPoint.z - basePoint.z),
        color,
        createdAt: now,
      };
    }

    if (newMeasurement) {
      set({
        measurements: [...measurements, newMeasurement],
        activeMeasurementPoints: [],
      });
    }
  },

  cancelMeasurement: () => {
    set({
      activeMeasurementPoints: [],
    });
  },

  deleteMeasurement: (id) => {
    set((state) => ({
      measurements: state.measurements.filter((m) => m.id !== id),
      selectedMeasurementId:
        state.selectedMeasurementId === id ? null : state.selectedMeasurementId,
    }));
  },

  clearMeasurements: () => {
    set({
      measurements: [],
      activeMeasurementPoints: [],
      selectedMeasurementId: null,
    });
  },

  selectMeasurement: (id) => {
    set({ selectedMeasurementId: id });
  },

  updateMeasurementLabel: (id, label) => {
    set((state) => ({
      measurements: state.measurements.map((m) =>
        m.id === id ? { ...m, label } : m
      ),
    }));
  },

  // Status
  updateStatusInfo: (info) => {
    set((state) => ({
      statusInfo: { ...state.statusInfo, ...info },
    }));
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setError: (error) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },

  // Export
  exportMeasurements: () => {
    const { measurements } = get();

    const exportData = {
      exportedAt: new Date().toISOString(),
      measurementCount: measurements.length,
      measurements: measurements.map((m) => {
        if (m.type === 'distance') {
          return {
            id: m.id,
            type: m.type,
            startPoint: m.startPoint,
            endPoint: m.endPoint,
            distanceMeters: m.distance,
            label: m.label,
            createdAt: m.createdAt.toISOString(),
          };
        } else if (m.type === 'area') {
          return {
            id: m.id,
            type: m.type,
            points: m.points,
            areaSquareMeters: m.area,
            perimeterMeters: m.perimeter,
            label: m.label,
            createdAt: m.createdAt.toISOString(),
          };
        } else {
          return {
            id: m.id,
            type: m.type,
            basePoint: m.basePoint,
            topPoint: m.topPoint,
            heightMeters: m.height,
            label: m.label,
            createdAt: m.createdAt.toISOString(),
          };
        }
      }),
    };

    return JSON.stringify(exportData, null, 2);
  },
}));
