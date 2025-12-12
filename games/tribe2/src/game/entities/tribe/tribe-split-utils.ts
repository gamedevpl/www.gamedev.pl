import { NOTIFICATION_DURATION_LONG_HOURS } from '../../notifications/notification-consts.ts';
import {
  TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
  TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  TRIBE_SPLIT_MIGRATION_MIN_DISTANCE,
  TRIBE_SPLIT_CONCENTRATION_STORAGE_RADIUS,
  TRIBE_SPLIT_PHASE_TIMEOUT_HOURS,
  TRIBE_SPLIT_COOLDOWN_AFTER_FAILURE_HOURS,
  TRIBE_SPLIT_GATHER_RADIUS,
} from './tribe-consts.ts';
import { HumanEntity } from '../characters/human/human-types.ts';
import { NotificationType } from '../../notifications/notification-types.ts';
import { addNotification } from '../../notifications/notification-utils.ts';
import { playSoundAt } from '../../sound/sound-manager.ts';
import { SoundType } from '../../sound/sound-types.ts';
import { DiplomacyStatus, GameWorldState, UpdateContext } from '../../world-types.ts';
import { findChildren, findDescendants, findHeir, findTribeMembers } from './family-tribe-utils';
import { generateTribeBadge } from '../../utils/general-utils.ts';
import { TribeRole } from './tribe-types.ts';
import { Vector2D } from '../../utils/math-types.ts';
import { calculateWrappedDistance } from '../../utils/math-utils.ts';
import { IndexedWorldState } from '../../world-index/world-index-types.ts';
import { BuildingEntity, BuildingType } from '../buildings/building-types.ts';
import { calculateAllTerritories } from './territory-utils.ts';
import { EntityId } from '../entities-types.ts';
import { Blackboard, BlackboardData } from '../../ai/behavior-tree/behavior-tree-blackboard.ts';

// ============================================================================
// Blackboard Key Constants for State Management
// All keys are prefixed with 'tribeSplit_'
// ============================================================================
const BB_SPLIT_PHASE = 'tribeSplit_phase'; // 'idle' | 'checking' | 'planning' | 'gathering' | 'executing'
const BB_SPLIT_STRATEGY = 'tribeSplit_strategy'; // 'migration' | 'concentration'
const BB_SPLIT_TARGET_POSITION = 'tribeSplit_targetPosition'; // Vector2D for migration
const BB_SPLIT_TARGET_BUILDING_ID = 'tribeSplit_targetBuildingId'; // EntityId for concentration
const BB_SPLIT_FAMILY_IDS = 'tribeSplit_familyIds'; // EntityId[] of family members involved
const BB_SPLIT_PHASE_START_TIME = 'tribeSplit_phaseStartTime'; // number (game time)
const BB_SPLIT_LAST_FAILURE_TIME = 'tribeSplit_lastFailureTime'; // number (game time)

// ============================================================================
// Type Definitions
// ============================================================================
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

// ============================================================================
// Blackboard State Management Functions
// ============================================================================

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

// ============================================================================
// Phase 1: Check Split Conditions
// ============================================================================

/**
 * Phase 1: Check if a tribe split is possible and determine the best strategy
 */
export function checkSplitConditions(human: HumanEntity, gameState: GameWorldState): SplitCheckResult {
  // Basic eligibility checks
  if (!human.isAdult || human.gender !== 'male' || human.leaderId === human.id || !human.leaderId) {
    return { canSplit: false, reason: 'Not eligible to split' };
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

  // Check tribe size
  const currentTribeMembers = findTribeMembers(human.leaderId, gameState).filter((m) => m.isAdult);
  if (currentTribeMembers.length < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    return { canSplit: false, reason: 'Tribe too small' };
  }

  // Check family size
  const descendants = findDescendants(human, gameState).filter((d) => d.isAdult);
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
  const requiredSize = Math.min(
    currentTribeMembers.length * TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
    TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  );

  const progress = familySize / requiredSize;

  if (familySize >= requiredSize) {
    const strategy = determineOptimalStrategy(human, gameState);
    return { canSplit: true, progress, strategy };
  }

  return { canSplit: false, progress, reason: 'Family too small' };
}

/**
 * Determines the optimal split strategy based on current territory and resources
 */
function determineOptimalStrategy(human: HumanEntity, gameState: GameWorldState): TribeSplitStrategy {
  if (!human.leaderId) return 'migration';

  const indexedState = gameState as IndexedWorldState;

  // Check for available storage buildings within radius
  const storageBuildings = indexedState.search.building
    .byProperty('ownerId', human.leaderId)
    .filter((b) => b.buildingType === BuildingType.StorageSpot && b.isConstructed);

  // If there are storage buildings, check if any are close enough
  if (storageBuildings.length > 0) {
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

// ============================================================================
// Phase 2: Plan Split
// ============================================================================

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
 * Plans a migration split: find a suitable location outside current territory
 */
function planMigrationSplit(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard || !human.leaderId) return false;

  const territories = calculateAllTerritories(gameState);

  // Find a position far from current territory
  let bestPosition: Vector2D | null = null;
  let maxMinDistance = 0;

  // Sample positions in a grid
  const gridStep = 100;
  for (let x = 0; x < gameState.mapDimensions.width; x += gridStep) {
    for (let y = 0; y < gameState.mapDimensions.height; y += gridStep) {
      const position = { x, y };

      // Calculate minimum distance to any territory
      let minDistanceToAnyTerritory = Infinity;

      for (const [, territory] of territories) {
        for (const circle of territory.circles) {
          const distance = calculateWrappedDistance(
            position,
            circle.center,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );
          const distanceToEdge = distance - circle.radius;
          if (distanceToEdge < minDistanceToAnyTerritory) {
            minDistanceToAnyTerritory = distanceToEdge;
          }
        }
      }

      // We want a position that is far from all territories
      if (minDistanceToAnyTerritory > maxMinDistance && minDistanceToAnyTerritory >= TRIBE_SPLIT_MIGRATION_MIN_DISTANCE) {
        maxMinDistance = minDistanceToAnyTerritory;
        bestPosition = position;
      }
    }
  }

  if (!bestPosition) {
    // Fallback: just pick a position far from the human's current position
    const angle = Math.random() * Math.PI * 2;
    const distance = TRIBE_SPLIT_MIGRATION_MIN_DISTANCE + Math.random() * 200;
    bestPosition = {
      x: ((human.position.x + Math.cos(angle) * distance) % gameState.mapDimensions.width + gameState.mapDimensions.width) % gameState.mapDimensions.width,
      y: ((human.position.y + Math.sin(angle) * distance) % gameState.mapDimensions.height + gameState.mapDimensions.height) % gameState.mapDimensions.height,
    };
  }

  Blackboard.set(human.aiBlackboard, BB_SPLIT_TARGET_POSITION, bestPosition);
  return true;
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

  if (!closestBuilding) {
    return false;
  }

  Blackboard.set(human.aiBlackboard, BB_SPLIT_TARGET_BUILDING_ID, closestBuilding.id);
  return true;
}

// ============================================================================
// Phase 3: Gathering
// ============================================================================

/**
 * Coordinates family members to move towards the gathering point
 */
export function coordinateFamilyGathering(human: HumanEntity, gameState: GameWorldState): void {
  if (!human.aiBlackboard) return;

  const strategy = Blackboard.get<TribeSplitStrategy>(human.aiBlackboard, BB_SPLIT_STRATEGY);
  const familyIds = Blackboard.get<EntityId[]>(human.aiBlackboard, BB_SPLIT_FAMILY_IDS);

  if (!strategy || !familyIds) return;

  let targetPosition: Vector2D | undefined;

  if (strategy === 'migration') {
    targetPosition = Blackboard.get<Vector2D>(human.aiBlackboard, BB_SPLIT_TARGET_POSITION);
  } else if (strategy === 'concentration') {
    const buildingId = Blackboard.get<EntityId>(human.aiBlackboard, BB_SPLIT_TARGET_BUILDING_ID);
    if (buildingId) {
      const building = gameState.entities.entities[buildingId] as BuildingEntity | undefined;
      if (building) {
        targetPosition = building.position;
      }
    }
  }

  if (!targetPosition) return;

  // Set target for all family members including the patriarch
  for (const memberId of familyIds) {
    const member = gameState.entities.entities[memberId] as HumanEntity | undefined;
    if (!member || member.type !== 'human') continue;

    const distance = calculateWrappedDistance(
      member.position,
      targetPosition,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    // Only set target if not already close enough
    if (distance > TRIBE_SPLIT_GATHER_RADIUS) {
      member.target = targetPosition;
      member.activeAction = 'moving';
    }
  }
}

/**
 * Checks if family members have gathered at the target location
 * Returns true if at least 80% of family members are within range
 */
export function checkFamilyGathered(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard) return false;

  const strategy = Blackboard.get<TribeSplitStrategy>(human.aiBlackboard, BB_SPLIT_STRATEGY);
  const familyIds = Blackboard.get<EntityId[]>(human.aiBlackboard, BB_SPLIT_FAMILY_IDS);

  if (!strategy || !familyIds) return false;

  let targetPosition: Vector2D | undefined;

  if (strategy === 'migration') {
    targetPosition = Blackboard.get<Vector2D>(human.aiBlackboard, BB_SPLIT_TARGET_POSITION);
  } else if (strategy === 'concentration') {
    const buildingId = Blackboard.get<EntityId>(human.aiBlackboard, BB_SPLIT_TARGET_BUILDING_ID);
    if (buildingId) {
      const building = gameState.entities.entities[buildingId] as BuildingEntity | undefined;
      if (building) {
        targetPosition = building.position;
      }
    }
  }

  if (!targetPosition) return false;

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
  const requiredCount = Math.ceil(familyIds.length * 0.8);
  return gatheredCount >= requiredCount;
}

// ============================================================================
// Phase 4: Execute Split
// ============================================================================

/**
 * Phase 4: Execute the tribe split
 */
export function executeSplit(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.aiBlackboard) return false;

  const strategy = Blackboard.get<TribeSplitStrategy>(human.aiBlackboard, BB_SPLIT_STRATEGY);
  const familyIds = Blackboard.get<EntityId[]>(human.aiBlackboard, BB_SPLIT_FAMILY_IDS);

  if (!strategy || !familyIds) return false;

  const previousLeader = human.leaderId ? (gameState.entities.entities[human.leaderId] as HumanEntity | undefined) : undefined;

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
  }
  // For migration strategy, the family should build a new storage at the target position
  // This will be handled by the normal building behavior

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

// ============================================================================
// Legacy Functions (Backward Compatibility)
// ============================================================================

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
