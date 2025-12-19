import { PlantEntity } from '../plant-types';

/**
 * Represents a tree entity in the game world.
 */
export interface TreeEntity extends PlantEntity {
  /**
   * Random offset for the sway animation to ensure trees don't sway in perfect unison.
   */
  swayOffset: number;

  /**
   * Visual variant index (e.g., 0-3) to provide variety in tree appearance.
   */
  variant: number;
}
