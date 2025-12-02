import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { Vector2D } from '../../../../utils/math-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { PredatorEntity } from '../predator-types';
import { getEffectivePredatorSpeed } from '../predator-utils';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_MOVING,
  PREDATOR_ATTACKING,
  PREDATOR_EATING,
  PredatorAttackingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

const MOVEMENT_THRESHOLD = 12; // Distance to consider "close enough" to target for predators

class PredatorMovingState implements State<PredatorEntity, PredatorStateData> {
  id = PREDATOR_MOVING;

  update(movingData: PredatorStateData, context: StateContext<PredatorEntity>) {
    const { entity, updateContext } = context;

    // Higher priority actions override moving
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
          preyId: entity.attackTargetId!,
          eatingStartTime: updateContext.gameState.time,
        } as PredatorEatingStateData,
      };
    }

    if (entity.activeAction === 'attacking' && entity.attackTargetId) {
      return {
        nextState: PREDATOR_ATTACKING,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
          attackTargetId: entity.attackTargetId,
          attackStartTime: updateContext.gameState.time,
        } as PredatorAttackingStateData,
      };
    }

    // If not moving anymore, go to idle
    if (entity.activeAction !== 'moving') {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
        },
      };
    }

    // Calculate direction to target
    let targetPosition: Vector2D | undefined;
    if (typeof entity.target === 'object') {
      targetPosition = entity.target;
    } else if (typeof entity.target === 'number') {
      targetPosition = context.updateContext.gameState.entities.entities.get(entity.target)?.position;
    }

    if (!targetPosition && (entity.direction.x !== 0 || entity.direction.y !== 0)) {
      targetPosition = {
        x: entity.position.x + entity.direction.x * MOVEMENT_THRESHOLD * 2,
        y: entity.position.y + entity.direction.y * MOVEMENT_THRESHOLD * 2,
      };
    }

    if (!targetPosition) {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
        },
      };
    }

    const dirToTarget = getDirectionVectorOnTorus(
      entity.position,
      targetPosition,
      context.updateContext.gameState.mapDimensions.width,
      context.updateContext.gameState.mapDimensions.height,
    );
    entity.direction = vectorNormalize(dirToTarget);

    // Set acceleration based on effective speed
    entity.acceleration = getEffectivePredatorSpeed(entity);

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
        nextState: PREDATOR_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
        },
      };
    }

    return { nextState: PREDATOR_MOVING, data: movingData };
  }

  onExit(context: StateContext<PredatorEntity>) {
    const { entity } = context;

    // Reset acceleration when exiting moving state
    entity.acceleration = 0;
  }

  onEnter(context: StateContext<PredatorEntity>, nextData: PredatorStateData) {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  }
}

// Define the predator moving state
export const predatorMovingState: State<PredatorEntity, PredatorStateData> = new PredatorMovingState();