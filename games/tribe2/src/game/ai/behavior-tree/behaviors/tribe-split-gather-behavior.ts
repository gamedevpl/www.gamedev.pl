import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import { getSplitPhase, TribeSplitStrategy } from '../../../entities/tribe/tribe-split-utils';
import { EntityId } from '../../../entities/entities-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { TRIBE_SPLIT_GATHER_RADIUS } from '../../../entities/tribe/tribe-consts';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { findLivingFamilyRoot } from '../../../entities/tribe/family-tribe-utils';

// Re-declaring these constants locally to avoid circular dependency issues if they are not exported or to keep it self-contained if needed,
// but ideally we should import them. Since they are not exported from tribe-split-utils in a way that is easily importable without potential cycles or if they are private,
// we will use the string literals as defined in tribe-split-utils.ts.
// However, looking at tribe-split-utils.ts, the keys are local constants.
// We should probably export them or use the accessor functions.
// Since we can't easily change the export structure in this single file creation step without potentially affecting others,
// and we need to read the leader's blackboard, we will rely on the fact that we can read the raw data if we know the keys,
// OR we can add helper functions in tribe-split-utils to read these specific values from a *given* blackboard.
// For now, I will define the keys here matching tribe-split-utils.ts.
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
          // 1. Find the patriarch of the family line
          const patriarch = findLivingFamilyRoot(human, context.gameState);

          if (!patriarch.aiBlackboard) {
            return [false, 'Patriarch has no blackboard'];
          }

          // 2. Check if patriarch is in gathering phase
          const patriarchPhase = getSplitPhase(patriarch.aiBlackboard);
          if (patriarchPhase !== 'gathering') {
            return [false, `Patriarch phase: ${patriarchPhase}`];
          }

          // 3. Check if we are part of the splitting family
          const familyIds = Blackboard.get<EntityId[]>(patriarch.aiBlackboard, BB_SPLIT_FAMILY_IDS);
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
          const patriarch = findLivingFamilyRoot(human, context.gameState);
          // We already checked patriarch existence and identity in the condition node

          const strategy = Blackboard.get<TribeSplitStrategy>(patriarch.aiBlackboard!, BB_SPLIT_STRATEGY);

          let targetPosition: Vector2D | undefined;

          if (strategy === 'migration') {
            targetPosition = Blackboard.get<Vector2D>(patriarch.aiBlackboard!, BB_SPLIT_TARGET_POSITION);
          } else if (strategy === 'concentration') {
            const buildingId = Blackboard.get<EntityId>(patriarch.aiBlackboard!, BB_SPLIT_TARGET_BUILDING_ID);
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

          // If we are already close enough, we are done for now (success), but we should stay there.
          // Returning SUCCESS might make the sequence finish and the selector move on?
          // Actually, if we return SUCCESS, the parent selector (if this is high priority) will pick this behavior again next frame
          // as long as the condition holds.
          // However, we want to actively move if we are far.

          if (distance <= TRIBE_SPLIT_GATHER_RADIUS) {
            // We are there. We can idle or just return success.
            // To prevent jitter, maybe we just stop moving.
            human.activeAction = 'idle';
            human.target = undefined;
            return NodeStatus.SUCCESS;
          }

          // Move towards target
          human.activeAction = 'moving';
          human.target = targetPosition;

          return [NodeStatus.RUNNING, `Distance: ${distance.toFixed(2)}`];
        },
        'Move to Split Gathering Point',
        depth + 1,
      ),
    ],
    'Tribe Split Gather Behavior',
    depth,
  );
}
