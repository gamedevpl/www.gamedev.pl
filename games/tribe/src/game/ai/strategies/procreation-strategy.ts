import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Entity, EntityType } from '../../entities/entities-types';
import {
  findClosestEntity,
  countEntitiesOfTypeInRadius,
  countLivingOffspring,
  findPotentialNewPartners,
} from '../../utils/world-utils';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_AI_WANDER_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_FOOD_SEARCH_RADIUS,
  PROCREATION_MAX_CHILDREN_FOR_AI,
  PROCREATION_PARTNER_SEARCH_RADIUS_FOR_NEW_LINEAGE,
  PROCREATION_MIN_UNRELATED_PARTNERS_FOR_NEW_LINEAGE,
} from '../../world-consts';

export class ProcreationStrategy implements HumanAIStrategy {
  private findRegularPartner(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    const baseFilter = (p: Entity): p is HumanEntity => {
      const other = p as HumanEntity;
      return (
        (other.type === 'human' &&
          other.id !== human.id &&
          other.gender !== human.gender &&
          other.isAdult &&
          other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
          (other.procreationCooldown || 0) <= 0 &&
          (other.gender === 'female' ? !other.isPregnant : true)) ??
        false
      );
    };

    const unpartneredPartner = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 2,
      (p) => baseFilter(p) && (!p.partnerIds || p.partnerIds.length === 0),
    );

    if (unpartneredPartner) {
      return unpartneredPartner;
    }

    const anyPartner = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 2,
      (p) => baseFilter(p),
    );

    return anyPartner;
  }

  check(human: HumanEntity, context: UpdateContext): boolean {
    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      context.gameState,
      'berryBush' as EntityType,
      PROCREATION_FOOD_SEARCH_RADIUS,
    );

    const canProcreateBasically =
      human.isAdult &&
      human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (human.procreationCooldown || 0) <= 0 &&
      (human.gender === 'female' ? !human.isPregnant : true) &&
      nearbyBerryBushesCount >= PROCREATION_MIN_NEARBY_BERRY_BUSHES;

    if (!canProcreateBasically) {
      return false;
    }

    const livingOffspringCount = countLivingOffspring(human.id, context.gameState);

    if (livingOffspringCount < PROCREATION_MAX_CHILDREN_FOR_AI) {
      const regularPartner = this.findRegularPartner(human, context);
      return !!regularPartner;
    } else {
      const newPotentialPartners = findPotentialNewPartners(
        human,
        context.gameState,
        PROCREATION_PARTNER_SEARCH_RADIUS_FOR_NEW_LINEAGE,
      );
      return newPotentialPartners.length >= PROCREATION_MIN_UNRELATED_PARTNERS_FOR_NEW_LINEAGE;
    }
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const livingOffspringCount = countLivingOffspring(human.id, context.gameState);
    let partnerToPursue: HumanEntity | null = null;

    if (livingOffspringCount < PROCREATION_MAX_CHILDREN_FOR_AI) {
      partnerToPursue = this.findRegularPartner(human, context);
    } else {
      const newPotentialPartners = findPotentialNewPartners(
        human,
        context.gameState,
        PROCREATION_PARTNER_SEARCH_RADIUS_FOR_NEW_LINEAGE,
      );
      if (newPotentialPartners.length > 0) {
        partnerToPursue = newPotentialPartners[0];
      }
    }

    if (partnerToPursue) {
      const distance = vectorDistance(human.position, partnerToPursue.position);
      if (distance < HUMAN_INTERACTION_RANGE / 1.5) {
        human.activeAction = 'procreating';
        human.targetPosition = partnerToPursue.position;
      } else {
        human.activeAction = 'moving';
        human.targetPosition = { ...partnerToPursue.position };
        const dirToTarget = vectorSubtract(partnerToPursue.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      }
    } else {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
