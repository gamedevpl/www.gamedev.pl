import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';
import { GameWorldState } from './game-world-types';

// Function to create initial game state
export function createInitialState(): GameWorldState {
  const initialTime = Date.now();

  return {
    time: initialTime,
    gameOver: false,
    lion: {
      position: {
        x: GAME_WORLD_WIDTH / 2,
        y: GAME_WORLD_HEIGHT / 2,
      },
      targetPosition: null,
      movement: {
        isMoving: false,
        speed: 0,
        direction: { x: 0, y: 0 },
      },
    },
  };
}
