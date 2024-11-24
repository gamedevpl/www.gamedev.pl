import { useRef } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { updateGameWorld } from './game-world/game-world-update';
import { createRenderState, RenderState, updateRenderState } from './game-render/render-state';
import { createSanta } from './game-world/game-world-manipulate';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world/game-world-consts';

// Create initial Santa
const PLAYER_SANTA = createSanta(
  'player_santa',
  GAME_WORLD_WIDTH / 2, // Start in horizontal center
  GAME_WORLD_HEIGHT * 0.7, // Start at 70% of screen height
  true, // Mark as player-controlled
);

const INITIAL_STATE: GameWorldState = {
  time: Date.now(),
  playerSanta: PLAYER_SANTA,
  santas: [PLAYER_SANTA], // Add player Santa to initial state
  gifts: [],
  chimneys: [],
  fireballs: [],
};

const UPDATE_STEP = 1000 / 60; // 60 FPS
const MAX_DELTA_TIME = 1000; // Maximum time step to prevent spiral of death

export function PlayScreen() {
  const gameStateRef = useRef<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>({
    gameWorldState: INITIAL_STATE,
    renderState: createRenderState(),
  });

  useRafLoop(() => {
    let deltaTime = Date.now() - gameStateRef.current.gameWorldState.time;

    // Prevent large time steps that could cause physics issues
    if (deltaTime > MAX_DELTA_TIME) {
      gameStateRef.current.gameWorldState.time = Date.now() - MAX_DELTA_TIME;
      deltaTime = MAX_DELTA_TIME;
    }

    while (deltaTime >= 0) {
      const stepTime = Math.min(deltaTime, UPDATE_STEP);

      // Update game world
      gameStateRef.current.gameWorldState = updateGameWorld(gameStateRef.current.gameWorldState, stepTime);

      // Update render state
      gameStateRef.current.renderState = updateRenderState(
        gameStateRef.current.gameWorldState,
        gameStateRef.current.renderState,
        stepTime,
      );

      deltaTime -= UPDATE_STEP;
    }
  });

  return <GameViewport gameStateRef={gameStateRef} />;
}
