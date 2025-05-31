import { State } from '../../../../state-machine/state-machine-types';
import { HUMAN_HUNGER_DEATH, HUMAN_MAX_AGE_YEARS, HUMAN_BERRY_HUNGER_REDUCTION } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { HumanStateData, HUMAN_EATING, HUMAN_DYING, HUMAN_IDLE } from './human-state-types';

// Define the human eating state
export const humanEatingState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_EATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
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
          previousState: HUMAN_EATING,
          cause: 'oldAge',
        },
      };
    }

    if (entity.activeAction !== 'eating') {
      // If not actively eating, return to idle state
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
        },
      };
    }

    // Eat a berry (reduce hunger, decrement berry count)
    if (
      entity.berries > 0 &&
      (!entity.eatingCooldownTime || updateContext.gameState.time >= entity.eatingCooldownTime) &&
      entity.hunger > HUMAN_BERRY_HUNGER_REDUCTION
    ) {
      entity.hunger = Math.max(0, entity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
      entity.berries = Math.max(0, entity.berries - 1);
      entity.eatingCooldownTime = updateContext.gameState.time + 1; // 1 second cooldown after eating
    }

    // After eating, return to idle
    return {
      nextState: HUMAN_EATING,
      data: data,
    };
  },
  onEnter: (context, nextData) => {
    // Reset acceleration and velocity when entering eating state
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
