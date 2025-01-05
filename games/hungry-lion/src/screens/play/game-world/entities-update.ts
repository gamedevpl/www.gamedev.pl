import { Entities, Entity, EntityId, EntityType, LionEntity, PreyEntity, CarrionEntity } from './entities-types';
import { UpdateContext } from './game-world-types';
import { vectorAdd, vectorLength, vectorScale, calculateBoundaryForce } from './math-utils';
import { BOUNDARY_FORCE_STRENGTH, BOUNDARY_FORCE_RANGE } from './game-world-consts';
import { spawnPrey } from './prey-spawner';

export function updateEntities(updateContext: UpdateContext): void {
  const state = updateContext.gameState.entities;
  // First handle prey-to-carrion conversion
  state.entities.forEach((entity) => {
    if (entity.type === 'prey') {
      const prey = entity as PreyEntity;
      if (prey.health <= 0) {
        state.entities.delete(prey.id);
        createEntity<CarrionEntity>(state, 'carrion', {
          position: prey.position,
          direction: prey.direction,
          food: 100,
        });
      }
    }

    if (entity.type === 'carrion') {
      const carrion = entity as CarrionEntity;
      if (carrion.food <= 0) {
        state.entities.delete(carrion.id);
        return;
      }
    }

    // traction force
    entity.forces.push(vectorScale(entity.velocity, -0.1));

    // boundary forces
    const boundaryForce = calculateBoundaryForce(entity.position, BOUNDARY_FORCE_RANGE, BOUNDARY_FORCE_STRENGTH);
    entity.forces.push(boundaryForce);

    const accelerationForce = vectorScale(
      { x: Math.cos(entity.direction), y: Math.sin(entity.direction) },
      entity.acceleration,
    );
    entity.forces.push(accelerationForce);

    entity.velocity = vectorAdd(entity.velocity, entity.forces.reduce(vectorAdd, { x: 0, y: 0 }));
    // TODO: Introduce angular velocity
    entity.direction = entity.targetDirection;

    // zero velocity if it's too small
    if (vectorLength(entity.velocity) < 0.001) {
      entity.velocity = { x: 0, y: 0 };
    }

    entity.position = vectorAdd(entity.position, vectorScale(entity.velocity, updateContext.deltaTime));

    entity.forces = [];
  });

  // Spawn new prey if needed
  spawnPrey(state);
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
