import { HunterEntity, LionEntity } from '../../../entities/entities-types';
import { vectorDistance } from '../../../utils/math-utils';
import { BaseStateData, State } from '../../state-machine-types';
import { moveTowardsTarget } from './hunter-state-utils';
import { getEntityById } from '../../../game-world-query';

// Constants for chasing behavior
const CHASE_SPEED = 0.007; // Hunter moves faster when chasing
const SHOOTING_DISTANCE = 200; // Distance at which hunter starts shooting
const CHASE_TIMEOUT = 10000; // Time after which hunter gives up if lion not found
const MAX_CHASE_DISTANCE = 600; // Maximum distance hunter will chase lion

// Define state data interface
export interface HunterChasingStateData extends BaseStateData {
  lastSeenPosition?: { x: number; y: number };
}

// Hunter chasing state definition
export const HUNTER_CHASING_STATE: State<HunterEntity, HunterChasingStateData> = {
  id: 'HUNTER_CHASING',

  update: (data, context) => {
    const { entity, updateContext } = context;
    const currentTime = updateContext.gameState.time;
    const timeInState = currentTime - data.enteredAt;

    // Check if target lion still exists
    const targetLion = entity.targetLionId
      ? (getEntityById(updateContext.gameState, entity.targetLionId) as LionEntity | undefined)
      : undefined;

    // If no target or target is not a lion, go back to patrolling
    if (!targetLion || targetLion.type !== 'lion') {
      return {
        nextState: 'HUNTER_PATROLLING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_CHASING',
          targetPosition: data.lastSeenPosition || null,
        },
      };
    }

    // Update last seen position
    data.lastSeenPosition = { ...targetLion.position };

    // Calculate distance to target
    const distanceToTarget = vectorDistance(entity.position, targetLion.position);

    // If target is too far, give up chase
    if (distanceToTarget > MAX_CHASE_DISTANCE) {
      entity.targetLionId = undefined;
      return {
        nextState: 'HUNTER_PATROLLING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_CHASING',
          targetPosition: data.lastSeenPosition,
        },
      };
    }

    // If close enough, transition to shooting state
    if (distanceToTarget <= SHOOTING_DISTANCE) {
      return {
        nextState: 'HUNTER_SHOOTING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_CHASING',
        },
      };
    }

    // Move towards target lion
    moveTowardsTarget(entity, targetLion.position.x, targetLion.position.y, CHASE_SPEED);

    // If chasing for too long, take a break and look around
    if (timeInState > CHASE_TIMEOUT) {
      return {
        nextState: 'HUNTER_WAITING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_CHASING',
          waitDuration: 3000,
          rotationDirection: Math.random() > 0.5 ? 1 : -1,
        },
      };
    }

    // Continue chasing
    return {
      nextState: 'HUNTER_CHASING',
      data,
    };
  },

  onEnter: (context, data) => {
    const { entity, updateContext } = context;

    // If no target lion ID is set, try to find one
    if (!entity.targetLionId) {
      // This shouldn't happen normally, but as a fallback
      return {
        enteredAt: data.enteredAt,
        previousState: data.previousState,
      };
    }

    // Get the target lion
    const targetLion = getEntityById(updateContext.gameState, entity.targetLionId) as LionEntity | undefined;

    // If found, save its position
    if (targetLion) {
      data.lastSeenPosition = { ...targetLion.position };
    }

    return data;
  },

  onExit: (context, nextState) => {
    const { entity } = context;

    // Reset acceleration if not transitioning to shooting
    if (nextState !== 'HUNTER_SHOOTING') {
      entity.acceleration = 0;
    }
  },
};
