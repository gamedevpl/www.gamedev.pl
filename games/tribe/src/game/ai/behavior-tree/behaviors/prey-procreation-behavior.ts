/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PREY_MIN_PROCREATION_AGE,
  PREY_MAX_PROCREATION_AGE,
  PREY_INTERACTION_RANGE,
} from '../../../world-consts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, Selector } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for prey procreation.
 */
export function createPreyProcreationBehavior(depth: number): BehaviorNode {
  const findImmediatePartner = new ConditionNode(
    (prey: any, context: UpdateContext, blackboard) => {
      // Find suitable partners nearby
      let bestPartner: PreyEntity | null = null;
      let closestDistance = Infinity;

      context.gameState.entities.entities.forEach((entity) => {
        if (entity.type === 'prey' && entity.id !== prey.id) {
          const potentialPartner = entity as PreyEntity;
          
          // Check if this is a valid partner
          if (
            potentialPartner.gender !== prey.gender && // Opposite gender
            potentialPartner.isAdult &&
            potentialPartner.age >= PREY_MIN_PROCREATION_AGE &&
            potentialPartner.age <= PREY_MAX_PROCREATION_AGE &&
            !potentialPartner.isPregnant &&
            (!potentialPartner.procreationCooldown || potentialPartner.procreationCooldown <= 0) &&
            potentialPartner.hunger < 80 && // Not too hungry
            !prey.ancestorIds.includes(potentialPartner.id) && // Avoid inbreeding
            (!prey.fatherId || prey.fatherId !== potentialPartner.id) &&
            (!prey.motherId || prey.motherId !== potentialPartner.id)
          ) {
            const distance = calculateWrappedDistance(
              prey.position,
              potentialPartner.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            
            if (distance < closestDistance && distance <= PREY_INTERACTION_RANGE) {
              closestDistance = distance;
              bestPartner = potentialPartner;
            }
          }
        }
      });

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
    (prey: any, _context: UpdateContext, blackboard) => {
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
    (prey: any, context: UpdateContext, blackboard) => {
      // Find suitable partners in a larger radius
      let bestPartner: PreyEntity | null = null;
      let closestDistance = Infinity;

      context.gameState.entities.entities.forEach((entity) => {
        if (entity.type === 'prey' && entity.id !== prey.id) {
          const potentialPartner = entity as PreyEntity;
          
          // Check if this is a valid partner (same criteria as above)
          if (
            potentialPartner.gender !== prey.gender &&
            potentialPartner.isAdult &&
            potentialPartner.age >= PREY_MIN_PROCREATION_AGE &&
            potentialPartner.age <= PREY_MAX_PROCREATION_AGE &&
            !potentialPartner.isPregnant &&
            (!potentialPartner.procreationCooldown || potentialPartner.procreationCooldown <= 0) &&
            potentialPartner.hunger < 80 &&
            !prey.ancestorIds.includes(potentialPartner.id) &&
            (!prey.fatherId || prey.fatherId !== potentialPartner.id) &&
            (!prey.motherId || prey.motherId !== potentialPartner.id)
          ) {
            const distance = calculateWrappedDistance(
              prey.position,
              potentialPartner.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            
            if (distance < closestDistance && distance <= PREY_INTERACTION_RANGE * 3) {
              closestDistance = distance;
              bestPartner = potentialPartner;
            }
          }
        }
      });

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
    (prey: any, context: UpdateContext, blackboard) => {
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
        (prey: any) => {
          return !!(
            prey.isAdult &&
            !prey.isPregnant &&
            prey.age >= PREY_MIN_PROCREATION_AGE &&
            prey.age <= PREY_MAX_PROCREATION_AGE &&
            prey.hunger < 80 && // Not too hungry
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