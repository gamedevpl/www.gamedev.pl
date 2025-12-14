/**
 * Logistics Registry Utilities
 *
 * Functions for managing the tribe's logistics registry, including:
 * - TribeDemand entries (requests from consumers)
 * - TribeSupply entries (available and forecast supplies)
 * - MoverTask tracking (active logistics operations)
 *
 * The registry is stored in the tribe leader's blackboard using individual keys.
 */

import { HumanEntity } from '../characters/human/human-types';
import { BuildingEntity } from '../buildings/building-types';
import { GameWorldState } from '../../world-types';
import { EntityId } from '../entities-types';
import { Blackboard, BlackboardData } from '../../ai/behavior-tree/behavior-tree-blackboard';
import { Vector2D } from '../../utils/math-types';
import { calculateWrappedDistance } from '../../utils/math-utils';
import {
  TribeDemand,
  TribeSupply,
  MoverTask,
  DemandPriority,
  DemandStatus,
  SupplyType,
  MoverTaskState,
  LogisticsMetadata,
  LogisticsResourceType,
} from './logistics-types';
import {
  LOGISTICS_DEMAND_STALE_TIMEOUT_HOURS,
  LOGISTICS_CLAIM_TIMEOUT_HOURS,
  LOGISTICS_MAX_MOVER_TRAVEL_DISTANCE,
  LOGISTICS_SUPPLY_WAIT_TIMEOUT_HOURS,
  LOGISTICS_MOVER_HUNGER_SELF_SUSTAIN_THRESHOLD,
  LOGISTICS_CLEANUP_INTERVAL_HOURS,
  LOGISTICS_FORECAST_EXPIRY_HOURS,
} from '../../logistics-consts';

// Blackboard key prefixes
const LOGISTICS_META_KEY = 'logistics_meta';
const LOGISTICS_DEMAND_PREFIX = 'logistics_demand_';
const LOGISTICS_SUPPLY_PREFIX = 'logistics_supply_';
const LOGISTICS_TASK_PREFIX = 'logistics_task_';

// ============================================================================
// METADATA MANAGEMENT
// ============================================================================

/**
 * Gets or creates the logistics metadata for a tribe leader
 */
function getLogisticsMetadata(leaderBlackboard: BlackboardData, currentTime: number): LogisticsMetadata {
  let meta = Blackboard.get<LogisticsMetadata>(leaderBlackboard, LOGISTICS_META_KEY);

  if (!meta) {
    meta = {
      lastCleanupTime: currentTime,
      demandIds: [],
      supplyIds: [],
      taskIds: [],
    };
    Blackboard.set(leaderBlackboard, LOGISTICS_META_KEY, meta);
  }

  return meta;
}

/**
 * Saves the logistics metadata
 */
function saveLogisticsMetadata(leaderBlackboard: BlackboardData, meta: LogisticsMetadata): void {
  Blackboard.set(leaderBlackboard, LOGISTICS_META_KEY, meta);
}

// ============================================================================
// DEMAND MANAGEMENT (For Consumers: Warriors, hungry tribe members)
// ============================================================================

/**
 * Creates a unique demand ID based on requester
 */
function createDemandId(requesterId: EntityId): string {
  return `demand_${requesterId}`;
}

/**
 * Registers a demand for resources.
 * Called by consumers (Warriors, hungry tribe members) when they need resources.
 * If a demand from this requester already exists, it updates the existing one.
 */
export function registerDemand(
  leaderBlackboard: BlackboardData,
  requesterId: EntityId,
  resourceType: LogisticsResourceType,
  amount: number,
  priority: DemandPriority,
  location: Vector2D,
  currentTime: number,
): TribeDemand {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const demandId = createDemandId(requesterId);
  const demandKey = LOGISTICS_DEMAND_PREFIX + demandId;

  // Check if demand already exists
  const existing = Blackboard.get<TribeDemand>(leaderBlackboard, demandKey);
  if (existing) {
    // Update existing demand (but don't reset claimed status)
    existing.amount = amount;
    existing.priority = priority;
    existing.location = location;
    // Only reset to pending if it was fulfilled
    if (existing.status === DemandStatus.Fulfilled) {
      existing.status = DemandStatus.Pending;
      existing.claimedBy = undefined;
      existing.claimedAt = undefined;
    }
    Blackboard.set(leaderBlackboard, demandKey, existing);
    return existing;
  }

  // Create new demand
  const demand: TribeDemand = {
    id: demandId,
    requesterId,
    resourceType,
    amount,
    priority,
    location,
    status: DemandStatus.Pending,
    createdAt: currentTime,
  };

  Blackboard.set(leaderBlackboard, demandKey, demand);

  // Add to metadata if not already there
  if (!meta.demandIds.includes(demandId)) {
    meta.demandIds.push(demandId);
    saveLogisticsMetadata(leaderBlackboard, meta);
  }

  return demand;
}

/**
 * Gets all pending demands sorted by priority (highest first).
 */
export function getPendingDemands(
  leaderBlackboard: BlackboardData,
  currentTime: number,
  resourceType?: LogisticsResourceType,
): TribeDemand[] {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const pending: TribeDemand[] = [];

  for (const demandId of meta.demandIds) {
    const demand = Blackboard.get<TribeDemand>(leaderBlackboard, LOGISTICS_DEMAND_PREFIX + demandId);
    if (!demand) continue;
    if (demand.status !== DemandStatus.Pending) continue;
    if (resourceType && demand.resourceType !== resourceType) continue;
    pending.push(demand);
  }

  // Sort by priority (highest first)
  pending.sort((a, b) => b.priority - a.priority);
  return pending;
}

/**
 * Gets a demand by its ID.
 */
export function getDemand(
  leaderBlackboard: BlackboardData,
  demandId: string,
): TribeDemand | null {
  return Blackboard.get<TribeDemand>(leaderBlackboard, LOGISTICS_DEMAND_PREFIX + demandId) ?? null;
}

/**
 * Gets a demand by requester ID.
 */
export function getDemandByRequester(
  leaderBlackboard: BlackboardData,
  requesterId: EntityId,
): TribeDemand | null {
  return getDemand(leaderBlackboard, createDemandId(requesterId));
}

/**
 * Claims a demand for a mover.
 * Returns true if successfully claimed, false if already claimed or invalid.
 */
export function claimDemand(
  leaderBlackboard: BlackboardData,
  demandId: string,
  moverId: EntityId,
  currentTime: number,
): boolean {
  const demandKey = LOGISTICS_DEMAND_PREFIX + demandId;
  const demand = Blackboard.get<TribeDemand>(leaderBlackboard, demandKey);

  if (!demand || demand.status !== DemandStatus.Pending) {
    return false;
  }

  demand.status = DemandStatus.Claimed;
  demand.claimedBy = moverId;
  demand.claimedAt = currentTime;
  Blackboard.set(leaderBlackboard, demandKey, demand);
  return true;
}

/**
 * Releases a claimed demand back to pending status.
 * Called when a mover fails to fulfill a demand or times out.
 */
export function releaseDemand(
  leaderBlackboard: BlackboardData,
  demandId: string,
): void {
  const demandKey = LOGISTICS_DEMAND_PREFIX + demandId;
  const demand = Blackboard.get<TribeDemand>(leaderBlackboard, demandKey);

  if (demand && demand.status === DemandStatus.Claimed) {
    demand.status = DemandStatus.Pending;
    demand.claimedBy = undefined;
    demand.claimedAt = undefined;
    Blackboard.set(leaderBlackboard, demandKey, demand);
  }
}

/**
 * Marks a demand as fulfilled.
 */
export function fulfillDemand(
  leaderBlackboard: BlackboardData,
  demandId: string,
): void {
  const demandKey = LOGISTICS_DEMAND_PREFIX + demandId;
  const demand = Blackboard.get<TribeDemand>(leaderBlackboard, demandKey);

  if (demand) {
    demand.status = DemandStatus.Fulfilled;
    Blackboard.set(leaderBlackboard, demandKey, demand);
  }
}

/**
 * Removes a demand from the registry.
 */
export function removeDemand(
  leaderBlackboard: BlackboardData,
  demandId: string,
  currentTime: number,
): void {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  Blackboard.delete(leaderBlackboard, LOGISTICS_DEMAND_PREFIX + demandId);
  meta.demandIds = meta.demandIds.filter((id) => id !== demandId);
  saveLogisticsMetadata(leaderBlackboard, meta);
}

// ============================================================================
// SUPPLY MANAGEMENT (For Gatherers and Storage)
// ============================================================================

/**
 * Creates a unique supply ID based on source
 */
function createSupplyId(sourceId: EntityId): string {
  return `supply_${sourceId}`;
}

/**
 * Registers an immediate supply (from storage or ground).
 * Called when updating storage contents.
 */
export function registerImmediateSupply(
  leaderBlackboard: BlackboardData,
  sourceId: EntityId,
  resourceType: LogisticsResourceType,
  amount: number,
  location: Vector2D,
  currentTime: number,
): TribeSupply {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const supplyId = createSupplyId(sourceId);
  const supplyKey = LOGISTICS_SUPPLY_PREFIX + supplyId;

  const supply: TribeSupply = {
    id: supplyId,
    sourceId,
    resourceType,
    amount,
    location,
    type: SupplyType.Immediate,
    updatedAt: currentTime,
  };

  Blackboard.set(leaderBlackboard, supplyKey, supply);

  // Add to metadata if not already there
  if (!meta.supplyIds.includes(supplyId)) {
    meta.supplyIds.push(supplyId);
    saveLogisticsMetadata(leaderBlackboard, meta);
  }

  return supply;
}

/**
 * Registers a forecast supply (from gatherer en route).
 * Called by gatherers after harvesting, announcing their incoming delivery.
 * "I am bringing X berries to Storage Y, ETA Z"
 */
export function registerForecastSupply(
  leaderBlackboard: BlackboardData,
  gathererId: EntityId,
  resourceType: LogisticsResourceType,
  amount: number,
  targetStorageId: EntityId,
  storageLocation: Vector2D,
  eta: number,
  currentTime: number,
): TribeSupply {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const supplyId = createSupplyId(gathererId);
  const supplyKey = LOGISTICS_SUPPLY_PREFIX + supplyId;

  const supply: TribeSupply = {
    id: supplyId,
    sourceId: gathererId,
    resourceType,
    amount,
    location: storageLocation,
    type: SupplyType.Forecast,
    eta,
    targetStorageId,
    updatedAt: currentTime,
  };

  Blackboard.set(leaderBlackboard, supplyKey, supply);

  // Add to metadata if not already there
  if (!meta.supplyIds.includes(supplyId)) {
    meta.supplyIds.push(supplyId);
    saveLogisticsMetadata(leaderBlackboard, meta);
  }

  return supply;
}

/**
 * Updates a storage's supply entry.
 * Called when storage contents change.
 */
export function updateStorageSupply(
  leaderBlackboard: BlackboardData,
  storage: BuildingEntity,
  currentTime: number,
): TribeSupply | null {
  const amount = storage.storedFood?.length ?? 0;

  // Only register if there's actually food
  if (amount === 0) {
    // Remove supply entry if it exists
    removeSupply(leaderBlackboard, createSupplyId(storage.id), currentTime);
    return null;
  }

  return registerImmediateSupply(
    leaderBlackboard,
    storage.id,
    'food',
    amount,
    storage.position,
    currentTime,
  );
}

/**
 * Converts a forecast supply to immediate supply.
 * Called when a gatherer completes their delivery.
 */
export function convertForecastToImmediate(
  leaderBlackboard: BlackboardData,
  gathererId: EntityId,
  currentTime: number,
): void {
  // Remove the forecast supply (storage will register its own immediate supply)
  removeSupply(leaderBlackboard, createSupplyId(gathererId), currentTime);
}

/**
 * Registers a relay mover as an immediate supply source.
 * Called when a mover decides to act as a relay point for long-distance logistics.
 * The mover holds position and waits for another mover to pick up from them.
 */
export function registerRelayMoverSupply(
  leaderBlackboard: BlackboardData,
  moverId: EntityId,
  resourceType: LogisticsResourceType,
  amount: number,
  location: Vector2D,
  currentTime: number,
): TribeSupply {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const supplyId = `relay_${moverId}`;
  const supplyKey = LOGISTICS_SUPPLY_PREFIX + supplyId;

  const supply: TribeSupply = {
    id: supplyId,
    sourceId: moverId,
    resourceType,
    amount,
    location,
    type: SupplyType.Immediate,
    isRelayMover: true,
    updatedAt: currentTime,
  };

  Blackboard.set(leaderBlackboard, supplyKey, supply);

  // Add to metadata if not already there
  if (!meta.supplyIds.includes(supplyId)) {
    meta.supplyIds.push(supplyId);
    saveLogisticsMetadata(leaderBlackboard, meta);
  }

  return supply;
}

/**
 * Removes a relay mover's supply entry.
 * Called when the relay handoff completes or times out.
 */
export function removeRelayMoverSupply(
  leaderBlackboard: BlackboardData,
  moverId: EntityId,
  currentTime: number,
): void {
  removeSupply(leaderBlackboard, `relay_${moverId}`, currentTime);
}

/**
 * Removes a supply entry.
 */
export function removeSupply(
  leaderBlackboard: BlackboardData,
  supplyId: string,
  currentTime: number,
): void {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  Blackboard.delete(leaderBlackboard, LOGISTICS_SUPPLY_PREFIX + supplyId);
  meta.supplyIds = meta.supplyIds.filter((id) => id !== supplyId);
  saveLogisticsMetadata(leaderBlackboard, meta);
}

/**
 * Gets a supply by its ID.
 */
export function getSupply(
  leaderBlackboard: BlackboardData,
  supplyId: string,
): TribeSupply | null {
  return Blackboard.get<TribeSupply>(leaderBlackboard, LOGISTICS_SUPPLY_PREFIX + supplyId) ?? null;
}

/**
 * Gets all supplies.
 */
export function getAllSupplies(
  leaderBlackboard: BlackboardData,
  currentTime: number,
): TribeSupply[] {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const supplies: TribeSupply[] = [];

  for (const supplyId of meta.supplyIds) {
    const supply = Blackboard.get<TribeSupply>(leaderBlackboard, LOGISTICS_SUPPLY_PREFIX + supplyId);
    if (supply) {
      supplies.push(supply);
    }
  }

  return supplies;
}

/**
 * Finds the best supply for a given demand.
 * Prefers immediate supply nearby, but accepts forecast if arriving soon.
 */
export function findBestSupplyForDemand(
  leaderBlackboard: BlackboardData,
  demand: TribeDemand,
  mover: HumanEntity,
  gameState: GameWorldState,
  currentTime: number,
): TribeSupply | null {
  const supplies = getAllSupplies(leaderBlackboard, currentTime);

  let bestSupply: TribeSupply | null = null;
  let bestScore = -Infinity;

  for (const supply of supplies) {
    // Must match resource type
    if (supply.resourceType !== demand.resourceType) continue;

    // Must have sufficient amount
    if (supply.amount < demand.amount) continue;

    // For forecasts, check if ETA is valid
    if (supply.type === SupplyType.Forecast) {
      if (!supply.eta || currentTime > supply.eta + LOGISTICS_SUPPLY_WAIT_TIMEOUT_HOURS) {
        continue; // Forecast expired or too far in future
      }
    }

    // Calculate distances
    const distMoverToSupply = calculateWrappedDistance(
      mover.position,
      supply.location,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    const distSupplyToDemand = calculateWrappedDistance(
      supply.location,
      demand.location,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    const totalDistance = distMoverToSupply + distSupplyToDemand;

    // Skip if too far
    if (totalDistance > LOGISTICS_MAX_MOVER_TRAVEL_DISTANCE * 2) continue;

    // Calculate score
    // Prefer: immediate over forecast, closer distance, more amount
    let score = 0;
    score += supply.type === SupplyType.Immediate ? 100 : 0;
    score += Math.max(0, LOGISTICS_MAX_MOVER_TRAVEL_DISTANCE * 2 - totalDistance) / 10;
    score += Math.min(supply.amount, 10); // Bonus for more supply

    if (score > bestScore) {
      bestScore = score;
      bestSupply = supply;
    }
  }

  return bestSupply;
}

// ============================================================================
// MOVER TASK MANAGEMENT
// ============================================================================

/**
 * Creates a unique task ID
 */
function createTaskId(moverId: EntityId, timestamp: number): string {
  return `task_${moverId}_${Math.floor(timestamp * 1000)}`;
}

/**
 * Creates a new mover task when claiming a demand.
 */
export function createMoverTask(
  leaderBlackboard: BlackboardData,
  moverId: EntityId,
  demand: TribeDemand,
  supply: TribeSupply,
  currentTime: number,
): MoverTask {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  const taskId = createTaskId(moverId, currentTime);
  const taskKey = LOGISTICS_TASK_PREFIX + taskId;

  const task: MoverTask = {
    id: taskId,
    moverId,
    demandId: demand.id,
    supplyId: supply.id,
    state: MoverTaskState.MovingToSupply,
    pickupLocation: supply.location,
    deliveryLocation: demand.location,
    amount: demand.amount,
    resourceType: demand.resourceType,
    createdAt: currentTime,
    lastActivityAt: currentTime,
    // Set wait deadline for forecast supplies
    waitDeadline: supply.type === SupplyType.Forecast && supply.eta
      ? supply.eta + LOGISTICS_SUPPLY_WAIT_TIMEOUT_HOURS
      : undefined,
  };

  Blackboard.set(leaderBlackboard, taskKey, task);

  // Add to metadata
  meta.taskIds.push(taskId);
  saveLogisticsMetadata(leaderBlackboard, meta);

  return task;
}

/**
 * Gets a mover task by its ID.
 */
export function getMoverTaskById(
  leaderBlackboard: BlackboardData,
  taskId: string,
): MoverTask | null {
  return Blackboard.get<MoverTask>(leaderBlackboard, LOGISTICS_TASK_PREFIX + taskId) ?? null;
}

/**
 * Gets the active task for a mover.
 */
export function getMoverTask(
  leaderBlackboard: BlackboardData,
  moverId: EntityId,
  currentTime: number,
): MoverTask | null {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);

  for (const taskId of meta.taskIds) {
    const task = Blackboard.get<MoverTask>(leaderBlackboard, LOGISTICS_TASK_PREFIX + taskId);
    if (
      task &&
      task.moverId === moverId &&
      task.state !== MoverTaskState.Completed &&
      task.state !== MoverTaskState.Failed
    ) {
      return task;
    }
  }

  return null;
}

/**
 * Updates a mover task's state and refreshes activity timestamp.
 */
export function updateMoverTaskState(
  leaderBlackboard: BlackboardData,
  taskId: string,
  newState: MoverTaskState,
  currentTime: number,
): void {
  const taskKey = LOGISTICS_TASK_PREFIX + taskId;
  const task = Blackboard.get<MoverTask>(leaderBlackboard, taskKey);

  if (task) {
    task.state = newState;
    task.lastActivityAt = currentTime;
    Blackboard.set(leaderBlackboard, taskKey, task);
  }
}

/**
 * Updates the delivery location for a task (when requester moves).
 */
export function updateTaskDeliveryLocation(
  leaderBlackboard: BlackboardData,
  taskId: string,
  newLocation: Vector2D,
  currentTime: number,
): void {
  const taskKey = LOGISTICS_TASK_PREFIX + taskId;
  const task = Blackboard.get<MoverTask>(leaderBlackboard, taskKey);

  if (task) {
    task.deliveryLocation = newLocation;
    task.lastActivityAt = currentTime;
    Blackboard.set(leaderBlackboard, taskKey, task);
  }
}

/**
 * Completes a mover task successfully.
 */
export function completeMoverTask(
  leaderBlackboard: BlackboardData,
  taskId: string,
  currentTime: number,
): void {
  const taskKey = LOGISTICS_TASK_PREFIX + taskId;
  const task = Blackboard.get<MoverTask>(leaderBlackboard, taskKey);

  if (task) {
    task.state = MoverTaskState.Completed;
    task.lastActivityAt = currentTime;
    Blackboard.set(leaderBlackboard, taskKey, task);

    // Fulfill the demand
    fulfillDemand(leaderBlackboard, task.demandId);
  }
}

/**
 * Fails a mover task and releases the demand.
 */
export function failMoverTask(
  leaderBlackboard: BlackboardData,
  taskId: string,
): void {
  const taskKey = LOGISTICS_TASK_PREFIX + taskId;
  const task = Blackboard.get<MoverTask>(leaderBlackboard, taskKey);

  if (task) {
    task.state = MoverTaskState.Failed;
    Blackboard.set(leaderBlackboard, taskKey, task);

    // Release the demand back to pending
    releaseDemand(leaderBlackboard, task.demandId);
  }
}

/**
 * Removes a task from the registry.
 */
export function removeMoverTask(
  leaderBlackboard: BlackboardData,
  taskId: string,
  currentTime: number,
): void {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);
  Blackboard.delete(leaderBlackboard, LOGISTICS_TASK_PREFIX + taskId);
  meta.taskIds = meta.taskIds.filter((id) => id !== taskId);
  saveLogisticsMetadata(leaderBlackboard, meta);
}

// ============================================================================
// CLEANUP AND MAINTENANCE
// ============================================================================

/**
 * Cleans up stale entries from the logistics registry.
 * Should be called periodically (e.g., by tribe leader).
 *
 * Handles:
 * - Stale pending demands (requester died or demand too old)
 * - Timed-out claimed demands (mover died or stuck)
 * - Expired forecast supplies (gatherer died en route)
 * - Completed/failed tasks
 */
export function cleanupLogisticsRegistry(
  leaderBlackboard: BlackboardData,
  currentTime: number,
  gameState: GameWorldState,
): void {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);

  // Check if cleanup is needed
  if (currentTime - meta.lastCleanupTime < LOGISTICS_CLEANUP_INTERVAL_HOURS) {
    return;
  }

  meta.lastCleanupTime = currentTime;

  // Cleanup demands
  const demandIdsToRemove: string[] = [];
  for (const demandId of meta.demandIds) {
    const demand = Blackboard.get<TribeDemand>(leaderBlackboard, LOGISTICS_DEMAND_PREFIX + demandId);
    if (!demand) {
      demandIdsToRemove.push(demandId);
      continue;
    }

    const age = currentTime - demand.createdAt;

    // Check if requester still exists
    const requester = gameState.entities.entities[demand.requesterId];
    if (!requester) {
      demandIdsToRemove.push(demandId);
      continue;
    }

    // Remove fulfilled demands after a short delay
    if (demand.status === DemandStatus.Fulfilled && age > 1) {
      demandIdsToRemove.push(demandId);
      continue;
    }

    // Remove stale pending demands
    if (demand.status === DemandStatus.Pending && age > LOGISTICS_DEMAND_STALE_TIMEOUT_HOURS) {
      demandIdsToRemove.push(demandId);
      continue;
    }

    // Reset timed-out claimed demands
    if (demand.status === DemandStatus.Claimed && demand.claimedAt) {
      const claimAge = currentTime - demand.claimedAt;
      if (claimAge > LOGISTICS_CLAIM_TIMEOUT_HOURS) {
        // Check if mover still exists
        const mover = demand.claimedBy ? gameState.entities.entities[demand.claimedBy] : null;
        if (!mover) {
          // Mover died, release demand
          demand.status = DemandStatus.Pending;
          demand.claimedBy = undefined;
          demand.claimedAt = undefined;
          Blackboard.set(leaderBlackboard, LOGISTICS_DEMAND_PREFIX + demandId, demand);
        }
      }
    }
  }
  for (const id of demandIdsToRemove) {
    Blackboard.delete(leaderBlackboard, LOGISTICS_DEMAND_PREFIX + id);
  }
  meta.demandIds = meta.demandIds.filter((id) => !demandIdsToRemove.includes(id));

  // Cleanup supplies
  const supplyIdsToRemove: string[] = [];
  for (const supplyId of meta.supplyIds) {
    const supply = Blackboard.get<TribeSupply>(leaderBlackboard, LOGISTICS_SUPPLY_PREFIX + supplyId);
    if (!supply) {
      supplyIdsToRemove.push(supplyId);
      continue;
    }

    // Check if source still exists
    const source = gameState.entities.entities[supply.sourceId];
    if (!source) {
      supplyIdsToRemove.push(supplyId);
      continue;
    }

    // Remove expired forecasts
    if (supply.type === SupplyType.Forecast) {
      if (supply.eta && currentTime > supply.eta + LOGISTICS_FORECAST_EXPIRY_HOURS) {
        supplyIdsToRemove.push(supplyId);
        continue;
      }
      // Also check if supply is too old
      if (currentTime - supply.updatedAt > LOGISTICS_FORECAST_EXPIRY_HOURS * 2) {
        supplyIdsToRemove.push(supplyId);
        continue;
      }
    }

    // Remove zero-amount immediate supplies
    if (supply.type === SupplyType.Immediate && supply.amount === 0) {
      supplyIdsToRemove.push(supplyId);
      continue;
    }
  }
  for (const id of supplyIdsToRemove) {
    Blackboard.delete(leaderBlackboard, LOGISTICS_SUPPLY_PREFIX + id);
  }
  meta.supplyIds = meta.supplyIds.filter((id) => !supplyIdsToRemove.includes(id));

  // Cleanup tasks
  const taskIdsToRemove: string[] = [];
  for (const taskId of meta.taskIds) {
    const task = Blackboard.get<MoverTask>(leaderBlackboard, LOGISTICS_TASK_PREFIX + taskId);
    if (!task) {
      taskIdsToRemove.push(taskId);
      continue;
    }

    // Remove completed/failed tasks after a short delay
    if (task.state === MoverTaskState.Completed || task.state === MoverTaskState.Failed) {
      if (currentTime - task.lastActivityAt > 1) {
        taskIdsToRemove.push(taskId);
        continue;
      }
    }

    // Check if mover still exists
    const mover = gameState.entities.entities[task.moverId];
    if (!mover) {
      // Release demand and remove task
      releaseDemand(leaderBlackboard, task.demandId);
      taskIdsToRemove.push(taskId);
      continue;
    }

    // Check for stuck tasks (no activity for too long)
    if (currentTime - task.lastActivityAt > LOGISTICS_CLAIM_TIMEOUT_HOURS) {
      failMoverTask(leaderBlackboard, taskId);
      taskIdsToRemove.push(taskId);
      continue;
    }
  }
  for (const id of taskIdsToRemove) {
    Blackboard.delete(leaderBlackboard, LOGISTICS_TASK_PREFIX + id);
  }
  meta.taskIds = meta.taskIds.filter((id) => !taskIdsToRemove.includes(id));

  saveLogisticsMetadata(leaderBlackboard, meta);
}

/**
 * Checks if the mover should prioritize self-sustain (feeding themselves).
 */
export function shouldMoverSelfSustain(mover: HumanEntity): boolean {
  const hungerRatio = mover.hunger / 150; // Assuming max hunger is 150
  return hungerRatio > LOGISTICS_MOVER_HUNGER_SELF_SUSTAIN_THRESHOLD;
}

/**
 * Checks if a demand is being delivered to (has an active task).
 */
export function isDemandBeingDelivered(
  leaderBlackboard: BlackboardData,
  demandId: string,
  currentTime: number,
): boolean {
  const meta = getLogisticsMetadata(leaderBlackboard, currentTime);

  for (const taskId of meta.taskIds) {
    const task = Blackboard.get<MoverTask>(leaderBlackboard, LOGISTICS_TASK_PREFIX + taskId);
    if (
      task &&
      task.demandId === demandId &&
      task.state !== MoverTaskState.Completed &&
      task.state !== MoverTaskState.Failed
    ) {
      return true;
    }
  }

  return false;
}
