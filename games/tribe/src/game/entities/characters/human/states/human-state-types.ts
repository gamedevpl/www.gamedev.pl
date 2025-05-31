import { StateData } from '../../../../state-machine/state-machine-types';
import { EntityId } from '../../../entities-types';
import { Vector2D } from '../../../../utils/math-types';

export const HUMAN_IDLE = 'humanIdle';
export const HUMAN_MOVING = 'humanMoving';
export const HUMAN_EATING = 'humanEating';
export const HUMAN_HUNGRY = 'humanHungry'; // When hunger is high, impacting speed
export const HUMAN_DYING = 'humanDying'; // When hunger reaches 100 or max age is reached
export const HUMAN_GATHERING = 'humanGathering'; // When gathering resources

export interface HumanIdleStateData extends StateData {
  state: 'idle'; // Explicitly define state for clarity
}

export interface HumanMovingStateData extends StateData {
  targetPosition?: Vector2D; // Where the human is moving to
}

export interface HumanEatingStateData extends StateData {
  berryBushId: EntityId; // The ID of the berry bush being eaten from
}

export interface HumanHungryStateData extends StateData {
  state: 'hungry'; // Explicitly define state for clarity
}

export interface HumanDyingStateData extends StateData {
  cause: 'hunger' | 'oldAge';
}

export interface HumanGatheringStateData extends StateData {
  state: 'gathering';
}

export type HumanStateData =
  | HumanIdleStateData
  | HumanMovingStateData
  | HumanEatingStateData
  | HumanHungryStateData
  | HumanDyingStateData;
