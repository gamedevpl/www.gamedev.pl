import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Sequence } from '../nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { GameWorldState } from '../../../world-types';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { isEnemyBuilding } from '../../../utils/human-utils';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { HUMAN_INTERACTION_RANGE } from '../../../human-consts';
import {
  LEADER_BUILDING_INTERACTION_CHECK_INTERVAL_HOURS,
  LEADER_BUILDING_INTERACTION_RANGE,
} from '../../../ai-consts';
import { Blackboard } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types';

const REMOVAL_TARGET_KEY = 'removeEnemyBuildingTarget';

/**
 * Creates a behavior that allows AI tribe leaders to autonomously destroy enemy buildings.
 * 
 * The behavior:
 * 1. Checks if the entity is a tribe leader
 * 2. Finds nearby enemy buildings within detection range
 * 3. Moves to the target building
 * 4. Initiates the destruction action when in range
 * 
 * This is wrapped in a CooldownNode to prevent constant checking.
 * 
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createRemoveEnemyBuildingBehavior(depth: number): BehaviorNode<HumanEntity> {
  const removeAction = new Sequence(
    [
      // 1. Check if we can find an enemy building to destroy
      new ConditionNode(
        (human: HumanEntity, context: { gameState: GameWorldState }, aiBlackboard) => {
          // Only leaders can destroy buildings
          if (!human.leaderId || human.leaderId !== human.id) {
            return [false, 'Not a tribe leader'];
          }

          // Check if we already have a target
          const existingTarget = Blackboard.get<EntityId>(aiBlackboard, REMOVAL_TARGET_KEY);
          if (existingTarget) {
            const targetBuilding = context.gameState.entities.entities[existingTarget] as BuildingEntity | undefined;
            // Validate the target still exists and is still an enemy building
            if (targetBuilding && targetBuilding.type === 'building' && isEnemyBuilding(human, targetBuilding, context.gameState)) {
              return [true, `Continuing to target building ${existingTarget}`];
            }
            // Target no longer valid, clear it
            Blackboard.delete(aiBlackboard, REMOVAL_TARGET_KEY);
          }

          // Search for a new enemy building
          const enemyBuilding = findClosestEntity<BuildingEntity>(
            human,
            context.gameState,
            'building',
            LEADER_BUILDING_INTERACTION_RANGE,
            (building) => isEnemyBuilding(human, building, context.gameState) && building.isConstructed,
          );

          if (enemyBuilding) {
            Blackboard.set(aiBlackboard, REMOVAL_TARGET_KEY, enemyBuilding.id);
            return [true, `Found enemy building at distance ${calculateWrappedDistance(human.position, enemyBuilding.position, context.gameState.mapDimensions.width, context.gameState.mapDimensions.height).toFixed(0)}px`];
          }

          return [false, 'No enemy buildings found within range'];
        },
        'Find Enemy Building to Destroy',
        depth + 2,
      ),

      // 2. Move to the target building
      new ActionNode<HumanEntity>(
        (human, context, aiBlackboard) => {
          const targetId = Blackboard.get<EntityId>(aiBlackboard, REMOVAL_TARGET_KEY);
          
          if (!targetId) {
            return NodeStatus.FAILURE;
          }

          const targetBuilding = context.gameState.entities.entities[targetId] as BuildingEntity | undefined;

          // Validate target still exists and is still an enemy
          if (!targetBuilding || targetBuilding.type !== 'building' || !isEnemyBuilding(human, targetBuilding, context.gameState)) {
            Blackboard.delete(aiBlackboard, REMOVAL_TARGET_KEY);
            human.activeAction = 'idle';
            human.target = undefined;
            return NodeStatus.FAILURE;
          }

          // Check if we've arrived at the target
          const distance = calculateWrappedDistance(
            human.position,
            targetBuilding.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance < HUMAN_INTERACTION_RANGE) {
            // Arrived at destination
            human.activeAction = 'idle';
            human.target = undefined;
            return NodeStatus.SUCCESS;
          }

          // Still moving to target
          human.activeAction = 'moving';
          human.target = targetBuilding.id;

          return NodeStatus.RUNNING;
        },
        'Move to Enemy Building',
        depth + 2,
      ),

      // 3. Initiate the destruction action
      new ActionNode(
        (human: HumanEntity, context: { gameState: GameWorldState }, aiBlackboard) => {
          const targetId = Blackboard.get<EntityId>(aiBlackboard, REMOVAL_TARGET_KEY);
          
          if (!targetId) {
            return NodeStatus.FAILURE;
          }

          const targetBuilding = context.gameState.entities.entities[targetId] as BuildingEntity | undefined;

          // Final validation
          if (!targetBuilding || targetBuilding.type !== 'building' || !isEnemyBuilding(human, targetBuilding, context.gameState)) {
            Blackboard.delete(aiBlackboard, REMOVAL_TARGET_KEY);
            return NodeStatus.FAILURE;
          }

          // Set the action - the interaction system will handle the actual destruction
          human.activeAction = 'destroyingBuilding';
          human.target = targetBuilding.id;

          // Clear the blackboard target since we've initiated the action
          Blackboard.delete(aiBlackboard, REMOVAL_TARGET_KEY);

          return NodeStatus.SUCCESS;
        },
        'Initiate Building Destruction',
        depth + 2,
      ),
    ],
    'Remove Enemy Building Action',
    depth + 1,
  );

  // Wrap the entire action in a CooldownNode to rate-limit this behavior
  return new CooldownNode(
    LEADER_BUILDING_INTERACTION_CHECK_INTERVAL_HOURS,
    removeAction,
    'Remove Enemy Building Cooldown',
    depth,
  );
}
