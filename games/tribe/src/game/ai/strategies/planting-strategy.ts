import {
  AI_PLANTING_BERRY_THRESHOLD,
  AI_PLANTING_MAX_NEARBY_BUSHES,
  AI_PLANTING_SEARCH_RADIUS,
  BERRY_BUSH_SPREAD_RADIUS,
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
} from '../../world-consts';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { findChildren, findValidPlantingSpot, countEntitiesOfTypeInRadius } from '../../utils/world-utils';
import { FoodType } from '../../food/food-types';
import { Vector2D } from '../../utils/math-types';
import { FoodSource, GatheringStrategy } from './gathering-strategy';

export class PlantingStrategy implements HumanAIStrategy<Vector2D | FoodSource | null> {
  gatheringStrategy = new GatheringStrategy();

  check(human: HumanEntity, context: UpdateContext): Vector2D | FoodSource | null {
    const { gameState } = context;

    const hasEnoughBerries = human.food.filter((f) => f.type === FoodType.Berry).length >= AI_PLANTING_BERRY_THRESHOLD;
    const isNotHungry = human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING;
    const children = findChildren(gameState, human);
    const hasHungryChildren = children.some((child) => child.hunger > CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD);

    if (human.isAdult && !hasEnoughBerries) {
      // If not enough berries, try to gather more
      const foodSource = this.gatheringStrategy.check(human, context, {
        onlyBerries: true,
        hungerThreshold: 0,
      });
      if (foodSource?.type === 'berryBush') {
        return foodSource; // Return the food source if found
      }
    }

    if (!human.isAdult || !hasEnoughBerries || !isNotHungry || hasHungryChildren) {
      return null;
    }

    const plantingSpot = findValidPlantingSpot(
      human.position,
      gameState,
      AI_PLANTING_SEARCH_RADIUS,
      BERRY_BUSH_SPREAD_RADIUS,
    );
    if (!plantingSpot) {
      return null;
    }

    const nearbyBushes = countEntitiesOfTypeInRadius(plantingSpot, gameState, 'berryBush', AI_PLANTING_SEARCH_RADIUS);
    if (nearbyBushes >= AI_PLANTING_MAX_NEARBY_BUSHES) {
      return null;
    }

    return plantingSpot;
  }

  execute(human: HumanEntity, _context: UpdateContext, checkResult: FoodSource | Vector2D): void {
    if ('type' in checkResult && checkResult.type === 'berryBush') {
      this.gatheringStrategy.execute(human, _context, checkResult);
    } else if (typeof checkResult === 'object' && 'x' in checkResult && 'y' in checkResult) {
      human.activeAction = 'planting';
      human.targetPosition = checkResult;
    }
  }
}
