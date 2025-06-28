import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import {
  AI_FLAG_PLANTING_TRIBE_MEMBER_THRESHOLD,
  FLAG_PLANTING_COST,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  HUMAN_INTERACTION_RANGE,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { findOptimalFlagPlantingSpot, getAdultFamilyMembers } from '../../utils/world-utils';
import { FoodType } from '../../food/food-types';
import { Vector2D } from '../../utils/math-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils';
import { IndexedWorldState } from '../../world-index/world-index-types';

export class PlantingFlagStrategy implements HumanAIStrategy<Vector2D> {
  check(human: HumanEntity, context: UpdateContext): Vector2D | null {
    const { gameState } = context;

    // Only leaders can plant flags
    if (human.leaderId !== human.id) {
      return null;
    }

    // Check for resource cost
    if (human.food.filter((f) => f.type === FoodType.Berry).length < FLAG_PLANTING_COST) {
      return null;
    }

    // Don't plant flags if hungry
    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      return null;
    }

    const tribeFlagsCount = (gameState as IndexedWorldState).search.flag.byProperty('leaderId', human.id).length;
    const adultTribeMembersCount = getAdultFamilyMembers(human, gameState).length;

    // Allow planting the first flag, then require a certain number of adults per flag to expand
    if (tribeFlagsCount > 0 && adultTribeMembersCount < tribeFlagsCount * AI_FLAG_PLANTING_TRIBE_MEMBER_THRESHOLD) {
      return null;
    }

    // Find the best spot to plant the next flag
    const plantingSpot = findOptimalFlagPlantingSpot(human, gameState);

    return plantingSpot;
  }

  execute(human: HumanEntity, context: UpdateContext, plantingSpot: Vector2D): void {
    const distance = calculateWrappedDistance(
      human.position,
      plantingSpot,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_RANGE) {
      human.activeAction = 'moving';
      human.targetPosition = plantingSpot;
      human.direction = vectorNormalize(
        getDirectionVectorOnTorus(
          human.position,
          plantingSpot,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        ),
      );
    } else {
      human.activeAction = 'plantingFlag';
      human.targetPosition = undefined; // Clear target position as we are there
    }
  }
}
