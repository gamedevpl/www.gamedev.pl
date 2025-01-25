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
    if (
      (entity.target.entityId && entity.actions.attack.enabled) ||
      (entity.target.position && entity.actions.walk.enabled)
    ) {
      // Determine if target is an entity (chasing) or position (moving to target)
      const nextState = entity.target.entityId ? 'LION_CHASING' : 'LION_MOVING_TO_TARGET';
      return {
        nextState,
        data: {
          ...data,
        },
      };
    } else if (entity.target.entityId && !entity.actions.attack.enabled) {
      const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId!);

      if (targetEntity) {
        const dx = targetEntity.position.x - entity.position.x;
        const dy = targetEntity.position.y - entity.position.y;

        entity.targetDirection = Math.atan2(dy, dx);
      }
    } else if (entity.target.position && !entity.actions.walk.enabled) {
      const dx = entity.target.position.x - entity.position.x;
      const dy = entity.target.position.y - entity.position.y;

      entity.targetDirection = Math.atan2(dy, dx);
    }

    entity.acceleration = 0;

    if (entity.actions.ambush.enabled) {
      return {
        nextState: 'LION_AMBUSH',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    return { nextState: 'LION_IDLE', data };
  },

  onEnter: (context, nextData) => {
    const { entity } = context;

    // Reset target
    entity.actions.attack.enabled = false;
    entity.actions.walk.enabled = false;
    entity.actions.ambush.enabled = false;

    return nextData;
  },
};
