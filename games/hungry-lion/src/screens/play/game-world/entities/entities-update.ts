import { Entities, Entity, EntityId, EntityType, LionEntity } from './entities-types';
import { UpdateContext } from '../game-world-types';
import { preySpawn } from './prey-spawner';
import { entityUpdate } from './entity-update';
import { carrionUpdate } from './carrion-update';
import { preyUpdate } from './prey-update';
import { createLionStateMachine } from '../state-machine/states/lion';

export function entitiesUpdate(updateContext: UpdateContext): void {
  const state = updateContext.gameState.entities;
  // First handle prey-to-carrion conversion
  state.entities.forEach((entity) => {
    if (entity.type === 'carrion') {
      carrionUpdate(entity, updateContext, state);
      return;
    }

    if (entity.type === 'prey') {
      preyUpdate(entity, updateContext, state);
    }

    // generic entity update
    entityUpdate(entity, updateContext);
  });

  // Spawn new prey if needed
  preySpawn(state);
}

export function createEntities(): Entities {
  const state = {
    entities: new Map<EntityId, Entity>(),
    nextEntityId: 1,
  };

  createEntity<LionEntity>(state, 'lion', {
    position: { x: 100, y: 100 },
    isPlayer: true,
    target: {},
    stateMachine: createLionStateMachine(),
  });

  return state;
}

export function createEntity<T extends Entity>(
  state: Entities,
  type: EntityType,
  initialState: Partial<Entity> &
    Omit<T, 'id' | 'type' | 'velocity' | 'forces' | 'direction' | 'targetDirection' | 'acceleration'>,
): T {
  const entity: T = {
    id: state.nextEntityId++,
    type,
    velocity: { x: 0, y: 0 },
    direction: 0,
    targetDirection: 0,
    acceleration: 0,
    forces: [],
    ...initialState,
  } as unknown as T;
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
