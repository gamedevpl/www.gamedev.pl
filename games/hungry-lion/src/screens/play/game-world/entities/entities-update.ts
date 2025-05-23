import { Entities, Entity, EntityId, EntityType, LionEntity, PreyEntity } from './entities-types';
import { UpdateContext } from '../game-world-types';
import { preySpawn } from './prey-spawner';
import { entityUpdate } from './entity-update';
import { carrionUpdate } from './carrion-update';
import { preyUpdate } from './prey-update';
import { hunterUpdate } from './hunter-update';
import { createLionStateMachine } from '../state-machine/states/lion';
import { spawnHunter } from './hunter-update';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world-consts';
import { createPreyStateMachine } from '../state-machine/states/prey';

const INITIAL_PREY_COUNT = 5;
const INITIAL_HUNTER_COUNT = 2;

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

    if (entity.type === 'hunter') {
      hunterUpdate(entity, updateContext, state);
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
    movementVector: { x: 0, y: 0 },
    target: {},
    activeAction: 'walk',
    hungerLevel: 100, // Initialize hunger level for lions
    stateMachine: createLionStateMachine(),
  });

  // Spawn initial prey
  for (let i = 0; i < INITIAL_PREY_COUNT; i++) {
    const preyPosition = {
      x: Math.random() * (GAME_WORLD_WIDTH - 200) + 100,
      y: Math.random() * (GAME_WORLD_HEIGHT - 200) + 100,
    };
    createEntity<PreyEntity>(state, 'prey', {
      position: preyPosition,
      stateMachine: createPreyStateMachine(),
      health: 100,
      hungerLevel: Math.random() * 50 + 50, // Range 50-100
      thirstLevel: Math.random() * 50 + 50, // Range 50-100
      staminaLevel: Math.random() * 30 + 70, // Range 70-100
    });
  }

  // Spawn initial hunters
  for (let i = 0; i < INITIAL_HUNTER_COUNT; i++) {
    const hunterPosition = {
      x: Math.random() * (GAME_WORLD_WIDTH - 200) + 100,
      y: Math.random() * (GAME_WORLD_HEIGHT - 200) + 100,
    };
    spawnHunter(state, hunterPosition);
  }

  return state;
}

export function createEntity<T extends Entity>(
  state: Entities,
  type: EntityType,
  initialState: Partial<Entity> &
    Omit<T, 'id' | 'type' | 'velocity' | 'forces' | 'direction' | 'targetDirection' | 'acceleration' | 'debuffs'>,
): T {
  const entity: T = {
    id: state.nextEntityId++,
    type,
    velocity: { x: 0, y: 0 },
    direction: 0,
    targetDirection: 0,
    acceleration: 0,
    forces: [],
    debuffs: [],
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
