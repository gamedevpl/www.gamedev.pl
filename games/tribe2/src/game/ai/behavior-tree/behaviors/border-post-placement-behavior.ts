import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import {
  findNearestTerritoryEdge,
  getTerritoryEdgeNormal,
  canPlaceBuildingInTerritory,
} from '../../../entities/tribe/territory-utils';
import { vectorAdd, vectorRotate, vectorScale, calculateWrappedDistance } from '../../../utils/math-utils';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { createBuilding } from '../../../utils';

/**
 * Constants for border expansion behavior
 */
const BORDER_EXPANSION_STEP_DISTANCE = 30; // Distance to move per step along border
const BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT = 2; // Minimum army control weight to expand borders
const EDGE_APPROACH_THRESHOLD = 40; // How close to be considered "at the edge"

/**
 * Factory function to create a border expansion behavior node.
 * This behavior allows Warriors and Leaders to autonomously expand territory ("Pioneer" behavior).
 *
 * The behavior tree structure:
 * - Sequence
 *   1. Condition: Is Warrior or Leader
 *   2. Condition: Has Army Control with expandBorders weight > threshold
 *   3. Condition: Tribe has buildings (territory exists)
 *   4. Action: Pioneer Logic (Find edge, walk along it, paint territory)
 */
export function createBorderPostPlacementBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Condition: Check if entity is a Warrior or Leader
  const isWarriorOrLeaderCondition = new ConditionNode<HumanEntity>(
    (entity) => {
      const isLeader = entity.leaderId === entity.id;
      const isWarrior = entity.tribeRole === TribeRole.Warrior;

      if (!isLeader && !isWarrior) {
        return [false, `Not a Warrior or Leader (role: ${entity.tribeRole || 'none'})`];
      }
      return [true, isLeader ? 'Is Leader' : 'Is Warrior'];
    },
    'Is Warrior or Leader',
    depth + 1,
  );

  // Condition: Check if Army Control has expandBorders weight set high enough
  const hasExpandBordersWeightCondition = new ConditionNode<HumanEntity>(
    (entity) => {
      if (entity.leaderId !== entity.id) {
        // Warriors follow leader's strategy.
        // In a real implementation, we might check the leader's blackboard or tribe settings.
        // For now, assuming warriors are enabled if the behavior is active.
        return [true, 'Warrior follows leader strategy'];
      }

      const expandBordersWeight = entity.tribeControl?.armyControl?.expandBorders ?? 0;
      if (expandBordersWeight < BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT) {
        return [
          false,
          `Expand borders weight too low: ${expandBordersWeight}/${BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT}`,
        ];
      }
      return [true, `Expand borders weight: ${expandBordersWeight}`];
    },
    'Has Expand Borders Weight',
    depth + 1,
  );

  // Condition: Check if territory exists
  const hasTerritoryCondition = new ConditionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) return [false, 'No tribe leader'];
      const indexedState = context.gameState as IndexedWorldState;
      const tribeBuildings = indexedState.search.building.byProperty('ownerId', entity.leaderId);
      if (tribeBuildings.length === 0) {
        return [false, 'No territory to expand'];
      }
      return [true, `Tribe has ${tribeBuildings.length} buildings`];
    },
    'Has Territory',
    depth + 1,
  );

  // Action: Pioneer Logic
  // This complex action handles finding the edge, navigating along it, and painting.
  const pioneerAction = new ActionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) return [NodeStatus.FAILURE, 'No leader'];

      const gameState = context.gameState;
      const worldWidth = gameState.mapDimensions.width;
      const worldHeight = gameState.mapDimensions.height;

      // 1. Find nearest territory edge
      const nearestEdge = findNearestTerritoryEdge(entity.position, entity.leaderId, gameState);

      if (!nearestEdge) {
        // Should not happen if hasTerritoryCondition passed, unless map is full or bug
        return [NodeStatus.FAILURE, 'Could not find territory edge'];
      }

      // 2. Check distance to edge
      const distToEdge = calculateWrappedDistance(entity.position, nearestEdge, worldWidth, worldHeight);

      if (distToEdge > EDGE_APPROACH_THRESHOLD) {
        // Too far, move towards edge
        entity.activeAction = 'moving';
        // Set target position for movement
        entity.target = nearestEdge;
        return [NodeStatus.RUNNING, `Approaching territory edge (${distToEdge.toFixed(0)}px)`];
      }

      // 3. We are at the edge. Calculate expansion direction.
      const normal = getTerritoryEdgeNormal(entity.position, entity.leaderId, gameState);

      // Default: Turn 90 degrees (tangent). Let's say Clockwise (-90 deg)
      // We can randomize this or store it in a temp property if we want persistence,
      // but for now, let's try CW.
      // If we want to support "try other direction", we need to know if we failed recently.
      // For simplicity: Try CW. If blocked, try CCW.

      let tangent = vectorRotate(normal, -Math.PI / 2); // CW

      // 4. Calculate proposed next position
      let nextPos = vectorAdd(entity.position, vectorScale(tangent, BORDER_EXPANSION_STEP_DISTANCE));

      // Wrap nextPos
      nextPos = {
        x: ((nextPos.x % worldWidth) + worldWidth) % worldWidth,
        y: ((nextPos.y % worldHeight) + worldHeight) % worldHeight,
      };

      // 5. Check validity (Is it blocked by another tribe?)
      // We check if the NEW position is in another tribe's territory.
      let validity = canPlaceBuildingInTerritory(nextPos, entity.leaderId, gameState);

      if (!validity.canPlace) {
        // Blocked! Try scanning angles.
        // Scan +/- 30 degrees in 10 degree steps
        let found = false;
        const angles = [10, -10, 20, -20, 30, -30]; // Degrees

        for (const angleDeg of angles) {
          const angleRad = (angleDeg * Math.PI) / 180;
          const adjustedTangent = vectorRotate(tangent, angleRad);
          let testPos = vectorAdd(entity.position, vectorScale(adjustedTangent, BORDER_EXPANSION_STEP_DISTANCE));
          testPos = {
            x: ((testPos.x % worldWidth) + worldWidth) % worldWidth,
            y: ((testPos.y % worldHeight) + worldHeight) % worldHeight,
          };

          if (canPlaceBuildingInTerritory(testPos, entity.leaderId, gameState).canPlace) {
            nextPos = testPos;
            found = true;
            break;
          }
        }

        if (!found) {
          // Try reversing direction (CCW)
          tangent = vectorRotate(normal, Math.PI / 2); // CCW
          let testPos = vectorAdd(entity.position, vectorScale(tangent, BORDER_EXPANSION_STEP_DISTANCE));
          testPos = {
            x: ((testPos.x % worldWidth) + worldWidth) % worldWidth,
            y: ((testPos.y % worldHeight) + worldHeight) % worldHeight,
          };

          if (canPlaceBuildingInTerritory(testPos, entity.leaderId, gameState).canPlace) {
            nextPos = testPos;
            found = true;
          }
        }

        if (!found) {
          // Completely blocked. Stop.
          return [NodeStatus.FAILURE, 'Blocked by other territories'];
        }
      }

      // 6. Move to the valid position
      entity.target = nextPos;

      createBuilding(entity.position, BuildingType.BorderPost, entity.leaderId, gameState);

      entity.activeAction = 'moving';

      return [NodeStatus.RUNNING, 'Expanding territory'];
    },
    'Pioneer Expansion',
    depth + 1,
  );

  return new Sequence<HumanEntity>(
    [isWarriorOrLeaderCondition, hasExpandBordersWeightCondition, hasTerritoryCondition, pioneerAction],
    'Border Expansion',
    depth,
  );
}
