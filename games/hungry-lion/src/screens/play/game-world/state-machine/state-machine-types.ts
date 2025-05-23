import { Entity } from '../entities/entities-types';
import { UpdateContext } from '../game-world-types';

export type StateType = string;

/**
 * Base interface for all state data
 */
export interface BaseStateData {
  /** Timestamp when the state was entered */
  enteredAt: number;
  /** Previous state type */
  previousState?: StateType;
}

/**
 * Context provided to state update function
 */
export interface StateContext<T = Entity> {
  /** The entity being updated */
  entity: T;
  /** Game update context */
  updateContext: UpdateContext;
}

/**
 * Result of state update, including next state and its data
 */
export interface StateTransition {
  /** Next state type */
  nextState: StateType;
  /** Data for the next state */
  data: StateData;
}

/**
 * State update function type
 */
export type StateUpdate<T extends Entity = Entity, D extends BaseStateData = BaseStateData> = (
  data: D,
  context: StateContext<T>,
) => StateTransition;

/**
 * State definition interface
 */
export interface State<T extends Entity = Entity, D extends BaseStateData = BaseStateData> {
  /** Unique identifier of the state */
  id: StateType;
  /** Function to update the state */
  update: StateUpdate<T, D>;
  /** Optional function called when entering the state */
  onEnter?: (context: StateContext<T>, nextData: D) => D;
  /** Optional function called when leaving the state */
  onExit?: (context: StateContext<T>, nextState: StateType) => void;
}

/** Union type for all possible state data */
export type StateData = BaseStateData;
