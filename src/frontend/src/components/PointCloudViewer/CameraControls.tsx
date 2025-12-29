/**
 * CameraControls Component
 * Enhanced camera controls with orbit, pan, zoom, and first-person mode
 * Sprint 9-10: Core 3D visualization infrastructure
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { CameraControlsProps, Point3D } from './types';

// Export handle type for external use
export interface CameraControlsHandle {
  resetView: () => void;
  fitToBounds: (bounds: { min: Point3D; max: Point3D }) => void;
  setFirstPersonMode: (enabled: boolean) => void;
}

/**
 * Calculate camera position to fit bounds in view
 */
function calculateFitPosition(
  bounds: { min: Point3D; max: Point3D },
  camera: THREE.PerspectiveCamera
): { position: THREE.Vector3; target: THREE.Vector3 } {
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

  // Calculate distance based on FOV
  const fov = camera.fov * (Math.PI / 180);
  const distance = (size / 2) / Math.tan(fov / 2) * 1.5;

  // Position camera at 45-degree angle
  const offset = distance * 0.7;
  const position = new THREE.Vector3(
    center.x + offset,
    center.y + offset,
    center.z + offset
  );

  return { position, target: center };
}

export const CameraControls = forwardRef<CameraControlsHandle, CameraControlsProps>(
  ({ bounds, enableFirstPerson = false, onResetView }, ref) => {
    const { camera, gl } = useThree();
    const orbitControlsRef = useRef<any>(null);
    const pointerLockRef = useRef<any>(null);
    const [isFirstPerson, setIsFirstPerson] = React.useState(false);

    // Store initial bounds for reset
    const initialBoundsRef = useRef(bounds);

    // First-person movement state
    const moveState = useRef({
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
    });
    const moveSpeed = useRef(1);

    /**
     * Reset view to fit bounds
     */
    const resetView = useCallback(() => {
      const targetBounds = bounds || initialBoundsRef.current;
      if (!targetBounds) return;

      const { position, target } = calculateFitPosition(
        targetBounds,
        camera as THREE.PerspectiveCamera
      );

      // Animate camera to position
      const startPosition = camera.position.clone();
      const startTime = Date.now();
      const duration = 500; // ms

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic

        camera.position.lerpVectors(startPosition, position, eased);

        if (orbitControlsRef.current) {
          orbitControlsRef.current.target.lerp(target, eased);
          orbitControlsRef.current.update();
        }

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          onResetView?.();
        }
      };

      animate();
    }, [bounds, camera, onResetView]);

    /**
     * Fit camera to specific bounds
     */
    const fitToBounds = useCallback((newBounds: { min: Point3D; max: Point3D }) => {
      const { position, target } = calculateFitPosition(
        newBounds,
        camera as THREE.PerspectiveCamera
      );

      camera.position.copy(position);
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(target);
        orbitControlsRef.current.update();
      }
    }, [camera]);

    /**
     * Toggle first-person mode
     */
    const setFirstPersonMode = useCallback((enabled: boolean) => {
      setIsFirstPerson(enabled);
    }, []);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      resetView,
      fitToBounds,
      setFirstPersonMode,
    }), [resetView, fitToBounds, setFirstPersonMode]);

    // Initial camera positioning
    useEffect(() => {
      if (bounds && camera) {
        const { position, target } = calculateFitPosition(
          bounds,
          camera as THREE.PerspectiveCamera
        );

        camera.position.copy(position);
        camera.lookAt(target);

        if (orbitControlsRef.current) {
          orbitControlsRef.current.target.copy(target);
          orbitControlsRef.current.update();
        }
      }
    }, [bounds, camera]);

    // First-person keyboard controls
    useEffect(() => {
      if (!isFirstPerson) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        switch (event.code) {
          case 'KeyW':
            moveState.current.forward = true;
            break;
          case 'KeyS':
            moveState.current.backward = true;
            break;
          case 'KeyA':
            moveState.current.left = true;
            break;
          case 'KeyD':
            moveState.current.right = true;
            break;
          case 'Space':
            moveState.current.up = true;
            break;
          case 'ShiftLeft':
            moveState.current.down = true;
            break;
        }
      };

      const handleKeyUp = (event: KeyboardEvent) => {
        switch (event.code) {
          case 'KeyW':
            moveState.current.forward = false;
            break;
          case 'KeyS':
            moveState.current.backward = false;
            break;
          case 'KeyA':
            moveState.current.left = false;
            break;
          case 'KeyD':
            moveState.current.right = false;
            break;
          case 'Space':
            moveState.current.up = false;
            break;
          case 'ShiftLeft':
            moveState.current.down = false;
            break;
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }, [isFirstPerson]);

    // Update move speed based on bounds
    useEffect(() => {
      if (bounds) {
        const size = Math.max(
          bounds.max.x - bounds.min.x,
          bounds.max.y - bounds.min.y,
          bounds.max.z - bounds.min.z
        );
        moveSpeed.current = size / 100;
      }
    }, [bounds]);

    // First-person movement in animation frame
    useFrame((_, delta) => {
      if (!isFirstPerson || !pointerLockRef.current?.isLocked) return;

      const speed = moveSpeed.current * delta * 60;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);

      const right = new THREE.Vector3();
      right.crossVectors(direction, camera.up).normalize();

      if (moveState.current.forward) {
        camera.position.addScaledVector(direction, speed);
      }
      if (moveState.current.backward) {
        camera.position.addScaledVector(direction, -speed);
      }
      if (moveState.current.left) {
        camera.position.addScaledVector(right, -speed);
      }
      if (moveState.current.right) {
        camera.position.addScaledVector(right, speed);
      }
      if (moveState.current.up) {
        camera.position.y += speed;
      }
      if (moveState.current.down) {
        camera.position.y -= speed;
      }
    });

    // Render appropriate controls
    if (isFirstPerson && enableFirstPerson) {
      return (
        <PointerLockControls
          ref={pointerLockRef}
          camera={camera}
          domElement={gl.domElement}
        />
      );
    }

    return (
      <DreiOrbitControls
        ref={orbitControlsRef}
        enableDamping
        dampingFactor={0.05}
        screenSpacePanning={true}
        minDistance={0.1}
        maxDistance={100000}
        maxPolarAngle={Math.PI}
        enableZoom={true}
        zoomSpeed={1.0}
        enableRotate={true}
        rotateSpeed={0.5}
        enablePan={true}
        panSpeed={1.0}
        keyPanSpeed={10.0}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
    );
  }
);

CameraControls.displayName = 'CameraControls';

export default CameraControls;
