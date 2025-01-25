import { LionEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';

/**
 * State data interface for lion ambush state
 */
export interface LionAmbushStateData extends BaseStateData {
  /** Flag to indicate if speed boost should be applied when transitioning to chasing */
  applySpeedBoost?: boolean;
}

/**
 * Lion ambush state implementation
 * In this state:
 * - Lion does not move
 * - Lion is less noticeable by prey (handled by prey behavior)
 * - Transitions to chasing state with speed boost when target acquired
 */
export const LION_AMBUSH_STATE: State<LionEntity, LionAmbushStateData> = {
  id: 'LION_AMBUSH',

  update: (data, context) => {
    const { entity } = context;

    // If we have a target and attack is enabled, transition to chasing with speed boost
    if (entity.target.entityId && entity.actions.attack.enabled) {
      entity.actions.ambush.enabled = false;
      return {
        nextState: 'LION_CHASING',
        data: {
          enteredAt: context.updateContext.gameState.time,
          applySpeedBoost: true, // Set flag for speed boost
          boostAppliedAt: context.updateContext.gameState.time, // Set timestamp for speed boost
        },
      };
    }

    // Return to idle if ambush action is disabled
    if (!entity.actions.ambush.enabled) {
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // In ambush state:
    // - No movement (zero acceleration and velocity)
    // - Keep target direction updated if we have a target
    entity.acceleration = 0;

    // Update direction to face target if one exists
    if (entity.target.entityId) {
      const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId);
      if (targetEntity) {
        const dx = targetEntity.position.x - entity.position.x;
        const dy = targetEntity.position.y - entity.position.y;
        entity.targetDirection = Math.atan2(dy, dx);
        entity.acceleration = 0.001;
      }
    }

    // Stay in ambush state
    return {
      nextState: 'LION_AMBUSH',
      data: {
        ...data,
        lastTargetUpdate: context.updateContext.gameState.time,
      },
    };
  },
};
