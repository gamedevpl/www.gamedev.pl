import { Entity } from '../entities/entities-types';
import { State, StateContext, StateData, StateType } from './state-machine-types';

/**
 * Handles state transition, including calling exit and enter handlers
 * @param currentState Current state handler
 * @param nextStateType Next state type
 * @param context State update context
 * @param states Array of available states
 * @returns Next state data
 */
export function handleStateTransition<T extends Entity>(
  currentState: State<T, StateData>,
  nextStateType: StateType,
  nextData: StateData,
  context: StateContext<T>,
  states: State<T, StateData>[],
): StateData {
  // Call exit handler if exists
  currentState.onExit?.(context, nextStateType);

  // Find next state handler
  const nextStateHandler = states.find(({ id }) => id === nextStateType) as State<T, StateData>;
  if (nextStateHandler?.onEnter) {
    // Call enter handler and use its data
    return nextStateHandler.onEnter(context, nextData);
  }

  // Return default state data if no enter handler
  return { ...nextData, enteredAt: context.updateContext.gameState.time };
}

/**
 * Finds a state handler by state type
 * @param stateType State type to find
 * @param states Array of available states
 * @returns State handler or undefined if not found
 */
export function findStateHandler<T extends Entity>(
  stateType: StateType,
  states: State<T, StateData>[],
): State<T, StateData> | undefined {
  return states.find(({ id }) => id === stateType) as State<T, StateData>;
}

/**
 * Updates entity state using provided state handler
 * @param state Current state handler
 * @param data Current state data
 * @param context State update context
 * @returns Updated state data
 */
export function updateEntityState<T extends Entity>(
  state: State<T, StateData>,
  data: StateData,
  context: StateContext<T>,
): StateData {
  return state.update(data, context).data;
}

/**
 * Creates initial state data
 * @param time Current game time
 * @returns Initial state data
 */
export function createInitialStateData(time: number): StateData {
  return { enteredAt: time };
}

/**
 * Checks if state transition is needed
 * @param currentStateType Current state type
 * @param nextStateType Next state type
 * @returns True if state transition is needed
 */
export function isStateTransitionNeeded(currentStateType: StateType, nextStateType: StateType): boolean {
  return currentStateType !== nextStateType;
}

/**
 * Logs warning if state handler is not found
 * @param stateType State type that was not found
 */
export function logStateHandlerNotFound(stateType: StateType): void {
  console.warn(`No handler found for state: ${stateType}`);
}
