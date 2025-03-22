import { HunterEntity } from '../../../entities/entities-types';
import { detectLion } from '../../../entities/hunter-update';
import { BaseStateData, State } from '../../state-machine-types';

// Constants for waiting behavior
const MIN_WAIT_DURATION = 2000; // Minimum waiting time in milliseconds
const MAX_WAIT_DURATION = 5000; // Maximum waiting time in milliseconds
const ROTATION_SPEED = 0.002; // Speed at which hunter rotates while waiting

// Define state data interface
export interface HunterWaitingStateData extends BaseStateData {
  waitDuration: number;
  rotationDirection: number; // 1 for clockwise, -1 for counter-clockwise
}

// Hunter waiting state definition
export const HUNTER_WAITING_STATE: State<HunterEntity, HunterWaitingStateData> = {
  id: 'HUNTER_WAITING',

  update: (data, context) => {
    const { entity, updateContext } = context;
    const currentTime = updateContext.gameState.time;
    const timeInState = currentTime - data.enteredAt;

    // Check if we should transition to chasing state if lion detected
    const detectedLion = detectLion(entity, updateContext);
    if (detectedLion) {
      entity.targetLionId = detectedLion.id;
      return {
        nextState: 'HUNTER_CHASING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_WAITING',
        },
      };
    }

    // Rotate hunter to look around
    entity.targetDirection += data.rotationDirection * ROTATION_SPEED * updateContext.deltaTime;

    // Normalize direction to keep within -PI to PI range
    if (entity.targetDirection > Math.PI) {
      entity.targetDirection -= 2 * Math.PI;
    } else if (entity.targetDirection < -Math.PI) {
      entity.targetDirection += 2 * Math.PI;
    }

    // Check if wait duration has elapsed
    if (timeInState >= data.waitDuration) {
      return {
        nextState: 'HUNTER_PATROLLING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_WAITING',
          targetPosition: null,
        },
      };
    }

    // Continue waiting
    return {
      nextState: 'HUNTER_WAITING',
      data,
    };
  },

  onEnter: (context, data) => {
    const { entity } = context;

    // Stop movement
    entity.acceleration = 0;
    entity.velocity = { x: 0, y: 0 };

    // Set random wait duration if not already set
    if (!data.waitDuration) {
      data.waitDuration = MIN_WAIT_DURATION + Math.random() * (MAX_WAIT_DURATION - MIN_WAIT_DURATION);
    }

    // Set random rotation direction
    data.rotationDirection = Math.random() > 0.5 ? 1 : -1;

    return data;
  },
};
