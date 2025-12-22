/**
 * Type definitions for the temperature system.
 * Tracks regional temperature across a grid of sectors in the game world.
 */

/**
 * Represents the state of a single temperature sector.
 */
export interface TemperatureSector {
  /** Base environmental temperature of the sector in degrees Celsius. */
  baseTemperature: number;

  /** Current temperature of the sector, including artificial heat sources (degrees Celsius). */
  currentTemperature: number;
}

/**
 * State tracking for the entire temperature system.
 * Uses a grid representation for regional variations.
 */
export interface TemperatureState {
  /**
   * Map of temperature sectors, keyed by "x,y" grid coordinates.
   */
  sectors: Record<string, TemperatureSector>;
}

/**
 * Creates a key for the temperature sector map from grid coordinates.
 */
export function getTemperatureSectorKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}
