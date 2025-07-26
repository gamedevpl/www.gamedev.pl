import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findFamilyMemberUnderAttack } from '../../../utils/world-utils';
import { AI_DEFEND_FAMILY_TRIGGER_RADIUS } from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

const AGGRESSOR_KEY = 'defendAggressor';

/**
 * Creates a behavior that triggers an attack when a human observes a close family member
 * being attacked by an outsider.
 */
export function createDefendFamilyBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is a family member under attack by an outsider?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const result = findFamilyMemberUnderAttack(human, context.gameState, AI_DEFEND_FAMILY_TRIGGER_RADIUS);

          if (result) {
            blackboard.set(AGGRESSOR_KEY, result.aggressor);
            return [true, `Family member ${result.familyMember.id} attacked by ${result.aggressor.id}`];
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

          // If already attacking this target, the behavior is running.
          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          // Initiate the attack.
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;

          // This behavior remains running as long as the human is attacking the aggressor.
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
