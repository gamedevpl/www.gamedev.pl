import { EntityId, Entity, EntityType } from '../entities/entities-types';
import { Vector2D } from './math-types';
import { calculateWrappedDistance, vectorAdd, getAveragePosition } from './math-utils';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_ATTACK_RANGE,
  BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
  AI_PLANTING_SEARCH_RADIUS,
  PLAYER_CALL_TO_ATTACK_RADIUS,
  TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
  TRIBE_SPLIT_MOVE_AWAY_DISTANCE,
} from '../world-consts';
import {
  LEADER_HABITAT_SCORE_BUSH_WEIGHT,
  LEADER_HABITAT_SCORE_DANGER_WEIGHT,
  LEADER_WORLD_ANALYSIS_GRID_SIZE,
} from '../world-consts';
import { BERRY_COST_FOR_PLANTING } from '../world-consts';
import { FoodType } from '../food/food-types';
import { TRIBE_BADGE_EMOJIS } from '../world-consts';
import { GameWorldState, UpdateContext } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { PlayerActionHint, PlayerActionType, TribeInfo } from '../ui/ui-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

export function getAvailablePlayerActions(gameState: GameWorldState, player: HumanEntity): PlayerActionHint[] {
  const actions: PlayerActionHint[] = [];
  const indexedState = gameState as IndexedWorldState;

  // Check for Eating
  if (player.food.length > 0 && player.hunger > HUMAN_HUNGER_THRESHOLD_SLOW) {
    actions.push({ type: PlayerActionType.Eat, action: 'eating', key: 'f' });
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
        calculateWrappedDistance(
          player.position,
          gatherBushTarget.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        ) <=
        calculateWrappedDistance(
          player.position,
          gatherCorpseTarget.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        )
          ? gatherBushTarget
          : gatherCorpseTarget;
    } else {
      target = gatherBushTarget || gatherCorpseTarget;
    }

    if (target) {
      actions.push({ type: PlayerActionType.GatherFood, action: 'gathering', key: 'e', targetEntity: target });
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
    actions.push({
      type: PlayerActionType.Procreate,
      action: 'procreating',
      key: 'r',
      targetEntity: procreationTarget,
    });
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
    actions.push({ type: PlayerActionType.Attack, action: 'attacking', key: 'q', targetEntity: attackTarget });
  }

  // Check for Planting
  if (player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING) {
    actions.push({ type: PlayerActionType.PlantBush, action: 'planting', key: 'b' });
  }

  // Check for Call to Attack
  if (player.leaderId === player.id && !player.isCallingToAttack) {
    const nearbyEnemies = findNearbyEnemiesOfTribe(
      player.position,
      player.id,
      indexedState,
      PLAYER_CALL_TO_ATTACK_RADIUS,
    );
    if (nearbyEnemies.length > 0) {
      actions.push({ type: PlayerActionType.CallToAttack, action: 'callingToAttack', key: 'v' });
    }
  }

  // Check for Tribe Split
  if (canSplitTribe(player, gameState).canSplit) {
    actions.push({ type: PlayerActionType.TribeSplit, action: 'tribeSplitting', key: 'k' });
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

export function isPositionOccupied(
  position: Vector2D,
  gameState: GameWorldState,
  checkRadius: number,
  ignoreEntityId?: EntityId, // New optional parameter
): boolean {
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
    // Ignore the specified entity if provided
    if (ignoreEntityId !== undefined && entity.id === ignoreEntityId) {
      continue;
    }

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
  ignoreEntityId?: EntityId, // New optional parameter
): Vector2D | null {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // First, check the center spot itself, ignoring the specified entity.
  if (!isPositionOccupied(center, gameState, spotRadius, ignoreEntityId)) {
    return center;
  }

  // Then, check in expanding concentric circles (approximated by polygons)
  const step = spotRadius; // The distance between each check point circle.
  for (let r = step; r <= searchRadius; r += step) {
    const pointsOnCircle = Math.ceil((2 * Math.PI * r) / step); // Number of points to check on the circle
    for (let i = 0; i < pointsOnCircle; i++) {
      const angle = (i / pointsOnCircle) * 2 * Math.PI;
      const offset = {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      };
      const spot = vectorAdd(center, offset);
      const wrappedSpot = {
        x: ((spot.x % worldWidth) + worldWidth) % worldWidth,
        y: ((spot.y % worldHeight) + worldHeight) % worldHeight,
      };

      // Pass the ignoreEntityId to the occupancy check
      if (!isPositionOccupied(wrappedSpot, gameState, spotRadius, ignoreEntityId)) {
        return wrappedSpot;
      }
    }
  }

  return null;
}

export function findOptimalBushPlantingSpot(human: HumanEntity, gameState: GameWorldState): Vector2D | null {
  // Find the closest bush owned by this human
  const closestOwnedBush = findClosestEntity<BerryBushEntity>(
    human,
    gameState,
    'berryBush',
    undefined, // Search the whole map
    (bush) => bush.ownerId === human.id,
  );

  if (!closestOwnedBush) {
    // If the human doesn't own any bushes, they can't plant a new one based on proximity to an existing one.
    // They must first claim a wild bush by gathering from it.
    return null;
  }

  // Find a valid spot near the owned bush, ignoring the owned bush itself.
  const spot = findValidPlantingSpot(
    closestOwnedBush.position,
    gameState,
    AI_PLANTING_SEARCH_RADIUS,
    BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
    closestOwnedBush.id, // Pass the ID of the owned bush to ignore
  );
  return spot;
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

export function findFamilyPatriarch(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  // Children follow their father
  if (!human.isAdult && human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father && father.type === 'human') {
      return father;
    }
  }

  // Adult females follow their male partner
  if (human.isAdult && human.gender === 'female' && human.partnerIds && human.partnerIds.length > 0) {
    // This reuses the existing logic to find the first male partner
    return findMalePartner(human, gameState);
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

export function findSafeTribeSplitLocation(
  originalTribeCenter: Vector2D,
  human: HumanEntity,
  gameState: GameWorldState,
): Vector2D | null {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;
  const checkRadius = human.radius * 2; // Clearance needed for the spot

  // Start searching from the minimum distance and expand outwards
  for (let r = TRIBE_SPLIT_MOVE_AWAY_DISTANCE; r < worldWidth / 2; r += 50) {
    // Try a few random positions at this radius
    for (let i = 0; i < 10; i++) {
      const spot = getRandomNearbyPosition(originalTribeCenter, r, worldWidth, worldHeight);

      // Check if the spot is far enough from the center
      const distanceFromCenter = calculateWrappedDistance(
        originalTribeCenter,
        spot,
        worldWidth,
        worldHeight,
      );

      if (distanceFromCenter < TRIBE_SPLIT_MOVE_AWAY_DISTANCE) {
        continue; // Not far enough, try another spot
      }

      if (!isPositionOccupied(spot, gameState, checkRadius, human.id)) {
        return spot; // Found a safe and unoccupied spot
      }
    }
  }

  return null; // No suitable location found
}

export function findDescendants(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const descendants = new Map<EntityId, HumanEntity>();

  function find(currentHuman: HumanEntity) {
    const children = findChildren(gameState, currentHuman);
    for (const child of children) {
      if (!descendants.has(child.id)) {
        descendants.set(child.id, child);
        find(child); // Recurse
      }
    }
  }

  find(human);
  return Array.from(descendants.values());
}

export function canSplitTribe(human: HumanEntity, gameState: GameWorldState): { canSplit: boolean; progress?: number } {
  if (!human.isAdult || human.gender !== 'male' || human.leaderId === human.id || !human.leaderId) {
    return { canSplit: false };
  }

  if (!human.leaderId) {
    return { canSplit: false }; // Not in a tribe, can't split
  }

  const leader = gameState.entities.entities.get(human.leaderId) as HumanEntity | undefined;
  if (!leader || leader.type !== 'human') {
    return { canSplit: false }; // Leader is not a human or doesn't exist
  }

  const heir = findHeir(findChildren(gameState, leader));
  if (heir && heir.id === human.id) {
    return { canSplit: false }; // The human is already the heir, no need to split
  }

  const currentTribeMembers = findTribeMembers(human.leaderId, gameState);
  if (currentTribeMembers.length < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    return { canSplit: false };
  }

  const descendants = findDescendants(human, gameState);
  const familySize = descendants.length + 1; // +1 for the leader himself

  const requiredSize = currentTribeMembers.length * TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE;

  return { canSplit: familySize >= requiredSize, progress: familySize / requiredSize };
}

export function performTribeSplit(human: HumanEntity, gameState: GameWorldState): void {
  if (!canSplitTribe(human, gameState).canSplit) {
    return;
  }

  const newTribeBadge = generateTribeBadge();
  const descendants = findDescendants(human, gameState);

  // The founder becomes the new leader
  human.leaderId = human.id;
  human.tribeBadge = newTribeBadge;

  // Update all descendants
  for (const descendant of descendants) {
    descendant.leaderId = human.id;
    descendant.tribeBadge = newTribeBadge;
  }

  // Play sound
  const updateContext: UpdateContext = { gameState, deltaTime: 0 };
  playSoundAt(updateContext, SoundType.TribeSplit, human.position);
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

export function findTribeMembers(leaderId: EntityId, gameState: GameWorldState): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  return indexedState.search.human.byProperty('leaderId', leaderId);
}

export function findNearbyEnemiesOfTribe(
  center: Vector2D,
  leaderId: EntityId,
  gameState: IndexedWorldState,
  radius: number,
): HumanEntity[] {
  const nearbyHumans = gameState.search.human.byRadius(center, radius);
  return nearbyHumans.filter((human) => human.leaderId !== leaderId && human.id !== leaderId);
}

export function countTribeAttackersOnTarget(
  tribeLeaderId: EntityId,
  targetId: EntityId,
  gameState: IndexedWorldState,
): number {
  const tribeMembers = gameState.search.human.byProperty('leaderId', tribeLeaderId);
  let count = 0;
  for (const member of tribeMembers) {
    if (member.attackTargetId === targetId) {
      count++;
    }
  }
  return count;
}

export function getTribesInfo(gameState: GameWorldState, playerLeaderId?: EntityId): TribeInfo[] {
  const tribes: Map<EntityId, { leaderId: EntityId; tribeBadge: string; members: HumanEntity[] }> = new Map();

  const humans = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'human') as HumanEntity[];

  for (const human of humans) {
    if (human.leaderId) {
      if (!tribes.has(human.leaderId)) {
        tribes.set(human.leaderId, {
          leaderId: human.leaderId,
          tribeBadge: human.tribeBadge || '?',
          members: [],
        });
      }
      tribes.get(human.leaderId)?.members.push(human);
    }
  }

  const tribeInfoList: TribeInfo[] = Array.from(tribes.values()).map((tribe) => {
    const leader = gameState.entities.entities.get(tribe.leaderId) as HumanEntity | undefined;
    const adultCount = tribe.members.filter((m) => m.isAdult).length;
    const childCount = tribe.members.length - adultCount;

    return {
      leaderId: tribe.leaderId,
      tribeBadge: tribe.tribeBadge,
      adultCount,
      childCount,
      isPlayerTribe: tribe.leaderId === playerLeaderId,
      leaderAge: leader?.age ?? 0,
      leaderGender: leader?.gender ?? 'male',
    };
  });

  // Sort the list: player's tribe first, then by total member count descending
  tribeInfoList.sort((a, b) => {
    if (a.isPlayerTribe) return -1;
    if (b.isPlayerTribe) return 1;
    return b.adultCount + b.childCount - (a.adultCount + a.childCount);
  });

  return tribeInfoList;
}

export function getTribeForLeader(leaderId: EntityId, gameState: IndexedWorldState): HumanEntity[] {
  const tribeMembers = gameState.search.human.byProperty('leaderId', leaderId);
  const leader = gameState.entities.entities.get(leaderId) as HumanEntity | undefined;
  if (leader) {
    // Ensure the leader is included if they are managing their own tribe
    if (!tribeMembers.some((m) => m.id === leaderId)) {
      tribeMembers.push(leader);
    }
  }
  return tribeMembers;
}

export function calculateHabitabilityScore(
  position: Vector2D,
  radius: number,
  gameState: IndexedWorldState,
  evaluatingTribeId: EntityId,
): { score: number; occupyingTribeId?: EntityId } {
  const bushes = gameState.search.berryBush.byRadius(position, radius);
  const enemies = gameState.search.human.byRadius(position, radius).filter((h) => h.leaderId !== evaluatingTribeId);

  let score = bushes.length * LEADER_HABITAT_SCORE_BUSH_WEIGHT;
  score += enemies.length * LEADER_HABITAT_SCORE_DANGER_WEIGHT;

  let occupyingTribeId: EntityId | undefined;
  if (enemies.length > 0) {
    const enemyTribeCounts: Record<EntityId, number> = {};
    for (const enemy of enemies) {
      if (enemy.leaderId) {
        enemyTribeCounts[enemy.leaderId] = (enemyTribeCounts[enemy.leaderId] || 0) + 1;
      }
    }
    let maxCount = 0;
    for (const tribeId in enemyTribeCounts) {
      if (enemyTribeCounts[tribeId] > maxCount) {
        maxCount = enemyTribeCounts[tribeId];
        occupyingTribeId = parseInt(tribeId, 10);
      }
    }
  }

  return { score, occupyingTribeId };
}

export function findBestHabitat(
  gameState: IndexedWorldState,
  evaluatingTribeId: EntityId,
  gridStep: number,
): { position: Vector2D; score: number; occupyingTribeId?: EntityId } | null {
  let bestScore = -Infinity;
  let bestHabitat: { position: Vector2D; score: number; occupyingTribeId?: EntityId } | null = null;

  for (let x = 0; x < gameState.mapDimensions.width; x += gridStep) {
    for (let y = 0; y < gameState.mapDimensions.height; y += gridStep) {
      const position = { x, y };
      const { score, occupyingTribeId } = calculateHabitabilityScore(
        position,
        LEADER_WORLD_ANALYSIS_GRID_SIZE / 2,
        gameState,
        evaluatingTribeId,
      );

      if (score > bestScore) {
        bestScore = score;
        bestHabitat = { position, score, occupyingTribeId };
      }
    }
  }

  return bestHabitat;
}

export function calculateTribeStrength(tribeMembers: HumanEntity[]): number {
  return tribeMembers
    .filter((m) => m.isAdult)
    .reduce((total, member) => {
      let strength = member.hitpoints;
      strength += (member.maxAge - member.age) * 0.5; // Younger members are slightly stronger
      strength += member.food.length * 2; // Well-fed members are stronger
      return total + strength;
    }, 0);
}

export function isTribeUnderAttack(tribeMembers: HumanEntity[], gameState: IndexedWorldState): boolean {
  for (const member of tribeMembers) {
    const aggressors = gameState.search.human
      .byProperty('attackTargetId', member.id)
      .filter((attacker) => attacker.leaderId !== member.leaderId);
    if (aggressors.length > 0) {
      return true;
    }
  }
  return false;
}

export function findAllHumans(gameState: GameWorldState): HumanEntity[] {
  return Array.from(gameState.entities.entities.values()).filter((entity) => entity.type === 'human') as HumanEntity[];
}

export function getTribeCenter(leaderId: EntityId, gameState: GameWorldState): Vector2D {
  const tribeMembers = findTribeMembers(leaderId, gameState);
  if (tribeMembers.length === 0) {
    const leader = gameState.entities.entities.get(leaderId);
    return leader ? leader.position : { x: 0, y: 0 };
  }
  const positions = tribeMembers.map((member) => member.position);
  return getAveragePosition(positions);
}

export function getFamilyCenter(human: HumanEntity, gameState: GameWorldState): Vector2D {
  const familyMembers = getFamilyMembers(human, gameState);
  const positions = [...familyMembers, human].map((member) => member.position);
  return getAveragePosition(positions);
}
