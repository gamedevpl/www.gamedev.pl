import { StateData } from '../../../../state-machine/state-machine-types';
import { EntityId } from '../../../entities-types';
import { Vector2D } from '../../../../utils/math-types';

export const PREY_IDLE = 'preyIdle';
export const PREY_MOVING = 'preyMoving';
export const PREY_GRAZING = 'preyGrazing';
export const PREY_PROCREATING = 'preyProcreating';
export const PREY_FLEEING = 'preyFleeing';

interface PreyIdleStateData extends StateData {
  state: 'idle'; // Explicitly define state for clarity
}

export interface PreyMovingStateData extends StateData {
  target?: Vector2D | EntityId; // Where the prey is moving to
}

interface PreyGrazingStateData extends StateData {
  berryBushId?: EntityId; // The ID of the berry bush being grazed on
}

export interface PreyProcreatingStateData extends StateData {
  partnerId?: EntityId; // The ID of the partner for procreation
  duration?: number; // Duration of the procreation process
  procreationEndTime?: number; // When the procreation process ends
}

export interface PreyFleeingStateData extends StateData {
  fleeTargetId: EntityId; // The ID of the threat to flee from
  fleeStartTime: number; // When fleeing started
}

export type PreyStateData =
  | PreyIdleStateData
  | PreyMovingStateData
  | PreyGrazingStateData
  | PreyProcreatingStateData
  | PreyFleeingStateData;