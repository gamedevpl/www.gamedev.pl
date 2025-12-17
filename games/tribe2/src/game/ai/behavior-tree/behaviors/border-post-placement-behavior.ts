import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { canPlaceBuildingInTerritory } from '../../../entities/tribe/territory-utils';
import {
  vectorAdd,
  vectorRotate,
  vectorScale,
  calculateWrappedDistance,
  vectorNormalize,
  getDirectionVectorOnTorus,
} from '../../../utils/math-utils';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { createBuilding } from '../../../utils';
import { getTribeCenter } from '../../../utils/spatial-utils';

/**
 * Constants for border expansion behavior
 */
const BORDER_EXPANSION_STEP_DISTANCE = 30; // Distance to move per step along border
const BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT = 2; // Minimum army control weight to expand borders
const MIN_DISTANCE_FROM_CENTER_FOR_RADIAL = 30; // Entities closer than this pick a random direction
const EXPANSION_ANGLE_FALLBACKS = [15, -15, 30, -30, 45, -45]; // Degrees - smaller angles preferred for convex shape

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
  // This action handles radial expansion from the tribe center to create convex territory.
  // Instead of walking to any edge and expanding outward, we:
  // 1. Calculate the radial direction FROM the tribe center TO the entity
  // 2. Walk outward along that radial line to the territory edge
  // 3. Place border posts to expand the territory radially, maintaining a convex shape
  const pioneerAction = new ActionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) return [NodeStatus.FAILURE, 'No leader'];

      const gameState = context.gameState;
      const worldWidth = gameState.mapDimensions.width;
      const worldHeight = gameState.mapDimensions.height;

      // 1. Calculate tribe center
      const tribeCenter = getTribeCenter(entity.leaderId, gameState);

      // 2. Calculate radial direction from center to entity (this is our expansion direction)
      const directionFromCenter = getDirectionVectorOnTorus(
        tribeCenter,
        entity.position,
        worldWidth,
        worldHeight,
      );
      const radialDirection = vectorNormalize(directionFromCenter);

      // If entity is very close to the center, pick a random radial direction
      const distFromCenter = calculateWrappedDistance(entity.position, tribeCenter, worldWidth, worldHeight);
      let expansionDirection = radialDirection;
      if (distFromCenter < MIN_DISTANCE_FROM_CENTER_FOR_RADIAL) {
        // Pick a random direction to start expanding
        const randomAngle = Math.random() * Math.PI * 2;
        expansionDirection = { x: Math.cos(randomAngle), y: Math.sin(randomAngle) };
      }

      // 3. Find the territory edge in this radial direction by raymarching outward from center
      // Start from current position and check if we're inside territory
      const isInOwnTerritory = canPlaceBuildingInTerritory(entity.position, entity.leaderId, gameState).canPlace;

      if (!isInOwnTerritory) {
        // Entity is outside territory - move towards center first
        entity.activeAction = 'moving';
        entity.target = tribeCenter;
        return [NodeStatus.RUNNING, 'Moving to tribe territory'];
      }

      // 4. Check if entity is at the territory edge (next step would be outside or blocked)
      const testPos = vectorAdd(entity.position, vectorScale(expansionDirection, BORDER_EXPANSION_STEP_DISTANCE));
      const wrappedTestPos = {
        x: ((testPos.x % worldWidth) + worldWidth) % worldWidth,
        y: ((testPos.y % worldHeight) + worldHeight) % worldHeight,
      };

      const canExpandHere = canPlaceBuildingInTerritory(wrappedTestPos, entity.leaderId, gameState).canPlace;

      if (canExpandHere) {
        // 5. We can expand! Place a border post at current position and move outward
        createBuilding(entity.position, BuildingType.BorderPost, entity.leaderId, gameState);

        entity.target = wrappedTestPos;
        entity.activeAction = 'moving';
        return [NodeStatus.RUNNING, 'Expanding territory radially'];
      }

      // 6. Can't expand in the radial direction - try adjacent angles to maintain convex shape
      // Scan +/- 45 degrees in small steps (closer to radial = more convex)
      for (const angleDeg of EXPANSION_ANGLE_FALLBACKS) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const adjustedDirection = vectorRotate(expansionDirection, angleRad);
        let altTestPos = vectorAdd(entity.position, vectorScale(adjustedDirection, BORDER_EXPANSION_STEP_DISTANCE));
        altTestPos = {
          x: ((altTestPos.x % worldWidth) + worldWidth) % worldWidth,
          y: ((altTestPos.y % worldHeight) + worldHeight) % worldHeight,
        };

        if (canPlaceBuildingInTerritory(altTestPos, entity.leaderId, gameState).canPlace) {
          // Found a valid direction - place post and move there
          createBuilding(entity.position, BuildingType.BorderPost, entity.leaderId, gameState);
          entity.target = altTestPos;
          entity.activeAction = 'moving';
          return [NodeStatus.RUNNING, `Expanding territory at angle ${angleDeg}°`];
        }
      }

      // 7. Can't expand at all from here - walk around the edge to find a better spot
      // Move along the territory edge (perpendicular to radial direction)
      const tangentDirection = { x: -expansionDirection.y, y: expansionDirection.x };
      let edgeWalkPos = vectorAdd(entity.position, vectorScale(tangentDirection, BORDER_EXPANSION_STEP_DISTANCE));
      edgeWalkPos = {
        x: ((edgeWalkPos.x % worldWidth) + worldWidth) % worldWidth,
        y: ((edgeWalkPos.y % worldHeight) + worldHeight) % worldHeight,
      };

      if (canPlaceBuildingInTerritory(edgeWalkPos, entity.leaderId, gameState).canPlace) {
        entity.target = edgeWalkPos;
        entity.activeAction = 'moving';
        return [NodeStatus.RUNNING, 'Walking along edge to find expansion point'];
      }

      // Try the opposite tangent direction
      const oppositeTangent = vectorScale(tangentDirection, -1);
      edgeWalkPos = vectorAdd(entity.position, vectorScale(oppositeTangent, BORDER_EXPANSION_STEP_DISTANCE));
      edgeWalkPos = {
        x: ((edgeWalkPos.x % worldWidth) + worldWidth) % worldWidth,
        y: ((edgeWalkPos.y % worldHeight) + worldHeight) % worldHeight,
      };

      if (canPlaceBuildingInTerritory(edgeWalkPos, entity.leaderId, gameState).canPlace) {
        entity.target = edgeWalkPos;
        entity.activeAction = 'moving';
        return [NodeStatus.RUNNING, 'Walking along edge (reverse) to find expansion point'];
      }

      // Completely blocked
      return [NodeStatus.FAILURE, 'Blocked by other territories'];
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
