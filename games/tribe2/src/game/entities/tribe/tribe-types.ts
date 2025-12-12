import { DiplomacyStatus } from '../../world-types';
import { EntityId } from '../entities-types';

/**
 * Tribe control
 */
export type TribeControl = {
  /** Mapping of tribe role to weight, higher means more tribe members will be assigned to that role */
  roleWeights: Record<TribeRole, number>;
  diplomacy: Record<EntityId, DiplomacyStatus>; // LeaderId -> Status
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
