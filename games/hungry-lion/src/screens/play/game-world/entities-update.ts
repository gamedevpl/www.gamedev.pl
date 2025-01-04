import { Entities, Entity, EntityId, EntityType, LionEntity } from './entities-types';
import { UpdateContext } from './game-world-types';
import { vectorAdd, vectorLength, vectorScale, calculateBoundaryForce } from './math-utils';
import { BOUNDARY_FORCE_STRENGTH, BOUNDARY_FORCE_RANGE } from './game-world-consts';

export function updateEntities(state: Entities, updateContext: UpdateContext): void {
  state.entities.forEach((entity) => {
    // traction force
    entity.forces.push(vectorScale(entity.velocity, -0.1));

    // boundary forces
    const boundaryForce = calculateBoundaryForce(entity.position, BOUNDARY_FORCE_RANGE, BOUNDARY_FORCE_STRENGTH);
    entity.forces.push(boundaryForce);

    entity.velocity = vectorAdd(entity.velocity, entity.forces.reduce(vectorAdd, { x: 0, y: 0 }));

    // zero velocity if it's too small
    if (vectorLength(entity.velocity) < 0.001) {
      entity.velocity = { x: 0, y: 0 };
    } else {
      entity.direction = Math.atan2(entity.velocity.y, entity.velocity.x);
    }

    entity.position = vectorAdd(entity.position, vectorScale(entity.velocity, updateContext.deltaTime));

    entity.forces = [];
  });
}

export function createEntities(): Entities {
  const state = {
    entities: new Map<EntityId, Entity>(),
    nextEntityId: 1,
  };

  createEntity<LionEntity>(state, 'lion', { position: { x: 100, y: 100 }, isPlayer: true, target: {} });

  return state;
}

export function createEntity<T extends Entity>(
  state: Entities,
  type: EntityType,
  initialState: Partial<Entity> & Omit<T, 'id' | 'type' | 'velocity' | 'forces' | 'direction'>,
): T {
  const entity: T = {
    id: state.nextEntityId++,
    type,
    velocity: { x: 0, y: 0 },
    direction: 0,
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
