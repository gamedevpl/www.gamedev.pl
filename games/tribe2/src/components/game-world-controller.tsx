import React, { useRef, useEffect, useState, ReactNode } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/main-loop';
import { BiomeType, BuildingType, GameWorldState, RoadPiece } from '../game/types/world-types';
import { renderGame } from '../game/renderer/renderer';
import { renderDebugGame } from '../game/renderer/debug-renderer';
import { GameInputController } from './game-input-controller';
import { BACKGROUND_COLOR } from '../game/constants/rendering-constants';
import { HEIGHT_MAP_RESOLUTION, MAP_HEIGHT, MAP_WIDTH } from '../game/constants/world-constants';
import {
  generateBiomeMap,
  generateHeightMap,
  generateRabbits,
  generateTrees,
  initWorld,
} from '../game/game-factory';
import { createEntities } from '../game/ecs/entity-manager';
import { IntroAnimState, initIntroAnimation, updateIntroAnimation } from './intro-animation';
import { useWebGpuRenderer } from '../context/webgpu-renderer-context';
import { computeLightDirection } from '../game/utils/light-utils';

const containerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100vw',
  height: '100vh',
  backgroundColor: BACKGROUND_COLOR,
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
};

interface GameWorldControllerProps {
  mode: 'intro' | 'game';
  initialState?: GameWorldState;
  children?: ReactNode;
}

export const GameWorldController: React.FC<GameWorldControllerProps> = ({ mode, initialState, children }) => {
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState | null>(null);
  const animStateRef = useRef<IntroAnimState | null>(null);
  const lastUpdateTimeRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const renderer = useWebGpuRenderer();

  // Initialization Effect
  useEffect(() => {
    const webgpuCanvas = webgpuCanvasRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !webgpuCanvas) return;

    ctxRef.current = canvas.getContext('2d');
    if (!ctxRef.current) return;

    const handleResize = () => {
      webgpuCanvas.width = window.innerWidth;
      webgpuCanvas.height = window.innerHeight;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Initialize game state based on mode
    let worldState: GameWorldState;
    if (mode === 'intro') {
      const heightMap = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);
      const biomeMap = generateBiomeMap(heightMap);
      const gridHeight = heightMap.length;
      const gridWidth = heightMap[0]?.length ?? 0;
      const roadMap: (RoadPiece | null)[][] = Array.from({ length: gridHeight }, () =>
        new Array(gridWidth).fill(null),
      );
      const entities = createEntities();
      generateTrees(entities, biomeMap, HEIGHT_MAP_RESOLUTION);
      generateRabbits(entities, biomeMap, HEIGHT_MAP_RESOLUTION);
      worldState = {
        time: 0,
        entities: entities,
        mapDimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
        heightMap,
        biomeMap,
        roadMap,
        viewportCenter: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
        viewportZoom: 1.0,
        isPaused: false,
        gameOver: false,
        performanceMetrics: { currentBucket: { renderTime: 0, worldUpdateTime: 0, aiUpdateTime: 0 }, history: [] },
        terrainEditingMode: false,
        biomeEditingMode: false,
        selectedBiome: BiomeType.GRASS,
        editorBrush: { position: { x: 0, y: 0 }, radius: 0 },
        wireframeMode: false,
        roadEditingMode: false,
        lastRoadPosition: null,
        previewRoadPosition: null,
        buildingPlacementMode: false,
        selectedBuilding: BuildingType.HOUSE,
        previewBuildingPosition: null,
        isValidBuildingPlacement: false,
        debugMode: true,
      };
      animStateRef.current = initIntroAnimation(
        heightMap,
        { width: MAP_WIDTH, height: MAP_HEIGHT },
        { baseZoom: 0.8, focusZoom: 2.0, poiCount: 8 },
      );
    } else {
      worldState = initialState || initWorld();
      // Ensure debugMode is initialized if not present
      if (worldState.debugMode === undefined) {
        worldState.debugMode = true;
      }
    }
    gameStateRef.current = worldState;

    // Initialize WebGPU terrain using the context
    (async () => {
      if (gameStateRef.current) {
        await renderer.initTerrain(
          webgpuCanvas,
          gameStateRef.current.heightMap,
          gameStateRef.current.biomeMap,
          gameStateRef.current.roadMap,
          gameStateRef.current.mapDimensions,
          HEIGHT_MAP_RESOLUTION,
        );
        setIsInitialized(true); // Signal that we are ready to render
      }
    })();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mode, initialState, renderer]);

  // Main Render Loop
  useRafLoop((time) => {
    let gameState = gameStateRef.current;
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const webgpuCanvas = webgpuCanvasRef.current;

    if (!isInitialized || !gameState || !ctx || !canvas || !webgpuCanvas) {
      return;
    }

    const deltaTime = lastUpdateTimeRef.current ? (time - lastUpdateTimeRef.current) / 1000 : 1 / 60;
    lastUpdateTimeRef.current = time;

    let viewportCenter = gameState.viewportCenter;
    let viewportZoom = gameState.viewportZoom;
    let lightDir = undefined;

    // Update world state based on mode
    if (mode === 'intro' && animStateRef.current) {
      const anim = updateIntroAnimation(animStateRef.current, deltaTime, 0.5);
      viewportCenter = anim.center;
      viewportZoom = anim.zoom;
      lightDir = anim.lightDir;
      gameState.time = animStateRef.current.lightTime; // Use animation time for water
    } else if (mode === 'game') {
      if (!gameState.isPaused && !gameState.gameOver) {
        const updatedState = updateWorld(gameState, deltaTime);
        gameStateRef.current = updatedState;
        gameState = updatedState; // Use the updated state for rendering this frame
      }
      lightDir = computeLightDirection(gameState.time);
    }

    // --- RENDER ---
    if (gameState.debugMode) {
      // Debug Mode: Render simplified view
      // Clear WebGPU canvas (or just hide it via CSS if we wanted, but clearing is fine)
      // Actually, we can just not call renderTerrain. The canvas will keep its last frame unless cleared.
      // Let's clear the 2D canvas and draw debug info.
      // Ideally we should clear the WebGPU canvas too or cover it.
      // Since debug renderer fills background, we just need to make sure it covers everything.
      // But wait, debug renderer draws to `ctx` (2D canvas). The WebGPU canvas is behind it (zIndex 0).
      // If debug renderer fills the 2D canvas with opaque color, it will hide the WebGPU canvas.
      
      renderDebugGame(
        ctx,
        gameState,
        viewportCenter,
        viewportZoom,
        { width: canvas.width, height: canvas.height },
        deltaTime
      );
    } else {
      // Standard Mode: Render full visuals
      
      // 1. Render terrain (WebGPU)
      renderer.renderTerrain(viewportCenter, viewportZoom, gameState.time, lightDir);

      // 2. Render entities (Canvas 2D)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderGame(
        ctx,
        gameState,
        viewportCenter,
        viewportZoom,
        {
          width: canvas.width,
          height: canvas.height,
        },
        lightDir,
      );
    }
  });

  return (
    <div style={containerStyle}>
      <canvas ref={webgpuCanvasRef} style={{ ...canvasStyle, zIndex: 0 }} />
      <canvas ref={canvasRef} style={{ ...canvasStyle, zIndex: 1 }} />
      {/* Render UI overlays */}
      {children}
      {/* Conditionally render input controller */}
      {mode === 'game' && (
        <GameInputController
          isActive={() => isInitialized}
          gameStateRef={gameStateRef as React.MutableRefObject<GameWorldState>}
          updateTerrainHeightMap={renderer.updateTerrainHeightMap}
          updateBiomeMap={renderer.updateBiomeMap}
          updateRoadMap={renderer.updateRoadMap}
        />
      )}
    </div>
  );
};
