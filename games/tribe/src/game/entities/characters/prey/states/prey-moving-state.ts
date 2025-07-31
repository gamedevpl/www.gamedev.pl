import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { Vector2D } from '../../../../utils/math-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { PreyEntity } from '../prey-types';
import { getEffectivePreySpeed } from '../prey-utils';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_MOVING,
} from './prey-state-types';

const MOVEMENT_THRESHOLD = 10; // Distance to consider "close enough" to target for prey

class PreyMovingState implements State<PreyEntity, PreyStateData> {
  id = PREY_MOVING;

  update(movingData: PreyStateData, context: StateContext<PreyEntity>) {
    const { entity, updateContext } = context;

    // If not moving anymore, go to idle
    if (entity.activeAction !== 'moving') {
      return {
        nextState: PREY_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_MOVING,
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
        nextState: PREY_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_MOVING,
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
    entity.acceleration = getEffectivePreySpeed(entity);

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
        nextState: PREY_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_MOVING,
        },
      };
    }

    return { nextState: PREY_MOVING, data: movingData };
  }

  onExit(context: StateContext<PreyEntity>) {
    const { entity } = context;

    // Reset acceleration when exiting moving state
    entity.acceleration = 0;
  }

  onEnter(context: StateContext<PreyEntity>, nextData: PreyStateData) {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  }
}

// Define the prey moving state
export const preyMovingState: State<PreyEntity, PreyStateData> = new PreyMovingState();