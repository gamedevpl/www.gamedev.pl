import { LionEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';

// Constants for ambush state
const AMBUSH_SNEAK_ACCELERATION = 0.002; // Low acceleration for sneaking

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
 * - Lion can move very slowly (sneak) using keyboard controls
 * - Lion is less noticeable by prey (handled by prey behavior)
 * - Transitions to chasing state with speed boost when target acquired (via SPACE or click)
 * - Transitions to idle/moving state if ambush is cancelled (via SPACE with no target)
 */
export const LION_AMBUSH_STATE: State<LionEntity, LionAmbushStateData> = {
  id: 'LION_AMBUSH',

  update: (data, context) => {
    const { entity } = context;

    // --- Check for transitions out of Ambush ---

    // If we have a target and attack is enabled (SPACE pressed near prey, or clicked prey), transition to chasing with speed boost
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

    // Transition to idle if walk action is enabled (e.g., SPACE pressed with no target to break ambush)
    if (entity.actions.walk.enabled) {
      entity.actions.ambush.enabled = false; // Ensure ambush is disabled
      entity.actions.walk.enabled = false; // Reset walk action immediately
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // If ambush action itself got disabled externally (e.g., UI button), return to idle
    if (!entity.actions.ambush.enabled) {
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // --- Handle Ambush State Behavior (Sneaking) ---

    // Check for keyboard movement input for sneaking
    if (entity.movementVector.x !== 0 || entity.movementVector.y !== 0) {
      // Sneak in the direction of the keyboard input
      entity.targetDirection = Math.atan2(entity.movementVector.y, entity.movementVector.x);
      entity.acceleration = AMBUSH_SNEAK_ACCELERATION;
    } else {
      // No keyboard input: Stop sneaking, but allow turning to face target if one exists
      entity.acceleration = 0;

      // Update direction to face target if one exists (e.g., prey targeted via click while ambushing)
      if (entity.target.entityId) {
        const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId);
        if (targetEntity) {
          const dx = targetEntity.position.x - entity.position.x;
          const dy = targetEntity.position.y - entity.position.y;
          entity.targetDirection = Math.atan2(dy, dx);
        }
      } else if (entity.target.position) {
        // Or face movement target if set by mouse/touch while ambushing (less common)
        const dx = entity.target.position.x - entity.position.x;
        const dy = entity.target.position.y - entity.position.y;
        entity.targetDirection = Math.atan2(dy, dx);
      }
    }

    // Stay in ambush state
    return {
      nextState: 'LION_AMBUSH',
      data: {
        ...data,
      },
    };
  },

  onEnter: (context, nextData) => {
    // Clear any movement targets when entering ambush
    context.entity.target.position = undefined;
    context.entity.acceleration = 0;
    // Don't reset velocity to zero immediately, allow gradual stop from previous state
    // context.entity.velocity = { x: 0, y: 0 };
    return nextData;
  },
};
