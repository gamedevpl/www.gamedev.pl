import { Entity } from '../entities/entities-types';
import { StateData, State, StateContext, StateType } from './state-machine-types';
import {
  findStateHandler,
  handleStateTransition,
  isStateTransitionNeeded,
  logStateHandlerNotFound,
} from './state-machine-utils';
import { allBerryBushStates } from '../entities/plants/berry-bush/states'; // Added import
import { allHumanStates } from '../entities/characters/human/states'; // Added import for human states

// Combine all states
const STATES = [
  ...allBerryBushStates, // Added berry bush states
  ...allHumanStates, // Added human states
  // TODO: add other states
] as unknown as State<Entity, StateData>[];

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
