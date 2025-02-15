import { InteractionDefinition } from '../interactions-types';
import { vectorDistance, vectorNormalize, vectorSubtract, vectorScale } from '../../utils/math-utils';
import { metricsAggregator } from '../../../../../utils/metrics/metrics-aggregator';
import { LionEntity, PreyEntity } from '../../entities/entities-types';

const HEALTH_DECREMENT = 1;
const FORCE_STRENGTH = 0.005;

// Lion-prey interaction definition
export const LION_PREY_INTERACTION: InteractionDefinition = {
  sourceType: 'lion',
  targetType: 'prey',

  minDistance: 0,
  maxDistance: 30, // Units of distance for interaction

  checker: (source, target) => {
    const distance = vectorDistance(source.position, target.position);
    return distance < 30; // Same as maxDistance for consistency
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
      duration: 500,
    });

    // Apply force towards lion
    const direction = vectorNormalize(vectorSubtract(source.position, prey.position));
    const force = vectorScale(direction, FORCE_STRENGTH);
    prey.forces.push(force);
  },
};
