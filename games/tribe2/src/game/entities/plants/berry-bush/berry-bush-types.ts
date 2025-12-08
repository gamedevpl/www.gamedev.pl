import { FoodItem } from '../../../food/food-types';
import { PlantEntity } from '../plant-types';

/**
 * Represents a berry bush entity in the game.
 */
export interface BerryBushEntity extends PlantEntity {
  /** The current number of berries on the bush. */
  food: FoodItem[];
  /** The maximum number of berries the bush can hold. */
  maxFood: number;
  /** Game hours passed since the last berry was regenerated. */
  timeSinceLastBerryRegen: number;
  /** The maximum radius (in pixels) from the parent bush where a new bush can spawn. */
  spreadRadius: number;
  /** Game hours passed since the last spread attempt. */
  timeSinceLastSpreadAttempt: number;
  /** Game time when the bush was last harvested. */
  timeSinceLastHarvest: number;
}
