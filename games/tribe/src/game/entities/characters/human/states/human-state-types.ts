import { StateData } from '../../../../state-machine/state-machine-types';
import { EntityId } from '../../../entities-types';
import { Vector2D } from '../../../../utils/math-types';

export const HUMAN_IDLE = 'humanIdle';
export const HUMAN_MOVING = 'humanMoving';
export const HUMAN_EATING = 'humanEating';
export const HUMAN_GATHERING = 'humanGathering'; // When gathering resources
export const HUMAN_PROCREATING = 'humanProcreating'; // When procreating with another human
export const HUMAN_SEEKING_FOOD = 'humanSeekingFood';

export interface HumanIdleStateData extends StateData {
  state: 'idle'; // Explicitly define state for clarity
}

export interface HumanMovingStateData extends StateData {
  targetPosition?: Vector2D; // Where the human is moving to
}

export interface HumanEatingStateData extends StateData {
  berryBushId: EntityId; // The ID of the berry bush being eaten from
}

export interface HumanGatheringStateData extends StateData {
  state: 'gathering';
}

export interface HumanProcreatingStateData extends StateData {
  partnerId?: EntityId; // The ID of the partner for procreation
  duration?: number; // Duration of the procreation process
  procreationEndTime?: number; // When the procreation process ends
}

export interface HumanSeekingFoodStateData extends StateData {
  state: 'seekingFood';
}

export type HumanStateData =
  | HumanIdleStateData
  | HumanMovingStateData
  | HumanEatingStateData
  | HumanGatheringStateData
  | HumanProcreatingStateData
  | HumanSeekingFoodStateData;
