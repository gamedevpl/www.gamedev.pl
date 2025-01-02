import { GameWorldState } from './game-world-types';
import { updateLion } from './lion-update';
import { updateAllPrey } from './prey-update';

/**
 * Updates the entire game world state for one frame
 */
export function updateGameWorld(state: GameWorldState, deltaTime: number): GameWorldState {
  state.time += deltaTime;

  if (!state.gameOver) {
    // Update lion state including movement, hunger and prey catching
    updateLion(state, deltaTime);
    
    // Update all prey entities
    state.prey = updateAllPrey(state, deltaTime);

    // Remove fully eaten prey from the game world
    state.prey = state.prey.filter(prey => !prey.isEaten);
  }

  return state;
}

// Re-export coordinate utilities for backward compatibility
export { calculateWorldCoordinates, calculateInputPosition } from './coordinate-utils';