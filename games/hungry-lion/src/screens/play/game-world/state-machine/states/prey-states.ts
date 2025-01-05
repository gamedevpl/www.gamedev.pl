import { State, StateData, StateType } from '../state-machine-types';

export const PREY_INIT_STATE: State = {
  id: 'PREY_INIT',
  update: (data) => {
    return ['PREY_INIT', data];
  },
};

export function createPreyStateMachine(): [StateType, StateData] {
  return ['PREY_INIT', {}];
}
