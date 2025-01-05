import { LionEntity, PreyEntity } from '../../../entities/entities-types';
import { getLions } from '../../../game-world-query';
import { vectorAngleBetween, vectorDistance, vectorNormalize, vectorSubtract } from '../../../utils/math-utils';
import { StateContext } from '../../state-machine-types';

// Constants from existing behaviors
export const IDLE_CHANCE = 0.5;
export const MAX_SPEED_VARIATION = 0.005;
export const FLEE_ACCELERATION = 0.011;
export const FLEE_DISTANCE = 300;
export const FLEE_ANGLE_THRESHOLD = Math.PI / 3;

// Helper function to check if prey needs to flee
export function shouldFlee(entity: PreyEntity, context: StateContext<PreyEntity>): boolean {
  const lions = getLions(context.updateContext.gameState);
  let nearestLion = null;
  let minDistance = Infinity;

  for (const lion of lions) {
    const distance = vectorDistance(entity.position, lion.position);
    if (distance < minDistance) {
      minDistance = distance;
      nearestLion = lion;
    }
  }

  if (nearestLion) {
    const directionVector = vectorSubtract(entity.position, nearestLion.position);
    const normalizedDirection = vectorNormalize(directionVector);
    const preyDirectionVector = { x: Math.cos(entity.direction), y: Math.sin(entity.direction) };
    const angle = vectorAngleBetween(preyDirectionVector, normalizedDirection);

    const adjustedFleeDistance = angle < FLEE_ANGLE_THRESHOLD ? FLEE_DISTANCE * 0.5 : FLEE_DISTANCE;
    return minDistance < adjustedFleeDistance;
  }

  return false;
}

// Helper function to update fleeing behavior
export function updateFleeing(entity: PreyEntity, context: StateContext<PreyEntity>): void {
  const lions = getLions(context.updateContext.gameState);
  const nearestLion = lions.reduce<LionEntity | null>((nearest, lion) => {
    const distance = vectorDistance(entity.position, lion.position);
    return !nearest || distance < vectorDistance(entity.position, nearest.position) ? lion : nearest;
  }, null);

  if (nearestLion) {
    const directionVector = vectorSubtract(entity.position, nearestLion.position);
    const normalizedDirection = vectorNormalize(directionVector);
    entity.targetDirection = Math.atan2(normalizedDirection.y, normalizedDirection.x);
    entity.acceleration = FLEE_ACCELERATION - (FLEE_ACCELERATION * (1 - entity.staminaLevel / 100)) / 2;
  }
}
