import { useRef, useState } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { gameWorldUpdate } from './game-world/game-world-update';
import { createRenderState, RenderState, updateRenderState } from './game-render/render-state';
import { DevConfigPanel } from './dev/dev-config-panel';
import { GameOverScreen } from './game-over-screen';
import { InputController } from './game-input/input-controller';
import { gameWorldInit } from './game-world/game-world-update';

const UPDATE_STEP = 1000 / 60; // 60 FPS
const MAX_DELTA_TIME = 1000; // Maximum time step to prevent spiral of death

export function PlayScreen() {
  const gameStateRef = useRef<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>({
    gameWorldState: gameWorldInit(),
    renderState: createRenderState(),
  });
  const [gameState, setGameState] = useState(() => ({ ...gameStateRef.current.gameWorldState }));
  const [isGameOver, setIsGameOver] = useState(false);

  // Function to handle game restart
  const handleRestart = () => {
    // Reset game state to initial state
    gameStateRef.current = {
      gameWorldState: gameWorldInit(),
      renderState: createRenderState(),
    };
    setIsGameOver(false);
  };

  useRafLoop(() => {
    const currentTime = Date.now();
    let deltaTime = currentTime - gameStateRef.current.gameWorldState.time;

    // Prevent large time steps that could cause physics issues
    if (deltaTime > MAX_DELTA_TIME) {
      gameStateRef.current.gameWorldState.time = currentTime - MAX_DELTA_TIME;
      deltaTime = MAX_DELTA_TIME;
    }

    while (deltaTime >= 0) {
      const stepTime = Math.min(deltaTime, UPDATE_STEP);

      // Update game world
      gameStateRef.current.gameWorldState = gameWorldUpdate({
        gameState: gameStateRef.current.gameWorldState,
        deltaTime: stepTime,
      });

      // Update render state
      gameStateRef.current.renderState = updateRenderState(
        gameStateRef.current.gameWorldState,
        gameStateRef.current.renderState,
        stepTime,
      );

      deltaTime -= UPDATE_STEP;
    }

    if (gameStateRef.current.gameWorldState.gameOver && !isGameOver) {
      setIsGameOver(true);
    }

    // Update game state for UI every second
    if (gameStateRef.current.gameWorldState.time - gameState.time >= 1000) {
      setGameState({ ...gameStateRef.current.gameWorldState });
    }
  });

  return (
    <>
      <GameViewport gameStateRef={gameStateRef} />
      <InputController gameStateRef={gameStateRef} />
      <DevConfigPanel />
      {isGameOver && gameStateRef.current.gameWorldState.gameOverStats && (
        <GameOverScreen stats={gameStateRef.current.gameWorldState.gameOverStats} onRestart={handleRestart} />
      )}
    </>
  );
}
