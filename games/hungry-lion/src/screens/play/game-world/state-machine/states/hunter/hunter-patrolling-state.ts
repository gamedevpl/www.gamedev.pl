import { HunterEntity } from '../../../entities/entities-types';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world-consts';
import { detectLion } from '../../../entities/hunter-update';
import { vectorDistance } from '../../../utils/math-utils';
import { BaseStateData, State } from '../../state-machine-types';
import { moveTowardsTarget } from './hunter-state-utils';

// Constants for patrolling behavior
const PATROL_SPEED = 0.004;
const TARGET_REACHED_DISTANCE = 20;
const PATROL_MARGIN = 100; // Margin from world edges
const WAITING_CHANCE = 0.3; // Chance to transition to waiting state after reaching target
const MIN_PATROL_TIME = 5000; // Minimum time to stay in patrol state

// Define state data interface
export interface HunterPatrollingStateData extends BaseStateData {
  targetPosition: { x: number; y: number } | null;
}

// Generate a random position within the game world bounds
function getRandomPatrolPosition() {
  return {
    x: PATROL_MARGIN + Math.random() * (GAME_WORLD_WIDTH - 2 * PATROL_MARGIN),
    y: PATROL_MARGIN + Math.random() * (GAME_WORLD_HEIGHT - 2 * PATROL_MARGIN),
  };
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

    // If no target position, get a new one
    if (!data.targetPosition) {
      data.targetPosition = getRandomPatrolPosition();
    }

    // Move towards target position
    moveTowardsTarget(entity, data.targetPosition.x, data.targetPosition.y, PATROL_SPEED);

    // Check if target reached
    const distanceToTarget = vectorDistance(entity.position, data.targetPosition);
    if (distanceToTarget < TARGET_REACHED_DISTANCE) {
      // Target reached, decide what to do next
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
          // Get a new patrol target
          data.targetPosition = getRandomPatrolPosition();
        }
      }
    }

    // Continue patrolling
    return {
      nextState: 'HUNTER_PATROLLING',
      data,
    };
  },

  onEnter: (_, data) => {
    // Initialize with a random target if none exists
    if (!data.targetPosition) {
      data.targetPosition = getRandomPatrolPosition();
    }

    return data;
  },

  onExit: (context) => {
    const { entity } = context;

    // Stop movement when exiting patrol state
    entity.acceleration = 0;
  },
};
