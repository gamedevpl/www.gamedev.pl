/**
 * Types for the tribe territory system.
 * Territory defines the area controlled by a tribe, based on buildings and members.
 */

import { EntityId } from '../entities-types';

/**
 * Result of checking if a position is within a territory.
 */
export interface TerritoryCheckResult {
  /** Whether the position is inside any tribe territory */
  isInsideTerritory: boolean;
  /** Whether the position is close to (but not inside) the territory border */
  isNearBorder: boolean;
  /** Distance to the nearest territory edge (negative if inside) */
  distanceToEdge: number;
  /** The tribe territory if inside or near one */
  leaderId?: EntityId;
}
