import { Entity, EntityId } from '../../entities-types';

/**
 * Represents a human corpse entity in the game.
 * This entity is created when a human dies and remains for a certain period before decaying.
 */
export interface HumanCorpseEntity extends Entity {
  /**
   * The game time when the human died.
   */
  timeOfDeath: number;

  /**
   * The ID of the original human entity.
   */
  originalHumanId: EntityId;

  /**
   * The gender of the deceased human.
   */
  gender: 'male' | 'female';

  /**
   * The age of the human at the time of death.
   */
  age: number;

  /**
   * The progression of decay, from 0 (fresh) to 1 (fully decayed).
   */
  decayProgress: number;
}
