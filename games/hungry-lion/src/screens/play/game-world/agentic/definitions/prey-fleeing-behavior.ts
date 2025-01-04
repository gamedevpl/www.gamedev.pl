import { AgenticBehavior } from '../agentic-types';
import { PreyEntity } from '../../entities-types';
import { getLions } from '../../game-world-query';
import { vectorSubtract, vectorNormalize, vectorDistance, vectorAngleBetween } from '../../math-utils';

const FLEE_ACCELERATION = 0.011;
const FLEE_DISTANCE = 200;
const FLEE_ANGLE_THRESHOLD = Math.PI / 3; // 60 degrees

export const PREY_FLEEING: AgenticBehavior<PreyEntity> = {
  entityType: 'prey',
  perform: (gameState, entity) => {
    const lions = getLions(gameState);
    let nearestLion = null;
    let minDistance = Infinity;

    // Find the nearest lion
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

      // Adjust flee distance based on angle
      const adjustedFleeDistance = angle < FLEE_ANGLE_THRESHOLD ? FLEE_DISTANCE * 0.5 : FLEE_DISTANCE;

      // If a lion is within adjusted flee distance, flee from it
      if (minDistance < adjustedFleeDistance) {
        entity.targetDirection = Math.atan2(normalizedDirection.y, normalizedDirection.x);
        entity.acceleration = FLEE_ACCELERATION;
        entity.state = 'fleeing';
      } else {
        entity.state = 'moving';
      }
    } else {
      entity.state = 'moving';
    }
  },
};
