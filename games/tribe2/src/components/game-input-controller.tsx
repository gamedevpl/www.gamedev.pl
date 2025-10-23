import React, { useEffect, useRef } from 'react';
import { useMouse, useWindowSize } from 'react-use';
import { GameWorldState } from '../game/types/world-types';
import { screenToWorldCoords } from '../game/renderer/render-utils';
import { handleKeyDown } from '../game/input/input-handler';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_SPEED } from '../game/constants/rendering-constants';
import { applyBiomeEdit, applyTerrainEdit } from '../game/utils/terrain-editor-utils';
import { HEIGHT_MAP_RESOLUTION, TERRAIN_EDIT_INTENSITY } from '../game/constants/world-constants';

interface GameInputControllerProps {
  isActive: () => boolean;
  gameStateRef: React.MutableRefObject<GameWorldState>;
  updateTerrainHeightMap: (modifiedGridCells: Map<number, number>) => void;
  updateBiomeMap: (modifiedGridCells: Map<number, number>) => void;
}

export const GameInputController: React.FC<GameInputControllerProps> = ({
  isActive,
  gameStateRef,
  updateTerrainHeightMap,
  updateBiomeMap,
}) => {
  const { width, height } = useWindowSize();
  const ref = useRef(document.body); // Attach mouse listener to the body
  const { docX, docY } = useMouse(ref);
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const isEditingRef = useRef(false);
  const shiftKeyRef = useRef(false); // Track shift key state

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
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!isActive()) return;
      const gameState = gameStateRef.current;

      if (e.button === 1) {
        isPanningRef.current = true;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      if (e.button === 0 && gameState && (gameState.terrainEditingMode || gameState.biomeEditingMode)) {
        isEditingRef.current = true;
        shiftKeyRef.current = e.shiftKey;
        handleEdit(e.shiftKey);
        e.preventDefault();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) isPanningRef.current = false;
      if (e.button === 0) isEditingRef.current = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const gameState = gameStateRef.current;
      if (!isActive() || !gameState) return;

      if (isPanningRef.current) {
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        gameState.viewportCenter.x -= dx / gameState.viewportZoom;
        gameState.viewportCenter.y -= dy / gameState.viewportZoom;
        const { width: mapWidth, height: mapHeight } = gameState.mapDimensions;
        gameState.viewportCenter.x = ((gameState.viewportCenter.x % mapWidth) + mapWidth) % mapWidth;
        gameState.viewportCenter.y = ((gameState.viewportCenter.y % mapHeight) + mapHeight) % mapHeight;
      }

      const isEditingActive = gameState.terrainEditingMode || gameState.biomeEditingMode;
      if (isEditingActive) {
        gameState.editorBrush.position = screenToWorldCoords(
          { x: docX, y: docY },
          gameState.viewportCenter,
          gameState.viewportZoom,
          { width, height },
          gameState.mapDimensions,
        );
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
    };
  }, [isActive, gameStateRef, docX, docY, width, height, updateTerrainHeightMap, updateBiomeMap]);

  return null;
};
