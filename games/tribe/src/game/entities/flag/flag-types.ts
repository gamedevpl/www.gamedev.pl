import { Entity, EntityId } from '../entities-types';

/**
 * Represents a tribe's flag in the game.
 * Flags mark territory and can be attacked or reclaimed by other tribes.
 */
export interface FlagEntity extends Entity {
  /** ID of the human who is the leader of the tribe that owns this flag. */
  leaderId: EntityId;

  /** Visual representation of the tribe badge. */
  tribeBadge: string;

  /** The radius of the territory this flag controls. */
  territoryRadius: number;

  /** Current hitpoints of the flag. If it reaches 0, it's destroyed. */
  hitpoints: number;

  /** Maximum hitpoints of the flag. */
  maxHitpoints: number;

  /** The time at which the flag was planted. */
  plantedAt: number;

  /** The total lifespan of the flag in game hours. */
  lifespan: number;
}
