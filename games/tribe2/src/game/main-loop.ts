import { updateEntity } from './ecs/entity-updater';
import { EntityType, GameWorldState } from './types/world-types';
import { MAX_REAL_TIME_DELTA } from './constants/world-constants';

/**
 * The main update function for the entire game world.
 * It advances time, updates all entities, and handles other global systems.
 *
 * @param currentState The current state of the game world.
 * @param realDeltaTimeSeconds The real-world time elapsed since the last frame in seconds.
 * @returns The updated game world state.
 */
export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  if (currentState.isPaused) {
    return currentState;
  }

  // Process time in fixed chunks to ensure stability
  while (realDeltaTimeSeconds > 0) {
    const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

    // Accumulate real-world time in seconds
    currentState.time += deltaTime;

    // --- Core System Updates ---

    // 1. Update all entities (physics, state machines, AI)
    for (const entity of currentState.entities.entities.values()) {
      // Skip static entities like trees
      if (entity.type === EntityType.TREE) {
        continue;
      }
      updateEntity(entity, currentState, deltaTime);
    }

    // 2. Process interactions between entities
    // TODO: Call interactions update here

    // 3. Update visual effects
    // TODO: Call visual effects update here

    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
