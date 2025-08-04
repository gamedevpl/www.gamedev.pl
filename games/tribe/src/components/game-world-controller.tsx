import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/world-update';
import { DebugPanelType, GameWorldState } from '../game/world-types';
import { renderGame } from '../game/render';
import { findPlayerEntity, getAvailablePlayerActions } from '../game/utils/world-utils';
import { playSound } from '../game/sound/sound-utils';
import { SoundType } from '../game/sound/sound-types';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint } from '../game/ui/ui-types';
import { GameInputController } from './game-input-controller';
import { updateViewportCenter } from '../game/utils/camera-utils';
import { AppState } from '../context/game-context';
import { PERFORMANCE_METRICS_BUFFER_SIZE } from '../game/game-consts';

interface GameWorldControllerProps {
  gameStateRef: React.MutableRefObject<GameWorldState>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  debugPanelTypeRef: React.MutableRefObject<DebugPanelType>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  playerActionHintsRef: React.MutableRefObject<PlayerActionHint[]>;
  keysPressed: React.MutableRefObject<Set<string>>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  setAppState: (state: AppState, details?: { generations: number; cause: string }) => void;
  appState: AppState;
}

export const GameWorldController: React.FC<GameWorldControllerProps> = ({
  gameStateRef,
  ctxRef,
  debugPanelTypeRef,
  viewportCenterRef,
  playerActionHintsRef,
  keysPressed,
  canvasRef,
  setAppState,
  appState,
}) => {
  const lastUpdateTimeRef = useRef<number>();

  const [stopLoop, startLoop, isActive] = useRafLoop((time) => {
    if (!ctxRef.current || !lastUpdateTimeRef.current) {
      lastUpdateTimeRef.current = time;
      return;
    }
    const deltaTime = Math.min(time - lastUpdateTimeRef.current, 1000) / 1000; // Seconds (clamped to 1 second max)

    const { performanceMetrics } = gameStateRef.current;

    performanceMetrics.currentBucket = {
      renderTime: 0,
      worldUpdateTime: 0,
      aiUpdateTime: 0,
    };

    const worldUpdateStart = performance.now();
    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);
    performanceMetrics.currentBucket.worldUpdateTime = performance.now() - worldUpdateStart;

    const player = findPlayerEntity(gameStateRef.current);

    if (player) {
      playerActionHintsRef.current = getAvailablePlayerActions(gameStateRef.current, player);
    } else {
      playerActionHintsRef.current = [];
    }

    // Update viewport center by calling the new utility function
    viewportCenterRef.current = updateViewportCenter(gameStateRef.current, viewportCenterRef.current, deltaTime);

    const renderGameStart = performance.now();
    renderGame(
      ctxRef.current,
      gameStateRef.current,
      viewportCenterRef.current,
      playerActionHintsRef.current,
      { width: canvasRef.current?.width || 800, height: canvasRef.current?.height || 600 }, // canvasDimensions
      false, // isIntro
    );
    performanceMetrics.currentBucket.renderTime = performance.now() - renderGameStart;
    performanceMetrics.history.push({
      bucketTime: gameStateRef.current.time,
      ...performanceMetrics.currentBucket,
    });
    if (performanceMetrics.history.length > PERFORMANCE_METRICS_BUFFER_SIZE) {
      performanceMetrics.history.shift();
    }

    lastUpdateTimeRef.current = time;

    if (gameStateRef.current.gameOver && appState !== 'gameOver') {
      playSound(SoundType.GameOver, {
        masterVolume: gameStateRef.current.masterVolume,
        isMuted: gameStateRef.current.isMuted,
      });
      setAppState('gameOver', {
        generations: gameStateRef.current.generationCount,
        cause: gameStateRef.current.causeOfGameOver || 'Unknown',
      });
    }
  }, false);

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  return (
    <GameInputController
      isActive={isActive}
      gameStateRef={gameStateRef}
      canvasRef={canvasRef}
      viewportCenterRef={viewportCenterRef}
      playerActionHintsRef={playerActionHintsRef}
      debugPanelTypeRef={debugPanelTypeRef}
      keysPressed={keysPressed}
    />
  );
};
