import { State } from '../../../../state-machine/state-machine-types';
import { HUMAN_HUNGER_THRESHOLD_SLOW } from '../../../../human-consts.ts';
import { HumanEntity } from '../human-types';
import {
  HumanStateData,
  HUMAN_IDLE,
  HUMAN_MOVING,
  HUMAN_GATHERING,
  HUMAN_EATING,
  HUMAN_ATTACKING,
  HumanAttackingStateData,
  HUMAN_PLANTING,
  HumanPlantingStateData,
  HUMAN_DEPOSITING,
  HUMAN_RETRIEVING,
  HUMAN_CHOPPING,
  HumanChoppingStateData,
} from './human-state-types';

// Define the human idle state
export const humanIdleState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_IDLE,
  update: (data, context) => {
    const { entity, updateContext } = context;

    if (entity.activeAction === 'attacking' && entity.attackTargetId) {
      return {
        nextState: HUMAN_ATTACKING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          attackTargetId: entity.attackTargetId,
          attackStartTime: updateContext.gameState.time,
        } as HumanAttackingStateData,
      };
    }

    // Apply slow debuff if hunger is high
    if (entity.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
      entity.debuffs = entity.debuffs.filter((debuff) => debuff.type !== 'slow');
      entity.debuffs.push({
        type: 'slow',
        startTime: updateContext.gameState.time,
        duration: 0.1, // Very short duration, will be reapplied each update cycle while condition met
      });
    } else {
      // Remove slow debuff if hunger is not high
      entity.debuffs = entity.debuffs.filter((debuff) => debuff.type !== 'slow');
    }

    if (entity.activeAction === 'moving') {
      return {
        nextState: HUMAN_MOVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          target: entity.target,
        },
      };
    }

    if (entity.activeAction === 'gathering') {
      return {
        nextState: HUMAN_GATHERING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          target: entity.target, // Target position might be relevant for gathering
        },
      };
    }

    if (entity.activeAction === 'eating') {
      return {
        nextState: HUMAN_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    if (entity.activeAction === 'planting' && entity.target) {
      return {
        nextState: HUMAN_PLANTING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          plantingSpot: entity.target,
        } as HumanPlantingStateData,
      };
    }

    if (entity.activeAction === 'depositing') {
      return {
        nextState: HUMAN_DEPOSITING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    if (entity.activeAction === 'retrieving') {
      return {
        nextState: HUMAN_RETRIEVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    if (entity.activeAction === 'chopping' && entity.target) {
      return {
        nextState: HUMAN_CHOPPING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          state: 'chopping',
        } as HumanChoppingStateData,
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
