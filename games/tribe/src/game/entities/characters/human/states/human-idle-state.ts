import { State } from '../../../../state-machine/state-machine-types';
import { HUMAN_HUNGER_DEATH, HUMAN_MAX_AGE_YEARS, HUMAN_HUNGER_THRESHOLD_SLOW } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import {
  HumanStateData,
  HUMAN_IDLE,
  HUMAN_DYING,
  HUMAN_HUNGRY,
  HUMAN_MOVING,
  HUMAN_GATHERING,
  HUMAN_EATING,
} from './human-state-types';

// Define the human idle state
export const humanIdleState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_IDLE,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
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
          previousState: HUMAN_IDLE,
          cause: 'oldAge',
        },
      };
    }

    // Check for hunger threshold
    if (entity.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
      return {
        nextState: HUMAN_HUNGRY,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    if (entity.activeAction === 'moving') {
      return {
        nextState: HUMAN_MOVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          targetPosition: entity.targetPosition,
        },
      };
    }

    if (entity.activeAction === 'gathering') {
      // If the entity is gathering, it should not be idle
      return {
        nextState: HUMAN_GATHERING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          targetPosition: entity.targetPosition,
        },
      };
    }

    if (entity.activeAction === 'eating') {
      // If the entity is eating, it should not be idle
      return {
        nextState: HUMAN_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    return { nextState: HUMAN_IDLE, data };
  },
  onEnter: (context, nextData) => {
    // Reset acceleration and velocity when entering idle state
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
