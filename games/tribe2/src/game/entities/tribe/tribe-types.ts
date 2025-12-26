import { DiplomacyStatus } from '../../world-types';
import { EntityId } from '../entities-types';

/**
 * Tribe control - simplified for task-based system
 */
export type TribeControl = {
  diplomacy: Record<EntityId, DiplomacyStatus>; // LeaderId -> Status
};
