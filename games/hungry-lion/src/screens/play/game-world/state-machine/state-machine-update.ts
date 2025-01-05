import { Entity } from '../entities/entities-types';
import { State, StateContext, StateData, StateType } from './state-machine-types';
import { LION_STATES } from './states/lion-states';
import { PREY_STATES } from './states/prey-states';

// Combine all states
const STATES = [...LION_STATES, ...PREY_STATES];

/**
 * Updates the state machine for an entity
 * @param type Current state type
 * @param data Current state data
 * @param context State update context
 * @returns Tuple of [next state type, next state data]
 */
export function stateUpdate(type: StateType, data: StateData, context: StateContext<Entity>): [StateType, StateData] {
  // Find the current state handler
  const currentState = STATES.find(({ id }) => id === type) as unknown as State<Entity, StateData>;
  if (!currentState) {
    console.warn(`No handler found for state: ${type}`);
    return [type, data];
  }

  // Update the state
  const { nextState, data: nextData } = currentState.update(data, context);

  // If state is changing
  if (nextState !== type) {
    // Call exit handler if exists
    currentState.onExit?.(context, nextState);

    // Find next state handler
    const nextStateHandler = STATES.find(({ id }) => id === nextState) as unknown as State<Entity, StateData>;
    if (nextStateHandler?.onEnter) {
      // Call enter handler and use its data
      return [nextState, nextStateHandler.onEnter(context)];
    }
  }

  return [nextState, nextData];
}
