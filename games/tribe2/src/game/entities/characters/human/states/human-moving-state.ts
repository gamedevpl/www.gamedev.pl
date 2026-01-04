import {
  SOIL_DEPLETED_SPEED_BONUS,
  SOIL_STEERING_SAMPLE_DISTANCE,
  SOIL_STEERING_SAMPLE_ANGLE,
} from '../../../plants/soil-depletion-consts';
import { getSoilSpeedModifier } from '../../../plants/soil-depletion-update';
import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { Vector2D } from '../../../../utils/math-types';
import {
  calculateWrappedDistance,
  getDirectionVectorOnTorus,
  vectorNormalize,
  vectorAdd,
  vectorScale,
  vectorRotate,
} from '../../../../utils/math-utils';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import {
  HUMAN_MOVING,
  HumanMovingStateData,
  HUMAN_IDLE,
  HUMAN_ATTACKING,
  HumanAttackingStateData,
} from './human-state-types';
import { isDirectPathBlocked, findPath } from '../../../../utils/navigation-utils';

const MOVEMENT_THRESHOLD = 7.5; // Distance to consider "close enough" to target
const PATH_RECOMPUTE_INTERVAL = 0.5; // Recompute path every 0.5 game hours if needed

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

    const { width, height } = updateContext.gameState.mapDimensions;

    // Check if we've reached the target
    const distance = calculateWrappedDistance(entity.position, targetPosition, width, height);

    if (distance < MOVEMENT_THRESHOLD) {
      // Close enough to target
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...movingData,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
          path: undefined,
          pathIndex: undefined,
        },
      };
    }

    // --- Pathfinding Logic ---
    // Check if direct path is blocked by obstacles (palisades, gates, trees)
    let immediateTarget = targetPosition;
    let updatedMovingData = movingData;

    const isBlocked = isDirectPathBlocked(entity.position, targetPosition, updateContext.gameState, entity.leaderId);

    if (isBlocked) {
      // Need to use pathfinding
      const needsNewPath =
        !movingData.path ||
        movingData.path.length === 0 ||
        (movingData.pathComputedAt !== undefined &&
          updateContext.gameState.time - movingData.pathComputedAt > PATH_RECOMPUTE_INTERVAL);

      if (needsNewPath) {
        // Compute new path
        const path = findPath(entity.position, targetPosition, updateContext.gameState, entity.leaderId);

        if (path && path.length > 0) {
          updatedMovingData = {
            ...movingData,
            path,
            pathIndex: 0,
            pathComputedAt: updateContext.gameState.time,
          };
        } else {
          // No path found - clear path and try direct movement (may get stuck)
          updatedMovingData = {
            ...movingData,
            path: undefined,
            pathIndex: undefined,
            pathComputedAt: undefined,
          };
        }
      }

      // Follow the computed path
      if (updatedMovingData.path && updatedMovingData.path.length > 0) {
        const pathIndex = updatedMovingData.pathIndex ?? 0;
        const currentPath = updatedMovingData.path;

        if (pathIndex < currentPath.length) {
          const waypoint = currentPath[pathIndex];
          const waypointDistance = calculateWrappedDistance(entity.position, waypoint, width, height);

          if (waypointDistance < MOVEMENT_THRESHOLD * 2) {
            // Reached waypoint, move to next
            updatedMovingData = {
              ...updatedMovingData,
              pathIndex: pathIndex + 1,
            };

            // Get next waypoint or final target
            if (pathIndex + 1 < currentPath.length) {
              immediateTarget = currentPath[pathIndex + 1];
            } else {
              immediateTarget = targetPosition;
            }
          } else {
            immediateTarget = waypoint;
          }
        }
      }
    } else {
      // Direct path is clear, reset path data
      if (movingData.path) {
        updatedMovingData = {
          ...movingData,
          path: undefined,
          pathIndex: undefined,
          pathComputedAt: undefined,
        };
      }
    }
    // --- End Pathfinding Logic ---

    // --- Steering Logic ---
    const dirToTarget = getDirectionVectorOnTorus(entity.position, immediateTarget, width, height);
    const straightDir = vectorNormalize(dirToTarget);

    const immediateDistance = calculateWrappedDistance(entity.position, immediateTarget, width, height);

    if (immediateDistance > SOIL_STEERING_SAMPLE_DISTANCE) {
      // Greedy Steering: Sample soil in 3 directions to find the fastest path
      const leftDir = vectorRotate(straightDir, -SOIL_STEERING_SAMPLE_ANGLE);
      const rightDir = vectorRotate(straightDir, SOIL_STEERING_SAMPLE_ANGLE);

      const directions = [straightDir, leftDir, rightDir];
      const scores = directions.map((dir, index) => {
        // Calculate sample position with wrapping
        const samplePos = vectorAdd(entity.position, vectorScale(dir, SOIL_STEERING_SAMPLE_DISTANCE));
        const wrappedSamplePos = {
          x: ((samplePos.x % width) + width) % width,
          y: ((samplePos.y % height) + height) % height,
        };

        const speedModifier = getSoilSpeedModifier(
          updateContext.gameState.soilDepletion,
          wrappedSamplePos,
          width,
          height,
          SOIL_DEPLETED_SPEED_BONUS,
        );

        // Score based on speed modifier and alignment with target
        // alignment = cos(0) = 1.0 for straightDir, cos(30deg) ~= 0.866 for others
        const angleDeviation = index === 0 ? 0 : SOIL_STEERING_SAMPLE_ANGLE;
        const alignment = Math.cos(angleDeviation);
        return speedModifier * alignment;
      });

      // Pick the best direction
      let bestIndex = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] > scores[bestIndex]) {
          bestIndex = i;
        }
      }
      entity.direction = directions[bestIndex];
    } else {
      // Too close to target, just move straight
      entity.direction = straightDir;
    }
    // --- End Steering Logic ---

    // Get terrain speed modifier from soil depletion state at current position
    const terrainSpeedModifier = getSoilSpeedModifier(
      updateContext.gameState.soilDepletion,
      entity.position,
      width,
      height,
      SOIL_DEPLETED_SPEED_BONUS,
    );

    // Set acceleration based on effective speed
    entity.acceleration = getEffectiveSpeed(entity, terrainSpeedModifier);

    return { nextState: HUMAN_MOVING, data: updatedMovingData };
  }

  onExit(context: StateContext<HumanEntity>) {
    const { entity } = context;

    // Reset  acceleration when exiting moving state
    entity.acceleration = 0;
  }
}

// Define the human moving state
export const humanMovingState: State<HumanEntity, HumanMovingStateData> = new HumanMovingState();
