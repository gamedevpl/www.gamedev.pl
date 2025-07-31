/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PREDATOR_MIN_PROCREATION_AGE,
  PREDATOR_MAX_PROCREATION_AGE,
  PREDATOR_INTERACTION_RANGE,
} from '../../../world-consts';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, Selector } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for predator procreation.
 */
export function createPredatorProcreationBehavior(depth: number): BehaviorNode<PredatorEntity> {
  const findImmediatePartner = new ConditionNode(
    (predator: PredatorEntity, context: UpdateContext, blackboard) => {
      // Find suitable partners nearby
      const bestPartner = findClosestEntity<PredatorEntity>(
        predator,
        context.gameState,
        'predator',
        PREDATOR_INTERACTION_RANGE,
        (potentialPartner) => {
          return (
            potentialPartner.id !== predator.id &&
            potentialPartner.gender !== predator.gender && // Opposite gender
            !!potentialPartner.isAdult &&
            potentialPartner.age >= PREDATOR_MIN_PROCREATION_AGE &&
            potentialPartner.age <= PREDATOR_MAX_PROCREATION_AGE &&
            !potentialPartner.isPregnant &&
            (!potentialPartner.procreationCooldown || potentialPartner.procreationCooldown <= 0) &&
            potentialPartner.hunger < 200 // Very lenient for debugging
          );
        },
      );

      if (bestPartner) {
        blackboard.set('procreationPartner', bestPartner);
        return true;
      }
      return false;
    },
    'Find Immediate Partner',
    depth + 2,
  );

  const startProcreating = new ActionNode(
    (predator: PredatorEntity, _context: UpdateContext, blackboard) => {
      const partner = blackboard.get<PredatorEntity>('procreationPartner');
      if (!partner) {
        return NodeStatus.FAILURE;
      }

      predator.activeAction = 'procreating';
      predator.target = partner.id;
      predator.direction = { x: 0, y: 0 };

      // Clean up blackboard
      blackboard.delete('procreationPartner');

      return NodeStatus.SUCCESS;
    },
    'Start Procreating',
    depth + 2,
  );

  const locateDistantPartner = new ConditionNode(
    (predator: PredatorEntity, context: UpdateContext, blackboard) => {
      // Find suitable partners in a larger radius
      const bestPartner = findClosestEntity<PredatorEntity>(
        predator,
        context.gameState,
        'predator',
        PREDATOR_INTERACTION_RANGE * 10, // Much wider search radius for finding mates
        (potentialPartner) => {
          return (
            potentialPartner.id !== predator.id &&
            potentialPartner.gender !== predator.gender &&
            !!potentialPartner.isAdult &&
            potentialPartner.age >= PREDATOR_MIN_PROCREATION_AGE &&
            potentialPartner.age <= PREDATOR_MAX_PROCREATION_AGE &&
            !potentialPartner.isPregnant &&
            (!potentialPartner.procreationCooldown || potentialPartner.procreationCooldown <= 0) &&
            potentialPartner.hunger < 200 // Very lenient for debugging
          );
        },
      );

      if (bestPartner) {
        blackboard.set('procreationPartner', bestPartner);
        return true;
      }
      return false;
    },
    'Locate Distant Partner',
    depth + 2,
  );

  const moveTowardsPartner = new ActionNode(
    (predator: PredatorEntity, context: UpdateContext, blackboard) => {
      const partner = blackboard.get<PredatorEntity>('procreationPartner');
      if (!partner) {
        return NodeStatus.FAILURE;
      }

      const distance = calculateWrappedDistance(
        predator.position,
        partner.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance <= PREDATOR_INTERACTION_RANGE) {
        return NodeStatus.SUCCESS;
      }

      predator.activeAction = 'moving';
      predator.target = partner.id;

      const directionToPartner = getDirectionVectorOnTorus(
        predator.position,
        partner.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      predator.direction = vectorNormalize(directionToPartner);
      return NodeStatus.RUNNING;
    },
    'Move Towards Partner',
    depth + 2,
  );

  return new Sequence(
    [
      // Basic fertility conditions
      new ConditionNode(
        (predator) => {
          return !!(
            predator.isAdult &&
            !predator.isPregnant &&
            predator.age >= PREDATOR_MIN_PROCREATION_AGE &&
            predator.age <= PREDATOR_MAX_PROCREATION_AGE &&
            predator.hunger < 200 && // Very lenient for debugging
            (!predator.procreationCooldown || predator.procreationCooldown <= 0)
          );
        },
        'Is Fertile and Ready',
        depth + 1,
      ),
      // Find partner and procreate
      new Selector(
        [
          // Try immediate partner first
          new Sequence([findImmediatePartner, startProcreating], 'Procreate With Immediate Partner', depth + 2),
          // Otherwise find distant partner and move to them
          new Sequence([locateDistantPartner, moveTowardsPartner], 'Seek Distant Partner', depth + 2),
        ],
        'Find Partner And Procreate',
        depth + 1,
      ),
    ],
    'Predator Procreate',
    depth,
  );
}
