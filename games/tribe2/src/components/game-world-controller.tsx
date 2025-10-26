import React, { useRef, useEffect, useState, ReactNode } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/main-loop';
import { BiomeType, GameWorldState } from '../game/types/world-types';
import { renderGame } from '../game/renderer/renderer';
import { GameInputController } from './game-input-controller';
import { BACKGROUND_COLOR } from '../game/constants/rendering-constants';
import { HEIGHT_MAP_RESOLUTION, MAP_HEIGHT, MAP_WIDTH } from '../game/constants/world-constants';
import { generateBiomeMap, generateHeightMap, generateTrees, initWorld } from '../game/game-factory';
import { createEntities } from '../game/ecs/entity-manager';
import { IntroAnimState, initIntroAnimation, updateIntroAnimation } from './intro-animation';
import { useWebGpuRenderer } from '../context/webgpu-renderer-context';

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
      const entities = createEntities();
      generateTrees(entities, biomeMap, HEIGHT_MAP_RESOLUTION);
      worldState = {
        time: 0,
        entities: entities,
        mapDimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
        heightMap,
        biomeMap,
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
      };
      animStateRef.current = initIntroAnimation(
        heightMap,
        { width: MAP_WIDTH, height: MAP_HEIGHT },
        { baseZoom: 0.8, focusZoom: 2.0, poiCount: 8 },
      );
    } else {
      worldState = initialState || initWorld();
    }
    gameStateRef.current = worldState;

    // Initialize WebGPU terrain using the context
    (async () => {
      if (gameStateRef.current) {
        await renderer.initTerrain(
          webgpuCanvas,
          gameStateRef.current.heightMap,
          gameStateRef.current.biomeMap,
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
    const gameState = gameStateRef.current;
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    if (!isInitialized || !gameState || !ctx || !canvas) {
      return;
    }

    const deltaTime = lastUpdateTimeRef.current ? Math.min(time - lastUpdateTimeRef.current, 1000) / 1000 : 1 / 60;
    lastUpdateTimeRef.current = time;

    let viewportCenter = gameState.viewportCenter;
    let viewportZoom = gameState.viewportZoom;
    let lightDir = undefined;

    // Update world state based on mode
    if (mode === 'intro' && animStateRef.current) {
      const anim = updateIntroAnimation(animStateRef.current, deltaTime);
      viewportCenter = anim.center;
      viewportZoom = anim.zoom;
      lightDir = anim.lightDir;
      gameState.time = animStateRef.current.lightTime; // Use animation time for water
    } else if (mode === 'game') {
      if (!gameState.isPaused && !gameState.gameOver) {
        gameStateRef.current = updateWorld(gameState, deltaTime);
      }
    }

    // --- RENDER -- -
    // 1. Render terrain (WebGPU)
    renderer.renderTerrain(viewportCenter, viewportZoom, gameState.time, lightDir);

    // 2. Render entities (Canvas 2D)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderGame(ctx, gameState, viewportCenter, viewportZoom, {
      width: canvas.width,
      height: canvas.height,
    });
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
        />
      )}
    </div>
  );
};