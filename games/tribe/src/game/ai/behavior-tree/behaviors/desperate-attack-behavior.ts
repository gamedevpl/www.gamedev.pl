import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findWeakCannibalismTarget, findClosestEntity } from '../../../utils/world-utils';
import { AI_DESPERATE_ATTACK_HUNGER_THRESHOLD, HUMAN_INTERACTION_RANGE } from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../../../entities/characters/human/human-corpse-types';

const DESPERATE_TARGET_KEY = 'desperateAttackTarget';

/**
 * Creates a behavior that triggers an attack on a weak, non-family human
 * when the attacker is starving and there are no other food sources available.
 */
export function createDesperateAttackBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Am I starving?
      new ConditionNode(
        (human: HumanEntity) => human.hunger > AI_DESPERATE_ATTACK_HUNGER_THRESHOLD,
        'Is Starving',
        depth + 1,
      ),

      // 2. Condition: Are there absolutely no other food sources nearby?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          const closestBush = findClosestEntity<BerryBushEntity>(
            human,
            context.gameState,
            'berryBush',
            HUMAN_INTERACTION_RANGE,
            (b) => b.food.length > 0,
          );
          const closestCorpse = findClosestEntity<HumanCorpseEntity>(
            human,
            context.gameState,
            'humanCorpse',
            HUMAN_INTERACTION_RANGE,
            (c) => c.food.length > 0,
          );
          return !closestBush && !closestCorpse;
        },
        'No Other Food Available',
        depth + 1,
      ),

      // 3. Condition: Can I find a suitable weak target?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const target = findWeakCannibalismTarget(human, context.gameState);
          if (target) {
            blackboard.set(DESPERATE_TARGET_KEY, target);
            return [true, `Found weak target ${target.id}`];
          }
          blackboard.delete(DESPERATE_TARGET_KEY);
          return false;
        },
        'Find Weak Target',
        depth + 1,
      ),

      // 4. Action: Attack the target.
      new ActionNode(
        (human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<HumanEntity>(DESPERATE_TARGET_KEY);

          if (!target || target.hitpoints <= 0) {
            blackboard.delete(DESPERATE_TARGET_KEY);
            return [NodeStatus.FAILURE, 'Target is invalid or dead'];
          }

          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          human.activeAction = 'attacking';
          human.attackTargetId = target.id;

          return [NodeStatus.RUNNING, `Desperately attacking ${target.id}`];
        },
        'Execute Desperate Attack',
        depth + 1,
      ),
    ],
    'Desperate Attack',
    depth,
  );
}
