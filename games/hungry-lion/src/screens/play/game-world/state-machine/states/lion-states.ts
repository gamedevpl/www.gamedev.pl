import { State, StateData, StateType } from '../state-machine-types';

export const LION_INIT_STATE: State = {
  id: 'LION_INIT',
  update: (data) => {
    return ['LION_INIT', data];
  },
};

export function createLionStateMachine(): [StateType, StateData] {
  return ['LION_INIT', {}];
}
