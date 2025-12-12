import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { canSplitTribe, performTribeSplit } from '../../../utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Sequence } from '../nodes';
import { TRIBE_SPLIT_CHECK_INTERVAL_HOURS } from '../../../entities/tribe/tribe-consts.ts';

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe,
 * move to a new location, and then form a new tribe.
 *
 * This is a high-cost check, so it's wrapped in a CooldownNode to prevent it
 * from being evaluated on every AI tick.
 *
 * The process is a sequence:
 * 1. Check if a split is possible.
 * 2. Formally perform the split.
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

      // 2. If movement was successful, perform the administrative split.
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
