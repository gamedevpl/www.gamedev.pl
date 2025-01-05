import { LionEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';

/**
 * State data interface for lion idle state
 */
export type LionIdleStateData = BaseStateData;

/**
 * Lion idle state implementation
 */
export const LION_IDLE_STATE: State<LionEntity, LionIdleStateData> = {
  id: 'LION_IDLE',

  update: (data, context) => {
    const { entity } = context;

    // Check if we have a target
    if (entity.target.entityId || entity.target.position) {
      // Determine if target is an entity (chasing) or position (moving to target)
      const nextState = entity.target.entityId ? 'LION_CHASING' : 'LION_MOVING_TO_TARGET';
      return {
        nextState,
        data: {
          ...data,
        },
      };
    }

    // Stay idle
    entity.acceleration = 0;
    return { nextState: 'LION_IDLE', data };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
  }),
};
