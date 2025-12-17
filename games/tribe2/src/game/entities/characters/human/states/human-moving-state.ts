import {
  SOIL_DEPLETED_SPEED_BONUS,
  SOIL_PATH_PREFERENCE_FORCE,
  SOIL_PATH_PREFERENCE_SAMPLE_DISTANCE,
} from '../../../plants/soil-depletion-consts';
import { getSoilSpeedModifier, getPathPreferenceBias } from '../../../plants/soil-depletion-update';
import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { Vector2D } from '../../../../utils/math-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import {
  HUMAN_MOVING,
  HumanMovingStateData,
  HUMAN_IDLE,
  HUMAN_ATTACKING,
  HumanAttackingStateData,
} from './human-state-types';

const MOVEMENT_THRESHOLD = 7.5; // Distance to consider "close enough" to target

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
    let targetPosition: Vector2D | undefined;
    if (typeof entity.target === 'object') {
      targetPosition = entity.target;
    } else if (typeof entity.target === 'number') {
      targetPosition = context.updateContext.gameState.entities.entities[entity.target]?.position;
    }

    if (!targetPosition && (entity.direction.x !== 0 || entity.direction.y !== 0)) {
      targetPosition = {
        x: entity.position.x + entity.direction.x * MOVEMENT_THRESHOLD * 2,
        y: entity.position.y + entity.direction.y * MOVEMENT_THRESHOLD * 2,
      };
    }
    if (!targetPosition) {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
        },
      };
    }

    const { width: worldWidth, height: worldHeight } = updateContext.gameState.mapDimensions;
    
    const dirToTarget = getDirectionVectorOnTorus(entity.position, targetPosition, worldWidth, worldHeight);
    entity.direction = vectorNormalize(dirToTarget);

    // Apply small force towards depleted soil (more depleted = more force)
    const pathBias = getPathPreferenceBias(
      updateContext.gameState.soilDepletion,
      entity.position,
      entity.direction,
      SOIL_PATH_PREFERENCE_SAMPLE_DISTANCE,
      worldWidth,
      worldHeight,
    );

    // Add force towards depleted soil - the bias is already weighted by depletion level
    entity.forces.push({
      x: pathBias.x * SOIL_PATH_PREFERENCE_FORCE,
      y: pathBias.y * SOIL_PATH_PREFERENCE_FORCE,
    });

    // Get terrain speed modifier from soil depletion state
    const terrainSpeedModifier = getSoilSpeedModifier(
      updateContext.gameState.soilDepletion,
      entity.position,
      worldWidth,
      worldHeight,
      SOIL_DEPLETED_SPEED_BONUS,
    );

    // Set acceleration based on effective speed
    entity.acceleration = getEffectiveSpeed(entity, terrainSpeedModifier);

    // Check if we've reached the target
    const distance = calculateWrappedDistance(entity.position, targetPosition, worldWidth, worldHeight);

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
