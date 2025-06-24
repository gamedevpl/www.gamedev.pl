import { State } from '../../../../state-machine/state-machine-types';
import { HUMAN_HUNGER_THRESHOLD_SLOW } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import {
  HumanStateData,
  HUMAN_IDLE,
  HUMAN_MOVING,
  HUMAN_GATHERING,
  HUMAN_EATING,
  HUMAN_ATTACKING,
  HumanAttackingStateData,
  HUMAN_SEIZING,
  HUMAN_PLANTING,
  HumanPlantingStateData,
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
          targetPosition: entity.targetPosition,
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
          targetPosition: entity.targetPosition, // Target position might be relevant for gathering
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

    if (entity.activeAction === 'seizing') {
      return {
        nextState: HUMAN_SEIZING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    if (entity.activeAction === 'planting' && entity.targetPosition) {
      return {
        nextState: HUMAN_PLANTING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          plantingSpot: entity.targetPosition,
        } as HumanPlantingStateData,
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
