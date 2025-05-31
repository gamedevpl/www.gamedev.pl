import { State } from '../../../../state-machine/state-machine-types';
import { HUMAN_HUNGER_DEATH, HUMAN_MAX_AGE_YEARS, HUMAN_HUNGER_THRESHOLD_SLOW } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { HumanStateData, HUMAN_HUNGRY, HUMAN_DYING, HUMAN_IDLE } from './human-state-types';

// Define the human hungry state
export const humanHungryState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_HUNGRY,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_HUNGRY,
          cause: 'hunger',
        },
      };
    }

    if (entity.age >= HUMAN_MAX_AGE_YEARS) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_HUNGRY,
          cause: 'oldAge',
        },
      };
    }

    // Check if hunger has dropped below threshold
    if (entity.hunger < HUMAN_HUNGER_THRESHOLD_SLOW) {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_HUNGRY,
        },
      };
    }

    // Apply slow debuff while in hungry state
    entity.debuffs = entity.debuffs.filter((debuff) => debuff.type !== 'slow');
    entity.debuffs.push({
      type: 'slow',
      startTime: updateContext.gameState.time,
      duration: 0.1, // Very short duration, will be reapplied each update
    });

    return { nextState: HUMAN_HUNGRY, data };
  },
  onEnter: (context, nextData) => {
    // Apply slow debuff when entering hungry state
    context.entity.debuffs.push({
      type: 'slow',
      startTime: context.updateContext.gameState.time,
      duration: 0.1, // Very short duration, will be reapplied each update
    });

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
