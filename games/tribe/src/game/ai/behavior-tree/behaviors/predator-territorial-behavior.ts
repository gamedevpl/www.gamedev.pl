/* eslint-disable @typescript-eslint/no-explicit-any */
import { PREDATOR_ATTACK_RANGE, PREDATOR_TERRITORIAL_RANGE } from '../../../world-consts';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for predator territorial fighting.
 * Predators will fight other predators who have different fathers to establish territory dominance.
 */
export function createPredatorTerritorialBehavior(depth: number): BehaviorNode<PredatorEntity> {
  return new Sequence(
    [
      // Condition: Should I fight for territory?
      new ConditionNode(
        (predator, context: UpdateContext, blackboard) => {
          // Only adult predators with sufficient health engage in territorial fights
          if (
            !predator.isAdult ||
            predator.hitpoints < predator.maxHitpoints * 0.6 ||
            predator.hunger > 120 || // Too hungry to fight
            (predator.attackCooldown && predator.attackCooldown > 0)
          ) {
            return false;
          }

          // Find nearby predators with different fathers (rival territorial groups)
          const rivalPredator = findClosestEntity<PredatorEntity>(
            predator,
            context.gameState,
            'predator',
            PREDATOR_TERRITORIAL_RANGE,
            (rival) => {
              return !!(
                rival.id !== predator.id &&
                rival.hitpoints > 0 &&
                rival.isAdult &&
                // Different territorial groups (different fathers)
                predator.fatherId !== rival.fatherId &&
                predator.gender === rival.gender && // Same
                // Both must have fathers to determine territorial allegiance
                predator.fatherId !== undefined &&
                rival.fatherId !== undefined
              );
            },
          );

          if (rivalPredator) {
            const distance = calculateWrappedDistance(
              predator.position,
              rivalPredator.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            if (distance <= PREDATOR_ATTACK_RANGE) {
              // Close enough to engage in territorial combat
              blackboard.set('territorialTarget', rivalPredator);
              return true;
            } else if (distance <= PREDATOR_TERRITORIAL_RANGE) {
              // Need to approach the rival predator
              blackboard.set('territorialTarget', rivalPredator);
              blackboard.set('needToApproach', true);
              return true;
            }
          }

          return false;
        },
        'Find Territorial Rival',
        depth + 1,
      ),
      // Action: Fight or approach rival predator
      new ActionNode(
        (predator, context: UpdateContext, blackboard) => {
          const target = blackboard.get<PredatorEntity>('territorialTarget');
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
            // Within fighting range, engage in territorial combat
            predator.activeAction = 'attacking';
            predator.attackTargetId = target.id;
            predator.target = target.id;
            predator.direction = { x: 0, y: 0 };
            blackboard.delete('needToApproach');
            return NodeStatus.RUNNING;
          } else if (needToApproach || distance > PREDATOR_ATTACK_RANGE) {
            // Need to move closer to the rival
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
        'Territorial Fight or Approach',
        depth + 1,
      ),
    ],
    'Predator Territorial Defense',
    depth,
  );
}
