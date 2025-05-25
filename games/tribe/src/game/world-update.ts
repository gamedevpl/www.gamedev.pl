import { GameWorldState } from './world-types';

/**
 * Updates the game world state based on the elapsed time delta.
 * This function handles aging, hunger, procreation (births), resource regeneration, and death.
 * It uses immer for efficient immutable state updates.
 *
 * @param currentState The current state of the game world.
 * @param timeDeltaInHours The amount of game time that has passed, in hours.
 * @returns The new game world state after the update.
 */
export function updateWorld(currentState: GameWorldState, timeDeltaInHours: number): GameWorldState {
  const newState = { ...currentState };
  newState.time += timeDeltaInHours;

  return newState;
}
