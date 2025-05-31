import { Entities, Entity, EntityId, EntityType } from './entities-types';
import { UpdateContext } from '../world-types';
import { entityUpdate } from './entity-update';
import { Vector2D } from '../utils/math-types';
import { BerryBushEntity } from './plants/berry-bush/berry-bush-types';
import { BUSH_GROWING } from './plants/berry-bush/states/bush-state-types';
import {
  BERRY_BUSH_INITIAL_BERRIES,
  BERRY_BUSH_MAX_BERRIES,
  BERRY_BUSH_REGENERATION_HOURS,
  BERRY_BUSH_LIFESPAN_GAME_HOURS,
  BERRY_BUSH_SPREAD_CHANCE,
  BERRY_BUSH_SPREAD_RADIUS,
  HUMAN_INITIAL_AGE,
  HUMAN_INITIAL_HUNGER,
  HUMAN_MAX_AGE_YEARS,
} from '../world-consts';
import { HumanEntity } from './characters/human/human-types';
import { HUMAN_IDLE } from './characters/human/states/human-state-types';

export function entitiesUpdate(updateContext: UpdateContext): void {
  const state = updateContext.gameState.entities;
  // First handle prey-to-carrion conversion
  state.entities.forEach((entity) => {
    // generic entity update
    entityUpdate(entity, updateContext);
  });
}

export function createEntities(): Entities {
  const state = {
    entities: new Map<EntityId, Entity>(),
    nextEntityId: 1,
  };
  return state;
}

export function createEntity<T extends Entity>(
  state: Entities,
  type: EntityType,
  initialState: Partial<Entity> &
    Omit<T, 'id' | 'type' | 'velocity' | 'forces' | 'direction' | 'targetDirection' | 'acceleration' | 'debuffs'>,
): T {
  const entity: Entity = {
    id: state.nextEntityId++,
    type,
    velocity: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    debuffs: [],
    ...initialState,
  };
  state.entities.set(entity.id, entity);
  return entity as T;
}

export function createBerryBush(state: Entities, initialPosition: Vector2D, currentTime: number): BerryBushEntity {
  // Calculate regeneration rate in berries per hour
  // If BERRY_BUSH_REGENERATION_HOURS is hours per berry, then rate is 1 / hours_per_berry
  const regenerationRate = BERRY_BUSH_REGENERATION_HOURS > 0 ? 1 / BERRY_BUSH_REGENERATION_HOURS : 0;

  const bush = createEntity<BerryBushEntity>(state, 'berryBush', {
    position: initialPosition,
    currentBerries: BERRY_BUSH_INITIAL_BERRIES,
    maxBerries: BERRY_BUSH_MAX_BERRIES,
    berryRegenerationRate: regenerationRate,
    lifespan: BERRY_BUSH_LIFESPAN_GAME_HOURS,
    age: 0,
    spreadChance: BERRY_BUSH_SPREAD_CHANCE,
    spreadRadius: BERRY_BUSH_SPREAD_RADIUS,
    timeSinceLastBerryRegen: 0,
    timeSinceLastSpreadAttempt: 0,
    stateMachine: [BUSH_GROWING, { enteredAt: currentTime, previousState: undefined }],
  });
  return bush;
}

export function createHuman(
  state: Entities,
  initialPosition: Vector2D,
  currentTime: number,
  gender: 'male' | 'female',
  isPlayer: boolean = false,
): HumanEntity {
  const human = createEntity<HumanEntity>(state, 'human', {
    position: initialPosition,
    hunger: HUMAN_INITIAL_HUNGER,
    age: HUMAN_INITIAL_AGE,
    gender,
    isPlayer,
    berries: 0,
    maxBerries: 10, // Maximum berries a human can carry
    maxAge: HUMAN_MAX_AGE_YEARS,
    stateMachine: [HUMAN_IDLE, { enteredAt: currentTime, previousState: undefined }],
  });
  return human;
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
