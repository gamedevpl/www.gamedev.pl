import { BaseEntity } from '../entities-types';

/**
 * Base interface for plant-like entities in the game.
 */
export interface PlantEntity extends BaseEntity {
  /** The current age of the plant in game hours. */
  age: number;
  /** The total lifespan of the plant in game hours. */
  lifespan: number;
}
