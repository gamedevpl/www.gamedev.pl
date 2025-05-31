import { Entity } from '../entities-types';

/**
 * Base interface for character-like entities in the game.
 * This serves as a foundation for more specific character types like humans.
 */
export interface CharacterEntity extends Entity {
  /** The current age of the character in game years. */
  age: number;
  /** The maximum age the character can reach before dying of old age. */
  maxAge: number;
  /** The current hunger level of the character (0-100). */
  hunger: number;
}
