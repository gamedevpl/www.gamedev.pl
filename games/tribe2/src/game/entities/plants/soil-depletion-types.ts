/**
 * Type definitions for the soil depletion system.
 * Tracks soil health across a grid of sectors in the game world.
 */

import { EntityId } from '../entities-types';

/**
 * Represents the state of a single soil sector.
 */
export interface SoilSector {
  /** Current health of the soil (0-100) */
  health: number;
  /** Game time when this sector was last walked on */
  lastWalkTime: number;
  /** Game time when this sector last had a bush planted */
  lastPlantTime: number;
  /** Map of entity IDs to last time they affected this sector (for cooldown) */
  lastAffectedBy: Record<EntityId, number>;
}

/**
 * State tracking for the entire soil depletion system.
 * Uses a sparse grid representation - only sectors that have been affected are stored.
 */
export interface SoilDepletionState {
  /** Game time when the soil was last updated */
  lastUpdateTime: number;

  /**
   * Sparse map of soil sectors, keyed by packed numeric grid coordinates.
   * Only sectors with non-default values are stored.
   */
  sectors: Record<number, SoilSector>;
}

// Use a large enough multiplier to pack coordinates into a single number
// This avoids string operations entirely. Max grid size is 2^16 = 65536
const SECTOR_KEY_MULTIPLIER = 65536;

/**
 * Creates a numeric key for the sector map from grid coordinates.
 * Uses bit packing for O(1) key generation.
 */
export function getSectorKey(gridX: number, gridY: number): number {
  return gridY * SECTOR_KEY_MULTIPLIER + gridX;
}

/**
 * Parses a numeric sector key back into grid coordinates.
 * Uses bit unpacking for O(1) parsing.
 */
export function parseSectorKey(key: number): { gridX: number; gridY: number } {
  return {
    gridX: key % SECTOR_KEY_MULTIPLIER,
    gridY: Math.floor(key / SECTOR_KEY_MULTIPLIER),
  };
}

/**
 * Creates a default soil sector with full health.
 */
export function createDefaultSector(): SoilSector {
  return {
    health: 100,
    lastWalkTime: 0,
    lastPlantTime: 0,
    lastAffectedBy: {},
  };
}

/**
 * Creates an empty soil depletion state.
 */
export function createSoilDepletionState(): SoilDepletionState {
  return {
    lastUpdateTime: 0,
    sectors: {},
  };
}
