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
  /**
   * Sparse map of soil sectors, keyed by "x,y" grid coordinates.
   * Only sectors with non-default values are stored.
   */
  sectors: Record<string, SoilSector>;
}

/**
 * Creates a key for the sector map from grid coordinates.
 */
export function getSectorKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

/**
 * Parses a sector key back into grid coordinates.
 */
export function parseSectorKey(key: string): { gridX: number; gridY: number } {
  const [x, y] = key.split(',').map(Number);
  return { gridX: x, gridY: y };
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
    sectors: {},
  };
}
