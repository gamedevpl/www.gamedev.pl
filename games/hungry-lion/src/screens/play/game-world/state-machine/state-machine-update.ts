import { Entity } from '../entities/entities-types';
import { State, StateContext, StateData, StateType } from './state-machine-types';
import { LION_STATES } from './states/lion';
import { PREY_STATES } from './states/prey';
import { HUNTER_STATES } from './states/hunter';
import {
  findStateHandler,
  handleStateTransition,
  isStateTransitionNeeded,
  logStateHandlerNotFound,
} from './state-machine-utils';

// Combine all states
const STATES = [...LION_STATES, ...PREY_STATES, ...HUNTER_STATES] as unknown as State<Entity, StateData>[];

/**
 * Updates the state machine for an entity
 * @param type Current state type
 * @param data Current state data
 * @param context State update context
 * @returns Tuple of [next state type, next state data]
 */
export function stateUpdate(type: StateType, data: StateData, context: StateContext<Entity>): [StateType, StateData] {
  // Find the current state handler
  const currentState = findStateHandler(type, STATES);
  if (!currentState) {
    logStateHandlerNotFound(type);
    return [type, data];
  }

  // Update the state
  const { nextState, data: nextData } = currentState.update(data, context);

  // If state is changing, handle the transition
  if (isStateTransitionNeeded(type, nextState)) {
    return [nextState, handleStateTransition(currentState, nextState, nextData, context, STATES)];
  }

  return [nextState, nextData];
}