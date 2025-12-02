import { updateBehaviorTree } from './behavior-tree-update';
import { stateUpdate } from '../state-machine/state-machine-update';
import { Entity, GameWorldState } from '../types/world-types';
import { vectorAdd, vectorLength, vectorNormalize, vectorScale } from '../utils/math-utils';

/**
 * Updates a single entity, including its physics, state machine, and behavior tree.
 *
 * @param entity The entity to update.
 * @param state The current game world state.
 * @param deltaTime The time elapsed since the last frame in seconds.
 */
export function updateEntity(entity: Entity, state: GameWorldState, deltaTime: number): void {
  // --- State Machine and AI Updates ---
  // These should run before physics to allow AI to set forces/direction for the current frame.
  if (entity.stateMachine) {
    const [currentState, stateData] = entity.stateMachine;
    const [nextStateType, nextStateData] = stateUpdate(
      currentState,
      stateData,
      { entity, deltaTime, gameState: state }
    );
    entity.stateMachine = [nextStateType, nextStateData];
  }
  if (entity.behaviorTree) {
    updateBehaviorTree(entity, state, deltaTime);
  }

  // --- Physics Update ---
  // Handle debuffs if present
  if (entity.debuffs) {
    entity.debuffs.forEach((debuff) => {
      if (debuff.type === 'slow') {
        // Apply debuff effect - reduce velocity by 50%
        entity.velocity = vectorScale(entity.velocity, 0.5);
      }
    });
    // Clean up expired debuffs
    entity.debuffs = entity.debuffs.filter((debuff) => {
      const elapsedTime = state.time * 1000 - debuff.startTime;
      return elapsedTime < debuff.duration;
    });
  }

  // Apply friction/damping
  entity.forces.push(vectorScale(entity.velocity, -0.1));

  // Apply acceleration force based on direction
  const accelerationForce = vectorScale(vectorNormalize(entity.direction), entity.acceleration);
  entity.forces.push(accelerationForce);

  // Apply accumulated forces to velocity
  entity.velocity = vectorAdd(entity.velocity, entity.forces.reduce(vectorAdd, { x: 0, y: 0 }));

  // Zero velocity if it's too small to prevent drifting
  if (vectorLength(entity.velocity) < 0.001) {
    entity.velocity = { x: 0, y: 0 };
  }

  // Update position based on velocity
  entity.position = vectorAdd(entity.position, vectorScale(entity.velocity, deltaTime));

  // --- World Wrapping ---
  const { width, height } = state.mapDimensions;
  entity.position.x = ((entity.position.x % width) + width) % width;
  entity.position.y = ((entity.position.y % height) + height) % height;

  // Reset forces for the next frame
  entity.forces = [];
}
