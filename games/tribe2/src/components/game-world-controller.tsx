import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/main-loop';
import { GameWorldState } from '../game/types/game-types';
import { renderGame } from '../game/renderer/renderer';
import { Vector2D } from '../game/types/math-types';
import { GameInputController } from './game-input-controller';
import { renderWebGPUTerrain } from '../game/renderer/webgpu-renderer';

interface GameWorldControllerProps {
  gameStateRef: React.MutableRefObject<GameWorldState>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  viewportZoomRef: React.MutableRefObject<number>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const GameWorldController: React.FC<GameWorldControllerProps> = ({
  gameStateRef,
  ctxRef,
  viewportCenterRef,
  viewportZoomRef,
  canvasRef,
}) => {
  const lastUpdateTimeRef = useRef<number>(null);

  const gameLoopCallback: FrameRequestCallback = (time) => {
    const { current: ctx } = ctxRef;
    const { current: gameState } = gameStateRef;
    const { current: canvas } = canvasRef;

    if (!canvas) {
      lastUpdateTimeRef.current = time;
      return;
    }

    if (!lastUpdateTimeRef.current) {
      lastUpdateTimeRef.current = time;
      return;
    }

    if (gameState.isPaused || gameState.gameOver) {
      lastUpdateTimeRef.current = time;
      return;
    }

    const deltaTime = Math.min(time - lastUpdateTimeRef.current, 1000) / 1000;

    // Update world
    const worldUpdateStart = performance.now();
    gameStateRef.current = updateWorld(gameState, deltaTime);
    const worldUpdateTime = performance.now() - worldUpdateStart;

    // Render terrain (WebGPU) first
    if (gameStateRef.current.webgpu) {
      renderWebGPUTerrain(gameStateRef.current.webgpu, viewportCenterRef.current, viewportZoomRef.current);
    }

    // Render entities/UI (Canvas 2D)
    if (ctx) {
      // Clear to transparent so the WebGPU canvas shows through
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const renderGameStart = performance.now();
      renderGame(ctx, gameStateRef.current, viewportCenterRef.current, viewportZoomRef.current, {
        width: canvas.width,
        height: canvas.height,
      });
      const renderTime = performance.now() - renderGameStart;

      gameStateRef.current.performanceMetrics.currentBucket = {
        worldUpdateTime,
        renderTime,
        aiUpdateTime: 0,
      };
    }

    lastUpdateTimeRef.current = time;
  };

  const [stopLoop, startLoop, isActive] = useRafLoop(gameLoopCallback, false);

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  return <GameInputController isActive={isActive} gameStateRef={gameStateRef} />;
};
