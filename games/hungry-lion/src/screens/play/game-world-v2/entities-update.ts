import { Entities, Entity, EntityId, EntityType } from './entities-types';
import { Vector2D } from './math-types';

export function createEntities(): Entities {
  return {
    entities: new Map(),
    nextEntityId: 1,
  };
}

export function createEntity(
  state: Entities,
  type: EntityType,
  position: Vector2D,
  initialState?: Partial<Entity>,
): Entity {
  const entity: Entity = {
    id: state.nextEntityId,
    type,
    position,
    ...initialState,
  };
  state.entities.set(entity.id, entity);
  return entity;
}

export function updateEntity(state: Entities, entityId: EntityId, updates: Partial<Entity>): Entity | null {
  const entity = state.entities.get(entityId);
  if (!entity) return null;

  const updatedEntity = {
    ...entity,
    ...updates,
  };
  state.entities.set(entityId, updatedEntity);
  return updatedEntity;
}

export function removeEntity(state: Entities, entityId: EntityId): boolean {
  if (!state.entities.get(entityId)) return false;
  state.entities.delete(entityId);
  return true;
}

export function getEntity(state: Entities, entityId: EntityId): Entity | null {
  return state.entities.get(entityId) || null;
}
