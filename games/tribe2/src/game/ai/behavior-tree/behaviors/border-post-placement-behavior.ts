import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { createBuilding, findAdjacentBuildingPlacement } from '../../../utils/building-placement-utils';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';

/**
 * Constants for border post placement behavior
 */
const BORDER_POST_SEARCH_RADIUS = 120; // Small radius - entity must be nearby
const BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT = 2; // Minimum army control weight to place border posts
const BORDER_POST_MAX_POSTS_PER_BUILDING = 2; // Maximum border posts per other building
const BORDER_POST_MIN_DISTANCE_FROM_OTHER_TRIBE = 150; // Minimum distance from other tribe centers

/**
 * Factory function to create a border post placement behavior node.
 * This behavior allows Warriors and Leaders to autonomously place border posts
 * to expand tribe territory based on Army Control settings.
 *
 * The behavior tree structure:
 * - Sequence (all must succeed)
 *   1. Condition: Is Warrior or Leader
 *   2. Condition: Has Army Control with expandBorders weight > threshold
 *   3. Condition: Tribe has buildings (territory exists)
 *   4. Condition: Not too many border posts already
 *   5. Action: Place border post near current position
 *
 * @param depth The depth of this node in the behavior tree
 * @returns A new behavior tree for border post placement
 */
export function createBorderPostPlacementBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Condition: Check if entity is a Warrior or Leader
  const isWarriorOrLeaderCondition = new ConditionNode<HumanEntity>(
    (entity) => {
      // Leaders are identified by leaderId === entity.id
      const isLeader = entity.leaderId === entity.id;

      // Warriors have explicit role assignment
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
      // Only leaders have tribeControl
      if (entity.leaderId !== entity.id) {
        // Warriors inherit their leader's army control settings
        // We'll assume warriors should follow their leader's strategy
        // For now, allow warriors to place if they exist (their existence implies the need)
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

  // Condition: Check if tribe has buildings (territory exists)
  const hasTerritoryCondition = new ConditionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) {
        return [false, 'No tribe leader'];
      }

      const indexedState = context.gameState as IndexedWorldState;
      const tribeBuildings = indexedState.search.building.byProperty('ownerId', entity.leaderId);

      if (tribeBuildings.length === 0) {
        return [false, 'No tribe buildings - cannot expand without initial territory'];
      }

      return [true, `Tribe has ${tribeBuildings.length} buildings`];
    },
    'Has Territory',
    depth + 1,
  );

  // Condition: Check if tribe doesn't have too many border posts already
  const notTooManyBorderPostsCondition = new ConditionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) {
        return [false, 'No tribe leader'];
      }

      const indexedState = context.gameState as IndexedWorldState;
      const tribeBuildings = indexedState.search.building.byProperty('ownerId', entity.leaderId);

      const borderPosts = tribeBuildings.filter((b) => b.buildingType === BuildingType.BorderPost);
      const otherBuildings = tribeBuildings.filter((b) => b.buildingType !== BuildingType.BorderPost);

      // Allow more border posts as territory grows
      const maxBorderPosts = Math.max(3, otherBuildings.length * BORDER_POST_MAX_POSTS_PER_BUILDING);

      if (borderPosts.length >= maxBorderPosts) {
        return [
          false,
          `Too many border posts: ${borderPosts.length}/${maxBorderPosts} (${otherBuildings.length} other buildings)`,
        ];
      }

      return [true, `Border posts: ${borderPosts.length}/${maxBorderPosts} (${otherBuildings.length} other buildings)`];
    },
    'Not Too Many Border Posts',
    depth + 1,
  );

  // Action: Place border post near current position
  const placeBorderPostAction = new ActionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) {
        return [NodeStatus.FAILURE, 'No tribe leader'];
      }

      // Find placement location near entity's current position
      // We temporarily modify the game state to treat entity's position as an anchor
      // by using findAdjacentBuildingPlacement with the entity's position

      const placementLocation = findAdjacentBuildingPlacement(
        BuildingType.BorderPost,
        entity.leaderId,
        context.gameState,
        BORDER_POST_SEARCH_RADIUS,
        BORDER_POST_MIN_DISTANCE_FROM_OTHER_TRIBE,
      );

      if (!placementLocation) {
        return [NodeStatus.FAILURE, `No valid location found for border post within ${BORDER_POST_SEARCH_RADIUS}px`];
      }

      // Check if placement is reasonably close to entity's current position
      // This ensures warriors/leaders place posts near where they are
      const dx = placementLocation.x - entity.position.x;
      const dy = placementLocation.y - entity.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Allow placement within extended radius (account for world wrapping)
      const maxPlacementDistance = BORDER_POST_SEARCH_RADIUS * 1.5;
      if (distance > maxPlacementDistance) {
        return [
          NodeStatus.FAILURE,
          `Placement location too far from entity: ${distance.toFixed(0)}px > ${maxPlacementDistance}px`,
        ];
      }

      createBuilding(placementLocation, BuildingType.BorderPost, entity.leaderId, context.gameState);

      return [
        NodeStatus.SUCCESS,
        `Placed border post at (${placementLocation.x.toFixed(0)}, ${placementLocation.y.toFixed(
          0,
        )}) - ${distance.toFixed(0)}px from entity`,
      ];
    },
    'Place Border Post',
    depth + 1,
  );

  // Main sequence: Check role -> Check weight -> Check territory -> Check not too many -> Place
  return new Sequence<HumanEntity>(
    [
      isWarriorOrLeaderCondition,
      hasExpandBordersWeightCondition,
      hasTerritoryCondition,
      notTooManyBorderPostsCondition,
      placeBorderPostAction,
    ],
    'Border Post Placement',
    depth,
  );
}
