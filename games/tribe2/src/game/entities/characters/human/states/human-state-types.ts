import { StateData } from '../../../../state-machine/state-machine-types';
import { EntityId } from '../../../entities-types';
import { Vector2D } from '../../../../utils/math-types';

export const HUMAN_IDLE = 'humanIdle';
export const HUMAN_MOVING = 'humanMoving';
export const HUMAN_EATING = 'humanEating';
export const HUMAN_GATHERING = 'humanGathering'; // When gathering resources
export const HUMAN_DEPOSITING = 'humanDepositing'; // When depositing resources into storage
export const HUMAN_RETRIEVING = 'humanRetrieving'; // When retrieving resources from storage
export const HUMAN_PROCREATING = 'humanProcreating'; // When procreating with another human
export const HUMAN_ATTACKING = 'humanAttacking';
export const HUMAN_PLANTING = 'humanPlanting';
export const HUMAN_CHOPPING = 'humanChopping';

interface HumanIdleStateData extends StateData {
  state: 'idle'; // Explicitly define state for clarity
}

export interface HumanMovingStateData extends StateData {
  target?: Vector2D | EntityId; // Where the human is moving to
  path?: Vector2D[]; // Computed path for navigation around obstacles
  pathIndex?: number; // Current index in the path
  pathComputedAt?: number; // When the path was computed (for cache invalidation)
}

interface HumanEatingStateData extends StateData {
  berryBushId: EntityId; // The ID of the berry bush being eaten from
}

export interface HumanGatheringStateData extends StateData {
  state: 'gathering';
}

export interface HumanDepositingStateData extends StateData {
  state: 'depositing';
}

export interface HumanRetrievingStateData extends StateData {
  state: 'retrieving';
}

export interface HumanProcreatingStateData extends StateData {
  partnerId?: EntityId; // The ID of the partner for procreation
  duration?: number; // Duration of the procreation process
  procreationEndTime?: number; // When the procreation process ends
}

export interface HumanAttackingStateData extends StateData {
  attackTargetId: EntityId;
  attackStartTime: number;
}

export interface HumanPlantingStateData extends StateData {
  plantingSpot: Vector2D;
}

export interface HumanChoppingStateData extends StateData {
  state: 'chopping';
}

export type HumanStateData =
  | HumanIdleStateData
  | HumanMovingStateData
  | HumanEatingStateData
  | HumanGatheringStateData
  | HumanDepositingStateData
  | HumanRetrievingStateData
  | HumanProcreatingStateData
  | HumanAttackingStateData
  | HumanPlantingStateData
  | HumanChoppingStateData;