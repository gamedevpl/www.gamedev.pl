import { Entity, EntityId, Entities, EntityType } from '../types/world-types';

/**
 * Creates and initializes an empty container for entities.
 * @returns An object to hold and manage all game entities.
 */
export function createEntities(): Entities {
  const state = {
    entities: new Map<EntityId, Entity>(),
    nextEntityId: 1,
  };
  return state;
}

/**
 * Creates a new generic entity and adds it to the entity manager.
 * @param state The Entities container.
 * @param type The entity type from the EntityType enum.
 * @param initial A partial object of initial properties for the entity.
 * @returns The newly created entity.
 */
export function createEntity<T extends Entity>(
  state: Entities,
  type: EntityType,
  initial: Partial<Entity> & Omit<T, 'id' | 'type' | 'velocity' | 'forces' | 'direction' | 'acceleration'>,
): T {
  const entity: Entity = {
    id: state.nextEntityId++,
    type,
    // Default physics properties
    velocity: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    // Spread the initial properties
    ...initial,
    // Only set debuffs if not already provided
    debuffs: initial.debuffs ?? [],
  };
  state.entities.set(entity.id, entity);
  return entity as T;
}

/**
 * Removes an entity from the entity manager.
 * @param state The Entities container.
 * @param entityId The ID of the entity to remove.
 * @returns True if the entity was found and removed, false otherwise.
 */
export function removeEntity(state: Entities, entityId: EntityId): boolean {
  if (!state.entities.has(entityId)) {
    return false;
  }
  state.entities.delete(entityId);
  return true;
}
