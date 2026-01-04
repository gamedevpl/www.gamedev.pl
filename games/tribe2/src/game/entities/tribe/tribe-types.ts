import { DiplomacyStatus } from '../../world-types';
import { EntityId } from '../entities-types';

/**
 * Tribe control
 */
export type TribeControl = {
  diplomacy: Record<EntityId, DiplomacyStatus>; // LeaderId -> Status
};
