import { LionEntity, PreyEntity } from '../../../entities/entities-types';
import { getLions } from '../../../game-world-query';
import {
  vectorAngleBetween,
  calculateWrappedDistance, // Use wrapped distance
  vectorNormalize,
  calculateWrappedVectorDifference, // Use wrapped difference for direction
} from '../../../utils/math-utils';
import { StateContext } from '../../state-machine-types';

// Constants from existing behaviors
export const IDLE_CHANCE = 0.5;
export const MAX_SPEED_VARIATION = 0.005;
export const FLEE_ACCELERATION = 0.011;
export const FLEE_DISTANCE = 300;
export const FLEE_ANGLE_THRESHOLD = Math.PI / 3;
export const AMBUSH_DISTANCE_MODIFIER = 5;

// Helper function to check if prey needs to flee
export function shouldFlee(entity: PreyEntity, context: StateContext<PreyEntity>): boolean {
  const lions = getLions(context.updateContext.gameState);
  let nearestLion = null;
  let minDistance = Infinity;

  for (const lion of lions) {
    // Use wrapped distance for detection
    let distance = calculateWrappedDistance(entity.position, lion.position);
    if (lion.stateMachine[0] === 'LION_AMBUSH') {
      distance *= AMBUSH_DISTANCE_MODIFIER; // Ambush makes lion harder to detect initially
    }
    if (distance < minDistance) {
      minDistance = distance;
      nearestLion = lion;
    }
  }

  if (nearestLion) {
    // Use wrapped difference to determine the direction vector
    const directionVector = calculateWrappedVectorDifference(entity.position, nearestLion.position);
    const normalizedDirection = vectorNormalize(directionVector);
    const preyDirectionVector = {
      x: Math.cos(entity.direction),
      y: Math.sin(entity.direction),
    };
    const angle = vectorAngleBetween(preyDirectionVector, normalizedDirection);

    // Adjust flee distance based on whether prey is facing the threat
    const adjustedFleeDistance = angle < FLEE_ANGLE_THRESHOLD ? FLEE_DISTANCE * 0.5 : FLEE_DISTANCE;
    return minDistance < adjustedFleeDistance;
  }

  return false;
}

// Helper function to update fleeing behavior
export function updateFleeing(entity: PreyEntity, context: StateContext<PreyEntity>): void {
  const lions = getLions(context.updateContext.gameState);
  const nearestLion = lions.reduce<LionEntity | null>((nearest, lion) => {
    // Use wrapped distance to find the nearest lion
    const distance = calculateWrappedDistance(entity.position, lion.position);
    if (!nearest) return lion;
    const nearestDistance = calculateWrappedDistance(entity.position, nearest.position);
    return distance < nearestDistance ? lion : nearest;
  }, null);

  if (nearestLion) {
    // Flee directly away from the nearest lion using wrapped difference for direction
    const directionVector = calculateWrappedVectorDifference(entity.position, nearestLion.position);
    const normalizedDirection = vectorNormalize(directionVector);
    entity.targetDirection = Math.atan2(normalizedDirection.y, normalizedDirection.x);
    // Reduce acceleration based on stamina
    entity.acceleration = FLEE_ACCELERATION - (FLEE_ACCELERATION * (1 - entity.staminaLevel / 100)) / 2;
  }
}
