import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';
import { GameWorldState } from './game-world-types';
import { createInitialPrey } from './prey-init';

// Function to create initial game state
export function createInitialState(): GameWorldState {
  const initialTime = Date.now();
  const initialHungerLevel = 50; // Start at 50% hunger

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
      hunger: {
        level: initialHungerLevel,
        isStarving: initialHungerLevel <= 20, // Starvation threshold
        isFull: initialHungerLevel >= 80, // Full threshold
        isGluttonous: initialHungerLevel >= 100, // Gluttonous threshold
        lastEatenTime: 0,
      },
      chaseTarget: null,
    },
    prey: createInitialPrey(),
  };
}
