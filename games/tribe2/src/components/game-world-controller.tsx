import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/main-loop';
import { GameWorldState } from '../game/types/game-types';
import { renderGame } from '../game/renderer/renderer';
import { Vector2D } from '../game/types/math-types';
import { GameInputController } from './game-input-controller';

interface GameWorldControllerProps {
  gameStateRef: React.MutableRefObject<GameWorldState>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const GameWorldController: React.FC<GameWorldControllerProps> = ({
  gameStateRef,
  ctxRef,
  viewportCenterRef,
  canvasRef,
}) => {
  const lastUpdateTimeRef = useRef<number>(null);

  // Isolate the callback to help TypeScript's type inference.
  const gameLoopCallback: FrameRequestCallback = (time) => {
    const { current: ctx } = ctxRef;
    const { current: gameState } = gameStateRef;
    const { current: canvas } = canvasRef;

    if (!ctx || !canvas) {
      lastUpdateTimeRef.current = time;
      return;
    }

    if (!lastUpdateTimeRef.current) {
      lastUpdateTimeRef.current = time;
      return;
    }

    if (gameState.isPaused || gameState.gameOver) {
      lastUpdateTimeRef.current = time; // Keep updating time to prevent a large jump when unpausing
      return;
    }

    const deltaTime = Math.min(time - lastUpdateTimeRef.current, 1000) / 1000; // Seconds (clamped)

    // --- Update World ---
    const worldUpdateStart = performance.now();
    gameStateRef.current = updateWorld(gameState, deltaTime);
    const worldUpdateTime = performance.now() - worldUpdateStart;

    // --- Render World ---
    const renderGameStart = performance.now();
    renderGame(ctx, gameStateRef.current, viewportCenterRef.current, {
      width: canvas.width,
      height: canvas.height,
    });
    const renderTime = performance.now() - renderGameStart;

    // --- Performance Metrics ---
    gameStateRef.current.performanceMetrics.currentBucket = {
      worldUpdateTime,
      renderTime,
      aiUpdateTime: 0, // AI is not yet implemented in the core loop
    };

    lastUpdateTimeRef.current = time;
  };

  const [stopLoop, startLoop, isActive] = useRafLoop(gameLoopCallback, false);

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  return <GameInputController isActive={isActive} gameStateRef={gameStateRef} />;
};
