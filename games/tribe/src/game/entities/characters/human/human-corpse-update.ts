import { HumanCorpseEntity } from './human-corpse-types';
import { UpdateContext } from '../../../world-types';
import { removeEntity } from '../../entities-update';
import { HUMAN_CORPSE_INITIAL_FOOD } from '../../../world-consts';

/**
 * Updates a human corpse entity, handling its decay over time.
 * @param entity The human corpse entity to update.
 * @param updateContext The game update context.
 */
export function humanCorpseUpdate(entity: HumanCorpseEntity, updateContext: UpdateContext): void {
  const timeSinceDeath = updateContext.gameState.time - entity.timeOfDeath;

  // Human corpse decay constant
  const HUMAN_CORPSE_DECAY_TIME_HOURS = 128;

  if (HUMAN_CORPSE_DECAY_TIME_HOURS > 0) {
    entity.decayProgress = Math.min(1, timeSinceDeath / HUMAN_CORPSE_DECAY_TIME_HOURS);
  } else {
    entity.decayProgress = 1; // Instantly decay if time is zero or negative
  }

  // As the corpse decays, the amount of meat decreases.
  const remainingFood = Math.floor(HUMAN_CORPSE_INITIAL_FOOD * (1 - entity.decayProgress));
  if (entity.food.length > remainingFood) {
    entity.food.splice(remainingFood);
  }

  // The corpse is removed from the world once it has fully decayed and all meat is gone.
  if (entity.decayProgress >= 1 && entity.food.length <= 0) {
    removeEntity(updateContext.gameState.entities, entity.id);
  }
}
