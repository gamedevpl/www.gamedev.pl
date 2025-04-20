import { InteractionDefinition } from '../interactions-types';
import { calculateWrappedDistance, vectorNormalize, vectorSubtract, vectorScale } from '../../utils/math-utils'; // Import calculateWrappedDistance
import { metricsAggregator } from '../../../../../utils/metrics/metrics-aggregator';
import { LionEntity, PreyEntity } from '../../entities/entities-types';

const HEALTH_DECREMENT = 1;
const FORCE_STRENGTH = 0.005;
const INTERACTION_DISTANCE = 30; // Max distance for interaction

// Lion-prey interaction definition
export const LION_PREY_INTERACTION: InteractionDefinition = {
  sourceType: 'lion',
  targetType: 'prey',

  minDistance: 0,
  maxDistance: INTERACTION_DISTANCE, // Use constant

  checker: (source, target) => {
    // Use wrapped distance for checking interaction range
    const distance = calculateWrappedDistance(source.position, target.position);
    return distance < INTERACTION_DISTANCE;
  },

  perform: (source, target, updateContext) => {
    const lion = source as LionEntity;
    const prey = target as PreyEntity;

    metricsAggregator.recordCatchEvent(lion.hungerLevel);
    // Reduce prey health
    prey.health = Math.max(prey.health - HEALTH_DECREMENT, 0);

    // Apply slow debuff
    prey.debuffs.push({
      type: 'slow',
      startTime: updateContext.gameState.time,
      duration: 500, // Debuff duration in ms
    });

    // Apply force towards lion (pull effect)
    // Note: This direction might not be the shortest path in wrapped world, but represents direct pull
    const direction = vectorNormalize(vectorSubtract(source.position, prey.position)); 
    const force = vectorScale(direction, FORCE_STRENGTH);
    prey.forces.push(force);
  },
};
