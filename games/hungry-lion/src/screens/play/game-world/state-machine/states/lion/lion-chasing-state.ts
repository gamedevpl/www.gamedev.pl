import { LionEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { moveTowardsTarget } from './lion-state-utils';

// Constants for lion chasing behavior
const CHASE_ACCELERATION = 0.01; // Base acceleration when chasing
const CHASE_BOOST_ACCELERATION = 0.02; // Boosted acceleration when coming from ambush
const BOOST_DURATION = 1000; // Duration of speed boost in milliseconds

/**
 * State data interface for lion chasing state
 */
export interface LionChasingStateData extends BaseStateData {
  /** Flag indicating if speed boost should be applied */
  applySpeedBoost?: boolean;
  /** Timestamp when the boost was applied */
  boostAppliedAt?: number;
}

/**
 * Lion chasing state implementation
 */
export const LION_CHASING_STATE: State<LionEntity, LionChasingStateData> = {
  id: 'LION_CHASING',

  update: (data, context) => {
    const { entity } = context;
    const currentTime = context.updateContext.gameState.time;

    // Return to idle if attack action is disabled
    if (!entity.actions.attack.enabled) {
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: currentTime },
      };
    }

    // Get current target position
    const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId!);

    // If target lost, return to idle
    if (!targetEntity) {
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: currentTime },
      };
    }

    // Calculate acceleration based on boost status
    let acceleration = CHASE_ACCELERATION;
    if (data.applySpeedBoost && data.boostAppliedAt) {
      const boostElapsed = currentTime - data.boostAppliedAt;
      if (boostElapsed < BOOST_DURATION) {
        acceleration = CHASE_BOOST_ACCELERATION;
      } else {
        // Reset boost after duration expires
        data.applySpeedBoost = false;
        data.boostAppliedAt = undefined;
      }
    }

    // Move towards target with calculated acceleration
    moveTowardsTarget(entity, targetEntity.position.x, targetEntity.position.y, acceleration);

    return {
      nextState: 'LION_CHASING',
      data: {
        ...data,
        targetEntityId: entity.target.entityId,
        lastTargetUpdate: currentTime,
      },
    };
  },

  onEnter: (context, nextData) => ({
    targetEntityId: context.entity.target.entityId,
    ...nextData,
  }),
};
