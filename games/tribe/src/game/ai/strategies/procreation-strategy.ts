import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Entity, EntityType } from '../../entities/entities-types';
import {
  findClosestEntity,
  countEntitiesOfTypeInRadius,
  countLivingOffspring, // New import
  findPotentialNewPartners, // New import
} from '../../utils/world-utils';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_AI_WANDER_RADIUS, // Existing radius for regular partner search, consider if a specific one is needed
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_FOOD_SEARCH_RADIUS,
  PROCREATION_MAX_CHILDREN_FOR_AI, // New import
  PROCREATION_PARTNER_SEARCH_RADIUS_FOR_NEW_LINEAGE, // New import
  PROCREATION_MIN_UNRELATED_PARTNERS_FOR_NEW_LINEAGE, // New import
} from '../../world-consts';

/**
 * Strategy for AI-controlled humans to find a suitable partner and attempt procreation.
 * This strategy will check if the human meets all conditions for procreation,
 * then either move toward a potential partner or initiate procreation if close enough.
 * It also considers lineage size and opportunities for new lineage formation.
 */
export class ProcreationStrategy implements HumanAIStrategy {
  private findRegularPartner(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;
    const allEntities = gameState.entities.entities;
    const { mapDimensions } = gameState;

    const baseFilter = (p: Entity): p is HumanEntity => {
      const other = p as HumanEntity;
      return (
        (other.type === 'human' &&
          other.id !== human.id && // Not the same human
          other.gender !== human.gender && // Opposite gender
          other.isAdult && // Must be an adult
          other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL && // Not too hungry
          (other.procreationCooldown || 0) <= 0 && // Not on cooldown
          (other.gender === 'female' ? !other.isPregnant : true)) ?? // If female, not pregnant
        false
      );
    };

    // --- Pass 1: Find unpartnered individuals (the "safe" option) ---
    const unpartneredPartner = findClosestEntity<HumanEntity>(
      human,
      allEntities,
      'human' as EntityType,
      mapDimensions.width,
      mapDimensions.height,
      HUMAN_AI_WANDER_RADIUS * 2,
      (p) => baseFilter(p) && (!p.partnerIds || p.partnerIds.length === 0),
    );

    if (unpartneredPartner) {
      return unpartneredPartner;
    }

    // --- Pass 2: Find any eligible partner (the "risky" option) ---
    const anyPartner = findClosestEntity<HumanEntity>(
      human,
      allEntities,
      'human' as EntityType,
      mapDimensions.width,
      mapDimensions.height,
      HUMAN_AI_WANDER_RADIUS * 2,
      (p) => baseFilter(p),
    );

    return anyPartner;
  }

  /**
   * Checks if this human is eligible for procreation based on various conditions including lineage size.
   * @param human The human entity to check
   * @param context The current update context
   * @returns True if the human meets all conditions for procreation
   */
  check(human: HumanEntity, context: UpdateContext): boolean {
    // 1. Basic procreation conditions (including food)
    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      context.gameState.entities.entities,
      'berryBush' as EntityType,
      PROCREATION_FOOD_SEARCH_RADIUS,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const canProcreateBasically =
      human.isAdult &&
      human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (human.procreationCooldown || 0) <= 0 &&
      (human.gender === 'female' ? !human.isPregnant : true) &&
      nearbyBerryBushesCount >= PROCREATION_MIN_NEARBY_BERRY_BUSHES;

    // 2. If basic conditions not met, cannot procreate
    if (!canProcreateBasically) {
      return false;
    }

    // 3. Count living offspring
    const livingOffspringCount = countLivingOffspring(human.id, context.gameState.entities.entities);

    // 4. If lineage not full, check for regular partner
    if (livingOffspringCount < PROCREATION_MAX_CHILDREN_FOR_AI) {
      const regularPartner = this.findRegularPartner(human, context);
      return !!regularPartner; // True if a suitable regular partner is found
    }
    // 5. Else (lineage is full), check for new lineage possibility
    else {
      const newPotentialPartners = findPotentialNewPartners(
        human,
        context.gameState.entities.entities,
        PROCREATION_PARTNER_SEARCH_RADIUS_FOR_NEW_LINEAGE,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      return newPotentialPartners.length >= PROCREATION_MIN_UNRELATED_PARTNERS_FOR_NEW_LINEAGE;
    }
  }

  /**
   * Executes the procreation strategy for this human.
   * Will either move toward a potential partner (regular or new) or initiate procreation if close enough.
   * @param human The human entity to execute the strategy for
   * @param context The current update context
   */
  execute(human: HumanEntity, context: UpdateContext): void {
    // 1. Recalculate living offspring count
    const livingOffspringCount = countLivingOffspring(human.id, context.gameState.entities.entities);

    let partnerToPursue: HumanEntity | null = null;

    // 2. If lineage not full, find regular partner
    if (livingOffspringCount < PROCREATION_MAX_CHILDREN_FOR_AI) {
      partnerToPursue = this.findRegularPartner(human, context);
    }
    // 3. Else (lineage is full), find new unrelated partner
    else {
      const newPotentialPartners = findPotentialNewPartners(
        human,
        context.gameState.entities.entities,
        PROCREATION_PARTNER_SEARCH_RADIUS_FOR_NEW_LINEAGE,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      if (newPotentialPartners.length > 0) {
        // Select the first suitable new partner found (could be randomized or closest in future)
        partnerToPursue = newPotentialPartners[0];
      }
    }

    // 4. If a partner is found (either regular or new)
    if (partnerToPursue) {
      const distance = vectorDistance(human.position, partnerToPursue.position);

      // If close enough to the partner, initiate procreation action
      if (distance < HUMAN_INTERACTION_RANGE / 1.5) {
        // Slightly less than full range for robust interaction trigger
        human.activeAction = 'procreating';
        human.targetPosition = partnerToPursue.position; // For interaction system to identify target
      } else {
        // Otherwise, move toward the partner
        human.activeAction = 'moving';
        human.targetPosition = { ...partnerToPursue.position };
        const dirToTarget = vectorSubtract(partnerToPursue.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      }
    } else {
      // No suitable partner found under any condition, fall back to idle
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
