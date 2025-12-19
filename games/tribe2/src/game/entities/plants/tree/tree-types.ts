import { PlantEntity } from '../plant-types';
import { WoodItem } from '../../item-types';

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

  /** Game hours passed since the last spread attempt. */
  timeSinceLastSpreadAttempt: number;
  /** The maximum radius (in pixels) from the parent tree where a new tree can spawn. */
  spreadRadius: number;
  /** The wood items contained within the tree, which can be extracted by chopping. */
  wood: WoodItem[];
  /** Whether the wood items have been initialized for this tree. */
  woodGenerated?: boolean;
}
