/**
 * Logistics System Types
 *
 * Defines the core data structures for the demand-driven tribe logistics system.
 * This implements a Hybrid Model where:
 * - Gatherers act as Supply Forecasters (announce incoming supplies)
 * - Movers are intelligent logistics agents that match demands with supplies
 * - Consumers (Warriors, etc.) register demands when they need resources
 */

import { EntityId } from '../entities-types';
import { Vector2D } from '../../utils/math-types';

/**
 * Resource types that can be managed by the logistics system.
 * Currently only food (berries/meat) is supported.
 */
export type LogisticsResourceType = 'food';

/**
 * Status of a demand entry
 */
export enum DemandStatus {
  /** Demand is waiting for a mover to claim it */
  Pending = 'pending',
  /** A mover has claimed this demand and is working on fulfilling it */
  Claimed = 'claimed',
  /** The demand has been successfully fulfilled */
  Fulfilled = 'fulfilled',
}

/**
 * Priority levels for demand entries (1-5 scale)
 */
export enum DemandPriority {
  /** Low priority - nice to have */
  Low = 1,
  /** Normal priority - regular needs */
  Normal = 2,
  /** High priority - urgent needs */
  High = 3,
  /** Very High priority - important */
  VeryHigh = 4,
  /** Critical priority - emergency/starvation */
  Critical = 5,
}

/**
 * TribeDemand - Represents a need within the tribe.
 * Posted by Warriors, Builders, or hungry tribe members when they need resources.
 */
export type TribeDemand = {
  /** Unique ID for this demand */
  id: string;
  /** ID of the entity requesting resources (e.g., Warrior, Builder) */
  requesterId: EntityId;
  /** Type of resource needed */
  resourceType: LogisticsResourceType;
  /** Quantity needed */
  amount: number;
  /** Priority level (1=Low to 5=Critical/Starvation) */
  priority: DemandPriority;
  /** Where the resource is needed (requester's current position) */
  location: Vector2D;
  /** Current status of the demand */
  status: DemandStatus;
  /** ID of the mover who claimed this demand (if claimed) */
  claimedBy?: EntityId;
  /** Game time when the demand was created (for staleness checks) */
  createdAt: number;
  /** Game time when the demand was claimed (for timeout checks) */
  claimedAt?: number;
};

/**
 * Type of supply availability
 */
export enum SupplyType {
  /** Currently in a storage spot or on the ground - immediately available */
  Immediate = 'immediate',
  /** Currently being carried by a Gatherer en route to storage */
  Forecast = 'forecast',
}

/**
 * TribeSupply - Represents available or incoming resources.
 * Posted by Storage spots (Immediate), Gatherers en route (Forecast), or Relay Movers (Immediate).
 */
export type TribeSupply = {
  /** Unique ID for this supply */
  id: string;
  /** ID of the source entity (storage spot, gatherer, corpse, or relay mover) */
  sourceId: EntityId;
  /** Type of resource available */
  resourceType: LogisticsResourceType;
  /** Quantity available or incoming */
  amount: number;
  /** Position of the supply (storage location, gatherer's target, or relay mover's position) */
  location: Vector2D;
  /** Whether this is immediate or forecast supply */
  type: SupplyType;
  /** Estimated time of arrival (for Forecast supplies) */
  eta?: number;
  /** Target storage ID (for Forecast supplies from gatherers) */
  targetStorageId?: EntityId;
  /** Whether this supply is from a relay mover (temporary supply source) */
  isRelayMover?: boolean;
  /** Game time when the supply was last updated */
  updatedAt: number;
};

/**
 * State of a mover's logistics task
 */
export enum MoverTaskState {
  /** Moving to the supply location to pick up resources */
  MovingToSupply = 'movingToSupply',
  /** Waiting at supply source for forecast resources to arrive */
  WaitingForSupply = 'waitingForSupply',
  /** Picking up resources from the supply source */
  PickingUp = 'pickingUp',
  /** Moving to the requester to deliver resources */
  MovingToRequester = 'movingToRequester',
  /** Transferring resources to the requester */
  Delivering = 'delivering',
  /** Acting as a relay - holding position and waiting for another mover to pick up */
  RelayHolding = 'relayHolding',
  /** Task completed successfully */
  Completed = 'completed',
  /** Task failed (supply not available, requester died, etc.) */
  Failed = 'failed',
}

/**
 * MoverTask - Tracks an active logistics operation by a Mover.
 * Created when a mover claims a demand and matches it with a supply.
 */
export type MoverTask = {
  /** Unique ID for this task */
  id: string;
  /** ID of the mover performing the task */
  moverId: EntityId;
  /** ID of the demand being fulfilled */
  demandId: string;
  /** ID of the supply being used */
  supplyId: string;
  /** Current state of the task */
  state: MoverTaskState;
  /** Location of the pickup point (supply location) */
  pickupLocation: Vector2D;
  /** Location of the delivery point (requester location) */
  deliveryLocation: Vector2D;
  /** Amount of resources to transport */
  amount: number;
  /** Resource type being transported */
  resourceType: LogisticsResourceType;
  /** Game time when the task was created */
  createdAt: number;
  /** Game time of last activity (for timeout handling) */
  lastActivityAt: number;
  /** Maximum wait time at supply before giving up (for Forecast supplies) */
  waitDeadline?: number;
  /** Whether this is a relay task (partial delivery to midpoint) */
  isRelay?: boolean;
};

/**
 * The complete logistics registry stored in the tribe leader's blackboard.
 * Acts as the central coordination point for all logistics operations.
 * 
 * Note: Individual entries are stored as separate blackboard keys:
 * - demands: `logistics_demand_{demandId}`
 * - supplies: `logistics_supply_{supplyId}`
 * - tasks: `logistics_task_{taskId}`
 * - metadata: `logistics_meta`
 */
export type LogisticsMetadata = {
  /** Game time when the registry was last cleaned up */
  lastCleanupTime: number;
  /** List of active demand IDs */
  demandIds: string[];
  /** List of active supply IDs */
  supplyIds: string[];
  /** List of active task IDs */
  taskIds: string[];
};
