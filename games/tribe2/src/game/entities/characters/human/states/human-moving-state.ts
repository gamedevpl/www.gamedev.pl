import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { Vector2D } from '../../../../utils/math-types';
import {
  calculateWrappedDistance,
  getDirectionVectorOnTorus,
  vectorNormalize,
  vectorRotate,
  vectorAdd,
  vectorScale,
  vectorDot,
  vectorSubtract,
  vectorLength,
} from '../../../../utils/math-utils';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import { getSoilSpeedModifier, getSectorHealth, positionToGridCoords } from '../../../../soil-depletion-update';
import { SOIL_DEPLETED_SPEED_BONUS, SOIL_HEALTH_DEPLETED_THRESHOLD } from '../../../../soil-depletion-consts';
import {
  HUMAN_MOVING,
  HumanMovingStateData,
  HUMAN_IDLE,
  HUMAN_ATTACKING,
  HumanAttackingStateData,
} from './human-state-types';
import { isPositionInZone } from '../../../../utils/spatial-utils';
import { getTribePlantingZones } from '../../../tribe/tribe-food-utils';
import { isTribeRole } from '../../../tribe/tribe-role-utils';
import { TribeRole } from '../../../tribe/tribe-types';
import { IndexedWorldState } from '../../../../world-index/world-index-types';

const MOVEMENT_THRESHOLD = 7.5; // Distance to consider "close enough" to target
const COLLISION_AVOIDANCE_RADIUS = 40; // Distance to check for nearby humans
const LOOK_AHEAD_DISTANCE = 30; // Distance to look ahead for soil preference
const PLANTATION_AVOIDANCE_WEIGHT = 0.8;
const COLLISION_AVOIDANCE_WEIGHT = 0.5;
const SOIL_PREFERENCE_WEIGHT = 0.3;

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

    const dirToTarget = getDirectionVectorOnTorus(
      entity.position,
      targetPosition,
      context.updateContext.gameState.mapDimensions.width,
      context.updateContext.gameState.mapDimensions.height,
    );

    // --- Steering Behaviors ---
    let steeringForce = { x: 0, y: 0 };

    // 1. Plantation Avoidance
    if (
      !isTribeRole(entity, TribeRole.Gatherer, updateContext.gameState) &&
      !isTribeRole(entity, TribeRole.Planter, updateContext.gameState)
    ) {
      const tribePlantingZones = getTribePlantingZones(entity, updateContext.gameState);
      for (const zone of tribePlantingZones) {
        if (isPositionInZone(entity.position, zone, updateContext.gameState)) {
          // We're inside a zone - steer away from its center
          const awayFromZone = vectorSubtract(entity.position, zone.position);
          const awayNormalized = vectorNormalize(awayFromZone);
          steeringForce = vectorAdd(steeringForce, vectorScale(awayNormalized, PLANTATION_AVOIDANCE_WEIGHT));
        }
      }
    }

    // 2. Right-Hand Traffic (Collision Avoidance)
    const nearbyHumans = (updateContext.gameState as IndexedWorldState).search.human.byRadius(
      entity.position,
      COLLISION_AVOIDANCE_RADIUS,
    );
    for (const otherHuman of nearbyHumans) {
      if (otherHuman.id === entity.id) continue;

      const toOther = getDirectionVectorOnTorus(
        entity.position,
        otherHuman.position,
        updateContext.gameState.mapDimensions.width,
        updateContext.gameState.mapDimensions.height,
      );
      const distance = vectorLength(toOther);

      if (distance < COLLISION_AVOIDANCE_RADIUS && distance > 0) {
        // Check if moving towards each other
        const dotProduct = vectorDot(entity.direction, vectorNormalize(toOther));
        if (dotProduct > 0.5) {
          // Moving towards each other
          // Steer right relative to current direction
          const rightSteer = vectorRotate(entity.direction, Math.PI / 2);
          const steerStrength = (COLLISION_AVOIDANCE_RADIUS - distance) / COLLISION_AVOIDANCE_RADIUS;
          steeringForce = vectorAdd(steeringForce, vectorScale(rightSteer, COLLISION_AVOIDANCE_WEIGHT * steerStrength));
        }
      }
    }

    // 3. Depleted Soil Preference
    // Normalize current direction for look-ahead calculations
    const currentDirNormalized = vectorNormalize(
      entity.direction.x !== 0 || entity.direction.y !== 0 ? entity.direction : dirToTarget,
    );

    const aheadPos = vectorAdd(entity.position, vectorScale(currentDirNormalized, LOOK_AHEAD_DISTANCE));
    const aheadLeft = vectorAdd(aheadPos, vectorRotate(currentDirNormalized, -Math.PI / 4));
    const aheadRight = vectorAdd(aheadPos, vectorRotate(currentDirNormalized, Math.PI / 4));

    const { gridX, gridY } = positionToGridCoords(
      aheadPos,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );
    const { gridX: gridXL, gridY: gridYL } = positionToGridCoords(
      aheadLeft,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );
    const { gridX: gridXR, gridY: gridYR } = positionToGridCoords(
      aheadRight,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );

    const healthAhead = getSectorHealth(updateContext.gameState.soilDepletion, gridX, gridY);
    const healthLeft = getSectorHealth(updateContext.gameState.soilDepletion, gridXL, gridYL);
    const healthRight = getSectorHealth(updateContext.gameState.soilDepletion, gridXR, gridYR);

    // Prefer depleted soil (lower health is faster)
    if (healthAhead >= SOIL_HEALTH_DEPLETED_THRESHOLD) {
      if (healthLeft < SOIL_HEALTH_DEPLETED_THRESHOLD) {
        const leftSteer = vectorRotate(currentDirNormalized, -Math.PI / 6);
        steeringForce = vectorAdd(steeringForce, vectorScale(leftSteer, SOIL_PREFERENCE_WEIGHT));
      } else if (healthRight < SOIL_HEALTH_DEPLETED_THRESHOLD) {
        const rightSteer = vectorRotate(currentDirNormalized, Math.PI / 6);
        steeringForce = vectorAdd(steeringForce, vectorScale(rightSteer, SOIL_PREFERENCE_WEIGHT));
      }
    }

    // Combine steering with target direction
    const combinedDirection = vectorAdd(dirToTarget, steeringForce);
    entity.direction = vectorNormalize(combinedDirection);

    // Get terrain speed modifier from soil depletion state
    const terrainSpeedModifier = getSoilSpeedModifier(
      updateContext.gameState.soilDepletion,
      entity.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
      SOIL_DEPLETED_SPEED_BONUS,
    );

    // Set acceleration based on effective speed with terrain modifier
    entity.acceleration = getEffectiveSpeed(entity, terrainSpeedModifier);

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
