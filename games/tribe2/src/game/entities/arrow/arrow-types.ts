import { Entity, EntityId } from '../entities-types';

/**
 * Represents an arrow projectile entity in the game.
 * Arrows are shot by hunters at prey and travel in parabolic arcs.
 */
export interface ArrowEntity extends Entity {
  type: 'arrow';

  /** Horizontal velocity component (pixels per second) */
  vx: number;

  /** Vertical velocity component (pixels per second) */
  vy: number;

  /** Height velocity component for parabolic trajectory (pixels per second) */
  vz: number;

  /** ID of the human who shot this arrow */
  shooterId: EntityId;

  /** ID of the intended target (can be undefined if shooting at a location) */
  targetId?: EntityId;

  /** Base damage dealt by this arrow */
  damage: number;

  /** Time since creation in game hours */
  age: number;

  /** Whether the arrow is embedded in ground or target */
  isEmbedded: boolean;

  /** Game time when the arrow became embedded */
  embeddedTime?: number;
}
