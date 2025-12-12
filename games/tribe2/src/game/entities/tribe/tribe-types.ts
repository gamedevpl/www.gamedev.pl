import { DiplomacyStatus } from '../../world-types';
import { EntityId } from '../entities-types';
import { Vector2D } from '../../utils/math-types';

/**
 * Tribe control
 */
export type TribeControl = {
  /** Mapping of tribe role to weight, higher means more tribe members will be assigned to that role */
  roleWeights: Record<TribeRole, number>;
  diplomacy: Record<EntityId, DiplomacyStatus>; // LeaderId -> Status
};

/**
 * Strategy types for tribe splitting
 * - Migration: Move away to a safe spot, then split, then build a base. Used when the splitting group is small (<50%).
 * - Concentration: Gather at a key building (storage), split, and take it over. Used when the splitting group is large (>=50%).
 */
export enum TribeSplitStrategy {
  Migration = 'migration',
  Concentration = 'concentration',
}

/**
 * Phases of the tribe split process
 */
export enum TribeSplitPhase {
  Planning = 'planning',
  Gathering = 'gathering',
  Executing = 'executing',
}

/**
 * State for the tribe split process, stored on the patriarch's entity
 */
export type TribeSplitState = {
  /** The chosen strategy for splitting */
  strategy: TribeSplitStrategy;
  /** The current phase of the split process */
  phase: TribeSplitPhase;
  /** The target location for gathering (either migration target or storage position) */
  gatheringTarget: Vector2D;
  /** The game time when the split process started */
  startTime: number;
  /** IDs of family members involved in the split */
  familyMemberIds: EntityId[];
  /** For concentration strategy: the ID of the storage building to take over */
  targetBuildingId?: EntityId;
};

export enum TribeRole {
  // One leader per tribe
  Leader = 'leader',
  // Gets food from bushes and from corpses, delivers to storage spots
  Gatherer = 'gatherer',
  // Planters new berry bushes to ensure food supply
  Planter = 'planter',
  // Hunts animals and enemies, delivers meat to storage spots
  Hunter = 'hunter',
  // Moves resources between storage spots, or from storage spots to tribe members
  Mover = 'mover',
  // Warrior is responsible for defending the tribe and attacking enemies
  Warrior = 'warrior',
}
