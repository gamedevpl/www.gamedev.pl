/**
 * Tribe Logistics - Minimal Implementation
 * 
 * Simple demand registry for coordinating food delivery.
 * Stored in tribe leader's blackboard.
 */

import { EntityId } from '../entities-types';
import { Vector2D } from '../../utils/math-types';

/** A demand for food from a hungry tribe member */
export type TribeDemand = {
  requesterId: EntityId;
  amount: number;
  priority: number; // 1-5, higher = more urgent
  location: Vector2D;
  claimedBy?: EntityId; // Mover ID if claimed
  createdAt: number;
};

/** Blackboard key for the logistics data */
export const LOGISTICS_KEY = 'tribeLogistics';

/** Logistics data stored in leader's blackboard */
export type TribeLogistics = {
  demands: Record<string, TribeDemand>; // keyed by requesterId
};
