import { InteractionDefinition } from '../interactions-types';
import { vectorDistance } from '../../utils/math-utils';
import { CarrionEntity, LionEntity } from '../../entities/entities-types';
import { MAX_EATING_DISTANCE } from '../../game-world-consts';

const FOOD_CONSUMPTION_RATE = 0.25;

// Lion-carrion interaction definition
export const LION_CARRION_INTERACTION: InteractionDefinition<LionEntity, CarrionEntity> = {
  sourceType: 'lion',
  targetType: 'carrion',

  minDistance: 0,
  maxDistance: 30, // Units of distance for interaction

  checker: (source, target) => {
    if (source.stateMachine[0] !== 'LION_EATING') {
      return false;
    }

    const distance = vectorDistance(source.position, target.position);
    return distance < MAX_EATING_DISTANCE && (target as CarrionEntity).food > 0;
  },

  perform: (source, target) => {
    const carrion = target as CarrionEntity;

    // Reduce carrion food value
    carrion.food = Math.max(carrion.food - FOOD_CONSUMPTION_RATE, 0);
    source.hungerLevel = Math.min(source.hungerLevel + FOOD_CONSUMPTION_RATE, 100);
  },
};
