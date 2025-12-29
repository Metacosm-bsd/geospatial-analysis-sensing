/**
 * PointCloudViewer Component
 * Main 3D viewer component using @react-three/fiber
 * Sprint 9-10: Core 3D visualization infrastructure
 */

import React, { useState, useCallback, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { PointCloudViewerProps, ViewerSettings, PointCloudData } from './types';
import { PointCloudPoints } from './PointCloudPoints';
import { CameraControls, CameraControlsHandle } from './CameraControls';
import { ViewerToolbar } from './ViewerToolbar';

// Default viewer settings
const DEFAULT_SETTINGS: ViewerSettings = {
  pointSize: 2,
  colorMode: 'height',
  showGrid: true,
  showAxes: true,
  backgroundColor: '#1a1a2e',
};

// Loading spinner component
const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-10">
    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
    <p className="text-white text-sm">{message}</p>
  </div>
);

// Error display component
const ErrorDisplay: React.FC<{ error: string; onRetry?: () => void }> = ({ error, onRetry }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-10">
    <div className="bg-red-900/50 border border-red-500 rounded-lg p-6 max-w-md mx-4">
      <h3 className="text-red-400 font-semibold mb-2">Error Loading Point Cloud</h3>
      <p className="text-gray-300 text-sm mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  </div>
);

// Empty state component
const EmptyState: React.FC = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 z-10">
    <svg className="w-16 h-16 text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
    <p className="text-gray-400 text-lg">No point cloud data loaded</p>
    <p className="text-gray-500 text-sm mt-2">Upload a LAS/LAZ file to visualize</p>
  </div>
);

// Three.js scene content
interface SceneContentProps {
  data: PointCloudData;
  settings: ViewerSettings;
  cameraControlsRef: React.MutableRefObject<CameraControlsHandle | null>;
}

const SceneContent: React.FC<SceneContentProps> = ({ data, settings, cameraControlsRef }) => {
  // Calculate center and size for camera positioning
  const bounds = data.bounds;
  const center = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2
  );
  const size = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z
  );

  return (
    <>
      {/* Ambient lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />

      {/* Point cloud rendering */}
      <PointCloudPoints data={data} settings={settings} />

      {/* Grid helper */}
      {settings.showGrid && (
        <Grid
          position={[center.x, center.y, bounds.min.z]}
          args={[size * 1.5, size * 1.5]}
          cellSize={size / 20}
          cellThickness={0.5}
          cellColor="#4a5568"
          sectionSize={size / 4}
          sectionThickness={1}
          sectionColor="#718096"
          fadeDistance={size * 2}
          fadeStrength={1}
          infiniteGrid={false}
        />
      )}

      {/* Axes helper */}
      {settings.showAxes && (
        <axesHelper args={[size / 4]} position={[bounds.min.x, bounds.min.y, bounds.min.z]} />
      )}

      {/* Camera controls */}
      <CameraControls
        ref={cameraControlsRef}
        bounds={bounds}
        enableFirstPerson={false}
      />
    </>
  );
};

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({
  pointCloudData,
  settings: externalSettings,
  onSettingsChange,
  isLoading = false,
  error = null,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraControlsRef = useRef<CameraControlsHandle | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Merge external settings with defaults
  const [internalSettings, setInternalSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...externalSettings, ...internalSettings };

  // Handle settings changes
  const handleSettingsChange = useCallback((newSettings: ViewerSettings) => {
    setInternalSettings(newSettings);
    onSettingsChange?.(newSettings);
  }, [onSettingsChange]);

  // Reset camera view
  const handleResetView = useCallback(() => {
    cameraControlsRef.current?.resetView();
  }, []);

  // Toggle fullscreen
  const handleToggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }, []);

  // Listen for fullscreen changes
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Calculate initial camera position based on bounds
  const getCameraPosition = (): [number, number, number] => {
    if (!pointCloudData) return [0, 0, 100];

    const bounds = pointCloudData.bounds;
    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    return [center.x + size * 0.8, center.y + size * 0.8, center.z + size * 0.8];
  };

  // Get camera target for initial setup (reserved for future use)
  // const getCameraTarget = (): [number, number, number] => {
  //   if (!pointCloudData) return [0, 0, 0];
  //   const bounds = pointCloudData.bounds;
  //   return [
  //     (bounds.min.x + bounds.max.x) / 2,
  //     (bounds.min.y + bounds.max.y) / 2,
  //     (bounds.min.z + bounds.max.z) / 2,
  //   ];
  // };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[400px] bg-slate-900 rounded-lg overflow-hidden ${className}`}
    >
      {/* Three.js Canvas */}
      <Canvas
        camera={{
          position: getCameraPosition(),
          fov: 60,
          near: 0.1,
          far: 100000,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        style={{ background: settings.backgroundColor }}
      >
        <Suspense fallback={null}>
          {pointCloudData && (
            <SceneContent
              data={pointCloudData}
              settings={settings}
              cameraControlsRef={cameraControlsRef}
            />
          )}
        </Suspense>

        {/* Default orbit controls when no data */}
        {!pointCloudData && (
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            screenSpacePanning={true}
          />
        )}
      </Canvas>

      {/* Loading overlay */}
      {isLoading && <LoadingSpinner message="Loading point cloud..." />}

      {/* Error overlay */}
      {error && <ErrorDisplay error={error} />}

      {/* Empty state */}
      {!isLoading && !error && !pointCloudData && <EmptyState />}

      {/* Toolbar */}
      <ViewerToolbar
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onResetView={handleResetView}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
      />

      {/* Point count indicator */}
      {pointCloudData && (
        <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {pointCloudData.count.toLocaleString()} points
        </div>
      )}
    </div>
  );
};

export default PointCloudViewer;
