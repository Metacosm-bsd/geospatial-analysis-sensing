/**
 * SelectionManager.tsx
 * Handle 3D selection with raycasting, box selection, and state management
 * Sprint 9-10: 3D Visualization Features
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DetectedTree, SelectionState, OnSelectionChange } from './types';

// Selection context for sharing state across components
interface SelectionContextValue {
  selectedTreeIds: Set<string>;
  selectedPointIndices: Set<number>;
  selectionMode: 'single' | 'box' | 'lasso';
  isSelecting: boolean;
  selectTree: (tree: DetectedTree, addToSelection?: boolean) => void;
  selectTrees: (trees: DetectedTree[]) => void;
  deselectTree: (treeId: string) => void;
  clearSelection: () => void;
  toggleTreeSelection: (tree: DetectedTree) => void;
  setSelectionMode: (mode: 'single' | 'box' | 'lasso') => void;
  getSelectedTrees: () => DetectedTree[];
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Hook to access selection state
 */
export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within a SelectionManager');
  }
  return context;
}

interface SelectionManagerProps {
  trees: DetectedTree[];
  enabled: boolean;
  mode?: 'single' | 'box' | 'lasso';
  onSelectionChange?: OnSelectionChange;
  highlightColor?: string;
  children?: React.ReactNode;
}

/**
 * SelectionManager component - provides selection context and handles raycasting
 */
export const SelectionManager: React.FC<SelectionManagerProps> = ({
  trees,
  enabled,
  mode = 'single',
  onSelectionChange,
  highlightColor: _highlightColor = '#FFD700',
  children,
}) => {
  const [selectedTreeIds, setSelectedTreeIds] = useState<Set<string>>(new Set());
  const [selectedPointIndices, setSelectedPointIndices] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState<'single' | 'box' | 'lasso'>(mode);
  const [isSelecting, setIsSelecting] = useState(false);

  // Build tree lookup map
  const treeMap = useMemo(() => {
    const map = new Map<string, DetectedTree>();
    trees.forEach((tree) => map.set(tree.id, tree));
    return map;
  }, [trees]);

  // Update mode when prop changes
  useEffect(() => {
    setSelectionMode(mode);
  }, [mode]);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const state: SelectionState = {
        selectedTreeIds,
        selectedPointIndices,
        selectionMode,
        isSelecting,
      };
      onSelectionChange(state);
    }
  }, [selectedTreeIds, selectedPointIndices, selectionMode, isSelecting, onSelectionChange]);

  const selectTree = useCallback(
    (tree: DetectedTree, addToSelection = false) => {
      if (!enabled) return;

      setSelectedTreeIds((prev) => {
        const newSet = addToSelection ? new Set(prev) : new Set<string>();
        newSet.add(tree.id);
        return newSet;
      });
    },
    [enabled]
  );

  const selectTrees = useCallback(
    (treesToSelect: DetectedTree[]) => {
      if (!enabled) return;

      setSelectedTreeIds(new Set(treesToSelect.map((t) => t.id)));
    },
    [enabled]
  );

  const deselectTree = useCallback((treeId: string) => {
    setSelectedTreeIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(treeId);
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTreeIds(new Set());
    setSelectedPointIndices(new Set());
  }, []);

  const toggleTreeSelection = useCallback(
    (tree: DetectedTree) => {
      if (!enabled) return;

      setSelectedTreeIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(tree.id)) {
          newSet.delete(tree.id);
        } else {
          newSet.add(tree.id);
        }
        return newSet;
      });
    },
    [enabled]
  );

  const getSelectedTrees = useCallback(() => {
    return Array.from(selectedTreeIds)
      .map((id) => treeMap.get(id))
      .filter((tree): tree is DetectedTree => tree !== undefined);
  }, [selectedTreeIds, treeMap]);

  const contextValue: SelectionContextValue = useMemo(
    () => ({
      selectedTreeIds,
      selectedPointIndices,
      selectionMode,
      isSelecting,
      selectTree,
      selectTrees,
      deselectTree,
      clearSelection,
      toggleTreeSelection,
      setSelectionMode,
      getSelectedTrees,
    }),
    [
      selectedTreeIds,
      selectedPointIndices,
      selectionMode,
      isSelecting,
      selectTree,
      selectTrees,
      deselectTree,
      clearSelection,
      toggleTreeSelection,
      getSelectedTrees,
    ]
  );

  return (
    <SelectionContext.Provider value={contextValue}>
      {children}
      {enabled && selectionMode === 'box' && (
        <BoxSelector
          trees={trees}
          onSelect={selectTrees}
          onSelectionStart={() => setIsSelecting(true)}
          onSelectionEnd={() => setIsSelecting(false)}
        />
      )}
    </SelectionContext.Provider>
  );
};

/**
 * Box selection component for selecting multiple trees
 */
interface BoxSelectorProps {
  trees: DetectedTree[];
  onSelect: (trees: DetectedTree[]) => void;
  onSelectionStart: () => void;
  onSelectionEnd: () => void;
}

const BoxSelector: React.FC<BoxSelectorProps> = ({
  trees,
  onSelect,
  onSelectionStart,
  onSelectionEnd,
}) => {
  const { camera, gl } = useThree();
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [endPoint, setEndPoint] = useState<{ x: number; y: number } | null>(null);
  const selectionBoxRef = useRef<HTMLDivElement | null>(null);

  // Create selection box overlay
  useEffect(() => {
    if (!selectionBoxRef.current) {
      const box = document.createElement('div');
      box.style.cssText = `
        position: absolute;
        border: 2px dashed #3B82F6;
        background: rgba(59, 130, 246, 0.1);
        pointer-events: none;
        z-index: 1000;
        display: none;
      `;
      gl.domElement.parentElement?.appendChild(box);
      selectionBoxRef.current = box;
    }

    return () => {
      if (selectionBoxRef.current) {
        selectionBoxRef.current.remove();
        selectionBoxRef.current = null;
      }
    };
  }, [gl.domElement]);

  // Update selection box position
  useEffect(() => {
    if (selectionBoxRef.current && startPoint && endPoint && isDrawing) {
      const left = Math.min(startPoint.x, endPoint.x);
      const top = Math.min(startPoint.y, endPoint.y);
      const width = Math.abs(endPoint.x - startPoint.x);
      const height = Math.abs(endPoint.y - startPoint.y);

      selectionBoxRef.current.style.left = `${left}px`;
      selectionBoxRef.current.style.top = `${top}px`;
      selectionBoxRef.current.style.width = `${width}px`;
      selectionBoxRef.current.style.height = `${height}px`;
      selectionBoxRef.current.style.display = 'block';
    } else if (selectionBoxRef.current) {
      selectionBoxRef.current.style.display = 'none';
    }
  }, [startPoint, endPoint, isDrawing]);

  // Handle mouse events
  useEffect(() => {
    const domElement = gl.domElement;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.shiftKey) return; // Only left click without shift

      const rect = domElement.getBoundingClientRect();
      setStartPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      setIsDrawing(true);
      onSelectionStart();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDrawing) return;

      const rect = domElement.getBoundingClientRect();
      setEndPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    const handleMouseUp = (_event: MouseEvent) => {
      if (!isDrawing || !startPoint || !endPoint) {
        setIsDrawing(false);
        onSelectionEnd();
        return;
      }

      // Find trees within the selection box
      const selectedTrees = getTreesInBox(
        trees,
        startPoint,
        endPoint,
        camera as THREE.PerspectiveCamera | THREE.OrthographicCamera,
        domElement
      );

      onSelect(selectedTrees);
      setIsDrawing(false);
      setStartPoint(null);
      setEndPoint(null);
      onSelectionEnd();
    };

    domElement.addEventListener('mousedown', handleMouseDown);
    domElement.addEventListener('mousemove', handleMouseMove);
    domElement.addEventListener('mouseup', handleMouseUp);

    return () => {
      domElement.removeEventListener('mousedown', handleMouseDown);
      domElement.removeEventListener('mousemove', handleMouseMove);
      domElement.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    gl.domElement,
    camera,
    trees,
    isDrawing,
    startPoint,
    endPoint,
    onSelect,
    onSelectionStart,
    onSelectionEnd,
  ]);

  return null;
};

/**
 * Find trees within a 2D selection box
 */
function getTreesInBox(
  trees: DetectedTree[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  domElement: HTMLElement
): DetectedTree[] {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  const width = domElement.clientWidth;
  const height = domElement.clientHeight;

  return trees.filter((tree) => {
    // Project tree position to screen space
    const vector = new THREE.Vector3(
      tree.position.x,
      tree.position.y,
      tree.position.z
    );
    vector.project(camera);

    // Convert to screen coordinates
    const screenX = ((vector.x + 1) / 2) * width;
    const screenY = ((-vector.y + 1) / 2) * height;

    // Check if within selection box
    return screenX >= left && screenX <= right && screenY >= top && screenY <= bottom;
  });
}

/**
 * Raycaster component for single-click selection
 */
interface RaycasterSelectorProps {
  trees: DetectedTree[];
  onSelect: (tree: DetectedTree | null) => void;
  enabled?: boolean;
}

export const RaycasterSelector: React.FC<RaycasterSelectorProps> = ({
  trees,
  onSelect,
  enabled = true,
}) => {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.intersectObjects(scene.children, true);

      const firstIntersect = intersects[0];
      if (firstIntersect) {
        // Find the tree marker that was clicked
        const clickedObject = firstIntersect.object;
        const treeGroup = findTreeGroup(clickedObject);

        if (treeGroup) {
          const treeId = treeGroup.userData?.['treeId'];
          const tree = trees.find((t) => t.id === treeId);
          if (tree) {
            onSelect(tree);
            return;
          }
        }
      }

      // No tree clicked
      onSelect(null);
    };

    gl.domElement.addEventListener('click', handleClick);
    return () => gl.domElement.removeEventListener('click', handleClick);
  }, [enabled, camera, gl.domElement, scene, trees, onSelect]);

  return null;
};

/**
 * Find the parent tree group from a clicked object
 */
function findTreeGroup(object: THREE.Object3D): THREE.Object3D | null {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (current.userData?.['treeId']) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

/**
 * Selection highlight component
 * Renders visual highlights for selected trees
 */
interface SelectionHighlightProps {
  trees: DetectedTree[];
  selectedIds: Set<string>;
  color?: string;
  opacity?: number;
}

export const SelectionHighlight: React.FC<SelectionHighlightProps> = ({
  trees,
  selectedIds,
  color = '#FFD700',
  opacity = 0.3,
}) => {
  const selectedTrees = useMemo(() => {
    return trees.filter((tree) => selectedIds.has(tree.id));
  }, [trees, selectedIds]);

  if (selectedTrees.length === 0) return null;

  return (
    <group name="selection-highlights">
      {selectedTrees.map((tree) => (
        <mesh
          key={`highlight-${tree.id}`}
          position={[tree.position.x, tree.position.y, tree.position.z + 0.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry
            args={[
              (tree.crownDiameter || tree.height * 0.3) * 0.4,
              (tree.crownDiameter || tree.height * 0.3) * 0.5,
              32,
            ]}
          />
          <meshBasicMaterial color={color} opacity={opacity} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Hook for managing selection outside of 3D context
 */
export function useSelectionState(initialMode: 'single' | 'box' | 'lasso' = 'single') {
  const [selectedTreeIds, setSelectedTreeIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(initialMode);

  const selectTree = useCallback((tree: DetectedTree, addToSelection = false) => {
    setSelectedTreeIds((prev) => {
      const newSet = addToSelection ? new Set(prev) : new Set<string>();
      newSet.add(tree.id);
      return newSet;
    });
  }, []);

  const selectTrees = useCallback((trees: DetectedTree[]) => {
    setSelectedTreeIds(new Set(trees.map((t) => t.id)));
  }, []);

  const deselectTree = useCallback((treeId: string) => {
    setSelectedTreeIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(treeId);
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTreeIds(new Set());
  }, []);

  const toggleTreeSelection = useCallback((tree: DetectedTree) => {
    setSelectedTreeIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tree.id)) {
        newSet.delete(tree.id);
      } else {
        newSet.add(tree.id);
      }
      return newSet;
    });
  }, []);

  return {
    selectedTreeIds,
    selectionMode,
    setSelectionMode,
    selectTree,
    selectTrees,
    deselectTree,
    clearSelection,
    toggleTreeSelection,
  };
}

export default SelectionManager;
