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

export function createProcreationBehavior(): BehaviorNode {
  return new Sequence([
    // Condition: Can the human procreate?
    new ConditionNode((human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      // Check if human is adult and not pregnant
      if (!human.isAdult || human.isPregnant) {
        return false;
      }

      // Check age limits
      if (
        human.age < HUMAN_MIN_PROCREATION_AGE ||
        (human.gender === 'female' && human.age > HUMAN_FEMALE_MAX_PROCREATION_AGE)
      ) {
        return false;
      }

      // Check hunger levels
      if (human.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL) {
        return false;
      }

      // Check procreation cooldown
      if ((human.procreationCooldown || 0) > 0) {
        return false;
      }

      // Check for nearby berry bushes (resource availability)
      const nearbyBushes = countEntitiesOfTypeInRadius(
        human.position,
        context.gameState,
        'berryBush',
        PROCREATION_FOOD_SEARCH_RADIUS,
      );
      if (nearbyBushes < PROCREATION_MIN_NEARBY_BERRY_BUSHES) {
        return false;
      }

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
    }),
    // Action: Move towards or start procreating with partner
    new ActionNode((human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const partner = blackboard.get<HumanEntity>('procreationPartner');
      if (!partner) {
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
        // Set a small cooldown to prevent immediate re-procreation. This will be handled by the interaction system.
        // human.procreationCooldown = context.gameState.time + 1;
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
    }),
  ]);
}
