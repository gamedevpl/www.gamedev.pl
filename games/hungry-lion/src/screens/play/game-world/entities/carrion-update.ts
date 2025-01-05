import { UpdateContext } from '../game-world-types';
import { Entity, Entities, CarrionEntity } from './entities-types';

export function carrionUpdate(entity: Entity, updateContext: UpdateContext, state: Entities) {
  const carrion = entity as CarrionEntity;
  // decay
  carrion.decay -= 0.01 * updateContext.deltaTime;
  if (carrion.food <= 0 || carrion.decay <= 0) {
    state.entities.delete(carrion.id);
  }
}
