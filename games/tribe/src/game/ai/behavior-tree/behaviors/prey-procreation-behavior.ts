import {
  PREY_MIN_PROCREATION_AGE,
  PREY_MAX_PROCREATION_AGE,
  PREY_INTERACTION_RANGE
} from '../../../animal-consts.ts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, Selector } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for prey procreation.
 */
export function createPreyProcreationBehavior(depth: number): BehaviorNode<PreyEntity> {
  const findImmediatePartner = new ConditionNode<PreyEntity>(
    (prey, context: UpdateContext, blackboard) => {
      // Find suitable partners nearby
      const bestPartner = findClosestEntity<PreyEntity>(
        prey,
        context.gameState,
        'prey',
        PREY_INTERACTION_RANGE,
        (potentialPartner) => {
          return (
            potentialPartner.id !== prey.id &&
            potentialPartner.gender !== prey.gender && // Opposite gender
            !!potentialPartner.isAdult &&
            potentialPartner.age >= PREY_MIN_PROCREATION_AGE &&
            potentialPartner.age <= PREY_MAX_PROCREATION_AGE &&
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
    (prey: PreyEntity, _context: UpdateContext, blackboard) => {
      const partner = blackboard.get<PreyEntity>('procreationPartner');
      if (!partner) {
        return NodeStatus.FAILURE;
      }

      prey.activeAction = 'procreating';
      prey.target = partner.id;
      prey.direction = { x: 0, y: 0 };

      // Clean up blackboard
      blackboard.delete('procreationPartner');

      return NodeStatus.SUCCESS;
    },
    'Start Procreating',
    depth + 2,
  );

  const locateDistantPartner = new ConditionNode(
    (prey: PreyEntity, context: UpdateContext, blackboard) => {
      // Find suitable partners in a larger radius
      const bestPartner = findClosestEntity<PreyEntity>(
        prey,
        context.gameState,
        'prey',
        PREY_INTERACTION_RANGE * 10, // Much wider search radius for finding mates
        (potentialPartner) => {
          return (
            potentialPartner.id !== prey.id &&
            potentialPartner.gender !== prey.gender &&
            !!potentialPartner.isAdult &&
            potentialPartner.age >= PREY_MIN_PROCREATION_AGE &&
            potentialPartner.age <= PREY_MAX_PROCREATION_AGE &&
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
    (prey: PreyEntity, context: UpdateContext, blackboard) => {
      const partner = blackboard.get<PreyEntity>('procreationPartner');
      if (!partner) {
        return NodeStatus.FAILURE;
      }

      const distance = calculateWrappedDistance(
        prey.position,
        partner.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance <= PREY_INTERACTION_RANGE) {
        return NodeStatus.SUCCESS;
      }

      prey.activeAction = 'moving';
      prey.target = partner.id;

      const directionToPartner = getDirectionVectorOnTorus(
        prey.position,
        partner.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      prey.direction = vectorNormalize(directionToPartner);
      return NodeStatus.RUNNING;
    },
    'Move Towards Partner',
    depth + 2,
  );

  return new Sequence(
    [
      // Basic fertility conditions
      new ConditionNode(
        (prey) => {
          return !!(
            prey.isAdult &&
            !prey.isPregnant &&
            prey.age >= PREY_MIN_PROCREATION_AGE &&
            prey.age <= PREY_MAX_PROCREATION_AGE &&
            prey.hunger < 200 && // Very lenient for debugging
            (!prey.procreationCooldown || prey.procreationCooldown <= 0)
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
    'Prey Procreate',
    depth,
  );
}
