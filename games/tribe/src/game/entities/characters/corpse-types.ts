import { FoodItem } from '../../food/food-types';
import { Entity, EntityId } from '../entities-types';

/**
 * Represents a corpse entity in the game.
 * This entity is created when any character (human, prey, predator) dies and remains for a certain period before decaying.
 */
export interface CorpseEntity extends Entity {
  /**
   * The game time when the character died.
   */
  timeOfDeath: number;

  /**
   * The ID of the original entity.
   */
  originalEntityId: EntityId;

  /**
   * The type of the original entity that died.
   */
  originalEntityType: 'human' | 'prey' | 'predator';

  /**
   * The gender of the deceased character.
   */
  gender: 'male' | 'female';

  /**
   * The age of the character at the time of death.
   */
  age: number;

  /**
   * The progression of decay, from 0 (fresh) to 1 (fully decayed).
   */
  decayProgress: number;

  /**
   * The amount of meat available to be gathered from the corpse.
   */
  food: FoodItem[];

  /**
   * The gene code for rendering variety (for animals).
   */
  geneCode?: number;
}

/**
 * Legacy type alias for backward compatibility.
 * @deprecated Use CorpseEntity instead.
 */
export type HumanCorpseEntity = CorpseEntity;
