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
 * Handles movement based on keyboard (movementVector) or mouse/touch (target.position).
 */
export const LION_MOVING_TO_TARGET_STATE: State<LionEntity, LionMovingStateData> = {
  id: 'LION_MOVING_TO_TARGET',

  update: (data, context) => {
    const { entity } = context;

    // --- Priority 1: Target Entity (Attack/Chase) ---
    // If a prey entity is targeted (via SPACE or click), transition to chasing immediately.
    if (entity.target.entityId) {
      return {
        nextState: 'LION_CHASING',
        data: {
          ...data, // Pass existing data like enteredAt
          enteredAt: context.updateContext.gameState.time, // Reset enteredAt for the new state
        },
      };
    }

    let isMoving = false;

    // --- Priority 2: Keyboard Movement ---
    if (entity.movementVector.x !== 0 || entity.movementVector.y !== 0) {
      // Use keyboard vector for direction and acceleration
      entity.targetDirection = Math.atan2(entity.movementVector.y, entity.movementVector.x);
      entity.acceleration = MOVE_ACCELERATION;
      isMoving = true;
    } else {
      // --- Priority 3: Mouse/Touch Movement ---
      const targetPosition = entity.target.position;

      // If no keyboard input, check for mouse/touch target position
      if (targetPosition) {
        const distance = vectorDistance(entity.position, targetPosition);

        // Check if target reached
        if (distance < TARGET_REACHED_DISTANCE) {
          // Target reached via mouse/touch
          entity.acceleration = 0;
          entity.target = {}; // Clear target
          return {
            nextState: 'LION_IDLE',
            data: { enteredAt: context.updateContext.gameState.time },
          };
        } else {
          // Move towards mouse/touch target
          moveTowardsTarget(entity, targetPosition.x, targetPosition.y, MOVE_ACCELERATION);
          isMoving = true;
        }
      } else {
        // No active movement input (keyboard or mouse/touch target)
        entity.acceleration = 0;
      }
    }

    // --- State Transition Logic ---
    if (isMoving) {
      // Stay in moving state if any movement input is active
      return {
        nextState: 'LION_MOVING_TO_TARGET',
        data: {
          ...data,
          lastTargetUpdate: context.updateContext.gameState.time,
        },
      };
    } else {
      // No movement input active, transition to idle
      entity.target = {}; // Clear any residual target info
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }
  },

  onEnter: (context, nextData) => {
    // Reset acceleration on entering the state, it will be set based on input
    context.entity.acceleration = 0;
    return nextData;
  },
};
