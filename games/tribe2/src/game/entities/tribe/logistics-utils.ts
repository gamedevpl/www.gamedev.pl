/**
 * Tribe Logistics Utilities - Minimal Implementation
 */

import { Blackboard, BlackboardData } from '../../ai/behavior-tree/behavior-tree-blackboard';
import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../entities-types';
import { TribeDemand, TribeLogistics, LOGISTICS_KEY } from './logistics-types';

/** Get or create logistics data */
function getLogistics(bb: BlackboardData): TribeLogistics {
  let data = Blackboard.get<TribeLogistics>(bb, LOGISTICS_KEY);
  if (!data) {
    data = { demands: {} };
    Blackboard.set(bb, LOGISTICS_KEY, data);
  }
  return data;
}

/** Register a food demand (called by hungry Warriors) */
export function registerDemand(
  bb: BlackboardData,
  requesterId: EntityId,
  priority: number,
  location: Vector2D,
  time: number,
): void {
  const data = getLogistics(bb);
  data.demands[requesterId] = { requesterId, amount: 1, priority, location, createdAt: time };
}

/** Claim a demand for delivery */
export function claimDemand(bb: BlackboardData, requesterId: EntityId, moverId: EntityId): boolean {
  const data = getLogistics(bb);
  const demand = data.demands[requesterId];
  if (demand && !demand.claimedBy) {
    demand.claimedBy = moverId;
    return true;
  }
  return false;
}

/** Remove a demand (fulfilled or cancelled) */
export function removeDemand(bb: BlackboardData, requesterId: EntityId): void {
  const data = getLogistics(bb);
  delete data.demands[requesterId];
}

/** Get unclaimed demands sorted by priority */
export function getUnclaimedDemands(bb: BlackboardData): TribeDemand[] {
  const data = getLogistics(bb);
  return Object.values(data.demands)
    .filter((d) => !d.claimedBy)
    .sort((a, b) => b.priority - a.priority);
}
