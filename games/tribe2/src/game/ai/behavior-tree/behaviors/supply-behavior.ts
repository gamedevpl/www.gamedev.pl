import { HumanEntity } from '../../../entities/characters/human/human-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { BehaviorNode } from '../behavior-tree-types';
import { ConditionNode, Sequence } from '../nodes';

export function createSupplyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const sequence = new Sequence([
    new ConditionNode(
      (human: HumanEntity, context) => {
        if (!isTribeRole(human, TribeRole.Mover, context.gameState)) {
          return false;
        }

        return false;
      },
      'Supply eligible?',
      depth + 1,
    ),
    // do I have demand claimed?
    // no? claim it
    // yes? go deliver it
  ]);

  return sequence;
}
