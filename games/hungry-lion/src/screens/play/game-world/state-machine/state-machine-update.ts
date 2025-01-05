import { StateData, StateType } from './state-machine-types';

import { LION_INIT_STATE } from './states/lion-states';
import { PREY_INIT_STATE } from './states/prey-states';

const STATES = [LION_INIT_STATE, PREY_INIT_STATE];

export function stateUpdate(type: StateType, data: StateData): [StateType, StateData] {
  const state = STATES.find(({ id }) => id === type);
  if (!state) {
    // Not good
    return [type, data];
  }

  return state.update(data);
}
