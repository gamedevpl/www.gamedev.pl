import { LionEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { vectorDistance } from '../../../utils/math-utils';
import { moveTowardsTarget } from './lion-state-utils';

// Constants for lion movement behavior
const TARGET_REACHED_DISTANCE = 10;
const MOVE_ACCELERATION = 0.01;

/**
 * State data interface for lion moving state
 */
export interface LionMovingStateData extends BaseStateData {
  lastTargetUpdate?: number;
}

/**
 * Lion moving to target state implementation
 */
export const LION_MOVING_TO_TARGET_STATE: State<LionEntity, LionMovingStateData> = {
  id: 'LION_MOVING_TO_TARGET',

  update: (data, context) => {
    const { entity } = context;

    // Return to idle if walk action is disabled
    if (!entity.actions.walk.enabled) {
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Get current target position
    const targetPosition = entity.target.position;

    // If no target, return to idle
    if (!targetPosition) {
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Check if target reached
    const distance = vectorDistance(entity.position, targetPosition);
    if (distance < TARGET_REACHED_DISTANCE) {
      entity.acceleration = 0;
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Move towards target
    moveTowardsTarget(entity, targetPosition.x, targetPosition.y, MOVE_ACCELERATION);

    return {
      nextState: 'LION_MOVING_TO_TARGET',
      data: {
        ...data,
        lastTargetUpdate: context.updateContext.gameState.time,
      },
    };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
  }),
};
