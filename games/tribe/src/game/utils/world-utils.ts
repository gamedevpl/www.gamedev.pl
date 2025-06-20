import { EntityId, Entity, EntityType } from '../entities/entities-types';
import { Vector2D } from './math-types';
import { calculateWrappedDistance, vectorAdd, vectorDistance } from './math-utils';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_SLOW,
} from '../world-consts';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { PlayerActionHint, PlayerActionType } from '../ui/ui-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';

export function getAvailablePlayerActions(gameState: GameWorldState, player: HumanEntity): PlayerActionHint[] {
  const actions: PlayerActionHint[] = [];

  // Check for Eating
  if (player.food.length > 0 && player.hunger > HUMAN_HUNGER_THRESHOLD_SLOW) {
    actions.push({ type: PlayerActionType.Eat, key: 'f' });
  }

  // Check for Gathering Food
  if (player.food.length < player.maxFood) {
    const gatherBushTarget = findClosestEntity<BerryBushEntity>(
      player,
      gameState,
      'berryBush',
      HUMAN_INTERACTION_RANGE,
      (b) => b.food.length > 0,
    );

    const gatherCorpseTarget = findClosestEntity<HumanCorpseEntity>(
      player,
      gameState,
      'humanCorpse',
      HUMAN_INTERACTION_RANGE,
      (c) => c.food.length > 0,
    );

    let target: BerryBushEntity | HumanCorpseEntity | null = null;
    if (gatherBushTarget && gatherCorpseTarget) {
      target =
        vectorDistance(player.position, gatherBushTarget.position) <=
        vectorDistance(player.position, gatherCorpseTarget.position)
          ? gatherBushTarget
          : gatherCorpseTarget;
    } else {
      target = gatherBushTarget || gatherCorpseTarget;
    }

    if (target) {
      actions.push({ type: PlayerActionType.GatherFood, key: 'e', targetEntity: target });
    }
  }

  // Check for Procreation
  const procreationTarget = findClosestEntity<HumanEntity>(player, gameState, 'human', HUMAN_INTERACTION_RANGE, (h) => {
    const human = h as HumanEntity;
    return (
      (human.id !== player.id &&
        human.gender !== player.gender &&
        human.isAdult &&
        player.isAdult &&
        human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        player.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        (human.procreationCooldown || 0) <= 0 &&
        (player.procreationCooldown || 0) <= 0 &&
        (human.gender === 'female'
          ? !human.isPregnant && human.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE
          : !player.isPregnant && player.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE)) ??
      false
    );
  });
  if (procreationTarget) {
    actions.push({ type: PlayerActionType.Procreate, key: 'r', targetEntity: procreationTarget });
  }

  // Check for Attacking
  const attackTarget = findClosestEntity<HumanEntity>(
    player,
    gameState,
    'human',
    HUMAN_INTERACTION_RANGE,
    (h) => (h as HumanEntity).id !== player.id,
  );
  if (attackTarget) {
    actions.push({ type: PlayerActionType.Attack, key: 'q', targetEntity: attackTarget });
  }

  return actions;
}

export function getRandomNearbyPosition(
  center: Vector2D,
  radius: number,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  const randomAngle = Math.random() * Math.PI * 2;
  const randomDistance = Math.sqrt(Math.random()) * radius;
  const offset = {
    x: Math.cos(randomAngle) * randomDistance,
    y: Math.sin(randomAngle) * randomDistance,
  };
  const newPosition = vectorAdd(center, offset);
  return {
    x: ((newPosition.x % worldWidth) + worldWidth) % worldWidth,
    y: ((newPosition.y % worldHeight) + worldHeight) % worldHeight,
  };
}

export function isPositionOccupied(position: Vector2D, gameState: GameWorldState, checkRadius: number): boolean {
  const indexedState = gameState as IndexedWorldState;
  const searchRect = {
    left: position.x - checkRadius,
    top: position.y - checkRadius,
    right: position.x + checkRadius,
    bottom: position.y + checkRadius,
  };

  const potentialOccupants = [
    ...indexedState.search.human.byRect(searchRect),
    ...indexedState.search.berryBush.byRect(searchRect),
    ...indexedState.search.humanCorpse.byRect(searchRect),
  ];

  for (const entity of potentialOccupants) {
    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (distance < checkRadius) {
      return true;
    }
  }
  return false;
}

export function findClosestEntity<T extends Entity>(
  sourceEntity: Entity,
  gameState: GameWorldState,
  targetType: EntityType,
  maxDistance?: number,
  filterFn?: (entity: T) => boolean,
): T | null {
  const indexedState = gameState as IndexedWorldState;
  const searchRadius =
    maxDistance !== undefined ? maxDistance : Math.max(gameState.mapDimensions.width, gameState.mapDimensions.height);

  const candidates = indexedState.search[targetType].byRadius(sourceEntity.position, searchRadius) as unknown as T[];

  let closestEntity: T | null = null;
  let minDistance = searchRadius;

  for (const entity of candidates) {
    if (entity.id === sourceEntity.id || (filterFn && !filterFn(entity))) {
      continue;
    }

    const distance = calculateWrappedDistance(
      sourceEntity.position,
      entity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestEntity = entity;
    }
  }

  return closestEntity;
}

export function countEntitiesOfTypeInRadius(
  sourcePosition: Vector2D,
  gameState: GameWorldState,
  targetType: EntityType,
  radius: number,
): number {
  const indexedState = gameState as IndexedWorldState;
  return indexedState.search[targetType].byRadius(sourcePosition, radius).length;
}

export function countLivingOffspring(humanId: EntityId, gameState: GameWorldState): number {
  const indexedState = gameState as IndexedWorldState;
  const childrenAsMother = indexedState.search.human.byProperty('motherId', humanId);
  const childrenAsFather = indexedState.search.human.byProperty('fatherId', humanId);
  return childrenAsMother.length + childrenAsFather.length;
}

export function findPotentialNewPartners(
  sourceHuman: HumanEntity,
  gameState: GameWorldState,
  radius: number,
): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const candidates = indexedState.search.human.byRadius(sourceHuman.position, radius);

  return candidates.filter((partner) => {
    if (
      partner.id === sourceHuman.id ||
      partner.gender === sourceHuman.gender ||
      !partner.isAdult ||
      partner.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
      (partner.procreationCooldown || 0) > 0 ||
      (partner.gender === 'female' && partner.isPregnant)
    ) {
      return false;
    }

    const isParentOfSource = partner.id === sourceHuman.motherId || partner.id === sourceHuman.fatherId;
    const isChildOfSource = sourceHuman.id === partner.motherId || sourceHuman.id === partner.fatherId;

    return !isParentOfSource && !isChildOfSource;
  });
}

export function findHeir(potentialHeirs: HumanEntity[]): HumanEntity | undefined {
  if (potentialHeirs.length === 0) {
    return undefined;
  }

  const males = potentialHeirs.filter((h) => h.gender === 'male');
  const females = potentialHeirs.filter((h) => h.gender === 'female');

  const sortFn = (a: HumanEntity, b: HumanEntity) => {
    if (a.age !== b.age) {
      return b.age - a.age;
    }
    return a.id - b.id;
  };

  males.sort(sortFn);
  if (males.length > 0) {
    return males[0];
  }

  females.sort(sortFn);
  if (females.length > 0) {
    return females[0];
  }

  return undefined;
}

export function findPlayerEntity(gameState: GameWorldState): HumanEntity | undefined {
  const indexedState = gameState as IndexedWorldState;
  const players = indexedState.search.human.byProperty('isPlayer', true);
  return players.length > 0 ? players[0] : undefined;
}

export function findChildren(gameState: GameWorldState, parent: HumanEntity): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const childrenAsMother = indexedState.search.human.byProperty('motherId', parent.id);
  const childrenAsFather = indexedState.search.human.byProperty('fatherId', parent.id);
  return [...childrenAsMother, ...childrenAsFather];
}

export function findAggressor(targetId: EntityId, gameState: GameWorldState): HumanEntity | null {
  const indexedState = gameState as IndexedWorldState;
  const potentialAggressors = indexedState.search.human.byProperty('activeAction', 'attacking');
  for (const human of potentialAggressors) {
    if (human.attackTargetId === targetId) {
      return human;
    }
  }
  return null;
}

export function findProcreationThreat(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  const indexedState = gameState as IndexedWorldState;
  if (!human.partnerIds || human.partnerIds.length === 0) {
    return null;
  }

  for (const partnerId of human.partnerIds) {
    const partner = gameState.entities.entities.get(partnerId) as HumanEntity | undefined;
    if (!partner || partner.activeAction !== 'procreating') {
      continue;
    }

    const potentialThreats = indexedState.search.human.byRadius(partner.position, HUMAN_INTERACTION_RANGE * 1.5);

    for (const otherHuman of potentialThreats) {
      if (otherHuman.id !== human.id && otherHuman.id !== partner.id && otherHuman.activeAction === 'procreating') {
        return otherHuman;
      }
    }
  }

  return null;
}

export function areFamily(human1: HumanEntity, human2: HumanEntity, gameState: GameWorldState): boolean {
  if (human1.id === human2.id) return true;

  if (human1.motherId === human2.id || human1.fatherId === human2.id) return true;
  if (human2.motherId === human1.id || human2.fatherId === human1.id) return true;

  const areSiblings =
    (human1.motherId && human1.motherId === human2.motherId) ||
    (human1.fatherId && human1.fatherId === human2.fatherId);
  if (areSiblings) return true;

  if (human1.partnerIds?.includes(human2.id)) return true;

  if (human1.motherId) {
    const mother = gameState.entities.entities.get(human1.motherId) as HumanEntity | undefined;
    if (mother && (mother.motherId === human2.id || mother.fatherId === human2.id)) return true;
  }
  if (human1.fatherId) {
    const father = gameState.entities.entities.get(human1.fatherId) as HumanEntity | undefined;
    if (father && (father.motherId === human2.id || father.fatherId === human2.id)) return true;
  }

  if (human2.motherId) {
    const mother = gameState.entities.entities.get(human2.motherId) as HumanEntity | undefined;
    if (mother && (mother.motherId === human1.id || mother.fatherId === human1.id)) return true;
  }
  if (human2.fatherId) {
    const father = gameState.entities.entities.get(human2.fatherId) as HumanEntity | undefined;
    if (father && (father.motherId === human1.id || father.fatherId === human1.id)) return true;
  }

  return false;
}

export function findParents(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const parents: HumanEntity[] = [];
  if (human.motherId) {
    const mother = gameState.entities.entities.get(human.motherId) as HumanEntity | undefined;
    if (mother) {
      parents.push(mother);
    }
  }
  if (human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father) {
      parents.push(father);
    }
  }
  return parents;
}

export function findMalePartner(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  if (human.gender !== 'female' || !human.partnerIds || human.partnerIds.length === 0) {
    return null;
  }
  for (const partnerId of human.partnerIds) {
    const partner = gameState.entities.entities.get(partnerId) as HumanEntity | undefined;
    if (partner && partner.gender === 'male') return partner;
  }
  return null;
}

export function getFamilyMembers(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const family = new Set<HumanEntity>();

  // Add parents
  if (human.motherId) {
    const mother = gameState.entities.entities.get(human.motherId) as HumanEntity | undefined;
    if (mother) family.add(mother);
  }
  if (human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father) family.add(father);
  }

  // Add partners
  human.partnerIds?.forEach((id) => {
    const partner = gameState.entities.entities.get(id) as HumanEntity | undefined;
    if (partner) family.add(partner);
  });

  // Add children
  findChildren(gameState, human).forEach((child) => family.add(child));

  return Array.from(family);
}
