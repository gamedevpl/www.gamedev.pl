import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { canPlaceBuildingInTerritory } from '../../../entities/tribe/territory-utils';
import { vectorAdd, vectorRotate, vectorScale } from '../../../utils/math-utils';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { createBuilding } from '../../../utils';
import { getTribeCenter } from '../../../utils/spatial-utils';
import { Vector2D } from '../../../utils/math-types';
import { Blackboard } from '../behavior-tree-blackboard';

/**
 * Constants for border expansion behavior
 */
const BORDER_EXPANSION_STEP_DISTANCE = 30; // Distance to move per step along border
const BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT = 2; // Minimum army control weight to expand borders
const RIGHT_HAND_TURN_ANGLE = Math.PI / 2; // 90 degrees - turn right
const LEFT_HAND_TURN_ANGLE = -Math.PI / 2; // -90 degrees - turn left

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

  // Action: Pioneer Logic - Right-hand wall following algorithm
  // Walk around the territory border while keeping your right hand on the border.
  // This traces the perimeter and naturally creates a convex shape.
  // Algorithm:
  // 1. Find or remember current facing direction
  // 2. Try to turn right (into territory) - if blocked, that's the wall
  // 3. Try to go forward - if blocked, turn left until you can proceed
  // 4. Place border posts where territory can be expanded (to your left)
  const pioneerAction = new ActionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) return [NodeStatus.FAILURE, 'No leader'];

      const gameState = context.gameState;
      const worldWidth = gameState.mapDimensions.width;
      const worldHeight = gameState.mapDimensions.height;

      // Helper to wrap position to world bounds
      const wrapPosition = (pos: Vector2D): Vector2D => ({
        x: ((pos.x % worldWidth) + worldWidth) % worldWidth,
        y: ((pos.y % worldHeight) + worldHeight) % worldHeight,
      });

      // Helper to check if a position is valid for expansion
      const canExpand = (pos: Vector2D): boolean => {
        return canPlaceBuildingInTerritory(pos, entity.leaderId!, gameState).canPlace;
      };

      // Check if entity is inside territory
      const isInOwnTerritory = canExpand(entity.position);

      if (!isInOwnTerritory) {
        // Entity is outside territory - move towards center first
        const tribeCenter = getTribeCenter(entity.leaderId, gameState);
        entity.activeAction = 'moving';
        entity.target = tribeCenter;
        return [NodeStatus.RUNNING, 'Moving to tribe territory'];
      }

      // Get or initialize the facing direction from entity's blackboard
      // The facing direction is stored as the direction the entity is "walking" along the border
      let facingDirection: Vector2D;
      const BORDER_FACING_KEY = 'borderFacingDirection';

      const storedFacing = Blackboard.get<Vector2D>(entity.aiBlackboard, BORDER_FACING_KEY);
      if (storedFacing) {
        facingDirection = storedFacing;
      } else {
        // Initialize: face away from tribe center (outward direction)
        const tribeCenter = getTribeCenter(entity.leaderId, gameState);
        const toEntity = {
          x: entity.position.x - tribeCenter.x,
          y: entity.position.y - tribeCenter.y,
        };
        // Normalize and rotate 90 degrees to start walking along the edge (counterclockwise)
        const magnitude = Math.sqrt(toEntity.x * toEntity.x + toEntity.y * toEntity.y);
        if (magnitude > 0) {
          facingDirection = vectorRotate({ x: toEntity.x / magnitude, y: toEntity.y / magnitude }, LEFT_HAND_TURN_ANGLE);
        } else {
          facingDirection = { x: 1, y: 0 }; // Default direction
        }
        // Store in aiBlackboard
        if (entity.aiBlackboard) {
          Blackboard.set(entity.aiBlackboard, BORDER_FACING_KEY, facingDirection);
        }
      }

      // Right-hand wall following:
      // 1. First, try to turn right (check if wall is still there on our right)
      const rightDirection = vectorRotate(facingDirection, RIGHT_HAND_TURN_ANGLE);
      const rightPos = wrapPosition(vectorAdd(entity.position, vectorScale(rightDirection, BORDER_EXPANSION_STEP_DISTANCE)));

      // 2. Check if we can go right (into what should be the wall/outside territory)
      if (canExpand(rightPos)) {
        // The wall on our right is gone! This means we can expand the territory here.
        // Place a border post and turn right to keep following the wall
        createBuilding(entity.position, BuildingType.BorderPost, entity.leaderId, gameState);

        // Turn right and move
        const newFacing = rightDirection;
        if (entity.aiBlackboard) {
          Blackboard.set(entity.aiBlackboard, BORDER_FACING_KEY, newFacing);
        }
        entity.target = rightPos;
        entity.activeAction = 'moving';
        return [NodeStatus.RUNNING, 'Expanding territory - turning right into new area'];
      }

      // 3. Try to go forward
      const forwardPos = wrapPosition(vectorAdd(entity.position, vectorScale(facingDirection, BORDER_EXPANSION_STEP_DISTANCE)));

      if (canExpand(forwardPos)) {
        // Can go forward - continue walking along the border
        entity.target = forwardPos;
        entity.activeAction = 'moving';
        return [NodeStatus.RUNNING, 'Walking along border'];
      }

      // 4. Can't go forward - wall ahead, turn left
      let newFacing = facingDirection;
      let attempts = 0;
      const maxAttempts = 4; // Maximum 360 degrees of turning (4 x 90 degrees)

      while (attempts < maxAttempts) {
        newFacing = vectorRotate(newFacing, LEFT_HAND_TURN_ANGLE);
        const testPos = wrapPosition(vectorAdd(entity.position, vectorScale(newFacing, BORDER_EXPANSION_STEP_DISTANCE)));

        if (canExpand(testPos)) {
          // Found a valid direction - update facing and move
          if (entity.aiBlackboard) {
            Blackboard.set(entity.aiBlackboard, BORDER_FACING_KEY, newFacing);
          }
          entity.target = testPos;
          entity.activeAction = 'moving';
          return [NodeStatus.RUNNING, `Turned left ${(attempts + 1) * 90}° to find path`];
        }
        attempts++;
      }

      // 5. Completely surrounded - can't move anywhere
      // Reset facing direction and try again next tick
      if (entity.aiBlackboard) {
        Blackboard.delete(entity.aiBlackboard, BORDER_FACING_KEY);
      }
      return [NodeStatus.FAILURE, 'Completely surrounded - cannot expand'];
    },
    'Pioneer Expansion (Right-hand wall following)',
    depth + 1,
  );

  return new Sequence<HumanEntity>(
    [isWarriorOrLeaderCondition, hasExpandBordersWeightCondition, hasTerritoryCondition, pioneerAction],
    'Border Expansion',
    depth,
  );
}
