/**
 * Game Update Loop - Update game state each frame
 */

import { GameState, Entity } from './game-types';
import { vectorAdd, vectorScale } from './utils/math-utils';

/**
 * Update a single entity - simple physics with wrapping boundaries
 */
function updateEntity(entity: Entity, deltaTime: number, worldWidth: number, worldHeight: number): Entity {
  // Update position based on velocity using vector math
  const velocityDelta = vectorScale(entity.velocity, deltaTime);
  const newPosition = vectorAdd(entity.position, velocityDelta);

  // Wrap around world boundaries (toroidal world)
  const wrappedPosition = {
    x: ((newPosition.x % worldWidth) + worldWidth) % worldWidth,
    y: ((newPosition.y % worldHeight) + worldHeight) % worldHeight,
  };

  return {
    ...entity,
    position: wrappedPosition,
  };
}

/**
 * Main game update function
 * Called every frame to update the game state
 */
export function updateGame(state: GameState, deltaTime: number): GameState {
  // Don't update if paused
  if (state.isPaused) {
    return state;
  }

  // Clamp deltaTime to prevent large jumps
  const clampedDelta = Math.min(deltaTime, 0.1);

  // Update game time
  const newTime = state.time + clampedDelta;

  // Update all entities
  const updatedEntities = state.entities.map((entity) =>
    updateEntity(entity, clampedDelta, state.worldWidth, state.worldHeight),
  );

  return {
    ...state,
    time: newTime,
    entities: updatedEntities,
  };
}
