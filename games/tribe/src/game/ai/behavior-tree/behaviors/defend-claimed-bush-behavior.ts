import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findIntruderOnClaimedBush } from '../../../utils';
import { AI_DEFEND_CLAIMED_BUSH_TRIGGER_RADIUS } from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

const INTRUDER_KEY = 'bushIntruder';

/**
 * Creates a behavior that triggers an attack on an outsider gathering from a
 * berry bush claimed by the human's tribe.
 */
export function createDefendClaimedBushBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is an outsider stealing from our bushes?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const intruder = findIntruderOnClaimedBush(human, context.gameState, AI_DEFEND_CLAIMED_BUSH_TRIGGER_RADIUS);

          if (intruder) {
            blackboard.set(INTRUDER_KEY, intruder);
            return [true, `Intruder ${intruder.id} stealing berries`];
          }

          blackboard.delete(INTRUDER_KEY);
          return false;
        },
        'Check For Intruders on Bushes',
        depth + 1,
      ),

      // 2. Action: Attack the intruder.
      new ActionNode(
        (human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<HumanEntity>(INTRUDER_KEY);

          if (!target || target.hitpoints <= 0) {
            blackboard.delete(INTRUDER_KEY);
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
