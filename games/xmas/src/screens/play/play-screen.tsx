import { useRef, useState } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { updateGameWorld } from './game-world/game-world-update';
import { createRenderState, RenderState, updateRenderState } from './game-render/render-state';
import { createSanta } from './game-world/game-world-manipulate';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world/game-world-consts';
import { initializeWaveState } from './game-ai/ai-santa-spawner';
import { DevConfigPanel } from './dev/dev-config-panel';
import { GameOverScreen } from './game-over-screen';

// Game configuration
const GAME_CONFIG = {
  gifts: {
    maxActive: 5, // Maximum number of gifts in the game world
    initialCount: 3, // Number of gifts to start with
  },
  chimneys: {
    count: 3, // Number of chimneys in the game
    spacing: GAME_WORLD_WIDTH / 4, // Minimum spacing between chimneys
  },
};

// Function to create initial Santa
function createInitialSanta() {
  return createSanta(
    'player_santa',
    GAME_WORLD_WIDTH / 2, // Start in horizontal center
    GAME_WORLD_HEIGHT * 0.7, // Start at 70% of screen height
    true, // Mark as player-controlled
  );
}

// Create initial chimneys
const INITIAL_CHIMNEYS = Array.from({ length: GAME_CONFIG.chimneys.count }, (_, index) => ({
  id: `chimney_${index}`,
  x: (index + 1) * GAME_CONFIG.chimneys.spacing,
  y: GAME_WORLD_HEIGHT * 0.2, // Position chimneys at 20% of screen height
}));

// Function to create initial game state
function createInitialState(): GameWorldState {
  const playerSanta = createInitialSanta();
  return {
    time: Date.now(),
    playerSanta,
    santas: [playerSanta], // Add player Santa to initial state
    gifts: [], // Start with empty gifts array, they will be spawned by the update system
    chimneys: INITIAL_CHIMNEYS,
    fireballs: [],
    waveState: initializeWaveState(),
    lastGiftSpawnTime: Date.now(),
    nextGiftSpawnTime: Date.now(),
    gameOver: false,
    gameOverStats: undefined,
    giftsCollectedCount: 0,
    santasEliminatedCount: 0,
  };
}

const UPDATE_STEP = 1000 / 60; // 60 FPS
const MAX_DELTA_TIME = 1000; // Maximum time step to prevent spiral of death

export function PlayScreen() {
  const gameStateRef = useRef<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>({
    gameWorldState: createInitialState(),
    renderState: createRenderState(),
  });

  const [isGameOver, setIsGameOver] = useState(false);

  // Function to handle game restart
  const handleRestart = () => {
    // Reset game state to initial state
    gameStateRef.current = {
      gameWorldState: createInitialState(),
      renderState: createRenderState(),
    };
    setIsGameOver(false);
  };

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

    if (gameStateRef.current.gameWorldState.gameOver && !isGameOver) {
      setIsGameOver(true);
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
