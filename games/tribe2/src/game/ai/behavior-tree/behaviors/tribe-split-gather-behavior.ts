import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import {
  getSplitPhase,
  TribeSplitStrategy,
} from '../../../entities/tribe/tribe-split-utils';
import { EntityId } from '../../../entities/entities-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { TRIBE_SPLIT_GATHER_RADIUS } from '../../../entities/tribe/tribe-consts';
import { BuildingEntity } from '../../../entities/buildings/building-types';

// Blackboard keys matching tribe-split-utils.ts
const BB_SPLIT_STRATEGY = 'tribeSplit_strategy';
const BB_SPLIT_TARGET_POSITION = 'tribeSplit_targetPosition';
const BB_SPLIT_TARGET_BUILDING_ID = 'tribeSplit_targetBuildingId';
const BB_SPLIT_FAMILY_IDS = 'tribeSplit_familyIds';

/**
 * Creates a behavior that makes a tribe member gather for a split if their leader is initiating one.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitGatherBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          // 1. Check if we have a leader (and we're not the leader ourselves)
          if (!human.leaderId || human.leaderId === human.id) {
            return [false, 'No leader or is leader'];
          }

          const leader = context.gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
          if (!leader || !leader.aiBlackboard) {
            return [false, 'Leader not found or no blackboard'];
          }

          // 2. Check if leader is in gathering phase
          const leaderPhase = getSplitPhase(leader.aiBlackboard);
          if (leaderPhase !== 'gathering') {
            return [false, `Leader phase: ${leaderPhase}`];
          }

          // 3. Check if we are part of the splitting family
          const familyIds = Blackboard.get<EntityId[]>(leader.aiBlackboard, BB_SPLIT_FAMILY_IDS);
          if (!familyIds || !familyIds.includes(human.id)) {
            return [false, 'Not in split family'];
          }

          return [true, 'Gathering for split'];
        },
        'Should Gather for Split?',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const leader = context.gameState.entities.entities[human.leaderId!] as HumanEntity;
          // We already checked leader existence in the condition node

          const strategy = Blackboard.get<TribeSplitStrategy>(leader.aiBlackboard!, BB_SPLIT_STRATEGY);

          let targetPosition: Vector2D | undefined;

          if (strategy === 'migration') {
            targetPosition = Blackboard.get<Vector2D>(leader.aiBlackboard!, BB_SPLIT_TARGET_POSITION);
          } else if (strategy === 'concentration') {
            const buildingId = Blackboard.get<EntityId>(leader.aiBlackboard!, BB_SPLIT_TARGET_BUILDING_ID);
            if (buildingId) {
              const building = context.gameState.entities.entities[buildingId] as BuildingEntity | undefined;
              if (building) {
                targetPosition = building.position;
              }
            }
          }

          if (!targetPosition) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            targetPosition,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // If we are already close enough, we are done for now
          if (distance <= TRIBE_SPLIT_GATHER_RADIUS) {
            // We are there. Stay idle.
            return NodeStatus.SUCCESS;
          }

          // Move towards target
          human.activeAction = 'moving';
          human.target = targetPosition;

          return NodeStatus.RUNNING;
        },
        'Move to Split Gathering Point',
        depth + 1,
      ),
    ],
    'Tribe Split Gather Behavior',
    depth,
  );
}
