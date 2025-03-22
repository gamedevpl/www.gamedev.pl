import { CarrionEntity, Entity, EntityId, LionEntity, PreyEntity, HunterEntity } from './entities/entities-types';
import { GameWorldState } from './game-world-types';

export function isLion(entity: Entity): entity is LionEntity {
  return entity.type === 'lion';
}

export function isPlayerLion(entity: Entity): entity is LionEntity {
  return entity.isPlayer === true && entity.type === 'lion';
}

export function getPlayerLion(gameState: GameWorldState): LionEntity | undefined {
  return filteredEntities(gameState, (entity) => isPlayerLion(entity))[0] as LionEntity | undefined;
}

export function filteredEntities(gameState: GameWorldState, fn: (entity: Entity) => boolean) {
  return Array.from(gameState.entities.entities.values()).filter((entity) => fn(entity));
}

export function getEntityById(gameState: GameWorldState, entityId: EntityId): Entity | undefined {
  return filteredEntities(gameState, (entity) => entity.id === entityId)[0];
}

export function getLions(gameState: GameWorldState): LionEntity[] {
  return filteredEntities(gameState, (entity) => entity.type === 'lion') as LionEntity[];
}

export function getPrey(gameState: GameWorldState): PreyEntity[] {
  return filteredEntities(gameState, (entity) => entity.type === 'prey') as PreyEntity[];
}

export function getCarrion(gameState: GameWorldState): CarrionEntity[] {
  return filteredEntities(gameState, (entity) => entity.type === 'carrion') as CarrionEntity[];
}

export function isHunter(entity: Entity): entity is HunterEntity {
  return entity.type === 'hunter';
}

export function getHunters(gameState: GameWorldState): HunterEntity[] {
  return filteredEntities(gameState, (entity) => entity.type === 'hunter') as HunterEntity[];
}