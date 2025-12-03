import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { canSplitTribe, performTribeSplit, findSafeTribeSplitLocation, getTribeCenter } from '../../../utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Sequence } from '../nodes';
import { TRIBE_SPLIT_CHECK_INTERVAL_HOURS } from '../../../tribe-consts.ts';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts.ts';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { Vector2D } from '../../../utils/math-types';
import { Blackboard } from '../behavior-tree-blackboard.ts';

const MIGRATION_TARGET_KEY = 'tribeSplitMigrationTarget';

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe,
 * move to a new location, and then form a new tribe.
 *
 * This is a high-cost check, so it's wrapped in a CooldownNode to prevent it
 * from being evaluated on every AI tick.
 *
 * The process is a sequence:
 * 1. Check if a split is possible.
 * 2. Find a safe location far away and move there.
 * 3. Formally perform the split.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitBehavior(depth: number): BehaviorNode<HumanEntity> {
  const tribeSplitAction = new Sequence(
    [
      // 1. Perform the expensive check to see if all conditions are met.
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const { canSplit, progress } = canSplitTribe(human, context.gameState);
          return canSplit ? [true, `Progress: ${(progress ?? 0) * 100}%`] : [false, 'Cannot split'];
        },
        'Can Split Tribe?',
        depth + 2,
      ),

      // 2. Find a safe location and move there. This node is stateful.
      new ActionNode<HumanEntity>(
        (human, context, aiBlackboard) => {
          const { gameState } = context;
          let migrationTarget = Blackboard.get<Vector2D>(aiBlackboard, MIGRATION_TARGET_KEY);

          // Step 1: Find and set the target if it doesn't exist
          if (!migrationTarget) {
            if (!human.leaderId) return NodeStatus.FAILURE; // Should not happen if CanSplitTribe passed

            const originalTribeCenter = getTribeCenter(human.leaderId, gameState);
            const newLocation = findSafeTribeSplitLocation(originalTribeCenter, human, gameState);

            if (newLocation) {
              Blackboard.set(aiBlackboard, MIGRATION_TARGET_KEY, newLocation);
              migrationTarget = newLocation;
            } else {
              // Cannot find a safe location, fail for now
              return NodeStatus.FAILURE;
            }
          }

          // Step 2: Check if we have arrived
          const distance = calculateWrappedDistance(
            human.position,
            migrationTarget,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          if (distance < HUMAN_INTERACTION_PROXIMITY) {
            // Arrived at destination
            Blackboard.delete(aiBlackboard, MIGRATION_TARGET_KEY);
            human.activeAction = 'idle'; // Stop moving
            human.target = undefined;
            return NodeStatus.SUCCESS;
          }

          human.activeAction = 'moving';
          human.target = migrationTarget;

          // Still moving
          return NodeStatus.RUNNING;
        },
        'Move to New Territory',
        depth + 2,
      ),

      // 3. If movement was successful, perform the administrative split.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          performTribeSplit(human, context.gameState);
          return NodeStatus.SUCCESS;
        },
        'Perform Tribe Split',
        depth + 2,
      ),
    ],
    'Tribe Split Action',
    depth + 1,
  );

  // Wrap the entire action in a CooldownNode to rate-limit this behavior.
  return new CooldownNode(TRIBE_SPLIT_CHECK_INTERVAL_HOURS, tribeSplitAction, 'Tribe Split Cooldown', depth);
}
