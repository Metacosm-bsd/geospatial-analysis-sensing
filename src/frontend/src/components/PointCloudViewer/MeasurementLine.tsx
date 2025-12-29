import { useRef, useState, useMemo } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Line, Html, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import type { Point3D, DistanceMeasurement, HeightMeasurement } from '../../store/viewerStore';

interface MeasurementLineProps {
  measurement: DistanceMeasurement | HeightMeasurement;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  showLabel?: boolean;
}

// Format distance for display
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(2)} m`;
}

// Convert Point3D to THREE.Vector3
function toVector3(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

export function MeasurementLine({
  measurement,
  selected = false,
  onSelect,
  onDelete,
  showLabel = true,
}: MeasurementLineProps) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  // Determine start and end points based on measurement type
  const startPoint = measurement.type === 'distance' ? measurement.startPoint : measurement.basePoint;
  const endPoint = measurement.type === 'distance' ? measurement.endPoint : measurement.topPoint;

  // Calculate line positions
  const linePoints = useMemo(
    () => [toVector3(startPoint), toVector3(endPoint)],
    [startPoint, endPoint]
  );

  // Calculate midpoint for label
  const midPoint = useMemo(() => {
    const start = toVector3(startPoint);
    const end = toVector3(endPoint);
    return new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  }, [startPoint, endPoint]);

  // Get the value to display
  const displayValue = measurement.type === 'distance'
    ? formatDistance(measurement.distance)
    : formatDistance(measurement.height);

  // Get display label
  const displayLabel = measurement.label || (measurement.type === 'distance' ? 'Distance' : 'Height');

  // Line color based on state
  const lineColor = selected
    ? '#ffff00'
    : hovered
      ? '#ffffff'
      : measurement.color;

  // Line width based on state
  const lineWidth = selected ? 3 : hovered ? 2.5 : 2;

  // Handle click on measurement
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.();
  };

  // Handle pointer events
  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerLeave = () => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  return (
    <group ref={groupRef}>
      {/* Main measurement line */}
      <Line
        points={linePoints}
        color={lineColor}
        lineWidth={lineWidth}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      />

      {/* Start point sphere */}
      <Sphere
        position={[startPoint.x, startPoint.y, startPoint.z]}
        args={[0.15, 16, 16]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <meshBasicMaterial
          color={lineColor}
          transparent
          opacity={selected || hovered ? 1 : 0.8}
        />
      </Sphere>

      {/* End point sphere */}
      <Sphere
        position={[endPoint.x, endPoint.y, endPoint.z]}
        args={[0.15, 16, 16]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <meshBasicMaterial
          color={lineColor}
          transparent
          opacity={selected || hovered ? 1 : 0.8}
        />
      </Sphere>

      {/* Height measurement specific: vertical dashed line helper */}
      {measurement.type === 'height' && (
        <>
          {/* Horizontal guide line at base */}
          <Line
            points={[
              new THREE.Vector3(startPoint.x - 1, startPoint.y, startPoint.z),
              new THREE.Vector3(startPoint.x + 1, startPoint.y, startPoint.z),
            ]}
            color={lineColor}
            lineWidth={1}
            dashed
            dashSize={0.2}
            gapSize={0.1}
          />
          {/* Horizontal guide line at top */}
          <Line
            points={[
              new THREE.Vector3(endPoint.x - 1, endPoint.y, endPoint.z),
              new THREE.Vector3(endPoint.x + 1, endPoint.y, endPoint.z),
            ]}
            color={lineColor}
            lineWidth={1}
            dashed
            dashSize={0.2}
            gapSize={0.1}
          />
        </>
      )}

      {/* Label */}
      {showLabel && (
        <Html
          position={[midPoint.x, midPoint.y, midPoint.z]}
          center
          distanceFactor={15}
          style={{
            pointerEvents: hovered || selected ? 'auto' : 'none',
          }}
        >
          <div
            className={`
              px-2 py-1 rounded shadow-lg text-center whitespace-nowrap
              transition-all duration-150
              ${selected
                ? 'bg-yellow-500 text-black scale-110'
                : hovered
                  ? 'bg-white text-gray-900 scale-105'
                  : 'bg-gray-900 bg-opacity-80 text-white'
              }
            `}
            style={{
              transform: 'translateY(-50%)',
              minWidth: '60px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
          >
            <div className="text-xs opacity-75">{displayLabel}</div>
            <div className="text-sm font-bold">{displayValue}</div>
            {(hovered || selected) && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="mt-1 px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// Component to render active measurement preview line
interface MeasurementLinePreviewProps {
  startPoint: Point3D;
  endPoint: Point3D;
  color?: string;
  type: 'distance' | 'height';
}

export function MeasurementLinePreview({
  startPoint,
  endPoint,
  color = '#00ff00',
  type,
}: MeasurementLinePreviewProps) {
  const linePoints = useMemo(
    () => [toVector3(startPoint), toVector3(endPoint)],
    [startPoint, endPoint]
  );

  const distance = useMemo(() => {
    if (type === 'height') {
      return Math.abs(endPoint.z - startPoint.z);
    }
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }, [startPoint, endPoint, type]);

  const midPoint = useMemo(() => {
    const start = toVector3(startPoint);
    const end = toVector3(endPoint);
    return new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  }, [startPoint, endPoint]);

  return (
    <group>
      {/* Preview line - dashed to indicate it's not finalized */}
      <Line
        points={linePoints}
        color={color}
        lineWidth={2}
        dashed
        dashSize={0.3}
        gapSize={0.15}
      />

      {/* Start point */}
      <Sphere position={[startPoint.x, startPoint.y, startPoint.z]} args={[0.12, 16, 16]}>
        <meshBasicMaterial color={color} />
      </Sphere>

      {/* End point */}
      <Sphere position={[endPoint.x, endPoint.y, endPoint.z]} args={[0.12, 16, 16]}>
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </Sphere>

      {/* Distance preview label */}
      <Html position={[midPoint.x, midPoint.y, midPoint.z]} center distanceFactor={15}>
        <div
          className="px-2 py-1 bg-gray-900 bg-opacity-90 text-white rounded text-sm font-medium"
          style={{ transform: 'translateY(-50%)' }}
        >
          {formatDistance(distance)}
        </div>
      </Html>
    </group>
  );
}

export default MeasurementLine;
