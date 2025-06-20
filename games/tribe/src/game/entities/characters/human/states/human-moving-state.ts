import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, vectorAdd } from '../../../../utils/math-utils';
import {
  HUMAN_BASE_SPEED,
  HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD,
  HUMAN_OLD_AGE_SPEED_MODIFIER,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_SLOW_SPEED_MODIFIER,
} from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import {
  HUMAN_MOVING,
  HumanMovingStateData,
  HUMAN_IDLE,
  HUMAN_ATTACKING,
  HumanAttackingStateData,
} from './human-state-types';

const MOVEMENT_THRESHOLD = 5; // Distance to consider "close enough" to target

class HumanMovingState implements State<HumanEntity, HumanMovingStateData> {
  id = HUMAN_MOVING;

  update(movingData: HumanMovingStateData, context: StateContext<HumanEntity>) {
    const { entity, updateContext } = context;

    if (entity.activeAction === 'attacking' && entity.attackTargetId) {
      return {
        nextState: HUMAN_ATTACKING,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
          attackTargetId: entity.attackTargetId,
          attackStartTime: updateContext.gameState.time,
        } as HumanAttackingStateData,
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

    // Calculate effective speed considering hunger and old age
    let effectiveSpeed = HUMAN_BASE_SPEED;

    // Apply hunger slowdown
    if (entity.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
      effectiveSpeed *= HUMAN_SLOW_SPEED_MODIFIER;
    }

    // Apply old age slowdown
    if (entity.age >= HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD) {
      effectiveSpeed *= HUMAN_OLD_AGE_SPEED_MODIFIER;
    }

    // Set acceleration based on effective speed
    entity.acceleration = effectiveSpeed;

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
    entity.targetPosition = undefined;
  }
}

// Define the human moving state
export const humanMovingState: State<HumanEntity, HumanMovingStateData> = new HumanMovingState();
