import { HunterEntity, LionEntity } from '../../../entities/entities-types';
import { getEntityById } from '../../../game-world-query';
import { shootLion } from '../../../entities/hunter-update';
import { vectorDistance, vectorSubtract, vectorNormalize } from '../../../utils/math-utils';
import { BaseStateData, State } from '../../state-machine-types';
import { addHitNotification, addMissNotification } from '../../../notifications/notifications-update';

// Constants for shooting behavior
const SHOT_INTERVAL = 1000; // Time between shots in milliseconds
const MAX_SHOOTING_DISTANCE = 200; // Maximum distance for shooting
const MIN_SHOOTING_DISTANCE = 50; // Minimum distance for shooting (too close and hunter retreats)
const SHOOTING_DURATION = 3000; // Maximum time to stay in shooting state before reassessing

// Define state data interface
export interface HunterShootingStateData extends BaseStateData {
  lastShotTime: number;
  shotsAttempted: number;
}

// Hunter shooting state definition
export const HUNTER_SHOOTING_STATE: State<HunterEntity, HunterShootingStateData> = {
  id: 'HUNTER_SHOOTING',

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
      entity.targetLionId = undefined;
      return {
        nextState: 'HUNTER_PATROLLING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_SHOOTING',
          targetPosition: null,
        },
      };
    }

    // Calculate distance to target
    const distanceToTarget = vectorDistance(entity.position, targetLion.position);

    // If target moved too far away, go back to chasing
    if (distanceToTarget > MAX_SHOOTING_DISTANCE) {
      return {
        nextState: 'HUNTER_CHASING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_SHOOTING',
        },
      };
    }

    // If target is too close, retreat a bit
    if (distanceToTarget < MIN_SHOOTING_DISTANCE) {
      // Calculate direction away from lion
      const retreatDirection = vectorNormalize(vectorSubtract(entity.position, targetLion.position));
      entity.targetDirection = Math.atan2(retreatDirection.y, retreatDirection.x);
      entity.acceleration = 0.005;

      return {
        nextState: 'HUNTER_SHOOTING',
        data,
      };
    }

    // Stop moving while shooting
    entity.acceleration = 0;

    // Face the target
    const directionToTarget = vectorSubtract(targetLion.position, entity.position);
    entity.targetDirection = Math.atan2(directionToTarget.y, directionToTarget.x);

    // Check if we should fire a shot
    const timeSinceLastShot = currentTime - data.lastShotTime;
    if (timeSinceLastShot >= SHOT_INTERVAL && entity.ammunition > 0) {
      // Attempt to shoot the lion
      const hitSuccessful = shootLion(entity, targetLion, updateContext);

      // Create appropriate notification based on hit result
      if (hitSuccessful) {
        // Create hit notification
        addHitNotification(updateContext.gameState, targetLion.position);

        // If lion is hit, it might change behavior, so we can reset the shooting duration
        data.enteredAt = currentTime;
      } else {
        // Create miss notification - position it slightly off from the lion
        const missOffset = {
          x: targetLion.position.x + (Math.random() * 40 - 20),
          y: targetLion.position.y + (Math.random() * 40 - 20),
        };
        addMissNotification(updateContext.gameState, missOffset);
      }

      // Update shooting state data
      data.lastShotTime = currentTime;
      data.shotsAttempted++;
    }

    // If out of ammunition, transition to reloading
    if (entity.ammunition <= 0) {
      return {
        nextState: 'HUNTER_RELOADING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_SHOOTING',
        },
      };
    }

    // After shooting for a while, reassess the situation
    if (timeInState > SHOOTING_DURATION) {
      // Randomly decide to keep shooting or chase
      if (Math.random() < 0.6) {
        return {
          nextState: 'HUNTER_CHASING',
          data: {
            enteredAt: currentTime,
            previousState: 'HUNTER_SHOOTING',
          },
        };
      } else {
        // Reset shooting duration to continue shooting
        return {
          nextState: 'HUNTER_SHOOTING',
          data: {
            ...data,
            enteredAt: currentTime,
          },
        };
      }
    }

    // Continue shooting
    return {
      nextState: 'HUNTER_SHOOTING',
      data,
    };
  },

  onEnter: (context, data) => {
    const { entity, updateContext } = context;

    // Stop movement
    entity.acceleration = 0;
    entity.velocity = { x: 0, y: 0 };

    // Initialize shooting data
    return {
      enteredAt: data.enteredAt,
      previousState: data.previousState,
      lastShotTime: entity.lastShotTime || updateContext.gameState.time - SHOT_INTERVAL, // Allow immediate first shot
      shotsAttempted: 0,
    };
  },
};
