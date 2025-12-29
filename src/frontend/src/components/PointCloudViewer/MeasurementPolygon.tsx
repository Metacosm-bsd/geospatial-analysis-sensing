import { useRef, useState, useMemo } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Line, Html, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import type { Point3D, AreaMeasurement } from '../../store/viewerStore';

interface MeasurementPolygonProps {
  measurement: AreaMeasurement;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  onVertexMove?: (index: number, newPosition: Point3D) => void;
  showLabel?: boolean;
  editable?: boolean;
}

// Format area for display
function formatArea(squareMeters: number): string {
  if (squareMeters >= 10000) {
    return `${(squareMeters / 10000).toFixed(2)} ha`;
  }
  return `${squareMeters.toFixed(2)} m²`;
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

// Calculate centroid of polygon
function calculateCentroid(points: Point3D[]): Point3D {
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const sum = points.reduce(
    (acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y,
      z: acc.z + p.z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
}

export function MeasurementPolygon({
  measurement,
  selected = false,
  onSelect,
  onDelete,
  onVertexMove: _onVertexMove,
  showLabel = true,
  editable = false,
}: MeasurementPolygonProps) {
  // _onVertexMove is intentionally unused for now - reserved for future vertex editing feature
  void _onVertexMove;
  const [hovered, setHovered] = useState(false);
  const [hoveredVertex, setHoveredVertex] = useState<number | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  const { points, area, perimeter, color, label } = measurement;

  // Calculate line points for polygon edges (closed loop)
  const linePoints = useMemo(() => {
    if (points.length < 2) return [];

    const vectors = points.map(toVector3);
    const firstVector = vectors[0];
    // Close the polygon by adding the first point at the end
    if (firstVector) {
      return [...vectors, firstVector];
    }
    return vectors;
  }, [points]);

  // Calculate centroid for label placement
  const centroid = useMemo(() => calculateCentroid(points), [points]);

  // Create filled polygon mesh geometry
  const polygonGeometry = useMemo(() => {
    if (points.length < 3) return null;

    const firstPoint = points[0];
    if (!firstPoint) return null;

    // Create a shape from the points (projecting to XY plane)
    const shape = new THREE.Shape();
    shape.moveTo(firstPoint.x, firstPoint.y);
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      if (point) {
        shape.lineTo(point.x, point.y);
      }
    }
    shape.lineTo(firstPoint.x, firstPoint.y);

    const geometry = new THREE.ShapeGeometry(shape);

    // Position the geometry at the average Z height
    const avgZ = points.reduce((sum, p) => sum + p.z, 0) / points.length;
    geometry.translate(0, 0, avgZ);

    return geometry;
  }, [points]);

  // Line color based on state
  const lineColor = selected
    ? '#ffff00'
    : hovered
      ? '#ffffff'
      : color;

  // Line width based on state
  const lineWidth = selected ? 3 : hovered ? 2.5 : 2;

  // Fill opacity based on state
  const fillOpacity = selected ? 0.4 : hovered ? 0.3 : 0.2;

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

  // Display label
  const displayLabel = label || 'Area';

  return (
    <group ref={groupRef}>
      {/* Filled polygon surface */}
      {polygonGeometry && (
        <mesh
          geometry={polygonGeometry}
          onClick={handleClick}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <meshBasicMaterial
            color={color}
            transparent
            opacity={fillOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Polygon outline */}
      {linePoints.length > 0 && (
        <Line
          points={linePoints}
          color={lineColor}
          lineWidth={lineWidth}
          onClick={handleClick}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        />
      )}

      {/* Vertex handles */}
      {points.map((point, index) => (
        <Sphere
          key={index}
          position={[point.x, point.y, point.z]}
          args={[selected || editable ? 0.2 : 0.15, 16, 16]}
          onClick={handleClick}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredVertex(index);
            if (editable) {
              document.body.style.cursor = 'grab';
            }
          }}
          onPointerLeave={() => {
            setHoveredVertex(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <meshBasicMaterial
            color={
              hoveredVertex === index
                ? '#ffffff'
                : selected
                  ? '#ffff00'
                  : lineColor
            }
            transparent
            opacity={selected || hoveredVertex === index ? 1 : 0.8}
          />
        </Sphere>
      ))}

      {/* Vertex labels (show on hover or when selected) */}
      {(selected || hovered) &&
        points.map((point, index) => (
          <Html
            key={`vertex-label-${index}`}
            position={[point.x, point.y, point.z]}
            center
            distanceFactor={20}
            style={{ pointerEvents: 'none' }}
          >
            <div className="px-1 py-0.5 bg-gray-800 text-white text-xs rounded opacity-75">
              V{index + 1}
            </div>
          </Html>
        ))}

      {/* Main label at centroid */}
      {showLabel && (
        <Html
          position={[centroid.x, centroid.y, centroid.z]}
          center
          distanceFactor={15}
          style={{
            pointerEvents: hovered || selected ? 'auto' : 'none',
          }}
        >
          <div
            className={`
              px-3 py-2 rounded shadow-lg text-center whitespace-nowrap
              transition-all duration-150
              ${selected
                ? 'bg-yellow-500 text-black scale-110'
                : hovered
                  ? 'bg-white text-gray-900 scale-105'
                  : 'bg-gray-900 bg-opacity-80 text-white'
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
          >
            <div className="text-xs opacity-75">{displayLabel}</div>
            <div className="text-sm font-bold">{formatArea(area)}</div>
            <div className="text-xs opacity-75 mt-1">
              Perimeter: {formatDistance(perimeter)}
            </div>
            <div className="text-xs opacity-75">
              Vertices: {points.length}
            </div>
            {(hovered || selected) && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="mt-2 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
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

// Component to render active polygon measurement preview
interface MeasurementPolygonPreviewProps {
  points: Point3D[];
  color?: string;
  cursorPosition?: Point3D | null;
}

export function MeasurementPolygonPreview({
  points,
  color = '#00ffff',
  cursorPosition,
}: MeasurementPolygonPreviewProps) {
  // Line points for the polygon so far
  const linePoints = useMemo(() => {
    if (points.length === 0) return [];

    const vectors = points.map(toVector3);

    // If we have a cursor position, add it as a preview
    if (cursorPosition) {
      vectors.push(toVector3(cursorPosition));
    }

    // Close back to first point if we have at least 2 points
    const firstPoint = points[0];
    if (points.length >= 2 && cursorPosition && firstPoint) {
      vectors.push(toVector3(firstPoint));
    }

    return vectors;
  }, [points, cursorPosition]);

  // Calculate area preview
  const previewArea = useMemo(() => {
    const allPoints = cursorPosition ? [...points, cursorPosition] : points;
    if (allPoints.length < 3) return 0;

    let area = 0;
    const n = allPoints.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pi = allPoints[i];
      const pj = allPoints[j];
      if (pi && pj) {
        area += pi.x * pj.y;
        area -= pj.x * pi.y;
      }
    }

    return Math.abs(area / 2);
  }, [points, cursorPosition]);

  // Calculate centroid for label
  const centroid = useMemo(() => {
    const allPoints = cursorPosition ? [...points, cursorPosition] : points;
    return calculateCentroid(allPoints);
  }, [points, cursorPosition]);

  if (points.length === 0) return null;

  return (
    <group>
      {/* Preview polygon outline - dashed to indicate it's not finalized */}
      {linePoints.length > 1 && (
        <Line
          points={linePoints}
          color={color}
          lineWidth={2}
          dashed
          dashSize={0.3}
          gapSize={0.15}
        />
      )}

      {/* Vertex markers */}
      {points.map((point, index) => (
        <Sphere
          key={index}
          position={[point.x, point.y, point.z]}
          args={[0.12, 16, 16]}
        >
          <meshBasicMaterial color={color} />
        </Sphere>
      ))}

      {/* Cursor position preview sphere */}
      {cursorPosition && (
        <Sphere
          position={[cursorPosition.x, cursorPosition.y, cursorPosition.z]}
          args={[0.12, 16, 16]}
        >
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </Sphere>
      )}

      {/* Area preview label */}
      {points.length >= 2 && (
        <Html position={[centroid.x, centroid.y, centroid.z]} center distanceFactor={15}>
          <div
            className="px-2 py-1 bg-gray-900 bg-opacity-90 text-white rounded text-sm"
            style={{ transform: 'translateY(-50%)' }}
          >
            <div className="font-medium">{formatArea(previewArea)}</div>
            <div className="text-xs opacity-75">
              {points.length} vertices - click to add more
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default MeasurementPolygon;
