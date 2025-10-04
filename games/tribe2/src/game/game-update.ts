/**
 * Game Update Loop - Update game state each frame
 */

import { GameState, Entity } from './game-types';

/**
 * Update a single entity - simple physics with wrapping boundaries
 */
function updateEntity(entity: Entity, deltaTime: number, worldWidth: number, worldHeight: number): Entity {
  // Update position based on velocity
  let newX = entity.position.x + entity.velocity.x * deltaTime;
  let newY = entity.position.y + entity.velocity.y * deltaTime;

  // Wrap around world boundaries (toroidal world)
  newX = ((newX % worldWidth) + worldWidth) % worldWidth;
  newY = ((newY % worldHeight) + worldHeight) % worldHeight;

  return {
    ...entity,
    position: { x: newX, y: newY },
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
