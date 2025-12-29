import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Stats } from '@react-three/drei';
import * as THREE from 'three';
import {
  useViewerStore,
  Point3D,
  DetectedTree,
  ViewerSettings,
} from '../store/viewerStore';
import { useProjectStore } from '../store/projectStore';
import { useSpeciesStore } from '../store/speciesStore';
import {
  MeasurementTools,
  MeasurementLine,
  MeasurementLinePreview,
  MeasurementPolygon,
  MeasurementPolygonPreview,
} from '../components/PointCloudViewer';
import { SpeciesFilter } from '../components/Species/SpeciesFilter';
import { getSpeciesName, getSpeciesColor } from '../components/Species/speciesColors';

// Loading spinner
function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <svg
        className="animate-spin h-10 w-10 text-forest-600 mb-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className="text-gray-500">{message}</p>
    </div>
  );
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Status bar component
interface StatusBarProps {
  pointCount: number;
  fps: number;
  cursorPosition: Point3D | null;
  memoryUsage?: number;
  loadProgress?: number;
}

function StatusBar({
  pointCount,
  fps,
  cursorPosition,
  memoryUsage,
  loadProgress,
}: StatusBarProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gray-900 bg-opacity-90 text-white text-xs flex items-center px-4 gap-6 z-10">
      <div className="flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        <span>{pointCount.toLocaleString()} points</span>
      </div>

      <div className="flex items-center gap-1">
        <span
          className={`w-2 h-2 rounded-full ${
            fps >= 30 ? 'bg-green-500' : fps >= 15 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
        />
        <span>{fps} FPS</span>
      </div>

      {cursorPosition && (
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span>
            X: {cursorPosition.x.toFixed(2)}, Y: {cursorPosition.y.toFixed(2)}, Z:{' '}
            {cursorPosition.z.toFixed(2)}
          </span>
        </div>
      )}

      {memoryUsage !== undefined && (
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span>{memoryUsage.toFixed(0)} MB</span>
        </div>
      )}

      {loadProgress !== undefined && loadProgress < 100 && (
        <div className="flex items-center gap-2 ml-auto">
          <span>Loading: {loadProgress.toFixed(0)}%</span>
          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-forest-500 transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Toolbar component
interface ToolbarProps {
  settings: ViewerSettings;
  onSettingsChange: (settings: Partial<ViewerSettings>) => void;
  onResetCamera: () => void;
  onExportMeasurements: () => void;
  measurementCount: number;
}

function Toolbar({
  settings,
  onSettingsChange,
  onResetCamera,
  onExportMeasurements,
  measurementCount,
}: ToolbarProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="absolute top-0 left-0 right-0 h-12 bg-gray-900 bg-opacity-90 text-white flex items-center px-4 gap-2 z-10">
      {/* View controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onResetCamera}
          className="p-2 hover:bg-gray-700 rounded transition-colors"
          title="Reset Camera"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </button>

        <div className="w-px h-6 bg-gray-600 mx-2" />

        <button
          onClick={() => onSettingsChange({ showGrid: !settings.showGrid })}
          className={`p-2 rounded transition-colors ${
            settings.showGrid ? 'bg-forest-600' : 'hover:bg-gray-700'
          }`}
          title="Toggle Grid"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 9h16M4 13h16M9 4v16M13 4v16"
            />
          </svg>
        </button>

        <button
          onClick={() => onSettingsChange({ showTreeMarkers: !settings.showTreeMarkers })}
          className={`p-2 rounded transition-colors ${
            settings.showTreeMarkers ? 'bg-forest-600' : 'hover:bg-gray-700'
          }`}
          title="Toggle Tree Markers"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
        </button>

        <button
          onClick={() => onSettingsChange({ showMeasurements: !settings.showMeasurements })}
          className={`p-2 rounded transition-colors ${
            settings.showMeasurements ? 'bg-forest-600' : 'hover:bg-gray-700'
          }`}
          title="Toggle Measurements"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      <div className="w-px h-6 bg-gray-600 mx-2" />

      {/* Color mode */}
      <select
        value={settings.colorMode}
        onChange={(e) => onSettingsChange({ colorMode: e.target.value as ViewerSettings['colorMode'] })}
        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
      >
        <option value="rgb">RGB Colors</option>
        <option value="height">Height</option>
        <option value="intensity">Intensity</option>
        <option value="classification">Classification</option>
      </select>

      {/* Point size slider */}
      <div className="flex items-center gap-2 ml-4">
        <span className="text-xs text-gray-400">Size:</span>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          value={settings.pointSize}
          onChange={(e) => onSettingsChange({ pointSize: parseFloat(e.target.value) })}
          className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-xs w-4">{settings.pointSize}</span>
      </div>

      <div className="flex-1" />

      {/* Settings button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className={`p-2 rounded transition-colors ${
          showSettings ? 'bg-forest-600' : 'hover:bg-gray-700'
        }`}
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Export measurements */}
      {measurementCount > 0 && (
        <button
          onClick={onExportMeasurements}
          className="p-2 hover:bg-gray-700 rounded transition-colors"
          title="Export Measurements"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// File list panel item
interface FileItemProps {
  file: { id: string; name: string; size: number; status: string };
  selected: boolean;
  onSelect: () => void;
}

function FileItem({ file, selected, onSelect }: FileItemProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-2 rounded transition-colors ${
        selected ? 'bg-forest-100 border-l-4 border-forest-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
          <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
        </div>
        {file.status === 'ready' && (
          <div className="w-2 h-2 rounded-full bg-green-500" title="Ready" />
        )}
      </div>
    </button>
  );
}

// Tree list panel item
interface TreeItemProps {
  tree: DetectedTree;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
}

function TreeItem({ tree, selected, onSelect, onFocus }: TreeItemProps) {
  const speciesColor = tree.species ? getSpeciesColor(tree.species) : '#9E9E9E';
  const speciesName = tree.species ? getSpeciesName(tree.species) : `Tree ${tree.id.slice(0, 6)}`;

  return (
    <button
      onClick={onSelect}
      onDoubleClick={onFocus}
      className={`w-full text-left p-2 rounded transition-colors ${
        selected ? 'bg-forest-100 border-l-4 border-forest-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${speciesColor}20` }}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: speciesColor }}
            />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">
              {speciesName}
            </div>
            <div className="text-xs text-gray-500">
              H: {tree.height.toFixed(1)}m, D: {tree.crownDiameter.toFixed(1)}m
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-400">{(tree.confidence * 100).toFixed(0)}%</div>
      </div>
    </button>
  );
}

// 3D Scene component with point cloud rendering
interface SceneProps {
  settings: ViewerSettings;
}

function Scene({ settings }: SceneProps) {
  const {
    measurements,
    measurementMode,
    activeMeasurementPoints,
    selectedMeasurementId,
    selectMeasurement,
    deleteMeasurement,
    addMeasurementPoint,
    updateStatusInfo,
  } = useViewerStore();

  // We use useThree for potential future camera/renderer access
  useThree();
  const [cursorPosition, setCursorPosition] = useState<Point3D | null>(null);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  // Calculate FPS
  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    if (now - lastTime.current >= 1000) {
      updateStatusInfo({
        fps: frameCount.current,
        cursorPosition,
      });
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  // Handle click for measurements
  const handleClick = useCallback(
    (e: THREE.Event) => {
      if (measurementMode === 'none') return;

      // Get intersection point - for now using a simple plane intersection
      // In a real implementation, you'd raycast against the point cloud
      const point = (e as unknown as { point: THREE.Vector3 }).point;
      if (point) {
        addMeasurementPoint({
          x: point.x,
          y: point.y,
          z: point.z,
        });
      }
    },
    [measurementMode, addMeasurementPoint]
  );

  // Handle pointer move for cursor position
  const handlePointerMove = useCallback((e: THREE.Event) => {
    const point = (e as unknown as { point: THREE.Vector3 }).point;
    if (point) {
      setCursorPosition({ x: point.x, y: point.y, z: point.z });
    }
  }, []);

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[50, 50, 50]} fov={settings.fieldOfView} />
      <OrbitControls enableDamping dampingFactor={0.05} />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />

      {/* Grid */}
      {settings.showGrid && (
        <Grid
          position={[0, 0, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#444444"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#666666"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      {/* Ground plane for measurement clicks */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        visible={false}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Demo point cloud placeholder */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(
              Array.from({ length: 3000 }, () => (Math.random() - 0.5) * 50)
            ), 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[new Float32Array(
              Array.from({ length: 3000 }, () => Math.random())
            ), 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={settings.pointSize * 0.1}
          vertexColors
          sizeAttenuation
        />
      </points>

      {/* Render measurements */}
      {settings.showMeasurements && (
        <>
          {measurements.map((m) => {
            if (m.type === 'distance' || m.type === 'height') {
              return (
                <MeasurementLine
                  key={m.id}
                  measurement={m}
                  selected={selectedMeasurementId === m.id}
                  onSelect={() => selectMeasurement(m.id)}
                  onDelete={() => deleteMeasurement(m.id)}
                />
              );
            } else if (m.type === 'area') {
              return (
                <MeasurementPolygon
                  key={m.id}
                  measurement={m}
                  selected={selectedMeasurementId === m.id}
                  onSelect={() => selectMeasurement(m.id)}
                  onDelete={() => deleteMeasurement(m.id)}
                />
              );
            }
            return null;
          })}

          {/* Active measurement preview */}
          {measurementMode === 'distance' && activeMeasurementPoints.length === 1 && cursorPosition && activeMeasurementPoints[0] && (
            <MeasurementLinePreview
              startPoint={activeMeasurementPoints[0]}
              endPoint={cursorPosition}
              type="distance"
            />
          )}

          {measurementMode === 'height' && activeMeasurementPoints.length === 1 && cursorPosition && activeMeasurementPoints[0] && (
            <MeasurementLinePreview
              startPoint={activeMeasurementPoints[0]}
              endPoint={cursorPosition}
              type="height"
            />
          )}

          {measurementMode === 'area' && activeMeasurementPoints.length > 0 && (
            <MeasurementPolygonPreview
              points={activeMeasurementPoints}
              cursorPosition={cursorPosition}
            />
          )}
        </>
      )}

      {/* Performance stats in development */}
      {import.meta.env.DEV && <Stats />}
    </>
  );
}

// Main Viewer page component
export function Viewer() {
  const { id: projectId, fileId } = useParams<{ id: string; fileId?: string }>();
  const navigate = useNavigate();

  const {
    currentProject,
    projectFiles,
    fetchProject,
    fetchProjectFiles,
    isLoadingCurrentProject,
    isLoadingFiles,
  } = useProjectStore();

  const {
    settings,
    updateSettings,
    resetCamera,
    measurements,
    detectedTrees,
    selectedTreeIds,
    toggleTreeSelection,
    focusOnTree,
    statusInfo,
    exportMeasurements,
    error,
    setCurrentFile,
    availableFiles,
    setAvailableFiles,
    currentFile,
  } = useViewerStore();

  const [activePanel, setActivePanel] = useState<'files' | 'trees' | 'species' | 'measurements'>('files');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(fileId || null);

  // Sprint 15-16: Species store integration
  const {
    speciesBreakdown,
    selectedSpeciesFilter,
    setSelectedSpeciesFilter,
  } = useSpeciesStore();

  // Fetch project and files on mount
  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      fetchProjectFiles(projectId);
    }
  }, [projectId, fetchProject, fetchProjectFiles]);

  // Update available files when project files load
  useEffect(() => {
    if (projectFiles.length > 0) {
      const viewerFiles = projectFiles
        .filter((f) => f.status === 'ready' && (f.fileType === 'las' || f.fileType === 'laz'))
        .map((f) => ({
          id: f.id,
          name: f.originalName,
          size: f.size,
          status: f.status,
        }));
      setAvailableFiles(
        viewerFiles.map((f) => ({
          id: f.id,
          name: f.name,
          status: 'ready' as const,
        }))
      );

      // Auto-select first file if none selected
      if (!selectedFileId && viewerFiles.length > 0 && viewerFiles[0]) {
        setSelectedFileId(viewerFiles[0].id);
      }
    }
  }, [projectFiles, selectedFileId, setAvailableFiles]);

  // Handle file selection
  const handleFileSelect = useCallback(
    (fileId: string) => {
      setSelectedFileId(fileId);
      const file = availableFiles.find((f) => f.id === fileId);
      if (file) {
        setCurrentFile(file);
      }
      // Update URL
      navigate(`/projects/${projectId}/viewer/${fileId}`, { replace: true });
    },
    [availableFiles, projectId, navigate, setCurrentFile]
  );

  // Handle export
  const handleExport = useCallback(() => {
    const json = exportMeasurements();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurements-${projectId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportMeasurements, projectId]);

  // Loading state
  if (isLoadingCurrentProject || isLoadingFiles) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner message="Loading project..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-center">
          <svg
            className="w-12 h-12 text-red-500 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Viewer</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700"
          >
            Back to Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4">
        <Link
          to={`/projects/${projectId}`}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </Link>
        <div className="text-white font-medium">{currentProject?.name || 'Viewer'}</div>
        <div className="text-gray-500 text-sm">
          {currentFile?.name || 'Select a file to view'}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-200">
            {[
              { id: 'files' as const, label: 'Files' },
              { id: 'trees' as const, label: 'Trees' },
              { id: 'species' as const, label: 'Species' },
              { id: 'measurements' as const, label: 'Measure' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activePanel === tab.id
                    ? 'text-forest-600 border-b-2 border-forest-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {/* Sprint 15-16: Show filter badge on Species tab */}
                {tab.id === 'species' && selectedSpeciesFilter.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-xs font-semibold bg-forest-500 text-white rounded-full">
                    {selectedSpeciesFilter.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3">
            {activePanel === 'files' && (
              <div className="space-y-1">
                {projectFiles
                  .filter((f) => f.fileType === 'las' || f.fileType === 'laz')
                  .map((file) => (
                    <FileItem
                      key={file.id}
                      file={{
                        id: file.id,
                        name: file.originalName,
                        size: file.size,
                        status: file.status,
                      }}
                      selected={selectedFileId === file.id}
                      onSelect={() => handleFileSelect(file.id)}
                    />
                  ))}
                {projectFiles.filter((f) => f.fileType === 'las' || f.fileType === 'laz')
                  .length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No point cloud files</p>
                    <p className="text-xs mt-1">Upload LAS/LAZ files to view</p>
                  </div>
                )}
              </div>
            )}

            {activePanel === 'trees' && (
              <div className="space-y-1">
                {detectedTrees.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No detected trees</p>
                    <p className="text-xs mt-1">Run tree detection analysis first</p>
                  </div>
                ) : (
                  detectedTrees.map((tree) => (
                    <TreeItem
                      key={tree.id}
                      tree={tree}
                      selected={selectedTreeIds.includes(tree.id)}
                      onSelect={() => toggleTreeSelection(tree.id)}
                      onFocus={() => focusOnTree(tree.id)}
                    />
                  ))
                )}
              </div>
            )}

            {/* Sprint 15-16: Species filter panel */}
            {activePanel === 'species' && (
              <div className="space-y-3">
                {speciesBreakdown.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    <p className="text-sm">No species data</p>
                    <p className="text-xs mt-1">Run species classification first</p>
                  </div>
                ) : (
                  <SpeciesFilter
                    onFilterChange={(codes) => setSelectedSpeciesFilter(codes)}
                  />
                )}
              </div>
            )}

            {activePanel === 'measurements' && <MeasurementTools />}
          </div>
        </div>

        {/* Main 3D View */}
        <div className="flex-1 relative">
          {/* Toolbar */}
          <Toolbar
            settings={settings}
            onSettingsChange={updateSettings}
            onResetCamera={resetCamera}
            onExportMeasurements={handleExport}
            measurementCount={measurements.length}
          />

          {/* 3D Canvas */}
          <div className="absolute inset-0 pt-12 pb-8">
            <Canvas
              gl={{ antialias: true, preserveDrawingBuffer: true }}
              style={{ background: settings.backgroundColor }}
            >
              <Suspense fallback={null}>
                <Scene settings={settings} />
              </Suspense>
            </Canvas>
          </div>

          {/* Status Bar */}
          <StatusBar
            pointCount={statusInfo.pointCount}
            fps={statusInfo.fps}
            cursorPosition={statusInfo.cursorPosition}
            {...(statusInfo.memoryUsage !== undefined ? { memoryUsage: statusInfo.memoryUsage } : {})}
            {...(statusInfo.loadProgress !== undefined ? { loadProgress: statusInfo.loadProgress } : {})}
          />
        </div>
      </div>
    </div>
  );
}

export default Viewer;
