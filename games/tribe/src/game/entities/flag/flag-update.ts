import { UpdateContext } from '../../world-types';
import { removeEntity } from '../entities-update';
import { FlagEntity } from './flag-types';

/**
 * Updates a flag entity's state over time.
 * Currently, it only handles the decay of the flag.
 * @param entity The flag entity to update.
 * @param updateContext The game's update context.
 */
export function flagUpdate(entity: FlagEntity, updateContext: UpdateContext): void {
  const { gameState } = updateContext;
  const timeSincePlanted = gameState.time - entity.plantedAt;

  if (timeSincePlanted >= entity.lifespan) {
    removeEntity(gameState.entities, entity.id);
  }
}
