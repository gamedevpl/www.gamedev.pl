import { NOTIFICATION_DURATION_LONG_HOURS } from '../../notifications/notification-consts.ts';
import {
  TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
  TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  TRIBE_SPLIT_CONCENTRATION_THRESHOLD,
  TRIBE_SPLIT_MIGRATION_MIN_DISTANCE,
  TRIBE_SPLIT_MIGRATION_MAX_DISTANCE,
  TRIBE_SPLIT_BUILDING_SEARCH_RADIUS,
} from './tribe-consts.ts';
import { HumanEntity } from '../characters/human/human-types.ts';
import { NotificationType } from '../../notifications/notification-types.ts';
import { addNotification } from '../../notifications/notification-utils.ts';
import { playSoundAt } from '../../sound/sound-manager.ts';
import { SoundType } from '../../sound/sound-types.ts';
import { DiplomacyStatus, GameWorldState, UpdateContext } from '../../world-types.ts';
import { findChildren, findDescendants, findHeir, findTribeMembers } from './family-tribe-utils';
import { generateTribeBadge } from '../../utils/general-utils.ts';
import { TribeRole, TribeSplitStrategy, TribeSplitPhase, TribeSplitState } from './tribe-types.ts';
import { Vector2D } from '../../utils/math-types.ts';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils.ts';
import { IndexedWorldState } from '../../world-index/world-index-types.ts';
import { BuildingEntity } from '../buildings/building-types.ts';
import { calculateAllTerritories, checkPositionInTerritory } from './territory-utils.ts';
import { EntityId } from '../entities-types.ts';
import { getTribeCenter } from '../../utils/spatial-utils.ts';

export function canSplitTribe(human: HumanEntity, gameState: GameWorldState): { canSplit: boolean; progress?: number } {
  if (!human.isAdult || human.gender !== 'male' || human.leaderId === human.id || !human.leaderId) {
    return { canSplit: false };
  }

  if (!human.leaderId) {
    return { canSplit: false }; // Not in a tribe, can't split
  }

  const leader = gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
  if (!leader || leader.type !== 'human') {
    return { canSplit: false }; // Leader is not a human or doesn't exist
  }

  const heir = findHeir(findChildren(gameState, leader));
  if (heir && heir.id === human.id) {
    return { canSplit: false }; // The human is already the heir, no need to split
  }

  const currentTribeMembers = findTribeMembers(human.leaderId, gameState).filter((m) => m.isAdult);
  if (currentTribeMembers.length < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    return { canSplit: false };
  }

  const descendants = findDescendants(human, gameState).filter((d) => d.isAdult);
  const familySize = descendants.length + 1; // +1 for the leader himself

  const leaderDescendants = findDescendants(leader, gameState);
  const leaderFamillySize = leaderDescendants.length + 1;

  if (familySize >= leaderFamillySize && familySize > TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    return { canSplit: true };
  }

  const requiredSize = Math.min(
    currentTribeMembers.length * TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
    TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  );

  return { canSplit: familySize >= requiredSize, progress: familySize / requiredSize };
}

export function performTribeSplit(human: HumanEntity, gameState: GameWorldState): void {
  if (!canSplitTribe(human, gameState).canSplit) {
    return;
  }

  const previousLeader = human.leaderId
    ? (gameState.entities.entities[human.leaderId] as HumanEntity | undefined)
    : undefined;

  const newTribeBadge = generateTribeBadge();
  const descendants = findDescendants(human, gameState);

  // The founder becomes the new leader
  human.leaderId = human.id;
  human.tribeBadge = newTribeBadge;
  human.tribeRole = TribeRole.Leader;
  human.tribeControl = {
    roleWeights: {
      gatherer: 1,
      planter: 1,
      hunter: 1,
      mover: 1,
      warrior: 1,
      leader: 0,
    },
    diplomacy: {},
  };
  if (previousLeader && previousLeader.tribeControl?.diplomacy) {
    previousLeader.tribeControl.diplomacy[human.id] = DiplomacyStatus.Hostile;
  }
  // Update all descendants
  for (const descendant of descendants) {
    descendant.leaderId = human.id;
    descendant.tribeBadge = newTribeBadge;
  }

  // Add notification
  addNotification(gameState, {
    type: NotificationType.NewTribeFormed,
    message: `A new tribe has formed! ${newTribeBadge}`,
    duration: NOTIFICATION_DURATION_LONG_HOURS,
    targetEntityIds: [human.id],
    highlightedEntityIds: [human.id, ...descendants.map((d) => d.id)],
  });

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
        const mother = gameState.entities.entities[child.motherId] as HumanEntity | undefined;
        if (mother) {
          mother.leaderId = newLeader.id; // Set the new leader for the mother
          mother.tribeBadge = newLeader.tribeBadge; // Update tribe badge to match new leader
        }
      }
    });
  }
}

// ============================================================================
// Strategic Split Utility Functions
// ============================================================================

/**
 * Determines the appropriate split strategy based on family size relative to tribe size.
 * - Migration: Move away to a safe spot, then split, then build a base. Used when the splitting group is small (<50%).
 * - Concentration: Gather at a key building (storage), split, and take it over. Used when the splitting group is large (>=50%).
 */
export function determineSplitStrategy(human: HumanEntity, gameState: GameWorldState): TribeSplitStrategy {
  if (!human.leaderId) {
    return TribeSplitStrategy.Migration;
  }

  const tribeMembers = findTribeMembers(human.leaderId, gameState).filter((m) => m.isAdult);
  const descendants = findDescendants(human, gameState).filter((d) => d.isAdult);
  const familySize = descendants.length + 1; // +1 for the patriarch

  const familyRatio = familySize / Math.max(1, tribeMembers.length);

  // Use concentration strategy if family is >= 50% of the tribe
  if (familyRatio >= TRIBE_SPLIT_CONCENTRATION_THRESHOLD) {
    return TribeSplitStrategy.Concentration;
  }

  return TribeSplitStrategy.Migration;
}

/**
 * Finds a safe position outside the current tribe's territory for migration.
 * Searches in expanding rings from the patriarch's position, avoiding other tribes' territories.
 */
export function findSafeMigrationTarget(human: HumanEntity, gameState: GameWorldState): Vector2D | null {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const territories = calculateAllTerritories(gameState);
  const currentLeaderId = human.leaderId;

  if (!currentLeaderId) {
    return null;
  }

  const tribeCenter = getTribeCenter(currentLeaderId, gameState);

  // Search in expanding rings from the tribe center, looking for a position outside current territory
  const angleStep = Math.PI / 8; // 16 directions
  const distanceStep = 50;

  for (let distance = TRIBE_SPLIT_MIGRATION_MIN_DISTANCE; distance <= TRIBE_SPLIT_MIGRATION_MAX_DISTANCE; distance += distanceStep) {
    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      const candidateX = tribeCenter.x + Math.cos(angle) * distance;
      const candidateY = tribeCenter.y + Math.sin(angle) * distance;

      const position: Vector2D = {
        x: ((candidateX % worldWidth) + worldWidth) % worldWidth,
        y: ((candidateY % worldHeight) + worldHeight) % worldHeight,
      };

      // Check if the position is outside all territories
      let isInsideAnyTerritory = false;
      for (const [, territory] of territories) {
        const checkResult = checkPositionInTerritory(position, territory, gameState);
        if (checkResult.isInsideTerritory) {
          isInsideAnyTerritory = true;
          break;
        }
      }

      // If the position is outside all territories, it's a good migration target
      if (!isInsideAnyTerritory) {
        return position;
      }
    }
  }

  // Fallback: return a position far from tribe center if no perfect spot found
  const direction = getDirectionVectorOnTorus(
    tribeCenter,
    { x: human.position.x + 100, y: human.position.y + 100 },
    worldWidth,
    worldHeight,
  );
  const normalizedDirection = vectorNormalize(direction);
  const fallbackDistance = TRIBE_SPLIT_MIGRATION_MIN_DISTANCE;

  return {
    x: ((tribeCenter.x + normalizedDirection.x * fallbackDistance % worldWidth) + worldWidth) % worldWidth,
    y: ((tribeCenter.y + normalizedDirection.y * fallbackDistance % worldHeight) + worldHeight) % worldHeight,
  };
}

/**
 * Finds the closest storage spot owned by the current tribe for the concentration strategy.
 * Returns the storage building and its position if found.
 */
export function findClosestStorageForConcentration(
  human: HumanEntity,
  gameState: GameWorldState,
): { storage: BuildingEntity; position: Vector2D } | null {
  if (!human.leaderId) {
    return null;
  }

  const indexedState = gameState as IndexedWorldState;
  const storageSpots = indexedState.search.building
    .byRadius(human.position, TRIBE_SPLIT_BUILDING_SEARCH_RADIUS)
    .filter((building) => {
      return (
        building.buildingType === 'storageSpot' &&
        building.ownerId === human.leaderId &&
        building.isConstructed
      );
    });

  if (storageSpots.length === 0) {
    return null;
  }

  // Find the closest storage
  let closestStorage: BuildingEntity | null = null;
  let closestDistance = Infinity;

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  for (const storage of storageSpots) {
    const distance = calculateWrappedDistance(human.position, storage.position, worldWidth, worldHeight);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestStorage = storage;
    }
  }

  return closestStorage ? { storage: closestStorage, position: closestStorage.position } : null;
}

/**
 * Gets the IDs of all family members that will be part of the split.
 * This includes the patriarch and all their descendants.
 */
export function getSplittingFamilyMemberIds(human: HumanEntity, gameState: GameWorldState): EntityId[] {
  const descendants = findDescendants(human, gameState);
  return [human.id, ...descendants.map((d) => d.id)];
}

/**
 * Creates the initial split state for a patriarch starting the split process.
 */
export function createSplitState(
  human: HumanEntity,
  gameState: GameWorldState,
  currentTime: number,
): TribeSplitState | null {
  const initialStrategy = determineSplitStrategy(human, gameState);
  const familyMemberIds = getSplittingFamilyMemberIds(human, gameState);

  let gatheringTarget: Vector2D;
  let targetBuildingId: EntityId | undefined;
  let finalStrategy = initialStrategy;

  if (initialStrategy === TribeSplitStrategy.Concentration) {
    const storageInfo = findClosestStorageForConcentration(human, gameState);
    if (storageInfo) {
      gatheringTarget = storageInfo.position;
      targetBuildingId = storageInfo.storage.id;
    } else {
      // Fall back to migration if no storage found
      finalStrategy = TribeSplitStrategy.Migration;
      const migrationTarget = findSafeMigrationTarget(human, gameState);
      if (!migrationTarget) {
        return null;
      }
      gatheringTarget = migrationTarget;
    }
  } else {
    const migrationTarget = findSafeMigrationTarget(human, gameState);
    if (!migrationTarget) {
      return null;
    }
    gatheringTarget = migrationTarget;
  }

  return {
    strategy: finalStrategy,
    phase: TribeSplitPhase.Planning,
    gatheringTarget,
    startTime: currentTime,
    familyMemberIds,
    targetBuildingId,
  };
}

/**
 * Checks if all family members have arrived at the gathering target.
 */
export function areFamilyMembersGathered(
  familyMemberIds: EntityId[],
  gatheringTarget: Vector2D,
  gameState: GameWorldState,
  arrivalDistance: number,
): boolean {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  for (const memberId of familyMemberIds) {
    const member = gameState.entities.entities[memberId] as HumanEntity | undefined;
    if (!member || member.type !== 'human') {
      continue; // Skip if member no longer exists
    }

    const distance = calculateWrappedDistance(member.position, gatheringTarget, worldWidth, worldHeight);
    if (distance > arrivalDistance) {
      return false;
    }
  }

  return true;
}

/**
 * Sets the target for all family members to move towards the gathering point.
 * Called by the patriarch to coordinate the family's movement.
 */
export function coordinateFamilyMovement(
  _human: HumanEntity,
  splitState: TribeSplitState,
  gameState: GameWorldState,
): void {
  for (const memberId of splitState.familyMemberIds) {
    const member = gameState.entities.entities[memberId] as HumanEntity | undefined;
    if (!member || member.type !== 'human') {
      continue;
    }

    // Set the member's target to the gathering point
    member.target = splitState.gatheringTarget;
    member.activeAction = 'moving';
  }
}

/**
 * Transfers ownership of a building to a new owner (the new tribe leader).
 * Used in the concentration strategy when the splitting family takes over a storage.
 */
export function transferBuildingOwnership(
  buildingId: EntityId,
  newOwnerId: EntityId,
  gameState: GameWorldState,
): boolean {
  const building = gameState.entities.entities[buildingId] as BuildingEntity | undefined;
  if (!building || building.type !== 'building') {
    return false;
  }

  building.ownerId = newOwnerId;
  return true;
}
