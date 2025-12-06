import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findPartnerProcreatingWithStranger } from '../../../utils';
import { AI_JEALOUSY_PROCREATION_TRIGGER_RADIUS } from '../../../ai-consts.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { EntityId } from '../../../entities/entities-types.ts';

const JEALOUSY_TARGET_KEY = 'jealousyAttackTarget';

/**
 * Creates a behavior that triggers an attack when a human's primary partner
 * is found procreating with another human nearby.
 */
export function createJealousyAttackBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is my primary partner procreating with a stranger nearby?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const stranger = findPartnerProcreatingWithStranger(
            human,
            context.gameState as IndexedWorldState,
            AI_JEALOUSY_PROCREATION_TRIGGER_RADIUS,
          );

          if (stranger) {
            // Don't attack tribe members - this would weaken the tribe
            // Only attack strangers from other tribes or independent humans
            if (human.leaderId && stranger.leaderId === human.leaderId) {
              return [false, 'Stranger is in same tribe - no attack'];
            }
            
            Blackboard.set(blackboard, JEALOUSY_TARGET_KEY, stranger.id);
            return [true, `Partner cheating with ${stranger.id}`];
          }

          Blackboard.delete(blackboard, JEALOUSY_TARGET_KEY);
          return false;
        },
        'Check for Infidelity',
        depth + 1,
      ),

      // 2. Action: Attack the stranger.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const targetId = Blackboard.get<EntityId>(blackboard, JEALOUSY_TARGET_KEY);
          const target = targetId && (context.gameState.entities.entities[targetId] as HumanEntity | undefined);

          if (!target || target.hitpoints <= 0) {
            Blackboard.delete(blackboard, JEALOUSY_TARGET_KEY);
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
