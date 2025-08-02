import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findFamilyMemberUnderAttack } from '../../../utils';
import {
  AI_DEFEND_FAMILY_TRIGGER_RADIUS
} from '../../../ai-consts.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

const AGGRESSOR_KEY = 'defendAggressor';

/**
 * Creates a behavior that triggers an attack when a human observes a close family member
 * being attacked by an outsider.
 */
export function createDefendFamilyBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is a family member under attack by an outsider?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const intruder = findFamilyMemberUnderAttack(human, context.gameState, AI_DEFEND_FAMILY_TRIGGER_RADIUS);

          if (intruder) {
            blackboard.set(AGGRESSOR_KEY, intruder);
            return [true, `Family member ${intruder.familyMember.id} attacked by ${intruder.aggressor.id}`];
          }

          blackboard.delete(AGGRESSOR_KEY);
          return false;
        },
        'Check Family Under Attack',
        depth + 1,
      ),

      // 2. Action: Attack the aggressor.
      new ActionNode(
        (human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<HumanEntity>(AGGRESSOR_KEY);

          if (!target || target.hitpoints <= 0) {
            blackboard.delete(AGGRESSOR_KEY);
            return [NodeStatus.FAILURE, 'Target invalid/dead'];
          }

          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          human.activeAction = 'attacking';
          human.attackTargetId = target.id;

          return [NodeStatus.RUNNING, `Attacking aggressor ${target.id}`];
        },
        'Execute Family Defense Attack',
        depth + 1,
      ),
    ],
    'Defend Family',
    depth,
  );
}
