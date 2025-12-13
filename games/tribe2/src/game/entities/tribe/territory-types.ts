/**
 * Types for the tribe territory system.
 * Territory defines the area controlled by a tribe, based on buildings and members.
 */

import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../entities-types';

/**
 * Represents a circular territory area around a single point (building or center).
 */
export interface TerritoryCircle {
  center: Vector2D;
  radius: number;
}

/**
 * Represents the territory of a tribe.
 * The territory is defined as a union of circles around key points (buildings, tribe center).
 */
export interface TribeTerritory {
  /** The leader ID of the tribe that owns this territory */
  leaderId: EntityId;
  /** Individual territory circles that make up the full territory */
  circles: TerritoryCircle[];
  /** Badge color for rendering the territory border */
  color: string;
}

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
  territory?: TribeTerritory;
}

/**
 * Represents a sector (grid cell) of the world used for territory calculations.
 */
export interface TerritorySector {
  position: Vector2D;
  width: number;
  height: number;
  circle: TerritoryCircle;
  leaderId: EntityId;
}
