import { NOTIFICATION_DURATION_LONG_HOURS } from '../../notifications/notification-consts.ts';
import {
  TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
  TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  TRIBE_SPLIT_GATHER_RADIUS,
  TRIBE_SPLIT_CONCENTRATION_STORAGE_RADIUS,
  TRIBE_SPLIT_PHASE_TIMEOUT_HOURS,
  TRIBE_SPLIT_COOLDOWN_AFTER_FAILURE_HOURS,
} from './tribe-consts.ts';
import { HumanEntity } from '../characters/human/human-types.ts';
import { NotificationType } from '../../notifications/notification-types.ts';
import { addNotification } from '../../notifications/notification-utils.ts';
import { playSoundAt } from '../../sound/sound-manager.ts';
import { SoundType } from '../../sound/sound-types.ts';
import { DiplomacyStatus, GameWorldState, UpdateContext } from '../../world-types.ts';
import {
  findChildren,
  findDescendants,
  findHeir,
  findTribeMembers,
  detectOrphanedTribes,
  findLivingFamilyRoot,
} from './family-tribe-utils';
import { generateTribeBadge } from '../../utils/general-utils.ts';
import { TribeRole } from './tribe-types.ts';
import { Blackboard, BlackboardData } from '../../ai/behavior-tree/behavior-tree-blackboard.ts';
import { Vector2D } from '../../utils/math-types.ts';
import { calculateWrappedDistance } from '../../utils/math-utils.ts';
import { IndexedWorldState } from '../../world-index/world-index-types.ts';
import { BuildingEntity } from '../buildings/building-types.ts';
import { BuildingType } from '../../building-consts.ts';
import { EntityId } from '../entities-types.ts';
import { calculateAllTerritories, checkPositionInTerritory } from './territory-utils.ts';
import { TribeTerritory } from './territory-types.ts';
import { isPositionOccupied } from '../../utils/spatial-utils.ts';

/**
 * Blackboard keys for tribe split state management
 * All keys are prefixed with 'tribeSplit_'
 */
const BB_SPLIT_PHASE = 'tribeSplit_phase'; // 'idle' | 'checking' | 'planning' | 'gathering' | 'executing'
const BB_SPLIT_STRATEGY = 'tribeSplit_strategy'; // 'migration' | 'concentration'
const BB_SPLIT_TARGET_POSITION = 'tribeSplit_targetPosition'; // Vector2D for migration
const BB_SPLIT_TARGET_BUILDING_ID = 'tribeSplit_targetBuildingId'; // EntityId for concentration
const BB_SPLIT_FAMILY_IDS = 'tribeSplit_familyIds'; // EntityId[] of family members involved
const BB_SPLIT_PHASE_START_TIME = 'tribeSplit_phaseStartTime'; // number (game time)
const BB_SPLIT_LAST_FAILURE_TIME = 'tribeSplit_lastFailureTime'; // number (game time)

export type TribeSplitPhase = 'idle' | 'checking' | 'planning' | 'gathering' | 'executing';
export type TribeSplitStrategy = 'migration' | 'concentration';

/**
 * Result of checking split conditions
 */
export interface SplitCheckResult {
  canSplit: boolean;
  reason?: string;
  progress?: number;
  strategy?: TribeSplitStrategy;
}

/**
 * Resets the split state in the blackboard
 */
function resetSplitState(blackboard: BlackboardData, gameTime: number): void {
  Blackboard.set(blackboard, BB_SPLIT_PHASE, 'idle');
  Blackboard.delete(blackboard, BB_SPLIT_STRATEGY);
  Blackboard.delete(blackboard, BB_SPLIT_TARGET_POSITION);
  Blackboard.delete(blackboard, BB_SPLIT_TARGET_BUILDING_ID);
  Blackboard.delete(blackboard, BB_SPLIT_FAMILY_IDS);
  Blackboard.set(blackboard, BB_SPLIT_LAST_FAILURE_TIME, gameTime);
}

/**
 * Checks if enough time has passed since the last failure
 */
function canAttemptSplitAfterFailure(blackboard: BlackboardData, gameTime: number): boolean {
  const lastFailureTime = Blackboard.get<number>(blackboard, BB_SPLIT_LAST_FAILURE_TIME);
  if (!lastFailureTime) return true;
  return gameTime - lastFailureTime >= TRIBE_SPLIT_COOLDOWN_AFTER_FAILURE_HOURS;
}

/**
 * Checks if the current phase has timed out
 */
function hasPhaseTimedOut(blackboard: BlackboardData, gameTime: number): boolean {
  const phaseStartTime = Blackboard.get<number>(blackboard, BB_SPLIT_PHASE_START_TIME);
  if (!phaseStartTime) return false;
  return gameTime - phaseStartTime >= TRIBE_SPLIT_PHASE_TIMEOUT_HOURS;
}

/**
 * Phase 1: Check if a tribe split is possible and determine the best strategy
 */
export function checkSplitConditions(human: HumanEntity, gameState: GameWorldState): SplitCheckResult {
  // Basic eligibility checks
  if (!human.isAdult || human.gender !== 'male' || human.leaderId === human.id || !human.leaderId) {
    return { canSplit: false, reason: 'Not eligible to split' };
  }

  // Don't allow splits if the tribe is orphaned or being merged
  const orphanedTribes = detectOrphanedTribes(gameState);
  if (orphanedTribes.includes(human.leaderId)) {
    return { canSplit: false, reason: 'Tribe is being merged' };
  }

  if (!human.aiBlackboard) {
    return { canSplit: false, reason: 'No blackboard available' };
  }

  // Check cooldown after previous failure
  if (!canAttemptSplitAfterFailure(human.aiBlackboard, gameState.time)) {
    return { canSplit: false, reason: 'Cooldown after previous failure' };
  }

  const leader = gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
  if (!leader || leader.type !== 'human') {
    return { canSplit: false, reason: 'Leader not found' };
  }

  // Check if human is the heir (heirs don't split)
  const heir = findHeir(findChildren(gameState, leader));
  if (heir && heir.id === human.id) {
    return { canSplit: false, reason: 'Heir cannot split' };
  }

  // Check if human is the living family patriarch (has no living ancestors)
  const patriarch = findLivingFamilyRoot(human, gameState);
  if (patriarch.id !== human.id) {
    return { canSplit: false, reason: 'Not family patriarch' };
  }

  // Check tribe size
  const currentTribeMembers = findTribeMembers(human.leaderId, gameState).filter((m) => m.isAdult);
  if (currentTribeMembers.length < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    return { canSplit: false, reason: 'Tribe too small' };
  }

  // Check family size
  const descendants = findDescendants(human, gameState);
  const familySize = descendants.length + 1; // +1 for the leader himself

  const leaderDescendants = findDescendants(leader, gameState);
  const leaderFamilySize = leaderDescendants.length + 1;

  // If family is larger than leader's family, can split
  if (familySize >= leaderFamilySize && familySize > TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    // Determine strategy based on territory
    const strategy = determineOptimalStrategy(human, gameState);
    return { canSplit: true, progress: 1, strategy };
  }

  // Check if family meets minimum percentage
  const requiredSize = Math.max(
    currentTribeMembers.length * TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
    TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  );

  const progress = familySize / requiredSize;

  if (familySize >= requiredSize) {
    const strategy = determineOptimalStrategy(human, gameState);
    return { canSplit: true, progress, strategy };
  }

  return { canSplit: false, progress, reason: `Family too small: ${familySize} < ${requiredSize}` };
}

/**
 * Determines the optimal split strategy based on current territory and resources
 */
function determineOptimalStrategy(human: HumanEntity, gameState: GameWorldState): TribeSplitStrategy {
  if (!human.leaderId) return 'migration';

  const indexedState = gameState as IndexedWorldState;
  const territories = indexedState.territories;
  const ownTerritory = territories.get(human.leaderId);

  // If no territory (no buildings), migration is the only option
  if (!ownTerritory) {
    return 'migration';
  }

  // Check for available storage buildings within territory
  const storageBuildings = indexedState.search.building
    .byProperty('ownerId', human.leaderId)
    .filter((b) => b.buildingType === BuildingType.StorageSpot && b.isConstructed);

  // If there are storage buildings, concentration is viable
  if (storageBuildings.length > 0) {
    // Find a storage building close to the human
    const nearbyStorage = storageBuildings.find((building) => {
      const distance = calculateWrappedDistance(
        human.position,
        building.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      return distance <= TRIBE_SPLIT_CONCENTRATION_STORAGE_RADIUS;
    });

    if (nearbyStorage) {
      return 'concentration';
    }
  }

  // Default to migration
  return 'migration';
}

/**
 * Phase 2: Plan the split based on the chosen strategy
 */
export function planSplit(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard) return false;

  const strategy = Blackboard.get<TribeSplitStrategy>(human.aiBlackboard, BB_SPLIT_STRATEGY);
  if (!strategy) return false;

  const descendants = findDescendants(human, gameState);
  const familyIds = [human.id, ...descendants.map((d) => d.id)];
  Blackboard.set(human.aiBlackboard, BB_SPLIT_FAMILY_IDS, familyIds);

  if (strategy === 'migration') {
    return planMigrationSplit(human, gameState);
  } else if (strategy === 'concentration') {
    return planConcentrationSplit(human, gameState);
  }

  return false;
}

/**
 * Helper function to check if a position is valid for migration target
 */
function isValidMigrationTarget(
  position: Vector2D,
  leaderId: EntityId,
  territories: Map<EntityId, TribeTerritory>,
  gameState: GameWorldState,
): boolean {
  // Check if position is occupied by other entities
  const checkRadius = 30;
  if (isPositionOccupied(position, gameState, checkRadius)) {
    return false;
  }

  const ownTerritory = territories.get(leaderId);

  // If own territory exists, ensure we're outside of it
  if (ownTerritory) {
    const ownCheck = checkPositionInTerritory(position, ownTerritory, gameState);
    if (ownCheck.isInsideTerritory) {
      return false;
    }
  }

  // Check that position doesn't overlap with any other tribe's territory
  for (const [otherId, otherTerritory] of territories) {
    if (otherId === leaderId) continue;

    const otherCheck = checkPositionInTerritory(position, otherTerritory, gameState);
    if (otherCheck.isInsideTerritory) {
      return false;
    }
  }

  return true;
}

/**
 * Plans a migration split: find a suitable location outside current territory using spiral search
 */
function planMigrationSplit(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard || !human.leaderId) return false;

  const territories = (gameState as IndexedWorldState).territories;
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // Spiral search parameters
  const maxRadius = Math.min(worldWidth, worldHeight) / 2;
  const radiusStep = 50;
  const arcLength = 50; // Approximate distance between angle checks

  // Start spiral search from human's current position
  for (let radius = 0; radius <= maxRadius; radius += radiusStep) {
    // Calculate number of angles based on circumference for good coverage
    const numAngles = radius === 0 ? 1 : Math.max(8, Math.ceil((2 * Math.PI * radius) / arcLength));
    const angleStep = radius === 0 ? 0 : (2 * Math.PI) / numAngles;

    for (let i = 0; i < numAngles; i++) {
      const angle = i * angleStep;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;

      // Calculate candidate position with world wrapping
      const candidateX = human.position.x + offsetX;
      const candidateY = human.position.y + offsetY;

      const wrappedPosition: Vector2D = {
        x: ((candidateX % worldWidth) + worldWidth) % worldWidth,
        y: ((candidateY % worldHeight) + worldHeight) % worldHeight,
      };

      // Check if this position is valid
      if (isValidMigrationTarget(wrappedPosition, human.leaderId, territories, gameState)) {
        Blackboard.set(human.aiBlackboard, BB_SPLIT_TARGET_POSITION, wrappedPosition);
        return true;
      }
    }
  }

  // No valid position found within search radius
  return false;
}

/**
 * Plans a concentration split: find a suitable storage building to gather at
 */
function planConcentrationSplit(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard || !human.leaderId) return false;

  const indexedState = gameState as IndexedWorldState;
  const storageBuildings = indexedState.search.building
    .byProperty('ownerId', human.leaderId)
    .filter((b) => b.buildingType === BuildingType.StorageSpot && b.isConstructed);

  if (storageBuildings.length === 0) {
    return false;
  }

  // Find the closest storage building
  let closestBuilding: BuildingEntity | null = null;
  let minDistance = Infinity;

  for (const building of storageBuildings) {
    const distance = calculateWrappedDistance(
      human.position,
      building.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestBuilding = building;
    }
  }

  if (!closestBuilding) return false;

  Blackboard.set(human.aiBlackboard, BB_SPLIT_TARGET_BUILDING_ID, closestBuilding.id);
  return true;
}

/**
 * Phase 3: Check if family members have gathered at the target location
 */
export function checkFamilyGathered(human: HumanEntity, gameState: GameWorldState): [boolean, number] {
  if (!human.aiBlackboard) return [false, 0];

  const strategy = Blackboard.get<TribeSplitStrategy>(human.aiBlackboard, BB_SPLIT_STRATEGY);
  const familyIds = Blackboard.get<EntityId[]>(human.aiBlackboard, BB_SPLIT_FAMILY_IDS)?.filter(
    (id) => !!gameState.entities.entities[id],
  );

  if (!strategy || !familyIds) return [false, 0];

  let targetPosition: Vector2D;

  if (strategy === 'migration') {
    const pos = Blackboard.get<Vector2D>(human.aiBlackboard, BB_SPLIT_TARGET_POSITION);
    if (!pos) return [false, 0];
    targetPosition = pos;
  } else if (strategy === 'concentration') {
    const buildingId = Blackboard.get<EntityId>(human.aiBlackboard, BB_SPLIT_TARGET_BUILDING_ID);
    if (!buildingId) return [false, 0];
    const building = gameState.entities.entities[buildingId] as BuildingEntity | undefined;
    if (!building) return [false, 0];
    targetPosition = building.position;
  } else {
    return [false, 0];
  }

  // Check if all family members are within gathering radius
  let gatheredCount = 0;
  for (const familyId of familyIds) {
    const member = gameState.entities.entities[familyId] as HumanEntity | undefined;
    if (!member || member.type !== 'human') continue;

    const distance = calculateWrappedDistance(
      member.position,
      targetPosition,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance <= TRIBE_SPLIT_GATHER_RADIUS) {
      gatheredCount++;
    }
  }

  // Require at least 80% of family to be gathered
  const requiredCount = Math.ceil(familyIds.length * 0.5);
  return [gatheredCount >= requiredCount, gatheredCount / requiredCount];
}

/**
 * Phase 4: Execute the tribe split
 */
export function executeSplit(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard) return false;

  const strategy = Blackboard.get<TribeSplitStrategy>(human.aiBlackboard, BB_SPLIT_STRATEGY);
  const familyIds = Blackboard.get<EntityId[]>(human.aiBlackboard, BB_SPLIT_FAMILY_IDS);

  if (!strategy || !familyIds) return false;

  const previousLeader = human.leaderId
    ? (gameState.entities.entities[human.leaderId] as HumanEntity | undefined)
    : undefined;

  const newTribeBadge = generateTribeBadge();

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

  // Set diplomacy with previous leader
  if (previousLeader && previousLeader.tribeControl?.diplomacy) {
    previousLeader.tribeControl.diplomacy[human.id] = DiplomacyStatus.Hostile;
  }

  // Update all family members
  for (const familyId of familyIds) {
    if (familyId === human.id) continue;
    const member = gameState.entities.entities[familyId] as HumanEntity | undefined;
    if (!member || member.type !== 'human') continue;

    member.leaderId = human.id;
    member.tribeBadge = newTribeBadge;
  }

  // Handle strategy-specific actions
  if (strategy === 'concentration') {
    const buildingId = Blackboard.get<EntityId>(human.aiBlackboard, BB_SPLIT_TARGET_BUILDING_ID);
    if (buildingId) {
      const building = gameState.entities.entities[buildingId] as BuildingEntity | undefined;
      if (building && building.type === 'building') {
        // Take over the building
        building.ownerId = human.id;
      }
    }
  } else if (strategy === 'migration') {
    // For migration, the family should build a new storage at the target position
    // This will be handled by the normal building behavior
  }

  // Add notification
  addNotification(gameState, {
    type: NotificationType.NewTribeFormed,
    message: `A new tribe has formed via ${strategy}! ${newTribeBadge}`,
    duration: NOTIFICATION_DURATION_LONG_HOURS,
    targetEntityIds: [human.id],
    highlightedEntityIds: familyIds,
  });

  // Play sound
  const updateContext: UpdateContext = { gameState, deltaTime: 0 };
  playSoundAt(updateContext, SoundType.TribeSplit, human.position);

  // Reset split state
  resetSplitState(human.aiBlackboard, gameState.time);

  return true;
}

/**
 * Gets the current split phase from the blackboard
 */
export function getSplitPhase(blackboard: BlackboardData | undefined): TribeSplitPhase {
  if (!blackboard) return 'idle';
  return Blackboard.get<TribeSplitPhase>(blackboard, BB_SPLIT_PHASE) ?? 'idle';
}

/**
 * Sets the split phase in the blackboard
 */
export function setSplitPhase(blackboard: BlackboardData, phase: TribeSplitPhase, gameTime: number): void {
  Blackboard.set(blackboard, BB_SPLIT_PHASE, phase);
  Blackboard.set(blackboard, BB_SPLIT_PHASE_START_TIME, gameTime);
}

/**
 * Sets the split strategy in the blackboard
 */
export function setSplitStrategy(blackboard: BlackboardData, strategy: TribeSplitStrategy): void {
  Blackboard.set(blackboard, BB_SPLIT_STRATEGY, strategy);
}

/**
 * Handles phase timeout by resetting the split state
 */
export function handlePhaseTimeout(blackboard: BlackboardData, gameTime: number): void {
  resetSplitState(blackboard, gameTime);
}

/**
 * Checks if the phase has timed out and handles it
 */
export function checkAndHandleTimeout(blackboard: BlackboardData, gameTime: number): boolean {
  if (hasPhaseTimedOut(blackboard, gameTime)) {
    handlePhaseTimeout(blackboard, gameTime);
    return true;
  }
  return false;
}

/**
 * Legacy function for backward compatibility - now delegates to the new multi-phase system
 */
export function canSplitTribe(human: HumanEntity, gameState: GameWorldState): { canSplit: boolean; progress?: number } {
  const result = checkSplitConditions(human, gameState);
  return { canSplit: result.canSplit, progress: result.progress };
}

/**
 * Legacy function for backward compatibility - now delegates to the new multi-phase system
 */
export function performTribeSplit(human: HumanEntity, gameState: GameWorldState): void {
  if (!human.aiBlackboard) return;

  // Quick path: check, plan, and execute immediately (for backward compatibility)
  const checkResult = checkSplitConditions(human, gameState);
  if (!checkResult.canSplit || !checkResult.strategy) return;

  setSplitStrategy(human.aiBlackboard, checkResult.strategy);

  if (!planSplit(human, gameState)) return;

  // For legacy behavior, skip gathering phase and execute immediately
  executeSplit(human, gameState);
}

/**
 * Helper function for propagating new leader to descendants (unchanged)
 */
export function propagateNewLeaderToDescendants(
  newLeader: HumanEntity,
  human: HumanEntity,
  gameState: GameWorldState,
): void {
  human.leaderId = newLeader.id;
  human.tribeBadge = newLeader.tribeBadge;

  if (human.gender === 'male') {
    findChildren(gameState, human).forEach((child) => {
      propagateNewLeaderToDescendants(newLeader, child, gameState);
      if (child.motherId && human.partnerIds?.includes(child.motherId)) {
        const mother = gameState.entities.entities[child.motherId] as HumanEntity | undefined;
        if (mother) {
          mother.leaderId = newLeader.id;
          mother.tribeBadge = newLeader.tribeBadge;
        }
      }
    });
  }
}
