import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, vectorAdd } from '../../../../utils/math-utils';
import {
  HUMAN_HUNGER_DEATH,
  HUMAN_MAX_AGE_YEARS,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_BASE_SPEED,
} from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { HUMAN_MOVING, HumanMovingStateData, HUMAN_DYING, HUMAN_HUNGRY, HUMAN_IDLE } from './human-state-types';

const MOVEMENT_THRESHOLD = 5; // Distance to consider "close enough" to target

class HumanMovingState implements State<HumanEntity, HumanMovingStateData> {
  id = HUMAN_MOVING;

  update(movingData: HumanMovingStateData, context: StateContext<HumanEntity>) {
    const { entity, updateContext } = context;

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
          cause: 'hunger',
        },
      };
    }

    if (entity.age >= HUMAN_MAX_AGE_YEARS) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
          cause: 'oldAge',
        },
      };
    }

    // Check for hunger threshold
    if (entity.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
      return {
        nextState: HUMAN_HUNGRY,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
        },
      };
    }

    if (entity.activeAction !== 'moving') {
      // If not actively moving, return to idle state
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
        },
      };
    }

    // Calculate direction to target
    let targetPosition = movingData.targetPosition;
    if (!targetPosition) {
      targetPosition = vectorAdd(entity.position, {
        x: entity.direction.x * MOVEMENT_THRESHOLD,
        y: entity.direction.y * MOVEMENT_THRESHOLD,
      });
    }

    // Set acceleration based on base speed
    entity.acceleration = HUMAN_BASE_SPEED;

    // Check if we've reached the target
    const distance = calculateWrappedDistance(
      entity.position,
      targetPosition,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );

    if (distance < MOVEMENT_THRESHOLD) {
      // Close enough to target
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
        },
      };
    }

    return { nextState: HUMAN_MOVING, data: movingData };
  }

  onExit(context: StateContext<HumanEntity>) {
    const { entity } = context;

    // Reset  acceleration when exiting moving state
    entity.acceleration = 0;
  }
}

// Define the human moving state
export const humanMovingState: State<HumanEntity, HumanMovingStateData> = new HumanMovingState();
