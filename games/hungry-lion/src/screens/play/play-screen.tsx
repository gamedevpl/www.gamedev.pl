import { useRef, useState } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { gameWorldInit, gameWorldUpdate } from './game-world/game-world-update';
import { createRenderState, RenderState, updateRenderState } from './game-render/render-state';
import { DevConfigPanel } from './dev/dev-config-panel';
import { GameOverScreen } from './game-over-screen';

const UPDATE_STEP = 1000 / 60; // 60 FPS
const MAX_FRAME_TIME = 1000; // Maximum frame time to prevent spiral of death if tab is backgrounded

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

  // For fixed timestep loop
  const lastFrameTimeRef = useRef(performance.now());
  const accumulatorRef = useRef(0);

  // Function to handle game restart
  const handleRestart = () => {
    // Reset game state to initial state
    gameStateRef.current = {
      gameWorldState: gameWorldInit(),
      renderState: createRenderState(),
    };
    setIsGameOver(false);
    // Reset time tracking for the new game
    lastFrameTimeRef.current = performance.now();
    accumulatorRef.current = 0;
  };

  useRafLoop(() => {
    if (gameStateRef.current.gameWorldState.gameOver) {
        // If game is over, no more game logic updates needed for the current game instance.
        // The useRafLoop will continue running but we skip the main logic.
        // isGameOver state will ensure the GameOverScreen is displayed.
        return;
    }

    const currentTime = performance.now();
    let frameTime = currentTime - lastFrameTimeRef.current;
    lastFrameTimeRef.current = currentTime;

    // Prevent large frame times (e.g., when tab is backgrounded or on performance spikes)
    if (frameTime > MAX_FRAME_TIME) {
      frameTime = MAX_FRAME_TIME;
    }

    accumulatorRef.current += frameTime;

    while (accumulatorRef.current >= UPDATE_STEP) {
      // Update game world with fixed step
      gameStateRef.current.gameWorldState = gameWorldUpdate({
        gameState: gameStateRef.current.gameWorldState,
        deltaTime: UPDATE_STEP, // Use fixed UPDATE_STEP
      });

      // Update render state
      gameStateRef.current.renderState = updateRenderState(
        gameStateRef.current.gameWorldState,
        gameStateRef.current.renderState,
        UPDATE_STEP, // Pass UPDATE_STEP (its value is not used by updateRenderState currently)
      );

      accumulatorRef.current -= UPDATE_STEP;

      // Check for game over after each simulation step
      if (gameStateRef.current.gameWorldState.gameOver && !isGameOver) {
        setIsGameOver(true);
        // UI will update due to isGameOver changing, or the periodic update below
      }
    }

    // Update game state for UI (e.g., score, time display if it were live)
    // This ensures the UI (like a live timer if we had one) updates, and GameOverScreen appears.
    if (gameStateRef.current.gameWorldState.time - gameState.time >= 1000 || (isGameOver && gameState.gameOver !== true) ) {
      setGameState({ ...gameStateRef.current.gameWorldState });
    }
  });

  return (
    <>
      <GameViewport gameStateRef={gameStateRef} />
      <DevConfigPanel />
      {isGameOver && gameStateRef.current.gameWorldState.gameOverStats && (
        <GameOverScreen stats={gameStateRef.current.gameWorldState.gameOverStats} onRestart={handleRestart} />
      )}
    </>
  );
}
