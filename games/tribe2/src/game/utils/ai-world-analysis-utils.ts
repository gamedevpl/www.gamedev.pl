import {
  AI_DEFEND_BUSH_PREY_SEARCH_RADIUS,
  AI_DESPERATE_ATTACK_SEARCH_RADIUS,
  AI_DESPERATE_ATTACK_TARGET_MAX_HP_PERCENT,
  AI_MIGRATION_TARGET_SEARCH_RADIUS,
  LEADER_HABITAT_SCORE_BUSH_WEIGHT,
  LEADER_HABITAT_SCORE_DANGER_WEIGHT,
  LEADER_MIGRATION_SUPERIORITY_THRESHOLD,
  LEADER_WORLD_ANALYSIS_GRID_SIZE,
  LEADER_WORLD_ANALYSIS_GRID_STEP,
} from '../ai-consts.ts';
import { AI_PLANTING_SEARCH_RADIUS, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../berry-bush-consts.ts';
import { HUMAN_INTERACTION_RANGE, MAX_ATTACKERS_PER_TARGET } from '../human-consts.ts';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { EntityId } from '../entities/entities-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance } from './math-utils';
import { Vector2D } from './math-types';
import { areFamily, getFamilyMembers, getTribeMembers, isLineage } from './family-tribe-utils';
import { findClosestEntity } from './entity-finder-utils';
import { findValidPlantingSpot, getTribeCenter, isPositionOccupied } from './spatial-utils';
import { isHostile } from './world-utils';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { BuildingEntity, BuildingType } from '../entities/buildings/building-types';

/**
 * Checks if a human's primary partner is procreating with another human nearby.
 * @returns The stranger the partner is procreating with, otherwise undefined.
 */
export function findPartnerProcreatingWithStranger(
  human: HumanEntity,
  gameState: IndexedWorldState,
  radius: number,
): HumanEntity | undefined {
  const potentialTargets = gameState.search.human.byRadius(human.position, radius).filter((target) => {
    return (
      target.activeAction === 'procreating' &&
      target.gender === human.gender &&
      typeof target.target === 'number' &&
      human.partnerIds?.includes(target.target)
    );
  });

  return potentialTargets[0];
}

/**
 * Finds a human from another tribe gathering from a bush claimed by the given human's tribe.
 * @returns The intruder entity, otherwise undefined.
 */
export function findIntruderOnClaimedBush(
  human: HumanEntity,
  gameState: GameWorldState,
  radius: number,
): HumanEntity | undefined {
  if (!human.leaderId) {
    return undefined; // Not in a tribe, cannot have claimed bushes
  }

  const indexedState = gameState as IndexedWorldState;
  const nearbyBushes = indexedState.search.berryBush
    .byRadius(human.position, radius)
    .filter((bush) => bush.ownerId === human.id);

  for (const bush of nearbyBushes) {
    // Check if the bush is owned by the human's tribe
    if (bush.claimedUntil && gameState.time < bush.claimedUntil) {
      // This is a tribe-claimed bush. Now check for intruders.
      const potentialIntruders = indexedState.search.human.byRadius(bush.position, HUMAN_INTERACTION_RANGE);

      for (const potentialIntruder of potentialIntruders) {
        if (
          !isLineage(potentialIntruder, human) && // Not from the same tribe
          potentialIntruder.activeAction === 'gathering' &&
          potentialIntruder.target === bush.id
        ) {
          return potentialIntruder; // Found an intruder!
        }
      }
    }
  }

  return undefined;
}

/**
 * Finds a close family member (parent, partner, child) who is under attack by an outsider.
 * @returns An object containing the family member and the aggressor, otherwise undefined.
 */
export function findFamilyMemberUnderAttack(
  human: HumanEntity,
  gameState: GameWorldState,
  radius: number,
): { familyMember: HumanEntity; aggressor: HumanEntity } | undefined {
  const family = getFamilyMembers(human, gameState);
  const indexedState = gameState as IndexedWorldState;

  for (const familyMember of family) {
    const distanceToFamilyMember = calculateWrappedDistance(
      human.position,
      familyMember.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distanceToFamilyMember > radius) {
      continue;
    }

    // Find anyone attacking this family member
    const potentialAggressors = indexedState.search.human.byProperty('attackTargetId', familyMember.id);
    for (const aggressor of potentialAggressors) {
      // An aggressor is from a different tribe (or has no tribe if defender has one)
      if (aggressor.leaderId !== human.leaderId) {
        return { familyMember, aggressor };
      }
    }
  }

  return undefined;
}

/**
 * Finds the closest, weakest, non-family human to attack out of desperation.
 * @returns The target entity, otherwise undefined.
 */
export function findWeakCannibalismTarget(human: HumanEntity, gameState: GameWorldState): HumanEntity | undefined {
  const indexedState = gameState as IndexedWorldState;
  const nearbyHumans = indexedState.search.human.byRadius(human.position, AI_DESPERATE_ATTACK_SEARCH_RADIUS);

  let bestTarget: HumanEntity | undefined = undefined;
  let minDistance = Infinity;

  for (const target of nearbyHumans) {
    if (
      target.id === human.id ||
      target.hitpoints <= 0 ||
      target.hitpoints / target.maxHitpoints > AI_DESPERATE_ATTACK_TARGET_MAX_HP_PERCENT ||
      areFamily(human, target, gameState)
    ) {
      continue;
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < minDistance) {
      minDistance = distance;
      bestTarget = target;
    }
  }

  return bestTarget;
}

export function findOptimalBushPlantingSpot(human: HumanEntity, gameState: GameWorldState): Vector2D | null {
  // Find the closest bush owned by this human
  const closestOwnedBush = findClosestEntity<BerryBushEntity>(
    human,
    gameState,
    'berryBush',
    AI_PLANTING_SEARCH_RADIUS,
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

export function findBestAttackTarget<T extends HumanEntity | PreyEntity>(
  sourceHuman: HumanEntity,
  gameState: GameWorldState,
  targetType: 'human' | 'prey',
  maxDistance: number,
  filterFn?: (entity: T) => boolean,
): T | null {
  const indexedState = gameState as IndexedWorldState;
  const potentialTargets = indexedState.search[targetType].byRadius(sourceHuman.position, maxDistance) as T[];

  let bestTarget: T | null = null;
  let minAttackers = Infinity;
  let minDistance = Infinity;

  for (const target of potentialTargets) {
    if (target.id === sourceHuman.id || (filterFn && !filterFn(target))) {
      continue;
    }

    // Count current attackers on this target
    let currentAttackers = 0;
    for (const entity of Object.values(gameState.entities.entities)) {
      if (entity.type === 'human' && (entity as HumanEntity).attackTargetId === target.id) {
        currentAttackers++;
      }
    }

    if (currentAttackers >= MAX_ATTACKERS_PER_TARGET) {
      continue; // Skip targets that are already sufficiently engaged
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
export function findNearbyEnemiesOfTribe(
  human: HumanEntity,
  gameState: IndexedWorldState,
  radius: number,
): HumanEntity[] {
  const nearbyHumans = gameState.search.human.byRadius(human.position, radius);
  return nearbyHumans.filter((h) => isHostile(human, h, gameState));
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

export function findOptimalMigrationTarget(leader: HumanEntity, gameState: GameWorldState): Vector2D | null {
  if (leader.id !== leader.leaderId) {
    return null;
  }

  const indexedState = gameState as IndexedWorldState;
  const currentTribeCenter = getTribeCenter(leader.id, gameState);
  const { score: currentScore } = calculateHabitabilityScore(
    currentTribeCenter,
    LEADER_WORLD_ANALYSIS_GRID_SIZE / 2,
    indexedState,
    leader.id,
  );

  let bestCandidate: Vector2D | null = null;
  let bestScore = currentScore;

  const gridStep = LEADER_WORLD_ANALYSIS_GRID_STEP;
  const searchRadius = AI_MIGRATION_TARGET_SEARCH_RADIUS;

  // Search in a grid around the leader
  for (let x = leader.position.x - searchRadius; x < leader.position.x + searchRadius; x += gridStep) {
    for (let y = leader.position.y - searchRadius; y < leader.position.y + searchRadius; y += gridStep) {
      const position = {
        x: ((x % gameState.mapDimensions.width) + gameState.mapDimensions.width) % gameState.mapDimensions.width,
        y: ((y % gameState.mapDimensions.height) + gameState.mapDimensions.height) % gameState.mapDimensions.height,
      };

      const distanceFromCurrent = calculateWrappedDistance(
        currentTribeCenter,
        position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      // Don't consider spots too close to the current location
      if (distanceFromCurrent < LEADER_WORLD_ANALYSIS_GRID_SIZE * 2) {
        continue;
      }

      const { score: newScore } = calculateHabitabilityScore(
        position,
        LEADER_WORLD_ANALYSIS_GRID_SIZE / 2,
        indexedState,
        leader.id,
      );

      // Check if the new spot is significantly better and the best one so far
      if (newScore > bestScore * LEADER_MIGRATION_SUPERIORITY_THRESHOLD) {
        bestScore = newScore;
        bestCandidate = position;
      }
    }
  }

  return bestCandidate;
}

/**
 * Finds a prey entity that is currently eating from a berry bush claimed by the human's tribe.
 * @returns The prey entity, otherwise undefined.
 */
export function findPreyOnClaimedBush(human: HumanEntity, gameState: GameWorldState): PreyEntity | undefined {
  const indexedState = gameState as IndexedWorldState;
  const tribeMembers = getTribeMembers(human, gameState);
  const tribeMemberIds = new Set(tribeMembers.map((m) => m.id));

  const nearbyBushes = indexedState.search.berryBush.byRadius(human.position, AI_DEFEND_BUSH_PREY_SEARCH_RADIUS);

  for (const bush of nearbyBushes) {
    // Check if the bush is owned by the human's tribe
    if (bush.ownerId && tribeMemberIds.has(bush.ownerId) && bush.claimedUntil && gameState.time < bush.claimedUntil) {
      // This is a tribe-claimed bush. Now check for prey eating from it.
      const potentialPrey = indexedState.search.prey.byRadius(bush.position, HUMAN_INTERACTION_RANGE);

      for (const prey of potentialPrey) {
        if (prey.activeAction === 'grazing' && prey.target === bush.id) {
          return prey; // Found a prey eating from a claimed bush!
        }
      }
    }
  }

  return undefined;
}

/**
 * Checks if a position is within the rectangular bounds of a building zone,
 * accounting for world wrapping (toroidal world).
 */
export function isPositionInZone(position: Vector2D, zone: BuildingEntity, gameState: GameWorldState): boolean {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // Calculate relative position accounting for wrapping
  let dx = position.x - zone.position.x;
  let dy = position.y - zone.position.y;

  // Handle wrapping
  if (Math.abs(dx) > worldWidth / 2) dx -= Math.sign(dx) * worldWidth;
  if (Math.abs(dy) > worldHeight / 2) dy -= Math.sign(dy) * worldHeight;

  return Math.abs(dx) <= zone.width / 2 && Math.abs(dy) <= zone.height / 2;
}

/**
 * Calculates the maximum number of bushes that can fit in a planting zone
 * based on its dimensions and required clearance radius.
 */
export function calculatePlantingZoneCapacity(zone: BuildingEntity): number {
  const diameter = BERRY_BUSH_PLANTING_CLEARANCE_RADIUS * 2;
  const cols = Math.floor(zone.width / diameter);
  const rows = Math.floor(zone.height / diameter);
  return Math.max(1, cols * rows); // At least 1 bush can fit
}

/**
 * Counts the number of berry bushes currently within a planting zone.
 */
export function countBushesInZone(zone: BuildingEntity, gameState: GameWorldState): number {
  const indexedState = gameState as IndexedWorldState;

  // Search for bushes in a radius that covers the zone
  const searchRadius = Math.sqrt(zone.width * zone.width + zone.height * zone.height) / 2;
  const nearbyBushes = indexedState.search.berryBush.byRadius(zone.position, searchRadius);

  // Filter to only bushes actually within the zone bounds
  return nearbyBushes.filter((bush) => isPositionInZone(bush.position, zone, gameState)).length;
}

/**
 * Gets all planting zones belonging to the human's tribe.
 */
export function getTribePlantingZones(human: HumanEntity, gameState: GameWorldState): BuildingEntity[] {
  // If the human has no tribe, they can't have planting zones
  if (!human.leaderId) {
    return [];
  }

  const indexedState = gameState as IndexedWorldState;

  // Get all buildings in the world
  const allBuildings = indexedState.search.building.all();

  // Filter for planting zones owned by tribe members
  return allBuildings.filter((building) => {
    if (building.buildingType !== BuildingType.PlantingZone) {
      return false;
    }

    // Check if the building owner is part of the same tribe
    if (building.ownerId) {
      const owner = gameState.entities.entities[building.ownerId] as HumanEntity | undefined;
      return owner && owner.leaderId === human.leaderId;
    }

    return false;
  });
}

/**
 * Finds an optimal planting spot within the tribe's planting zones.
 * Returns null if no zones exist or all zones are full.
 */
export function findOptimalPlantingZoneSpot(human: HumanEntity, gameState: GameWorldState): Vector2D | null {
  const zones = getTribePlantingZones(human, gameState);

  // No planting zones exist
  if (zones.length === 0) {
    return null;
  }

  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // Try each zone to find a valid planting spot
  for (const zone of zones) {
    const capacity = calculatePlantingZoneCapacity(zone);
    const currentCount = countBushesInZone(zone, gameState);

    // Skip if this zone is full
    if (currentCount >= capacity) {
      continue;
    }

    // Try to find a valid spot within this zone (multiple random attempts)
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate a random position within the zone
      const randomX = zone.position.x + (Math.random() - 0.5) * zone.width;
      const randomY = zone.position.y + (Math.random() - 0.5) * zone.height;

      const position = {
        x: ((randomX % worldWidth) + worldWidth) % worldWidth,
        y: ((randomY % worldHeight) + worldHeight) % worldHeight,
      };

      // Check if this position is valid (not occupied)
      if (!isPositionOccupied(position, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS)) {
        return position;
      }
    }
  }

  // All zones are full or no valid spots found
  return null;
}
