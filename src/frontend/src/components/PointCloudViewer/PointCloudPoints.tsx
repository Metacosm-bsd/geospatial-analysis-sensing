/**
 * PointCloudPoints Component
 * Renders point cloud data using THREE.Points with custom shaders
 * Sprint 9-10: Core 3D visualization infrastructure
 */

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  PointCloudData,
  ViewerSettings,
  HEIGHT_COLOR_GRADIENT,
  LAS_CLASSIFICATION_COLORS
} from './types';

interface PointCloudPointsProps {
  data: PointCloudData;
  settings: ViewerSettings;
}

// Custom vertex shader for point cloud rendering
const vertexShader = `
  uniform float pointSize;
  uniform float minZ;
  uniform float maxZ;
  uniform int colorMode; // 0: rgb, 1: height, 2: intensity, 3: classification

  attribute vec3 customColor;
  attribute float intensity;
  attribute float classification;

  varying vec3 vColor;

  // Height color gradient (viridis-like)
  vec3 getHeightColor(float normalizedHeight) {
    // Blue -> Cyan -> Green -> Yellow -> Orange -> Red
    vec3 colors[6];
    colors[0] = vec3(0.0, 0.0, 0.5);   // Deep blue
    colors[1] = vec3(0.0, 0.5, 1.0);   // Light blue
    colors[2] = vec3(0.0, 1.0, 0.5);   // Cyan-green
    colors[3] = vec3(0.5, 1.0, 0.0);   // Yellow-green
    colors[4] = vec3(1.0, 0.5, 0.0);   // Orange
    colors[5] = vec3(1.0, 0.0, 0.0);   // Red

    float t = clamp(normalizedHeight, 0.0, 1.0) * 5.0;
    int idx = int(floor(t));
    float frac = fract(t);

    if (idx >= 5) return colors[5];
    return mix(colors[idx], colors[idx + 1], frac);
  }

  // Intensity grayscale
  vec3 getIntensityColor(float intensityValue) {
    float normalized = clamp(intensityValue / 65535.0, 0.0, 1.0);
    return vec3(normalized);
  }

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Attenuate point size based on distance
    float distance = length(mvPosition.xyz);
    gl_PointSize = pointSize * (300.0 / distance);
    gl_PointSize = clamp(gl_PointSize, 1.0, 50.0);

    // Color based on mode
    if (colorMode == 0) {
      // RGB mode - use vertex colors
      vColor = customColor;
    } else if (colorMode == 1) {
      // Height mode
      float normalizedHeight = (position.z - minZ) / (maxZ - minZ);
      vColor = getHeightColor(normalizedHeight);
    } else if (colorMode == 2) {
      // Intensity mode
      vColor = getIntensityColor(intensity);
    } else {
      // Classification mode - use custom color (set in JS)
      vColor = customColor;
    }
  }
`;

// Custom fragment shader
const fragmentShader = `
  varying vec3 vColor;

  void main() {
    // Create circular points
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    if (dist > 0.5) {
      discard;
    }

    // Smooth edges
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);

    gl_FragColor = vec4(vColor, alpha);
  }
`;

// Map color mode string to shader int
const colorModeToInt = (mode: ViewerSettings['colorMode']): number => {
  switch (mode) {
    case 'rgb': return 0;
    case 'height': return 1;
    case 'intensity': return 2;
    case 'classification': return 3;
    default: return 0;
  }
};

// Get classification color with safe fallback
const getClassificationColor = (classification: number): [number, number, number] => {
  const color = LAS_CLASSIFICATION_COLORS[classification];
  if (color) return color;
  const fallback = LAS_CLASSIFICATION_COLORS[1];
  return fallback ?? [0.5, 0.5, 0.5];
};

export const PointCloudPoints: React.FC<PointCloudPointsProps> = ({ data, settings }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create geometry with attributes
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Position attribute
    geo.setAttribute('position', new THREE.BufferAttribute(data.points, 3));

    // Custom color attribute
    if (data.colors && data.colors.length > 0) {
      geo.setAttribute('customColor', new THREE.BufferAttribute(data.colors, 3));
    } else {
      // Generate default colors based on height
      const colors = new Float32Array(data.count * 3);
      const minZ = data.bounds.min.z;
      const maxZ = data.bounds.max.z;
      const range = maxZ - minZ || 1;

      for (let i = 0; i < data.count; i++) {
        const z = data.points[i * 3 + 2] ?? 0;
        const normalized = (z - minZ) / range;

        // Find color from gradient
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

      geo.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    }

    // Intensity attribute (if available in metadata)
    const intensities = data.metadata?.['intensities'] as Float32Array | undefined;
    if (intensities) {
      geo.setAttribute('intensity', new THREE.BufferAttribute(intensities, 1));
    } else {
      geo.setAttribute('intensity', new THREE.BufferAttribute(new Float32Array(data.count), 1));
    }

    // Classification attribute (if available in metadata)
    const classifications = data.metadata?.['classifications'] as Uint8Array | undefined;
    if (classifications) {
      geo.setAttribute('classification', new THREE.BufferAttribute(new Float32Array(classifications), 1));
    } else {
      geo.setAttribute('classification', new THREE.BufferAttribute(new Float32Array(data.count), 1));
    }

    // Compute bounding sphere for frustum culling
    geo.computeBoundingSphere();

    return geo;
  }, [data]);

  // Update colors when mode changes to classification
  useEffect(() => {
    if (settings.colorMode === 'classification' && geometry) {
      const classifications = data.metadata?.['classifications'] as Uint8Array | undefined;
      if (classifications) {
        const colors = new Float32Array(data.count * 3);
        for (let i = 0; i < data.count; i++) {
          const classValue = classifications[i] ?? 1;
          const [r, g, b] = getClassificationColor(classValue);
          colors[i * 3] = r;
          colors[i * 3 + 1] = g;
          colors[i * 3 + 2] = b;
        }
        geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        const customColorAttr = geometry.attributes['customColor'];
        if (customColorAttr) {
          customColorAttr.needsUpdate = true;
        }
      }
    }
  }, [settings.colorMode, geometry, data]);

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        pointSize: { value: settings.pointSize },
        minZ: { value: data.bounds.min.z },
        maxZ: { value: data.bounds.max.z },
        colorMode: { value: colorModeToInt(settings.colorMode) },
      },
      transparent: true,
      depthTest: true,
      depthWrite: true,
    });
  }, []);

  // Update uniforms when settings change
  useEffect(() => {
    if (materialRef.current) {
      const pointSizeUniform = materialRef.current.uniforms['pointSize'];
      const colorModeUniform = materialRef.current.uniforms['colorMode'];
      if (pointSizeUniform) {
        pointSizeUniform.value = settings.pointSize;
      }
      if (colorModeUniform) {
        colorModeUniform.value = colorModeToInt(settings.colorMode);
      }
    }
  }, [settings.pointSize, settings.colorMode]);

  // Animation frame for potential updates
  useFrame(() => {
    // Could add animation or LOD switching here
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <primitive ref={materialRef} object={material} attach="material" />
    </points>
  );
};

export default PointCloudPoints;
