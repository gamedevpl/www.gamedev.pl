import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { canSplitTribe, performTribeSplit } from '../../../utils/world-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { TRIBE_SPLIT_CHECK_INTERVAL_HOURS } from '../../../world-consts';

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe and form a new one.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Check if the cooldown for this specific check is ready.
      new ConditionNode(
        (_human, context, blackboard) => {
          const lastCheckTime = blackboard.get<number>('lastTribeSplitCheckTime') || 0;
          const currentTime = context.gameState.time;
          if (currentTime - lastCheckTime >= TRIBE_SPLIT_CHECK_INTERVAL_HOURS) {
            blackboard.set('lastTribeSplitCheckTime', currentTime);
            return true;
          }
          return false;
        },
        'Is Cooldown Ready?',
        depth + 1,
      ),

      // 2. Perform the more expensive check to see if all conditions are met.
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const { canSplit, progress } = canSplitTribe(human, context.gameState);
          return progress ? [canSplit, `Progress: ${progress ?? 'N/A'}`] : false;
        },
        'Can Split Tribe?',
        depth + 1,
      ),

      // 3. If all conditions pass, perform the split.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          performTribeSplit(human, context.gameState);
          return NodeStatus.SUCCESS;
        },
        'Perform Tribe Split',
        depth + 1,
      ),
    ],
    'Tribe Split',
    depth,
  );
}
