import { HunterEntity } from '../../../entities/entities-types';
import { detectLion } from '../../../entities/hunter-update';
import { vectorDistance } from '../../../utils/math-utils';
import { BaseStateData, State } from '../../state-machine-types';
import { moveTowardsTarget } from './hunter-state-utils';

// Constants for patrolling behavior
const PATROL_SPEED = 0.004;
const MIN_PATROL_TIME = 5000; // Minimum time to stay in patrol state
const WAITING_CHANCE = 0.3; // Chance to transition to waiting state after reaching target

// Define state data interface
export interface HunterPatrollingStateData extends BaseStateData {
  targetPosition: { x: number; y: number } | null;
}

// Hunter patrolling state definition
export const HUNTER_PATROLLING_STATE: State<HunterEntity, HunterPatrollingStateData> = {
  id: 'HUNTER_PATROLLING',

  update: (data, context) => {
    const { entity, updateContext } = context;
    const currentTime = updateContext.gameState.time;

    // Check if we should transition to chasing state if lion detected
    const detectedLion = detectLion(entity, updateContext);
    if (detectedLion) {
      return {
        nextState: 'HUNTER_CHASING',
        data: {
          enteredAt: currentTime,
          previousState: 'HUNTER_PATROLLING',
        },
      };
    }

    // If no patrol points or empty array, revert to old behavior with random position
    if (!entity.patrolPoints || entity.patrolPoints.length === 0) {
      // This should not happen with proper initialization, but handle it gracefully
      if (!data.targetPosition) {
        // Generate a random position near the current position
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDistance = 100 + Math.random() * 200;
        data.targetPosition = {
          x: entity.position.x + Math.cos(randomAngle) * randomDistance,
          y: entity.position.y + Math.sin(randomAngle) * randomDistance,
        };
      }

      // Move towards the random target
      moveTowardsTarget(entity, data.targetPosition.x, data.targetPosition.y, PATROL_SPEED);

      // Check if target reached
      const distanceToTarget = vectorDistance(entity.position, data.targetPosition);
      if (distanceToTarget < 20) {
        // Target reached, get a new random position
        data.targetPosition = null;
      }

      return {
        nextState: 'HUNTER_PATROLLING',
        data,
      };
    }

    // Use patrol points system
    // Get the current patrol point
    const currentPatrolPoint = entity.patrolPoints[entity.currentPatrolPointIndex];

    // If we don't have a target position or it's different from the current patrol point,
    // update the target position to the current patrol point
    if (
      !data.targetPosition ||
      data.targetPosition.x !== currentPatrolPoint.x ||
      data.targetPosition.y !== currentPatrolPoint.y
    ) {
      data.targetPosition = { ...currentPatrolPoint };
    }

    // Move towards the current patrol point
    moveTowardsTarget(entity, currentPatrolPoint.x, currentPatrolPoint.y, PATROL_SPEED);

    // Check if patrol point reached
    const distanceToPatrolPoint = vectorDistance(entity.position, currentPatrolPoint);
    if (distanceToPatrolPoint < entity.patrolRadius) {
      // Patrol point reached, decide what to do next
      const timeInState = currentTime - data.enteredAt;

      // Only consider state transitions after minimum time
      if (timeInState > MIN_PATROL_TIME) {
        // Chance to transition to waiting state
        if (Math.random() < WAITING_CHANCE) {
          return {
            nextState: 'HUNTER_WAITING',
            data: {
              enteredAt: currentTime,
              previousState: 'HUNTER_PATROLLING',
            },
          };
        } else {
          // Move to the next patrol point
          entity.currentPatrolPointIndex = (entity.currentPatrolPointIndex + 1) % entity.patrolPoints.length;
          data.targetPosition = { ...entity.patrolPoints[entity.currentPatrolPointIndex] };
        }
      }
    }

    // Continue patrolling
    return {
      nextState: 'HUNTER_PATROLLING',
      data,
    };
  },

  onEnter: (context, data) => {
    const { entity } = context;

    // Initialize target position to the current patrol point if available
    if (entity.patrolPoints && entity.patrolPoints.length > 0) {
      const currentPatrolPoint = entity.patrolPoints[entity.currentPatrolPointIndex];
      data.targetPosition = { ...currentPatrolPoint };
    } else if (!data.targetPosition) {
      // Fallback to a position near the hunter if no patrol points
      const randomAngle = Math.random() * Math.PI * 2;
      const randomDistance = 100 + Math.random() * 200;
      data.targetPosition = {
        x: entity.position.x + Math.cos(randomAngle) * randomDistance,
        y: entity.position.y + Math.sin(randomAngle) * randomDistance,
      };
    }

    return data;
  },

  onExit: (context) => {
    const { entity } = context;

    // Stop movement when exiting patrol state
    entity.acceleration = 0;
  },
};
