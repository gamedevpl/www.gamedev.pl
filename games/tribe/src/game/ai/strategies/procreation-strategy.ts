import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { EntityType } from '../../entities/entities-types';
import { findClosestEntity, countEntitiesOfTypeInRadius } from '../../utils/world-utils';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { 
  HUMAN_HUNGER_THRESHOLD_CRITICAL, 
  HUMAN_INTERACTION_RANGE, 
  HUMAN_AI_WANDER_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_FOOD_SEARCH_RADIUS
} from '../../world-consts';

/**
 * Strategy for AI-controlled humans to find a suitable partner and attempt procreation.
 * This strategy will check if the human meets all conditions for procreation,
 * then either move toward a potential partner or initiate procreation if close enough.
 */
export class ProcreationStrategy implements HumanAIStrategy {
  /**
   * Checks if this human is eligible for procreation.
   * @param human The human entity to check
   * @param context The current update context
   * @returns True if the human meets all conditions for procreation
   */
  check(human: HumanEntity, context: UpdateContext): boolean {
    // Check for nearby food sources (berry bushes)
    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      context.gameState.entities.entities,
      'berryBush' as EntityType,
      PROCREATION_FOOD_SEARCH_RADIUS,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height
    );

    return (
      (human.isAdult &&
        human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        (human.procreationCooldown || 0) <= 0 &&
        (human.gender === 'female' ? !human.isPregnant : true) &&
        nearbyBerryBushesCount >= PROCREATION_MIN_NEARBY_BERRY_BUSHES) ||
      false
    );
  }

  /**
   * Executes the procreation strategy for this human.
   * Will either move toward a potential partner or initiate procreation if close enough.
   * @param human The human entity to execute the strategy for
   * @param context The current update context
   */
  execute(human: HumanEntity, context: UpdateContext): void {
    // Find a suitable partner of the opposite gender
    const partner = findClosestEntity<HumanEntity>(
      human,
      context.gameState.entities.entities,
      'human' as EntityType,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
      HUMAN_AI_WANDER_RADIUS * 2,
      (p) => {
        const other = p as HumanEntity;
        return (
          (other.id !== human.id && // Not the same human
            other.gender !== human.gender && // Opposite gender
            other.isAdult && // Must be an adult
            other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL && // Not too hungry
            (other.procreationCooldown || 0) <= 0 && // Not on cooldown
            (other.gender === 'female' ? !other.isPregnant : true)) ||
          false
        ); // If female, not pregnant
      },
    );

    if (partner) {
      const distance = vectorDistance(human.position, partner.position);

      // If close enough to the partner, initiate procreation
      if (distance < HUMAN_INTERACTION_RANGE / 1.5) {
        // Slightly less than full range to ensure interaction triggers
        human.activeAction = 'procreating';
        human.targetPosition = partner.position; // For interaction system
      } else {
        // Otherwise, move toward the partner
        human.activeAction = 'moving';
        human.targetPosition = { ...partner.position };
        const dirToTarget = vectorSubtract(partner.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      }
    } else {
      // No suitable partner found, fall back to idle
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}