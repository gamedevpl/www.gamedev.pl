import {
  AI_PLANTING_BERRY_THRESHOLD,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING,
  MAX_BUSHES_PER_TRIBE_TERRITORY,
} from '../../world-consts';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { countBushesInTribeTerritory, findOptimalBushPlantingSpot } from '../../utils/world-utils';
import { FoodType } from '../../food/food-types';
import { Vector2D } from '../../utils/math-types';
import { FoodSource, GatheringStrategy } from './gathering-strategy';
import { IndexedWorldState } from '../../world-index/world-index-types';

export class PlantingStrategy implements HumanAIStrategy<Vector2D | FoodSource | null> {
  gatheringStrategy = new GatheringStrategy();

  check(human: HumanEntity, context: UpdateContext): Vector2D | FoodSource | null {
    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    const hasEnoughBerries = human.food.filter((f) => f.type === FoodType.Berry).length >= AI_PLANTING_BERRY_THRESHOLD;
    const isNotTooHungry = human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING;
    const tribeFlagCount = indexedState.search.flag.byProperty('leaderId', human.leaderId).length;

    if (tribeFlagCount === 0 || !human.isAdult || !isNotTooHungry) {
      return null;
    }

    // Check bush density
    const tribeBushCount = human.leaderId ? countBushesInTribeTerritory(gameState, human.leaderId) : 0;

    if (tribeBushCount >= tribeFlagCount * MAX_BUSHES_PER_TRIBE_TERRITORY) {
      return null;
    }

    if (!hasEnoughBerries) {
      // If not enough berries, try to gather more
      const foodSource = this.gatheringStrategy.check(human, context, {
        onlyBerries: true,
        hungerThreshold: 0, // Gather berries even if not hungry
      });
      if (foodSource?.type === 'berryBush') {
        return foodSource; // Return the food source if found
      }
      return null; // No berries to gather, so can't plant
    }

    const plantingSpot = findOptimalBushPlantingSpot(human, gameState);
    if (!plantingSpot) {
      return null;
    }

    return plantingSpot;
  }

  execute(human: HumanEntity, context: UpdateContext, checkResult: FoodSource | Vector2D): void {
    if ('type' in checkResult && checkResult.type === 'berryBush') {
      this.gatheringStrategy.execute(human, context, checkResult);
    } else if (typeof checkResult === 'object' && 'x' in checkResult && 'y' in checkResult) {
      human.activeAction = 'planting';
      human.targetPosition = checkResult;
    }
  }
}
