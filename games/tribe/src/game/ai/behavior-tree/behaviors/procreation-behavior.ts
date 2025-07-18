import {
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_PROXIMITY,
  HUMAN_MIN_PROCREATION_AGE,
  PROCREATION_FOOD_SEARCH_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_PARTNER_SEARCH_RADIUS_LONG,
} from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { countEntitiesOfTypeInRadius, findPotentialNewPartners } from '../../../utils/world-utils';
import { getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Selector, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

// Helper function to find a valid partner from a list of potentials
const findValidPartner = (potentials: HumanEntity[]): HumanEntity | undefined => {
  return potentials.find(
    (p) =>
      (p.procreationCooldown || 0) <= 0 &&
      p.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (p.gender === 'female' ? !p.isPregnant && p.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true),
  );
};

export function createProcreationBehavior(depth: number): BehaviorNode {
  const findImmediatePartner = new ConditionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const potentialPartners = findPotentialNewPartners(human, context.gameState, HUMAN_INTERACTION_PROXIMITY);
      const partner = findValidPartner(potentialPartners);
      if (partner) {
        blackboard.set('procreationPartner', partner);
        return true;
      }
      return false;
    },
    'Find Immediate Partner',
    depth + 2,
  );

  const startProcreating = new ActionNode(
    (human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
      const partner = blackboard.get<HumanEntity>('procreationPartner');
      if (!partner) {
        return NodeStatus.FAILURE;
      }
      human.activeAction = 'procreating';
      human.target = undefined;
      if (!human.partnerIds?.includes(partner.id)) {
        human.partnerIds = human.partnerIds ? [...human.partnerIds, partner.id] : [partner.id];
      }
      return NodeStatus.SUCCESS;
    },
    'Start Procreating',
    depth + 2,
  );

  const locateDistantPartner = new ConditionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const potentialPartners = findPotentialNewPartners(
        human,
        context.gameState,
        PROCREATION_PARTNER_SEARCH_RADIUS_LONG,
      );
      const partner = findValidPartner(potentialPartners);
      if (partner) {
        blackboard.set('procreationPartner', partner);
        return true;
      }
      return false;
    },
    'Locate Distant Partner',
    depth + 2,
  );

  const moveTowardsPartner = new ActionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const partner = blackboard.get<HumanEntity>('procreationPartner');
      if (!partner) {
        return NodeStatus.FAILURE;
      }
      human.activeAction = 'moving';
      human.target = partner.id;
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        partner.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
      return NodeStatus.RUNNING;
    },
    'Move Towards Partner',
    depth + 2,
  );

  return new Sequence(
    [
      // Basic conditions to even consider procreating
      new ConditionNode(
        (human: HumanEntity) => {
          if (!human.isAdult || (human.gender === 'female' && human.isPregnant)) return false;
          if (
            human.age < HUMAN_MIN_PROCREATION_AGE ||
            (human.gender === 'female' && human.age > HUMAN_FEMALE_MAX_PROCREATION_AGE)
          )
            return false;
          return true;
        },
        'Is Fertile (age, not pregnant)',
        depth + 1,
      ),

      new ConditionNode(
        (human: HumanEntity) => human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL,
        'Is Healthy (hunger)',
        depth + 1,
      ),

      new ConditionNode(
        (human: HumanEntity) => (human.procreationCooldown || 0) <= 0,
        'Is Ready (cooldown)',
        depth + 1,
      ),

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

      // --- New Selector logic ---
      new Selector(
        [
          // Branch 1: Try to procreate with a partner that is already close
          new Sequence([findImmediatePartner, startProcreating], 'Procreate With Immediate Partner', depth + 2),
          // Branch 2: If no immediate partner, find a distant one and move towards them
          new Sequence([locateDistantPartner, moveTowardsPartner], 'Seek Distant Partner', depth + 2),
        ],
        'Find Partner And Procreate',
        depth + 1,
      ),
    ],
    'Procreate',
    depth,
  );
}
