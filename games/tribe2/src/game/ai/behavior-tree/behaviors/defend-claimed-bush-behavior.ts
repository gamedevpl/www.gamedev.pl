import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findIntruderOnClaimedBush } from '../../../utils';
import { AI_DEFEND_CLAIMED_BUSH_TRIGGER_RADIUS } from '../../../ai-consts.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types.ts';

const INTRUDER_KEY = 'bushIntruder';

/**
 * Creates a behavior that triggers an attack on an outsider gathering from a
 * berry bush claimed by the human's tribe.
 */
export function createDefendClaimedBushBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is an outsider stealing from our bushes?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const intruder = findIntruderOnClaimedBush(human, context.gameState, AI_DEFEND_CLAIMED_BUSH_TRIGGER_RADIUS);

          if (intruder) {
            Blackboard.set(blackboard, INTRUDER_KEY, intruder.id);
            return [true, `Intruder ${intruder.id} stealing berries`];
          }

          Blackboard.delete(blackboard, INTRUDER_KEY);
          return false;
        },
        'Check For Intruders on Bushes',
        depth + 1,
      ),

      // 2. Action: Attack the intruder.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const targetId = Blackboard.get<EntityId>(blackboard, INTRUDER_KEY);
          const target = targetId && (context.gameState.entities.entities[targetId] as HumanEntity | undefined);

          if (!target || target.hitpoints <= 0) {
            Blackboard.delete(blackboard, INTRUDER_KEY);
            return [NodeStatus.FAILURE, 'Intruder is invalid or dead'];
          }

          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          human.activeAction = 'attacking';
          human.attackTargetId = target.id;

          return [NodeStatus.RUNNING, `Attacking intruder ${target.id}`];
        },
        'Execute Bush Defense Attack',
        depth + 1,
      ),
    ],
    'Defend Claimed Bush',
    depth,
  );
}
