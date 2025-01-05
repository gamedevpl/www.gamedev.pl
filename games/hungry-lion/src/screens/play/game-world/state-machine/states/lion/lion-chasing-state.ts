import { LionEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { moveTowardsTarget } from './lion-state-utils';

// Constants for lion chasing behavior
const CHASE_ACCELERATION = 0.01;

/**
 * State data interface for lion chasing state
 */
export type LionChasingStateData = BaseStateData;

/**
 * Lion chasing state implementation
 */
export const LION_CHASING_STATE: State<LionEntity, LionChasingStateData> = {
  id: 'LION_CHASING',

  update: (data, context) => {
    const { entity } = context;

    // Get current target position
    const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId!);

    // If target lost, return to idle
    if (!targetEntity) {
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Move towards target with higher acceleration
    moveTowardsTarget(entity, targetEntity.position.x, targetEntity.position.y, CHASE_ACCELERATION);

    return {
      nextState: 'LION_CHASING',
      data: {
        ...data,
        targetEntityId: entity.target.entityId,
        lastTargetUpdate: context.updateContext.gameState.time,
      },
    };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
    targetEntityId: context.entity.target.entityId,
  }),
};
