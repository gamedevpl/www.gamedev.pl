import { Blackboard, BlackboardData } from '../behavior-tree/behavior-tree-blackboard';
import { EntityId } from '../../entities/entities-types';
import { TribeDemand, SupplyChainResourceType } from './supply-chain-types';
import { GameWorldState } from '../../world-types';
import { HumanEntity } from '../../entities/characters/human/human-types';

const BB_KEY_DEMANDS = 'tribe_logistics_demands';
const DEMAND_STALE_THRESHOLD_HOURS = 8;

/**
 * Retrieves the current list of tribe demands from the blackboard.
 */
export function getTribeDemands(blackboard: BlackboardData): TribeDemand[] {
  return Blackboard.get<TribeDemand[]>(blackboard, BB_KEY_DEMANDS) || [];
}

/**
 * Registers or updates a demand in the tribe's logistics registry.
 */
export function registerDemand(
  blackboard: BlackboardData,
  requesterId: EntityId,
  resourceType: SupplyChainResourceType,
  currentTime: number,
): void {
  const demands = getTribeDemands(blackboard);

  // Check if similar pending demand exists for this requester
  const existingDemand = demands.find((d) => d.requesterId === requesterId && d.resourceType === resourceType);

  if (existingDemand) {
    // Update existing demand
    existingDemand.updatedAt = currentTime;
  } else {
    // Create new demand
    const newDemand: TribeDemand = {
      requesterId,
      resourceType,
      updatedAt: currentTime,
    };
    demands.push(newDemand);
  }

  Blackboard.set(blackboard, BB_KEY_DEMANDS, demands);
}

/**
 * Attempts to claim a demand for a mover.
 * @returns true if claimed successfully, false otherwise.
 */
export function claimDemand(
  blackboard: BlackboardData,
  requesterId: EntityId,
  resourceType: SupplyChainResourceType,
  moverId: EntityId,
  currentTime: number,
): boolean {
  const demands = getTribeDemands(blackboard);
  const demand = demands.find((d) => d.requesterId === requesterId && d.resourceType === resourceType);

  if (demand && !demand.claimedBy) {
    demand.updatedAt = currentTime;
    demand.claimedBy = moverId;
    Blackboard.set(blackboard, BB_KEY_DEMANDS, demands);
    return true;
  }

  return false;
}

/**
 * Returns all demands that haven't been claimed yet, sorted by updatedAt (oldest first) for FIFO behavior.
 */
export function getUnclaimedDemands(blackboard: BlackboardData): TribeDemand[] {
  const demands = getTribeDemands(blackboard);
  return demands
    .filter((d) => !d.claimedBy)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

/**
 * Removes a demand from the registry after successful transfer.
 */
export function fulfillDemand(
  blackboard: BlackboardData,
  requesterId: EntityId,
  resourceType: SupplyChainResourceType,
): void {
  let demands = getTribeDemands(blackboard);
  demands = demands.filter((d) => !(d.requesterId === requesterId && d.resourceType === resourceType));
  Blackboard.set(blackboard, BB_KEY_DEMANDS, demands);
}

/**
 * Retrieves a specific demand by requester ID and resource type.
 */
export function getDemandById(
  blackboard: BlackboardData,
  requesterId: EntityId,
  resourceType: SupplyChainResourceType,
): TribeDemand | undefined {
  const demands = getTribeDemands(blackboard);
  return demands.find((d) => d.requesterId === requesterId && d.resourceType === resourceType);
}

/**
 * Checks if there's a supplier (Mover) approaching the demander.
 * Returns the supplier entity if found, null otherwise.
 */
export function findSupplierForDemand(
  blackboard: BlackboardData,
  requesterId: EntityId,
  resourceType: SupplyChainResourceType,
  gameState: GameWorldState,
): HumanEntity | null {
  const demand = getDemandById(blackboard, requesterId, resourceType);
  
  if (!demand || !demand.claimedBy) {
    return null;
  }

  const supplier = gameState.entities.entities[demand.claimedBy] as HumanEntity | undefined;
  
  if (!supplier || supplier.type !== 'human') {
    return null;
  }

  return supplier;
}

/** Cleanup stale demands */
export function cleanupStaleDemands(blackboard: BlackboardData, currentTime: number): void {
  let demands = getTribeDemands(blackboard);
  demands = demands.filter((d) => currentTime - d.updatedAt <= DEMAND_STALE_THRESHOLD_HOURS);
  Blackboard.set(blackboard, BB_KEY_DEMANDS, demands);
}
