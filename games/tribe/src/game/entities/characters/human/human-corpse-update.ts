import { HumanCorpseEntity } from './human-corpse-types';
import { UpdateContext } from '../../../world-types';
import { removeEntity } from '../../entities-update';
import { HUMAN_CORPSE_DECAY_TIME_HOURS } from '../../../world-consts';

/**
 * Updates a human corpse entity, handling its decay over time.
 * @param entity The human corpse entity to update.
 * @param updateContext The game update context.
 */
export function humanCorpseUpdate(entity: HumanCorpseEntity, updateContext: UpdateContext): void {
  const timeSinceDeath = updateContext.gameState.time - entity.timeOfDeath;

  if (HUMAN_CORPSE_DECAY_TIME_HOURS > 0) {
    entity.decayProgress = Math.min(1, timeSinceDeath / HUMAN_CORPSE_DECAY_TIME_HOURS);
  } else {
    entity.decayProgress = 1; // Instantly decay if time is zero or negative
  }

  if (entity.decayProgress >= 1) {
    removeEntity(updateContext.gameState.entities, entity.id);
  }
}
