import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { FLAG_PLANTING_COST, HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING, HUMAN_INTERACTION_RANGE } from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { findOptimalFlagPlantingSpot } from '../../utils/world-utils';
import { FoodType } from '../../food/food-types';
import { Vector2D } from '../../utils/math-types';
import { calculateWrappedDistance } from '../../utils/math-utils';

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
    } else {
      human.activeAction = 'plantingFlag';
      human.targetPosition = undefined; // Clear target position as we are there
    }
  }
}
