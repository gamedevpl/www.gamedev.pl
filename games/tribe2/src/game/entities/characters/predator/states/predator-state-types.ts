import { StateData } from '../../../../state-machine/state-machine-types';
import { EntityId } from '../../../entities-types';
import { Vector2D } from '../../../../utils/math-types';

export const PREDATOR_IDLE = 'predatorIdle';
export const PREDATOR_MOVING = 'predatorMoving';
export const PREDATOR_ATTACKING = 'predatorAttacking';
export const PREDATOR_PROCREATING = 'predatorProcreating';
export const PREDATOR_EATING = 'predatorEating';

interface PredatorIdleStateData extends StateData {
  state: 'idle'; // Explicitly define state for clarity
}

export interface PredatorMovingStateData extends StateData {
  target?: Vector2D | EntityId; // Where the predator is moving to
}


export interface PredatorAttackingStateData extends StateData {
  attackTargetId: EntityId; // The ID of the target being attacked
  attackStartTime: number; // When attack started
}

export interface PredatorProcreatingStateData extends StateData {
  partnerId?: EntityId; // The ID of the partner for procreation
  duration?: number; // Duration of the procreation process
  procreationEndTime?: number; // When the procreation process ends
}

export interface PredatorEatingStateData extends StateData {
  preyId: EntityId; // The ID of the prey being consumed
  eatingStartTime: number; // When eating started
}

export type PredatorStateData =
  | PredatorIdleStateData
  | PredatorMovingStateData
  | PredatorAttackingStateData
  | PredatorProcreatingStateData
  | PredatorEatingStateData;