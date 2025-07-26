import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findPartnerProcreatingWithStranger } from '../../../utils/world-utils';
import { AI_JEALOUSY_PROCREATION_TRIGGER_RADIUS } from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import { IndexedWorldState } from '../../../world-index/world-index-types';

const JEALOUSY_TARGET_KEY = 'jealousyAttackTarget';

/**
 * Creates a behavior that triggers an attack when a human's primary partner
 * is found procreating with another human nearby.
 */
export function createJealousyAttackBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is my primary partner procreating with a stranger nearby?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const stranger = findPartnerProcreatingWithStranger(
            human,
            context.gameState as IndexedWorldState,
            AI_JEALOUSY_PROCREATION_TRIGGER_RADIUS,
          );

          if (stranger) {
            blackboard.set(JEALOUSY_TARGET_KEY, stranger);
            return [true, `Partner cheating with ${stranger.id}`];
          }

          blackboard.delete(JEALOUSY_TARGET_KEY);
          return false;
        },
        'Check for Infidelity',
        depth + 1,
      ),

      // 2. Action: Attack the stranger.
      new ActionNode(
        (human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<HumanEntity>(JEALOUSY_TARGET_KEY);

          if (!target || target.hitpoints <= 0) {
            blackboard.delete(JEALOUSY_TARGET_KEY);
            return [NodeStatus.FAILURE, 'Target is invalid or dead'];
          }

          // If already attacking this target, the behavior is running.
          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          // Initiate the attack.
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;

          // The state machine will handle the attack logic from here.
          // This behavior will keep running as long as the human is in the 'attacking' state.
          return [NodeStatus.RUNNING, `Attacking ${target.id}`];
        },
        'Execute Jealousy Attack',
        depth + 1,
      ),
    ],
    'Jealousy Attack',
    depth,
  );
}
