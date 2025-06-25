import { EntityId, Entity, EntityType } from '../entities/entities-types';
import { Vector2D } from './math-types';
import { calculateWrappedDistance, vectorAdd, vectorDistance } from './math-utils';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_ATTACK_RANGE,
  FLAG_TERRITORY_RADIUS,
  AI_FLAG_PLANTING_EDGE_POINTS,
  FLAG_PLANTING_COST,
  FLAG_RADIUS,
} from '../world-consts';
import { BERRY_COST_FOR_PLANTING } from '../world-consts';
import { FoodType } from '../food/food-types';
import { TRIBE_BADGE_EMOJIS } from '../world-consts';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { PlayerActionHint, PlayerActionType } from '../ui/ui-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { FlagEntity } from '../entities/flag/flag-types';

export function isFamilyHeadWithoutLivingFather(human: HumanEntity, gameState: GameWorldState): boolean {
  if (human.gender !== 'male' || !human.isAdult) {
    return false;
  }

  if (human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId);
    if (father) {
      return false; // Father is alive
    }
  }

  return true; // Is an adult male with no living father
}

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
    HUMAN_ATTACK_RANGE,
    (h) => (h as HumanEntity).id !== player.id,
  );
  if (attackTarget) {
    actions.push({ type: PlayerActionType.Attack, key: 'q', targetEntity: attackTarget });
  }

  // Check for Planting Flag
  if (
    player.leaderId === player.id &&
    player.food.filter((f) => f.type === FoodType.Berry).length >= FLAG_PLANTING_COST
  ) {
    actions.push({ type: PlayerActionType.PlantFlag, key: 'x' });
  }

  // Check for Attacking Flag
  const attackFlagTarget = findClosestEntity<FlagEntity>(
    player,
    gameState,
    'flag',
    HUMAN_ATTACK_RANGE,
    (f) => f.leaderId !== player.leaderId,
  );
  if (attackFlagTarget) {
    actions.push({ type: PlayerActionType.AttackFlag, key: 'q', targetEntity: attackFlagTarget });
  }

  // Check for Reclaiming Flag
  const reclaimFlagTarget = findClosestEntity<FlagEntity>(
    player,
    gameState,
    'flag',
    HUMAN_INTERACTION_RANGE,
    (f) => f.leaderId !== player.leaderId,
  );
  if (reclaimFlagTarget) {
    actions.push({ type: PlayerActionType.ReclaimFlag, key: 'c', targetEntity: reclaimFlagTarget });
  }

  // Check for Planting
  if (player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING) {
    actions.push({ type: PlayerActionType.PlantBush, key: 'b' });
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
    ...indexedState.search.flag.byRect(searchRect),
  ];

  for (const entity of potentialOccupants) {
    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (distance < checkRadius + entity.radius) {
      return true;
    }
  }
  return false;
}

export function findValidPlantingSpot(
  center: Vector2D,
  gameState: GameWorldState,
  searchRadius: number,
  spotRadius: number,
): Vector2D | null {
  for (let i = 0; i < 10; i++) {
    const spot = getRandomNearbyPosition(
      center,
      searchRadius,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (!isPositionOccupied(spot, gameState, spotRadius) && !getTerritoryOwner(spot, gameState)) {
      return spot;
    }
  }
  return null;
}

export function findOptimalFlagPlantingSpot(human: HumanEntity, gameState: GameWorldState): Vector2D | null {
  const indexedState = gameState as IndexedWorldState;
  if (!human.leaderId) {
    return null;
  }

  const tribeFlags = indexedState.search.flag.byProperty('leaderId', human.leaderId);

  // If no flags exist, find a spot nearby deterministically.
  if (tribeFlags.length === 0) {
    const offsets = [
      { x: 0, y: 0 }, // Check current position first
      // Cardinal directions
      { x: 0, y: -HUMAN_INTERACTION_RANGE },
      { x: HUMAN_INTERACTION_RANGE, y: 0 },
      { x: 0, y: HUMAN_INTERACTION_RANGE },
      { x: -50, y: 0 },
      // Diagonal directions
      { x: -HUMAN_INTERACTION_RANGE / 2, y: -HUMAN_INTERACTION_RANGE / 2 },
      { x: HUMAN_INTERACTION_RANGE / 2, y: -HUMAN_INTERACTION_RANGE / 2 },
      { x: HUMAN_INTERACTION_RANGE / 2, y: HUMAN_INTERACTION_RANGE / 2 },
      { x: -HUMAN_INTERACTION_RANGE / 2, y: HUMAN_INTERACTION_RANGE / 2 },
    ];

    for (const offset of offsets) {
      const spot = vectorAdd(human.position, offset);
      // Ensure spot is within world bounds
      spot.x =
        ((spot.x % gameState.mapDimensions.width) + gameState.mapDimensions.width) % gameState.mapDimensions.width;
      spot.y =
        ((spot.y % gameState.mapDimensions.height) + gameState.mapDimensions.height) % gameState.mapDimensions.height;

      if (
        !isPositionOccupied(spot, gameState, FLAG_RADIUS) &&
        !isPositionInEnemyTerritory(spot, human.leaderId, gameState)
      ) {
        return spot; // Found a valid spot
      }
    }
    return null; // No suitable spot found nearby
  }

  // Try to find a spot adjacent to an existing flag
  for (const flag of tribeFlags) {
    for (let i = 0; i < AI_FLAG_PLANTING_EDGE_POINTS; i++) {
      const angle = (i / AI_FLAG_PLANTING_EDGE_POINTS) * 2 * Math.PI;
      const spot = {
        x: flag.position.x + Math.cos(angle) * FLAG_TERRITORY_RADIUS,
        y: flag.position.y + Math.sin(angle) * FLAG_TERRITORY_RADIUS,
      };

      // Check if spot is inside another of our flags' territory
      const isInsideOtherFriendlyTerritory = tribeFlags.some(
        (otherFlag) =>
          otherFlag.id !== flag.id && isPositionInTerritory(spot, otherFlag.position, otherFlag.territoryRadius),
      );

      if (isInsideOtherFriendlyTerritory) {
        continue;
      }

      // Check if the spot is occupied (using flag's physical radius) or in enemy territory
      if (
        !isPositionOccupied(spot, gameState, FLAG_RADIUS) &&
        !isPositionInEnemyTerritory(spot, human.leaderId, gameState)
      ) {
        return spot; // Found a valid spot
      }
    }
  }

  // Fallback: No adjacent spot found.
  return null;
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

export function findClosestAggressor(targetId: EntityId, gameState: GameWorldState): HumanEntity | null {
  const indexedState = gameState as IndexedWorldState;
  const potentialAggressors = indexedState.search.human.byProperty('activeAction', 'attacking');
  let closestAggressor: HumanEntity | null = null;
  let minDistance = Infinity;
  for (const human of potentialAggressors) {
    if (human.attackTargetId !== targetId) {
      continue; // Only consider aggressors targeting the specified entity
    }
    const distance = calculateWrappedDistance(
      human.position,
      gameState.entities.entities.get(targetId)?.position || { x: 0, y: 0 },
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (distance < minDistance) {
      closestAggressor = human as HumanEntity;
      minDistance = distance;
    }
  }
  return closestAggressor;
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

export function isLineage(human1: HumanEntity, human2: HumanEntity): boolean {
  if (human1.id === human2.id) return true;

  if (human1.motherId === human2.id || human1.fatherId === human2.id) return true;
  if (human2.motherId === human1.id || human2.fatherId === human1.id) return true;

  const isChildOfHuman1 = human1.motherId === human2.motherId || human1.fatherId === human2.fatherId;
  const isChildOfHuman2 = human2.motherId === human1.motherId || human2.fatherId === human1.fatherId;

  const isCommonAncestor =
    human1.ancestorIds?.some((ancestorId) => human2.ancestorIds.includes(ancestorId)) ||
    human2.ancestorIds?.some((ancestorId) => human1.ancestorIds.includes(ancestorId));

  return isChildOfHuman1 || isChildOfHuman2 || isCommonAncestor;
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

export function getAdultFamilyMembers(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const family = new Set<HumanEntity>();

  // Add self
  if (human.isAdult) {
    family.add(human);
  }

  // Add parents
  if (human.motherId) {
    const mother = gameState.entities.entities.get(human.motherId) as HumanEntity | undefined;
    if (mother?.isAdult) family.add(mother);
  }
  if (human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father?.isAdult) family.add(father);
  }

  // Add partners
  human.partnerIds?.forEach((id) => {
    const partner = gameState.entities.entities.get(id) as HumanEntity | undefined;
    if (partner?.isAdult) family.add(partner);
  });

  // Add adult children
  findChildren(gameState, human).forEach((child) => {
    if (child.isAdult) {
      family.add(child);
    }
  });

  return Array.from(family);
}

export function findBestAttackTarget(
  sourceHuman: HumanEntity,
  gameState: GameWorldState,
  maxDistance: number,
  filterFn?: (entity: HumanEntity) => boolean,
): HumanEntity | null {
  const indexedState = gameState as IndexedWorldState;
  const potentialTargets = indexedState.search.human.byRadius(sourceHuman.position, maxDistance) as HumanEntity[];

  let bestTarget: HumanEntity | null = null;
  let minAttackers = Infinity;
  let minDistance = Infinity;

  for (const target of potentialTargets) {
    if (target.id === sourceHuman.id || (filterFn && !filterFn(target))) {
      continue;
    }

    // Count current attackers on this target
    let currentAttackers = 0;
    for (const entity of gameState.entities.entities.values()) {
      if (entity.type === 'human' && (entity as HumanEntity).attackTargetId === target.id) {
        currentAttackers++;
      }
    }

    const distance = calculateWrappedDistance(
      sourceHuman.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    // Prioritize targets with fewer attackers, then by distance
    if (currentAttackers < minAttackers || (currentAttackers === minAttackers && distance < minDistance)) {
      minAttackers = currentAttackers;
      minDistance = distance;
      bestTarget = target;
    }
  }

  return bestTarget;
}

let emojiIndex = 0;

/**
 * Generates a unique tribe badge emoji.
 */
export function generateTribeBadge(): string {
  const badge = TRIBE_BADGE_EMOJIS[emojiIndex];
  emojiIndex = (emojiIndex + 1) % TRIBE_BADGE_EMOJIS.length;
  return badge;
}

export function propagateNewLeaderToDescendants(
  newLeader: HumanEntity,
  human: HumanEntity,
  gameState: GameWorldState,
): void {
  human.leaderId = newLeader.id; // Set the new leader for this human
  human.tribeBadge = newLeader.tribeBadge; // Update tribe badge to match new leader

  // Recursively propagate to children
  if (human.gender === 'male') {
    findChildren(gameState, human).forEach((child) => {
      propagateNewLeaderToDescendants(newLeader, child, gameState);
      if (child.motherId && human.partnerIds?.includes(child.motherId)) {
        // If the child is from the same family, propagate to the mother as long as she is currently partnered with the father
        const mother = gameState.entities.entities.get(child.motherId) as HumanEntity | undefined;
        if (mother) {
          mother.leaderId = newLeader.id; // Set the new leader for the mother
          mother.tribeBadge = newLeader.tribeBadge; // Update tribe badge to match new leader
        }
      }
    });
  }
}

export function isPositionInTerritory(position: Vector2D, territoryCenter: Vector2D, territoryRadius: number): boolean {
  return vectorDistance(position, territoryCenter) <= territoryRadius;
}

export function getTerritoryOwner(position: Vector2D, gameState: GameWorldState): HumanEntity | null {
  const flags = (gameState as IndexedWorldState).search.flag.byRadius(position, 1) as FlagEntity[];

  for (const flag of flags) {
    if (isPositionInTerritory(position, flag.position, flag.territoryRadius)) {
      return gameState.entities.entities.get(flag.leaderId) as HumanEntity | null;
    }
  }

  return null;
}

export function isPositionInEnemyTerritory(
  position: Vector2D,
  playerLeaderId: EntityId | undefined,
  gameState: GameWorldState,
): boolean {
  const flags = (gameState as IndexedWorldState).search.flag.byRadius(position, 1) as FlagEntity[];

  for (const flag of flags) {
    if (isPositionInTerritory(position, flag.position, flag.territoryRadius) && flag.leaderId !== playerLeaderId) {
      return true; // Position is in enemy territory
    }
  }

  return false; // Position is not in enemy territory
}
