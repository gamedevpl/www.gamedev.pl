/* eslint-disable @typescript-eslint/no-explicit-any */
import { PREDATOR_INTERACTION_RANGE } from '../../../world-consts';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for predator pack following.
 * Predators follow their pack leader (same father) when not engaged in critical activities.
 */
export function createPredatorPackBehavior(depth: number): BehaviorNode<PredatorEntity> {
  return new Sequence(
    [
      // Condition: Should I follow my pack?
      new ConditionNode(
        (predator, context: UpdateContext, blackboard) => {
          // Only follow pack if not engaged in critical activities
          if (
            predator.hunger > 100 || // Too hungry to socialize
            predator.hitpoints < predator.maxHitpoints * 0.4 || // Too injured
            predator.activeAction === 'attacking' ||
            predator.activeAction === 'procreating'
          ) {
            return false;
          }

          // Find pack members (predators with the same father)
          const packLeader = findClosestEntity<PredatorEntity>(
            predator,
            context.gameState,
            'predator',
            PREDATOR_INTERACTION_RANGE * 4, // Wider search for pack members
            (packMember) => {
              return (
                (packMember.id !== predator.id &&
                  packMember.hitpoints > 0 &&
                  packMember.isAdult &&
                  // Same pack (same father)
                  predator.fatherId !== undefined &&
                  packMember.fatherId === predator.fatherId &&
                  // Prefer the oldest/strongest pack member as leader
                  packMember.age >= predator.age) ||
                packMember.hitpoints > predator.hitpoints
              );
            },
          );

          if (packLeader) {
            const distance = calculateWrappedDistance(
              predator.position,
              packLeader.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            // Follow if too far from pack leader
            if (distance > PREDATOR_INTERACTION_RANGE * 2) {
              blackboard.set('packLeader', packLeader);
              return true;
            }
          }

          return false;
        },
        'Find Pack Leader',
        depth + 1,
      ),
      // Action: Move towards pack leader
      new ActionNode(
        (predator, context: UpdateContext, blackboard) => {
          const packLeader = blackboard.get<PredatorEntity>('packLeader');

          if (!packLeader || packLeader.hitpoints <= 0) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            predator.position,
            packLeader.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // Move closer to pack leader if too far
          if (distance > PREDATOR_INTERACTION_RANGE * 2) {
            predator.activeAction = 'moving';
            predator.target = packLeader.id;

            const directionToLeader = getDirectionVectorOnTorus(
              predator.position,
              packLeader.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            predator.direction = vectorNormalize(directionToLeader);
            return NodeStatus.RUNNING;
          } else {
            // Close enough to pack leader
            predator.activeAction = 'idle';
            predator.direction = { x: 0, y: 0 };
            return NodeStatus.SUCCESS;
          }
        },
        'Follow Pack Leader',
        depth + 1,
      ),
    ],
    'Predator Pack Behavior',
    depth,
  );
}
