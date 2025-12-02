import React, { useEffect, useRef } from 'react';
import { useMouse, useWindowSize } from 'react-use';
import { GameWorldState, RoadPiece } from '../game/world-types';
import { handleKeyDown } from '../game/input/input-handler';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_SPEED } from '../game/constants/rendering-constants';

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
    const handleEdit = () => {
      // Editor disabled for baseline - will be re-implemented with building system
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!isActive()) return;
      // Editor mode disabled for baseline

      if (e.button === 0) {
        // Left click - allow panning
        isPanningRef.current = true;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
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


      // Editor code disabled for baseline
      /*
      if (isEditingActive) {
        // ... editor code removed
      }
      */

      if (isEditingRef.current) {
        handleEdit();
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
      const { newState, handled } = handleKeyDown(e.key.toLowerCase(), gameStateRef.current, { shift: e.shiftKey });
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
