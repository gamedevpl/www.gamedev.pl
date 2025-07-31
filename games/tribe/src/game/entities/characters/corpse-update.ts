import { CorpseEntity } from './corpse-types';
import { UpdateContext } from '../../world-types';
import { removeEntity } from '../entities-update';
import { HUMAN_CORPSE_DECAY_TIME_HOURS, HUMAN_CORPSE_INITIAL_FOOD } from '../../world-consts';

/**
 * Updates a corpse entity, handling its decay over time.
 * @param entity The corpse entity to update.
 * @param updateContext The game update context.
 */
export function corpseUpdate(entity: CorpseEntity, updateContext: UpdateContext): void {
  const timeSinceDeath = updateContext.gameState.time - entity.timeOfDeath;

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

/**
 * Legacy function for backward compatibility.
 * @deprecated Use corpseUpdate instead.
 */
export const humanCorpseUpdate = corpseUpdate;
