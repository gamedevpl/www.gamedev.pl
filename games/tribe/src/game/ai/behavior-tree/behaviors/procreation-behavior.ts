import {
  HUMAN_MIN_PROCREATION_AGE,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_PROXIMITY,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_FOOD_SEARCH_RADIUS,
} from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findPotentialNewPartners, countEntitiesOfTypeInRadius } from '../../../utils/world-utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

export function createProcreationBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // Condition 1: Is the human biologically able to procreate right now?
      new ConditionNode(
        (human: HumanEntity) => {
          if (!human.isAdult || (human.gender === 'female' && human.isPregnant)) {
            return false;
          }
          if (
            human.age < HUMAN_MIN_PROCREATION_AGE ||
            (human.gender === 'female' && human.age > HUMAN_FEMALE_MAX_PROCREATION_AGE)
          ) {
            return false;
          }
          return true;
        },
        'Is Fertile (age, not pregnant)',
        depth + 1,
      ),

      // Condition 2: Is the human healthy enough?
      new ConditionNode(
        (human: HumanEntity) => {
          return human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL;
        },
        'Is Healthy (hunger)',
        depth + 1,
      ),

      // Condition 3: Has the cooldown expired?
      new ConditionNode(
        (human: HumanEntity) => {
          return (human.procreationCooldown || 0) <= 0;
        },
        'Is Ready (cooldown)',
        depth + 1,
      ),

      // Condition 4: Is the environment suitable for raising a child?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const nearbyBushes = countEntitiesOfTypeInRadius(
            human.position,
            context.gameState,
            'berryBush',
            PROCREATION_FOOD_SEARCH_RADIUS,
          );
          return nearbyBushes >= PROCREATION_MIN_NEARBY_BERRY_BUSHES;
        },
        'Is Environment Viable (food)',
        depth + 1,
      ),

      // Condition 5: Can a suitable partner be found?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          // Find a suitable partner
          const potentialPartners = findPotentialNewPartners(human, context.gameState, PROCREATION_FOOD_SEARCH_RADIUS);
          const partner = potentialPartners.find(
            (p) =>
              (p.procreationCooldown || 0) <= 0 &&
              p.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
              (p.gender === 'female' ? !p.isPregnant && p.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true),
          );

          if (partner) {
            blackboard.set('procreationPartner', partner);
            return true;
          }

          return false;
        },
        'Find Partner',
        depth + 1,
      ),

      // Action: Move towards or start procreating with the found partner
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const partner = blackboard.get<HumanEntity>('procreationPartner');
          if (!partner) {
            // This should not happen if the "Find Partner" node succeeded, but as a safeguard:
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            partner.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance < HUMAN_INTERACTION_PROXIMITY) {
            human.activeAction = 'procreating';
            human.targetPosition = undefined;
            human.direction = { x: 0, y: 0 };
            // Add partner to partnerIds if not already present
            if (!human.partnerIds?.includes(partner.id)) {
              human.partnerIds = human.partnerIds ? [...human.partnerIds, partner.id] : [partner.id];
            }
            return NodeStatus.SUCCESS;
          } else {
            human.activeAction = 'moving';
            human.targetPosition = { ...partner.position };
            const dirToTarget = getDirectionVectorOnTorus(
              human.position,
              partner.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            human.direction = vectorNormalize(dirToTarget);
            return NodeStatus.RUNNING;
          }
        },
        'Move To Partner and Procreate',
        depth + 1,
      ),
    ],
    'Procreate',
    depth,
  );
}
