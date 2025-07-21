import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { canSplitTribe, performTribeSplit } from '../../../utils/world-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Sequence } from '../nodes';
import { TRIBE_SPLIT_CHECK_INTERVAL_HOURS } from '../../../world-consts';

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe and form a new one.
 *
 * This is a high-cost check, so it's wrapped in a CooldownNode to prevent it
 * from being evaluated on every AI tick.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitBehavior(depth: number): BehaviorNode {
  // This sequence contains the actual logic for checking and performing the split.
  const tribeSplitAction = new Sequence(
    [
      // 1. Perform the expensive check to see if all conditions are met.
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const { canSplit, progress } = canSplitTribe(human, context.gameState);
          // Return the detailed progress string for debugging purposes
          return canSplit ? [true, `Progress: ${(progress ?? 0) * 100}%`] : [false, 'Cannot split'];
        },
        'Can Split Tribe?',
        depth + 2, // Child of Sequence, which is child of CooldownNode
      ),

      // 2. If the above condition passes, perform the split.
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
    depth + 1, // Child of CooldownNode
  );

  // Wrap the entire action in a CooldownNode to rate-limit this behavior.
  return new CooldownNode(
    TRIBE_SPLIT_CHECK_INTERVAL_HOURS,
    tribeSplitAction,
    'Tribe Split Cooldown', // Name for the CooldownNode itself
    depth,
  );
}
