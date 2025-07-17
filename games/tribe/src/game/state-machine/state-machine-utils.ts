import { Entity } from '../entities/entities-types';
import { StateData, State, StateContext, StateType } from './state-machine-types';

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
