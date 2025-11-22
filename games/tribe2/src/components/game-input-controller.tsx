import React, { useEffect, useRef } from 'react';
import { useMouse, useWindowSize } from 'react-use';
import { GameWorldState, RoadPiece } from '../game/types/world-types';
import { screenToWorldCoords } from '../game/renderer/render-utils';
import { handleKeyDown } from '../game/input/input-handler';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_SPEED } from '../game/constants/rendering-constants';
import { applyBiomeEdit, applyRoadEdit, applyTerrainEdit } from '../game/utils/terrain-editor-utils';
import { HEIGHT_MAP_RESOLUTION, TERRAIN_EDIT_INTENSITY } from '../game/constants/world-constants';

const PAN_EDGE_THRESHOLD = 50; // Pixels from edge to start panning
const PAN_SPEED_FACTOR = 5.0; // Increased for visibility

interface GameInputControllerProps {
  isActive: () => boolean;
  gameStateRef: React.MutableRefObject<GameWorldState>;
  updateTerrainHeightMap: (modifiedGridCells: Map<number, number>) => void;
  updateBiomeMap: (modifiedGridCells: Map<number, number>) => void;
  updateRoadMap: (modifiedGridCells: Map<number, RoadPiece | null>) => void;
}

export const GameInputController: React.FC<GameInputControllerProps> = ({
  isActive,
  gameStateRef,
  updateTerrainHeightMap,
  updateBiomeMap,
  updateRoadMap,
}) => {
  const { width, height } = useWindowSize();
  const ref = useRef(document.body); // Attach mouse listener to the body
  const { docX, docY } = useMouse(ref);
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const isEditingRef = useRef(false);
  const shiftKeyRef = useRef(false); // Track shift key state

  // Refs for edge panning
  const edgePanVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panAnimationIdRef = useRef<number | null>(null);
  const lastEdgePanTimeRef = useRef<number | null>(null);

  // Function to continuously pan when mouse is at the edge
  const panLoop = (timestamp: DOMHighResTimeStamp) => {
    if (!lastEdgePanTimeRef.current) {
      lastEdgePanTimeRef.current = timestamp;
    }
    const deltaTime = (timestamp - lastEdgePanTimeRef.current) / 1000; // Delta time in seconds
    lastEdgePanTimeRef.current = timestamp;

    const gameState = gameStateRef.current;
    const edgePanVelocity = edgePanVelocityRef.current;

    if (gameState && edgePanVelocity && (edgePanVelocity.x !== 0 || edgePanVelocity.y !== 0)) {
      // Adjust pan speed by zoom level so it feels consistent regardless of zoom
      const effectivePanSpeedX = edgePanVelocity.x * PAN_SPEED_FACTOR * deltaTime * 1000;
      const effectivePanSpeedY = edgePanVelocity.y * PAN_SPEED_FACTOR * deltaTime * 1000;

      gameState.viewportCenter.x -= effectivePanSpeedX / gameState.viewportZoom;
      gameState.viewportCenter.y -= effectivePanSpeedY / gameState.viewportZoom;
    }

    panAnimationIdRef.current = requestAnimationFrame(panLoop);
  };

  useEffect(() => {
    const handleEdit = (shiftKey: boolean) => {
      const gameState = gameStateRef.current;
      if (!gameState) return;

      if (gameState.terrainEditingMode) {
        const intensity = TERRAIN_EDIT_INTENSITY * (shiftKey ? -1 : 1);
        const modifiedCells = applyTerrainEdit(
          gameState.heightMap,
          gameState.editorBrush.position,
          gameState.editorBrush.radius,
          intensity,
          gameState.mapDimensions,
          HEIGHT_MAP_RESOLUTION,
        );
        if (modifiedCells.size > 0) {
          updateTerrainHeightMap(modifiedCells);
        }
      } else if (gameState.biomeEditingMode) {
        const modifiedCells = applyBiomeEdit(
          gameState.biomeMap,
          gameState.editorBrush.position,
          gameState.editorBrush.radius,
          gameState.selectedBiome,
          gameState.mapDimensions,
          HEIGHT_MAP_RESOLUTION,
        );
        if (modifiedCells.size > 0) {
          updateBiomeMap(modifiedCells);
        }
      } else if (gameState.roadEditingMode) {
        const result = applyRoadEdit(
          gameState.roadMap,
          gameState.heightMap,
          gameState.editorBrush.position,
          gameState.lastRoadPosition,
          gameState.mapDimensions,
          HEIGHT_MAP_RESOLUTION,
        );
        if (result.modifiedHeightCells.size > 0) {
          updateTerrainHeightMap(result.modifiedHeightCells);
        }
        if (result.modifiedRoadCells.size > 0) {
          updateRoadMap(result.modifiedRoadCells);
          // Update last position to chain roads
          gameState.lastRoadPosition = { ...gameState.editorBrush.position };
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!isActive()) return;
      const gameState = gameStateRef.current;

      // Check if editing mode is active
      const isEditingActive = gameState.terrainEditingMode || gameState.biomeEditingMode || gameState.roadEditingMode;

      if (e.button === 0) {
        // Left click
        if (isEditingActive) {
          if (gameState.roadEditingMode) {
            // Start of a new road segment
            const worldPos = screenToWorldCoords(
              { x: e.clientX, y: e.clientY },
              gameState.viewportCenter,
              gameState.viewportZoom,
              { width, height },
              gameState.mapDimensions,
            );
            gameState.editorBrush.position = worldPos;
            gameState.lastRoadPosition = worldPos;
          }

          isEditingRef.current = true;
          shiftKeyRef.current = e.shiftKey;
          handleEdit(e.shiftKey);
        } else {
          // Otherwise, allow panning with left click
          isPanningRef.current = true;
          lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        }
        e.preventDefault();
      } else if (e.button === 1) {
        // Middle click always pans
        isPanningRef.current = true;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 1) {
        isPanningRef.current = false;
      }
      if (e.button === 0) {
        isEditingRef.current = false;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const gameState = gameStateRef.current;
      if (!isActive() || !gameState) return;

      if (isPanningRef.current) {
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        gameState.viewportCenter.x -= dx / gameState.viewportZoom;
        gameState.viewportCenter.y += dy / gameState.viewportZoom;
      } else {
        // Handle edge panning only if not actively dragging
        let panX = 0;
        let panY = 0;

        if (docX < PAN_EDGE_THRESHOLD) {
          panX = (PAN_EDGE_THRESHOLD - docX) / PAN_EDGE_THRESHOLD; // Pan left, stronger closer to edge
        } else if (docX > width - PAN_EDGE_THRESHOLD) {
          panX = -(docX - (width - PAN_EDGE_THRESHOLD)) / PAN_EDGE_THRESHOLD; // Pan right
        }

        if (docY < PAN_EDGE_THRESHOLD) {
          panY = (PAN_EDGE_THRESHOLD - docY) / PAN_EDGE_THRESHOLD; // Pan up
        } else if (docY > height - PAN_EDGE_THRESHOLD) {
          panY = -(docY - (height - PAN_EDGE_THRESHOLD)) / PAN_EDGE_THRESHOLD; // Pan down
        }

        edgePanVelocityRef.current = { x: panX, y: panY };

        if ((panX !== 0 || panY !== 0) && !panAnimationIdRef.current) {
          // Start pan loop if not already running and at edge
          lastEdgePanTimeRef.current = null; // Reset time for smooth start
          panAnimationIdRef.current = requestAnimationFrame(panLoop);
        } else if (panX === 0 && panY === 0 && panAnimationIdRef.current) {
          // Stop pan loop if not at edge and running
          cancelAnimationFrame(panAnimationIdRef.current);
          panAnimationIdRef.current = null;
          lastEdgePanTimeRef.current = null;
        }
      }

      const isEditingActive = gameState.terrainEditingMode || gameState.biomeEditingMode || gameState.roadEditingMode;
      if (isEditingActive) {
        gameState.editorBrush.position = screenToWorldCoords(
          { x: docX, y: docY },
          gameState.viewportCenter,
          gameState.viewportZoom,
          { width, height },
          gameState.mapDimensions,
        );
        // Update road preview position
        if (gameState.roadEditingMode) {
          gameState.previewRoadPosition = { ...gameState.editorBrush.position };
        } else {
          gameState.previewRoadPosition = null;
        }
      } else {
        gameState.previewRoadPosition = null;
      }

      if (isEditingRef.current) {
        handleEdit(shiftKeyRef.current);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!isActive()) return;
      e.preventDefault();
      const gameState = gameStateRef.current;
      const zoomFactor = 1 - Math.sign(e.deltaY) * ZOOM_SPEED;
      gameState.viewportZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, gameState.viewportZoom * zoomFactor));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isActive()) return;
      shiftKeyRef.current = e.shiftKey;
      const { newState, handled } = handleKeyDown(e.key.toLowerCase(), gameStateRef.current);
      if (handled) {
        gameStateRef.current = newState;
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      shiftKeyRef.current = e.shiftKey;
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (panAnimationIdRef.current) {
        cancelAnimationFrame(panAnimationIdRef.current);
      }
    };
  }, [isActive, gameStateRef, docX, docY, width, height, updateTerrainHeightMap, updateBiomeMap, updateRoadMap]);

  return null;
};
