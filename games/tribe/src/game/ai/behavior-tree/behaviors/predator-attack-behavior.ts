/* eslint-disable @typescript-eslint/no-explicit-any */
import { PREDATOR_ATTACK_RANGE } from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';

/**
 * Creates a behavior sub-tree for predators attacking humans.
 */
export function createPredatorAttackBehavior(depth: number): BehaviorNode<PredatorEntity> {
  return new Sequence(
    [
      // Condition: Should I attack humans?
      new ConditionNode(
        (predator, context: UpdateContext, blackboard) => {
          // Only attack if very hungry or if humans are very close (defensive)
          const isVeryHungry = predator.hunger > 100;
          const isDefensive = predator.hitpoints < predator.maxHitpoints * 0.5;

          if (!isVeryHungry && !isDefensive) {
            return false;
          }

          // Check attack cooldown
          if (predator.attackCooldown && predator.attackCooldown > 0) {
            return false;
          }

          // Find nearby humans
          const closestHuman = findClosestEntity<HumanEntity>(
            predator,
            context.gameState,
            'human',
            PREDATOR_ATTACK_RANGE * 2, // Search in wider range
            (human) => human.hitpoints > 0, // Target must be alive
          );
          // Attack if human is within range, or approach if very hungry
          if (closestHuman) {
            const distance = calculateWrappedDistance(
              predator.position,
              closestHuman.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            if (distance <= PREDATOR_ATTACK_RANGE) {
              blackboard.set('attackTarget', closestHuman);
              return true;
            } else if (isVeryHungry && distance <= PREDATOR_ATTACK_RANGE * 2) {
              // Very hungry predators will approach humans more aggressively
              blackboard.set('attackTarget', closestHuman);
              blackboard.set('needToApproach', true);
              return true;
            }
          }

          return false;
        },
        'Find Human Target',
        depth + 1,
      ),
      // Action: Attack or approach human
      new ActionNode(
        (predator, context: UpdateContext, blackboard) => {
          const target = blackboard.get<HumanEntity>('attackTarget');
          const needToApproach = blackboard.get<boolean>('needToApproach');

          if (!target || target.hitpoints <= 0) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            predator.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= PREDATOR_ATTACK_RANGE) {
            // Within attack range, start attacking
            predator.activeAction = 'attacking';
            predator.attackTargetId = target.id;
            predator.target = target.id;
            predator.direction = { x: 0, y: 0 };
            blackboard.delete('needToApproach');
            return NodeStatus.RUNNING;
          } else if (needToApproach || distance > PREDATOR_ATTACK_RANGE) {
            // Need to move closer to the human
            predator.activeAction = 'moving';
            predator.target = target.id;

            const directionToTarget = getDirectionVectorOnTorus(
              predator.position,
              target.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            predator.direction = vectorNormalize(directionToTarget);
            return NodeStatus.RUNNING;
          }

          return NodeStatus.FAILURE;
        },
        'Attack or Approach Human',
        depth + 1,
      ),
    ],
    'Predator Attack Human',
    depth,
  );
}
