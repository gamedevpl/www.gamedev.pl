import { InteractionDefinition } from '../interactions-types';
import { vectorDistance } from '../../utils/math-utils';
import { CarrionEntity } from '../../entities/entities-types';

const FOOD_CONSUMPTION_RATE = 0.25;

// Lion-carrion interaction definition
export const LION_CARRION_INTERACTION: InteractionDefinition = {
  sourceType: 'lion',
  targetType: 'carrion',

  minDistance: 0,
  maxDistance: 30, // Units of distance for interaction

  checker: (source, target) => {
    const distance = vectorDistance(source.position, target.position);
    return distance < 30 && (target as CarrionEntity).food > 0;
  },

  perform: (_source, target) => {
    const carrion = target as CarrionEntity;

    // Reduce carrion food value
    carrion.food = Math.max(carrion.food - FOOD_CONSUMPTION_RATE, 0);
  },
};
