import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, GameWorldState } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard } from '../behavior-tree-blackboard';

const ATTACK_TARGET_KEY = 'attackTarget';
const ATTACK_RANGE = 150; // The maximum distance to initiate an attack

/**
 * Simple distance calculation without external dependencies.
 */
function getDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
  return Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y);
}

function findClosestEnemy(world: GameWorldState, human: HumanEntity, range: number): HumanEntity | undefined {
  let closestEnemy: HumanEntity | undefined = undefined;
  let minDistance = Infinity;

  for (const entity of Object.values(world.entities.entities)) {
    if (entity.type === 'human' && entity.id !== human.id && entity.hitpoints > 0) {
      // An enemy is a human not from the same tribe.
      // If either human doesn't have a tribe, they are considered enemies.
      if (entity.tribeBadge !== human.tribeBadge) {
        const distance = getDistance(human.position, entity.position);
        if (distance < range && distance < minDistance) {
          minDistance = distance;
          closestEnemy = entity as HumanEntity;
        }
      }
    }
  }
  return closestEnemy;
}

/**
 * Creates a behavior tree branch for attacking enemies.
 *
 * The behavior is a sequence that first finds a target and then executes the attack.
 */
export function createAttackingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is there a valid enemy to attack?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          // If already attacking a valid target, continue with that target.
          if (human.activeAction === 'attacking' && human.attackTargetId) {
            const currentTarget = context.gameState.entities.entities.get(human.attackTargetId) as HumanEntity;
            if (
              currentTarget &&
              currentTarget.hitpoints > 0 &&
              getDistance(human.position, currentTarget.position) <= ATTACK_RANGE
            ) {
              blackboard.set(ATTACK_TARGET_KEY, currentTarget);
              return true;
            }
          }

          // Find a new target if not currently engaged.
          const enemy = findClosestEnemy(context.gameState, human, ATTACK_RANGE);
          if (enemy) {
            blackboard.set(ATTACK_TARGET_KEY, enemy);
            return true;
          }

          // No target found.
          blackboard.set(ATTACK_TARGET_KEY, undefined);
          return false;
        },
        'Find Attack Target',
        depth + 1,
      ),
      // 2. Action: Execute the attack.
      new ActionNode(
        (human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<HumanEntity>(ATTACK_TARGET_KEY);

          // If target is invalid (dead, gone, or out of range), the behavior succeeded.
          if (!target || target.hitpoints <= 0 || getDistance(human.position, target.position) > ATTACK_RANGE) {
            if (human.activeAction === 'attacking') {
              human.activeAction = 'idle';
              human.attackTargetId = undefined;
            }
            blackboard.set(ATTACK_TARGET_KEY, undefined);
            return NodeStatus.SUCCESS;
          }

          // If already attacking this target, continue running.
          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          // Initiate the attack state. The actual combat logic is handled elsewhere (e.g., state machine/interactions).
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;
          return NodeStatus.RUNNING;
        },
        'Execute Attack',
        depth + 1,
      ),
    ],
    'Attack',
    depth,
  );
}
